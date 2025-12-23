# Fix Google OAuth Error 400: origin_mismatch

## Problem
You're getting: **Error 400: origin_mismatch**

This means the Google Client ID is not authorized for your current domain/origin.

## Solution

### Option 1: Get Your Own Google Client ID (Recommended)

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project (or use existing)
3. Go to **APIs & Services** → **Credentials**
4. Click **Create Credentials** → **OAuth 2.0 Client ID**
5. Choose **Web application**
6. Add **Authorized JavaScript origins:**
   - `http://localhost:3000`
   - `http://localhost:3001`
   - `http://localhost:5173` ← This is likely your current origin
   - `http://localhost:8000`
   - `http://localhost:8080`
7. Add **Authorized redirect URIs:**
   - `http://localhost:5173/`
   - `http://localhost:3000/`
8. Copy your **Client ID**

### Option 2: Update Your Current Setup

1. Get your **Client ID** from Google Cloud Console
2. Update `frontend/src/components/Login.tsx` line 29:
   ```typescript
   client_id: 'YOUR_NEW_CLIENT_ID_HERE',
   ```
3. Update `backend/.env`:
   ```
   GOOGLE_CLIENT_ID=YOUR_NEW_CLIENT_ID_HERE
   GOOGLE_CLIENT_SECRET=YOUR_NEW_CLIENT_SECRET_HERE
   ```

## Check Your Current Origin

Open browser Developer Tools (F12) and check Console when you see the error:
- Look for the origin being used (likely `http://localhost:5173`)
- Add this exact origin to Google Cloud Console

## After You Fix It

1. Restart your backend
2. Restart your frontend
3. Try Google login again - should work!
