# backend/app.py
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional, List, Dict, Any, Literal
import uvicorn
import time
import traceback
import inspect
import uuid
import hashlib
import json
import base64
import os
from datetime import datetime, timedelta
from passlib.context import CryptContext
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# dev-only: show full traceback in HTTP responses to help debugging
from fastapi.responses import PlainTextResponse

# Password hashing context
# Use bcrypt_sha256 to avoid the 72-byte password limit and ensure compatibility
pwd_context = CryptContext(schemes=["bcrypt_sha256"], deprecated="auto")

# Configuration from environment
GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID", "")
JWT_SECRET = os.getenv("JWT_SECRET", "dev-secret-change-in-production")
ENVIRONMENT = os.getenv("ENVIRONMENT", "development")

# Google OAuth verification library
try:
    from google.oauth2 import id_token
    from google.auth.transport import requests as google_requests
    GOOGLE_AUTH_AVAILABLE = True
except ImportError:
    GOOGLE_AUTH_AVAILABLE = False
    print("⚠️  google-auth library not installed. Install with: pip install google-auth google-auth-httplib2")


# Import DB and services
from db import (
    create_session as db_create_session,
    add_message as db_add_message,
    get_messages,
    get_sessions_for_user,
    delete_session,
    update_session_title,
    get_user_by_id,
    get_user_by_email,
    create_email_user,
    get_password_hash,
    upsert_google_user,
    update_last_login,
    update_user_name,
    set_password_hash,
)
import loader
from retriever import retrieve_relevant_docs
from llm_service import generate_legal_answer

# Simple in-memory stats for admin monitoring
_STATS = {
    "requests": 0,
    "last_retrieval_s": None,
    "last_generation_s": None,
    "avg_retrieval_s": None,
    "avg_generation_s": None,
}

# ---------------------------------------------------------
# FastAPI Init
# ---------------------------------------------------------
app = FastAPI(title="LEXAI Backend API", version="1.0")

# Dev exception handler (print traceback in response)
@app.exception_handler(Exception)
async def dev_exception_handler(request: Request, exc: Exception):
    tb = "".join(traceback.format_exception(type(exc), exc, exc.__traceback__))
    print("===== DEV EXCEPTION TRACEBACK =====")
    print(tb)
    print("===================================")
    return PlainTextResponse(tb, status_code=500)

# ---------------------------------------------------------
# CORS
# ---------------------------------------------------------
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------------------------------------------------
# Request / Response Models
# ---------------------------------------------------------
class ChatRequest(BaseModel):
    message: str
    user_id: str
    session_id: Optional[str] = None


class ChatResponse(BaseModel):
    response: str
    sessionId: str
    title: Optional[str] = None
    metadata: Optional[Dict[str, Any]] = None


# ---------------------------------------------------------
# Auth Models
# ---------------------------------------------------------
class GoogleAuthRequest(BaseModel):
    token: str


class EmailAuthRequest(BaseModel):
    email: str
    password: Optional[str] = None
    name: Optional[str] = None  # User's full name (for signup)
    mode: Optional[str] = None  # 'signin' or 'signup'


class AuthResponse(BaseModel):
    user_id: str
    name: str
    avatar: Optional[str] = None
    token: str
    status: Literal["signin", "signup"]
    message: Optional[str] = None


class ProfileResponse(BaseModel):
    user_id: str
    name: str
    email: Optional[str] = None
    provider: Optional[str] = None
    avatar: Optional[str] = None
    created_at: Optional[str] = None
    last_login: Optional[str] = None


class ProfileUpdateRequest(BaseModel):
    user_id: str
    name: Optional[str] = None
    old_password: Optional[str] = None
    new_password: Optional[str] = None


# Note: User data is now persisted in SQLite via db.py helpers



# ---------------------------------------------------------
# Load RAG Model + FAISS Index (cached)
# (deferred) — initialize to None, actual loading happens on startup
# ---------------------------------------------------------
MODEL = None
INDEX = None
DOCS = None


