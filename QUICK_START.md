# Quick Start: Real Authentication

## What You Have Now

✅ **Working login page** with email and Google buttons  
✅ **Demo mode** - login with any email  
✅ **Backend endpoints** ready for real authentication  
✅ **Frontend functions** ready for Google/Email auth  

## Choose Your Path

### 🚀 Path 1: Use Demo (Test Now - No Setup)

You're already set! Just:

```bash
# Frontend already running on http://localhost:3001
# Enter any email and click "Continue with Email"
# ✅ Logged in!
```

### 🔑 Path 2: Enable Google OAuth (30 min)

**Step 1: Get Google Client ID**
```
1. Go to https://console.cloud.google.com/
2. Create new project or select existing
3. Search "Google+ API" → Enable it
4. Go to Credentials → Create OAuth 2.0 Client ID
5. Select "Web application"
6. Authorized JavaScript origins: http://localhost:3001
7. Copy your Client ID
```

**Step 2: Update Code**
```typescript
// File: frontend/src/components/Login.tsx
// Line 40: Replace this:
client_id: 'YOUR_GOOGLE_CLIENT_ID',
// With your actual Client ID from step 1
```

**Step 3: Add Google Script**
```html
<!-- File: frontend/index.html -->
<!-- Add in <head> section: -->
<script src="https://accounts.google.com/gsi/client" async defer></script>
```

**Step 4: Test**
```
1. Refresh http://localhost:3001
2. Click "Continue with Google"
3. Sign in with your Google account
4. ✅ You're logged in!
```

### 📧 Path 3: Email + Password (1 hour)

**Step 1: Install packages**
```bash
pip install passlib bcrypt
```

**Step 2: Update backend** (`backend/app.py`)

Replace the `auth_email` function with:

```python
from passlib.context import CryptContext

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

@app.post("/auth/email", response_model=AuthResponse)
def auth_email(req: EmailAuthRequest):
    """Email login with password"""
    if not req.password:
        raise HTTPException(status_code=400, detail="Password required")
    
    email = req.email.lower()
    user_id = hashlib.md5(email.encode()).hexdigest()[:16]
    
    # For demo: accept any password, store user
    hashed_pwd = pwd_context.hash(req.password)
    
    _USERS[user_id] = {
        "name": email.split('@')[0],
        "email": email,
        "hashed_password": hashed_pwd,
        "provider": "email"
    }
    
    token = hashlib.sha256(f"{user_id}{time.time()}".encode()).hexdigest()
    
    return AuthResponse(
        user_id=user_id,
        name=email.split('@')[0],
        token=token
    )
```

**Step 3: Test**
```
1. Go to http://localhost:3001
2. Enter email
3. Click "Sign in with password instead"
4. Enter password (any password works in demo)
5. ✅ You're logged in!
```

## Common Questions

### Q: Google OAuth not working?
**A**: Make sure you:
- ✅ Added Client ID to Login.tsx
- ✅ Added Google script to index.html
- ✅ Using http://localhost:3001 (not 3000)

### Q: Where does auth token go?
**A**: Stored in localStorage:
- `localStorage['lexai_user']` - User info
- `localStorage['lexai_token']` - Auth token

### Q: How to send auth token to backend?
**A**: Already done in `api.ts`:
```typescript
// Automatically sends token in request headers
const response = await fetch('/chat', {
  headers: {
    'Authorization': `Bearer ${getAuthToken()}`
  }
})
```

### Q: Can I use both email AND password?
**A**: Yes! The frontend already has toggle:
1. Click "Sign in with password instead"
2. Password field appears
3. Backend handles both

### Q: Will login survive page refresh?
**A**: Yes! User is restored from localStorage automatically.

### Q: How to logout?
**A**: Click logout button (top right after login). It clears localStorage.

## Testing Checklist

- [ ] Frontend runs on http://localhost:3001
- [ ] Login page displays with email field
- [ ] "Continue with Email" button works
- [ ] Can enter any email and login
- [ ] Page shows chat after login
- [ ] Logout button appears
- [ ] Page refresh keeps you logged in
- [ ] Logout clears session

## Troubleshooting

### Blank page on localhost:3001?
```bash
# Kill and restart frontend
cd frontend
npm run dev
```

### Backend errors on auth endpoints?
```bash
# Check backend is running
cd backend
uvicorn app:app --reload
# Should see: Uvicorn running on http://127.0.0.1:5000
```

### Cannot login?
1. Check browser console (F12) for errors
2. Check backend terminal for error messages
3. Make sure both frontend (3001) and backend (5000) are running

## Files Modified

```
✨ NEW:
- frontend/src/index.css (Tailwind directives)
- AUTH_SETUP.md (Complete auth guide)
- IMPLEMENTATION_STATUS.md (What's implemented)

✏️ UPDATED:
- frontend/src/services/auth.ts (New auth functions)
- frontend/src/components/Login.tsx (Email + Google UI)
- frontend/src/App.tsx (Clean auth flow)
- frontend/tailwind.config.js (Custom colors)
- backend/app.py (Auth endpoints)
```

## Next: Going to Production

1. **Get real Google Client ID** (not localhost)
2. **Implement password hashing** (use bcrypt)
3. **Add database** for user storage
4. **Deploy with HTTPS** (required for OAuth)
5. **Add session timeouts** (token expiration)
6. **Implement email verification** (if email auth)

---

## Need Help?

1. **Detailed setup**: See `AUTH_SETUP.md`
2. **What's implemented**: See `IMPLEMENTATION_STATUS.md`
3. **Full auth flow**: Check `frontend/src/services/auth.ts`
4. **Backend routes**: Check `backend/app.py` /auth/* endpoints

**Ready to go! Start testing on http://localhost:3001** 🚀
