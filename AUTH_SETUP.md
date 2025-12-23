# LEXAI Authentication Setup Guide

This guide explains how to set up real authentication (Google OAuth and Email) for the LEXAI application.

## Current Status

✅ **Frontend**: Login component with email and Google OAuth UI (ready for integration)  
✅ **Backend**: Auth endpoints `/auth/google` and `/auth/email` (ready for production setup)  
✅ **Demo Mode**: Currently works with demo login (auto-authenticates)

## Option 1: Google OAuth Setup

### Step 1: Get Google Credentials

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select existing one
3. Enable **Google+ API**
4. Go to **Credentials** → Create **OAuth 2.0 Client ID**
5. Choose **Web application**
6. Add authorized JavaScript origins:
   - `http://localhost:3001`
   - `http://localhost:3000`
7. Add authorized redirect URIs:
   - `http://localhost:3001/`
   - `http://localhost:3000/`
8. Copy your **Client ID**

### Step 2: Update Frontend

In `frontend/src/components/Login.tsx`, replace:

```typescript
client_id: 'YOUR_GOOGLE_CLIENT_ID', // ← Replace with your actual Client ID
```

With your actual Client ID from Google Cloud Console.

### Step 3: Add Google Script to HTML

In `frontend/index.html`, add this in the `<head>` section:

```html
<script src="https://accounts.google.com/gsi/client" async defer></script>
```

### Step 4: Update Backend (Optional)

For production security, verify Google tokens in the backend. Update `backend/app.py`:

```python
@app.post("/auth/google", response_model=AuthResponse)
def auth_google(req: GoogleAuthRequest):
    """Verify Google OAuth token"""
    from google.auth.transport import requests
    from google.oauth2 import id_token
    
    try:
        # Verify token with Google's servers
        idinfo = id_token.verify_oauth2_token(
            req.token,
            requests.Request(),
            'YOUR_GOOGLE_CLIENT_ID'  # ← Add your Client ID here
        )
        
        user_id = idinfo['sub']
        name = idinfo.get('name', 'Google User')
        email = idinfo.get('email')
        avatar = idinfo.get('picture')
        
        # Store user in DB
        _USERS[user_id] = {
            "name": name,
            "email": email,
            "avatar": avatar,
            "provider": "google"
        }
        
        token = hashlib.sha256(f"{user_id}{time.time()}".encode()).hexdigest()
        
        return AuthResponse(
            user_id=user_id,
            name=name,
            avatar=avatar,
            token=token
        )
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid Google token")
```

Install required package:
```bash
pip install google-auth
```

---

## Option 2: Email Authentication Setup

### Step 1: Simple Email (Demo Mode - Current)

Currently, any email works. Users are auto-created. This is fine for development/testing.

### Step 2: Email + Password (Production)

For real password authentication:

1. **Update backend** to hash passwords:

```python
from passlib.context import CryptContext

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

@app.post("/auth/email", response_model=AuthResponse)
def auth_email(req: EmailAuthRequest):
    """Email login with password"""
    email = req.email.lower()
    password = req.password
    
    if not password:
        raise HTTPException(status_code=400, detail="Password required")
    
    # Check user exists in DB
    user_record = get_user_by_email(email)  # Your DB function
    
    if not user_record:
        # Option: Allow signup
        hashed_pwd = pwd_context.hash(password)
        user_id = create_user(email, hashed_pwd)  # Your DB function
    else:
        # Verify password
        if not pwd_context.verify(password, user_record['hashed_password']):
            raise HTTPException(status_code=401, detail="Invalid credentials")
        user_id = user_record['id']
    
    token = hashlib.sha256(f"{user_id}{time.time()}".encode()).hexdigest()
    
    return AuthResponse(
        user_id=user_id,
        name=email.split('@')[0],
        token=token
    )
```

2. **Update frontend** Login component to handle password:

The component already has password field toggle! Just ensure backend is connected.

---

## Option 3: Email Magic Link (Passwordless)