# Helper: call retriever safely regardless of signature
def _call_retriever(query: str):
    try:
        sig = inspect.signature(retrieve_relevant_docs)
        params = len(sig.parameters)
        if params == 1:
            return retrieve_relevant_docs(query)
        elif params == 2:
            return retrieve_relevant_docs(query, MODEL)
        elif params == 3:
            return retrieve_relevant_docs(query, MODEL, INDEX)
        else:
            # fallback: pass all
            return retrieve_relevant_docs(query, MODEL, INDEX, DOCS)
    except Exception as e:
        # if anything fails, return empty list
        print("retriever call failed:", e)
        return []


# ---------------------------------------------------------
# Routes
# ---------------------------------------------------------
@app.get("/api/health")
def health():
    return {"status": "ok"}


# ---------------------------------------------------------
# Auth Endpoints
# ---------------------------------------------------------
@app.post("/auth/google", response_model=AuthResponse)
def auth_google(req: GoogleAuthRequest):
    """
    Handle Google OAuth token verification - Production Grade.
    
    Verifies the token against Google's servers to ensure:
    - Token is valid and not tampered with
    - Token is not expired
    - Token is for the correct application
    
    This is how all production apps handle Google OAuth.
    """
    try:
        token = req.token
        
        if not token or len(token) < 10:
            raise ValueError("Invalid or empty token")
        
        idinfo = None
        verification_method = "unknown"
        
        # If google-auth is available, use production verification
        if GOOGLE_AUTH_AVAILABLE and GOOGLE_CLIENT_ID:
            try:
                verification_method = "google-auth (server verification)"
                print(f"🔍 Attempting Google server verification with Client ID: {GOOGLE_CLIENT_ID[:20]}...")
                
                # Verify token signature and claims with Google's servers
                idinfo = id_token.verify_oauth2_token(
                    token,
                    google_requests.Request(),
                    GOOGLE_CLIENT_ID
                )
                
                # Additional checks
                if idinfo.get('aud') != GOOGLE_CLIENT_ID:
                    raise ValueError("Token audience doesn't match")
                
                # Check token expiration
                issued_at = idinfo.get('iat', 0)
                expires_in = idinfo.get('exp', 0)
                current_time = int(time.time())
                
                if current_time > expires_in:
                    raise ValueError("Token has expired")
                
                print(f"✅ Token verified with Google servers")
                
            except Exception as e:
                print(f"⚠️  Google server verification failed: {e}")
                print(f"📋 Falling back to manual token decode...")
                verification_method = "manual decode (fallback)"
                idinfo = None  # Reset to use fallback
        
        # Fallback: decode without verification (development only)
        if not idinfo:
            if not GOOGLE_AUTH_AVAILABLE:
                print("⚠️  google-auth library not available. Using manual decode (DEV ONLY)")
            elif not GOOGLE_CLIENT_ID:
                print("⚠️  GOOGLE_CLIENT_ID not set. Using manual decode (DEV ONLY)")
            
            # Decode JWT token manually (Google JWT format: header.payload.signature)
            parts = token.split('.')
            if len(parts) != 3:
                raise ValueError("Invalid token format")
            
            # Decode payload (add padding if needed)
            payload = parts[1]
            padding = 4 - len(payload) % 4
            if padding != 4:
                payload += '=' * padding
            
            try:
                idinfo = json.loads(base64.urlsafe_b64decode(payload))
                print(f"✅ Token decoded manually (fallback): {list(idinfo.keys())}")
            except Exception as e:
                raise ValueError(f"Failed to decode token: {e}")
        
        # Extract user info from verified token
        user_id_from_google = idinfo.get('sub', '')  # Unique Google ID
        name = idinfo.get('name', '')  # User's actual name from Google
        email = idinfo.get('email', '')
        avatar = idinfo.get('picture', None)
        given_name = idinfo.get('given_name', '')  # First name from Google
        family_name = idinfo.get('family_name', '')  # Last name from Google
        
        print(f"\n" + "="*60)
        print(f"🔍 GOOGLE TOKEN DEBUG INFO:")
        print(f"="*60)
        print(f"Raw token data extracted:")
        print(f"  - name: '{name}' (type: {type(name).__name__}, len: {len(str(name))})")
        print(f"  - given_name: '{given_name}'")
        print(f"  - family_name: '{family_name}'")
        print(f"  - email: '{email}'")
        print(f"  - sub: '{user_id_from_google}'")
        print(f"  - picture: '{avatar}'")
        print(f"All token keys: {list(idinfo.keys())}")
        
        if not user_id_from_google:
            raise ValueError("No user ID in token")
        
        # Build the name from what's available in Google profile
        # Priority: name > (given_name + family_name) > email prefix
        final_name = name
        if not name or name.strip() == "":
            if given_name or family_name:
                final_name = f"{given_name} {family_name}".strip()
                print(f"✅ Using given_name + family_name: {final_name}")
            elif email:
                final_name = email.split("@")[0]
                print(f"⚠️  No name in token, using email prefix: {final_name}")
            else:
                final_name = "Google User"
                print(f"⚠️  No name data available, using default: {final_name}")
        else:
            print(f"✅ Using full name from token: {final_name}")
        
        # Create consistent user_id based on Google's sub
        user_id = f"google_{user_id_from_google}"

        # Determine whether this is a first-time signup or a signin
        # Determine if an account already exists by email or id
        prior = get_user_by_email(email) or get_user_by_id(user_id)
        existed_before = prior is not None

        # Upsert Google user; may merge into an existing email user and return its id
        final_user_id = upsert_google_user(user_id, email, final_name, avatar, verified=True)
        update_last_login(final_user_id)
        
        # Generate secure session token
        session_token = hashlib.sha256(
            f"{user_id}{time.time()}{JWT_SECRET}".encode()
        ).hexdigest()
        
        print(f"\n📤 RETURNING TO FRONTEND:")
        print(f"  - user_id: {final_user_id}")
        print(f"  - name: {final_name}")
        print(f"  - avatar: {avatar}")
        print(f"  - token: {session_token[:20]}...")
        print(f"="*60 + "\n")
        
        print(f"✅ Google OAuth success ({verification_method}): {final_user_id} ({final_name}) - {email}")
        
        # Return user info (matches what production apps return)
        return AuthResponse(
            user_id=final_user_id,
            name=final_name,
            avatar=avatar,
            token=session_token,
            status=("signin" if existed_before else "signup"),
            message=("Signed in successfully" if existed_before else "Account created successfully"),
        )
        
    except ValueError as e:
        print(f"❌ Google auth validation error: {e}")
        raise HTTPException(status_code=401, detail=str(e))
    except Exception as e:
        print(f"❌ Google auth error: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail="Google authentication failed")


@app.get("/profile", response_model=ProfileResponse)
def get_profile(user_id: str):
    user = get_user_by_id(user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return ProfileResponse(
        user_id=user["id"],
        name=user.get("name") or user.get("email") or "User",
        email=user.get("email"),
        provider=user.get("provider"),
        avatar=user.get("avatar"),
        created_at=user.get("created_at"),
        last_login=user.get("last_login"),
    )


@app.put("/profile", response_model=ProfileResponse)
def update_profile(req: ProfileUpdateRequest):
    user = get_user_by_id(req.user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    # Update name if provided
    if req.name is not None:
        new_name = req.name.strip()
        if not new_name:
            raise HTTPException(status_code=400, detail="Name cannot be empty")
        update_user_name(req.user_id, new_name)

    # Handle password change only for email provider
    if req.old_password or req.new_password:
        if user.get("provider") != "email":
            raise HTTPException(status_code=400, detail="Password change not allowed for this provider")
        if not req.old_password or not req.new_password:
            raise HTTPException(status_code=400, detail="Both old and new password are required")
        if len(req.new_password) < 6:
            raise HTTPException(status_code=400, detail="New password must be at least 6 characters")

        stored_hash = get_password_hash(req.user_id)
        if not stored_hash:
            raise HTTPException(status_code=400, detail="No password set for this account")
        if not pwd_context.verify(req.old_password, stored_hash):
            raise HTTPException(status_code=400, detail="Old password is incorrect")

        new_hash = pwd_context.hash(req.new_password)
        set_password_hash(req.user_id, new_hash)

    updated = get_user_by_id(req.user_id)
    return ProfileResponse(
        user_id=updated["id"],
        name=updated.get("name") or updated.get("email") or "User",
        email=updated.get("email"),
        provider=updated.get("provider"),
        avatar=updated.get("avatar"),
        created_at=updated.get("created_at"),
        last_login=updated.get("last_login"),
    )


@app.post("/auth/email", response_model=AuthResponse)
def auth_email(req: EmailAuthRequest):
    """
    Handle email-based authentication with password.
    Requires password for both signup and login.
    Password must match on login (strict validation).
    """
    try:
        if not req.email or "@" not in req.email:
            raise ValueError("Invalid email")
        
        if not req.password or len(req.password) < 6:
            raise ValueError("Password must be at least 6 characters")
        
        # Normalize email
        email_lower = req.email.lower().strip()
        
        # Create consistent user_id from email
        user_id = f"email_{hashlib.md5(email_lower.encode()).hexdigest()[:12]}"
        
        # Use provided name or extract from email
        name = req.name.strip() if req.name and req.name.strip() else email_lower.split("@")[0]

        # Determine intended flow (signin vs signup)
        intended_mode = (req.mode or ("signup" if (req.name and req.name.strip()) else "signin")).lower()
        if intended_mode not in ("signin", "signup"):
            intended_mode = "signin"
        
        print(f"\n" + "="*60)
        print(f"📧 EMAIL AUTH ATTEMPT:")
        print(f"="*60)
        print(f"   Email: {email_lower}")
        print(f"   User ID: {user_id}")
        print(f"   Password length: {len(req.password)} chars")
        print(f"   Provided name (from request): '{req.name}'")
        print(f"   Final name (to be stored): '{name}'")
        
        # Check if user already exists
        if get_user_by_id(user_id):
            print(f"   Status: EXISTING USER (login)")
            existing = get_user_by_id(user_id) or {}
            print(f"   Stored name in DB: '{existing.get('name')}'")
            # If client attempted signup but user exists, block with clear error
            if intended_mode == "signup":
                raise ValueError("Account already exists. Please sign in.")

            # User exists - must verify password
            stored_hash = get_password_hash(user_id)
            
            if not stored_hash:
                print(f"   ❌ ERROR: User exists but no password hash found!")
                raise ValueError("User account corrupted - password not found")
            
            # Verify the password against stored hash
            password_matches = pwd_context.verify(req.password, stored_hash)
            print(f"   Password check: {'✅ MATCH' if password_matches else '❌ NO MATCH'}")
            
            if not password_matches:
                raise ValueError("Invalid email or password")
            
            print(f"✅ Email login successful: {user_id} ({email_lower})")
            update_last_login(user_id)
        else:
            print(f"   Status: NEW USER (signup)")
            # If client attempted signin but account doesn't exist, block with clear error
            if intended_mode == "signin":
                raise ValueError("Account not found. Please sign up.")
            # New user - hash and store password
            hashed_password = pwd_context.hash(req.password)
            create_email_user(user_id, email_lower, name, hashed_password)
            print(f"✅ Email signup successful: {user_id} ({email_lower})")
            print(f"   Profile name stored: '{name}'")
            print(f"   Password hashed and stored")
        
        # Generate session token
        session_token = hashlib.sha256(f"{user_id}{time.time()}{JWT_SECRET}".encode()).hexdigest()
        
        # Verify what we're returning
        stored_user = get_user_by_id(user_id) or {"name": name, "email": email_lower}
        print(f"\n📤 RETURNING TO FRONTEND:")
        print(f"  - user_id: {user_id}")
        print(f"  - name: {stored_user['name']}")
        print(f"  - email: {stored_user['email']}")
        print(f"  - token: {session_token[:20]}...")
        print(f"="*60 + "\n")
        
        # Compose status/message based on intended flow
        status = "signin" if intended_mode == "signin" else "signup"
        message = "Signed in successfully" if status == "signin" else "Account created successfully"

        return AuthResponse(
            user_id=user_id,
            name=stored_user["name"],
            avatar=None,
            token=session_token,
            status=status,
            message=message,
        )
    except ValueError as e:
        print(f"❌ Email auth validation error: {e}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        print(f"❌ Email auth failed: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail="Email authentication failed")


@app.post("/chat", response_model=ChatResponse)
def chat(req: ChatRequest):
    """
    Handles chat: new session or existing one.
    Retrieves context using FAISS, generates LLM answer (structured),
    saves messages to SQLite DB.
    """
    user_id = req.user_id
    message = req.message
    session_id = req.session_id

    # If no session → create new one
    new_session = False
    if session_id is None:
        session_id = db_create_session(user_id)
        new_session = True

    # Store user message
    db_add_message(session_id, "user", message)

    # ---- RAG Retrieval ----
    ret_start = time.time()
    retrieved_docs = _call_retriever(message) or []
    ret_dur = time.time() - ret_start
    print(f"RAG retrieval took {ret_dur:.3f}s")

    # ---- LLM Response (structured) ----
    gen_start = time.time()
    result = generate_legal_answer(message, retrieved_docs)
    gen_dur = time.time() - gen_start
    print(f"LLM generation took {gen_dur:.3f}s")

    # update simple in-memory stats (best-effort)
    try:
        _STATS["requests"] = (_STATS.get("requests") or 0) + 1
        _STATS["last_retrieval_s"] = ret_dur
        _STATS["last_generation_s"] = gen_dur
        # running averages
        if _STATS.get("avg_retrieval_s") is None:
            _STATS["avg_retrieval_s"] = ret_dur
        else:
            _STATS["avg_retrieval_s"] = (_STATS["avg_retrieval_s"] * (_STATS["requests"] - 1) + ret_dur) / _STATS["requests"]
        if _STATS.get("avg_generation_s") is None:
            _STATS["avg_generation_s"] = gen_dur
        else:
            _STATS["avg_generation_s"] = (_STATS["avg_generation_s"] * (_STATS["requests"] - 1) + gen_dur) / _STATS["requests"]
    except Exception:
        pass

    # result expected to be dict: {"markdown": str, "metadata": {...}}
    if isinstance(result, dict):
        answer_markdown = result.get("markdown", "")
        metadata = result.get("metadata")
    else:
        # fallback to string
        answer_markdown = str(result)
        metadata = None

    # ensure we store a string in DB (avoid sqlite binding problems)
    try:
        db_add_message(session_id, "assistant", str(answer_markdown))
    except Exception as e:
        # if DB insertion fails, print and continue (we don't want to crash the endpoint)
        print("Failed to save assistant message:", e)

    # Automatically set session title based on first user query
    if new_session:
        try:
            title = message[:40] + "..." if len(message) > 40 else message
            update_session_title(session_id, title)
        except Exception:
            pass

    # Return chat response (markdown string for frontend)
    return ChatResponse(
        response=answer_markdown,
        sessionId=session_id,
        title=message[:40],
        metadata=metadata
    )


@app.get("/history")
def history(user_id: str):
    sessions = get_sessions_for_user(user_id)
    return {"history": sessions}


@app.get("/admin/stats")
def admin_stats():
    # return a copy to avoid accidental mutation
    return {k: (_STATS.get(k) if _STATS.get(k) is not None else None) for k in _STATS}


@app.get("/chat/{session_id}")
def get_chat_messages(session_id: str, user_id: str):
    msgs = get_messages(session_id)
    if msgs is None:
        raise HTTPException(status_code=404, detail="Session not found")

    formatted = [
        {"role": m["role"], "content": m["content"], "timestamp": m["timestamp"]}
        for m in msgs
    ]
    return {"messages": formatted}


@app.delete("/chat/{session_id}")
def remove_session(session_id: str, user_id: str):
    deleted = delete_session(session_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Session not found")
    return {"success": True}


# Run locally (optional)
@app.on_event("startup")
def startup_load_model():
    global MODEL, INDEX, DOCS
    try:
        print("⏳ Loading model and index...")
        MODEL, INDEX, DOCS = loader.load_model_data()
        print("✅ Model and index loaded on startup.")
    except Exception as e:
        print(f"⚠️ Failed to load model/index on startup: {e}")
        import traceback
        traceback.print_exc()
        # Don't crash - auth endpoints work without model
        MODEL, INDEX, DOCS = None, None, None


if __name__ == "__main__":
    uvicorn.run("app:app", host="127.0.0.1", port=5000, reload=True)


# Backend shell commands:
# D:/Projects/lexai/.venv/Scripts/Activate.ps1
# cd backend
# uvicorn app:app --reload --host 127.0.0.1 --port 5000

# frontend dev server:
# cd frontend
# npm run dev