### Step 1: Send Magic Link

```python
import secrets
from datetime import datetime, timedelta

magic_links = {}  # {token: {email, expires}}

@app.post("/auth/email/request")
def request_magic_link(req: EmailAuthRequest):
    """Send magic link via email"""
    email = req.email.lower()
    token = secrets.token_urlsafe(32)
    expires = datetime.utcnow() + timedelta(hours=1)
    
    magic_links[token] = {
        "email": email,
        "expires": expires
    }
    
    # TODO: Send email with link
    # send_email(email, f"http://localhost:3001/auth/magic/{token}")
    
    return {"message": "Check your email"}
```

### Step 2: Verify Magic Link

```python
@app.get("/auth/email/magic/{token}")
def verify_magic_link(token: str):
    """Verify magic link and create session"""
    if token not in magic_links:
        raise HTTPException(status_code=400, detail="Invalid link")
    
    link_data = magic_links[token]
    if datetime.utcnow() > link_data["expires"]:
        raise HTTPException(status_code=400, detail="Link expired")
    
    email = link_data["email"]
    user_id = hashlib.md5(email.encode()).hexdigest()[:16]
    
    del magic_links[token]
    
    return {
        "user_id": user_id,
        "name": email.split('@')[0],
        "token": hashlib.sha256(f"{user_id}{time.time()}".encode()).hexdigest()
    }
```

---

## Testing the Setup

### Test with Demo Login (Current)

1. Start frontend: `cd frontend && npm run dev` (port 3001)
2. Start backend: `cd backend && uvicorn app:app --reload` (port 5000)
3. Visit `http://localhost:3001`
4. Enter any email → "Continue with Email"
5. You're logged in!

### Test with Google OAuth

1. Add Google Client ID to `Login.tsx`
2. Click "Continue with Google"
3. Sign in with your Google account
4. Backend receives token and creates user

### Test with Email + Password

1. Update backend as shown above
2. Frontend already has password field
3. Login with email + password

---

## Database Integration

Currently using in-memory `_USERS` dictionary. For production:

1. **Create users table** in SQLite:
```python
CREATE TABLE users (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE,
    name TEXT,
    avatar TEXT,
    hashed_password TEXT,  -- for email auth
    provider TEXT,  -- 'google', 'email', etc
    created_at TIMESTAMP
);
```

2. **Update backend** to use your DB:
```python
# Import your DB functions
from db import get_user_by_email, create_user, update_user
```

3. **Replace in-memory operations** with DB calls

---

## Environment Variables

Create `.env` files for secrets:

### `backend/.env`
```
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret
JWT_SECRET=your_secret_key_here
DATABASE_URL=sqlite:///lexai.sqlite3
```

### `frontend/.env`
```
VITE_GOOGLE_CLIENT_ID=your_google_client_id
```

Then load in your app:
```python
from dotenv import load_dotenv
import os
load_dotenv()
GOOGLE_CLIENT_ID = os.getenv('GOOGLE_CLIENT_ID')
```

---

## Security Best Practices

1. ✅ **Never commit secrets** - Use `.env` files and `.gitignore`
2. ✅ **Verify tokens server-side** - Don't trust frontend validation
3. ✅ **Hash passwords** - Use `bcrypt` or `argon2`
4. ✅ **Use HTTPS in production** - OAuth requires secure connections
5. ✅ **Implement rate limiting** - Prevent brute force
6. ✅ **Add session timeouts** - Tokens should expire
7. ✅ **CORS properly** - Restrict origins in production

---

## Next Steps

1. Choose authentication method (Google OAuth recommended for simplicity)
2. Get credentials from provider
3. Update `client_id` in frontend
4. Test login flow
5. Integrate with your database
6. Deploy with HTTPS

Questions? Check the comments in:
- `frontend/src/services/auth.ts` - Frontend auth logic
- `frontend/src/components/Login.tsx` - Login UI
- `backend/app.py` - Auth endpoints
