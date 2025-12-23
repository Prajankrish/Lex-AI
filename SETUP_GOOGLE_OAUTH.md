# Complete Google OAuth Setup Guide

## Step 1: Get Your Own Google Client ID

### Go to Google Cloud Console:
1. Open https://console.cloud.google.com/
2. **Create a new project:**
   - Click "Select a Project" at top
   - Click "New Project"
   - Name: "LEXAI" (or your app name)
   - Click "Create"
   - Wait for it to be created

### Step 2: Enable Google+ API

1. In the left sidebar, go to **APIs & Services** → **Library**
2. Search for "Google+ API"
3. Click on it and click **"Enable"**
4. Wait for it to be enabled

### Step 3: Create OAuth 2.0 Credentials

1. Go to **APIs & Services** → **Credentials**
2. Click **"+ Create Credentials"** → **"OAuth 2.0 Client ID"**
3. You'll see a warning "You will need to create a consent screen first"
4. Click **"Create OAuth consent screen"**

### Step 4: Configure OAuth Consent Screen

1. Choose **"External"** user type
2. Click **"Create"**
3. Fill in the form:
   - **App name:** LEXAI
   - **User support email:** your-email@gmail.com
   - **Developer contact:** your-email@gmail.com
4. Click **"Save and Continue"**
5. On "Scopes" page, click **"Save and Continue"**
6. On "Test users" page, click **"Save and Continue"**
7. Review and click **"Back to Dashboard"**

### Step 5: Create OAuth Client ID

1. Go to **APIs & Services** → **Credentials**
2. Click **"+ Create Credentials"** → **"OAuth 2.0 Client ID"**
3. Choose **"Web application"**
4. Name: "LEXAI Web Client"
5. Under **"Authorized JavaScript origins"**, add:
   ```
   http://localhost:3000
   http://localhost:3001
   http://localhost:5173
   http://localhost:8080
   http://localhost:8000
   ```
6. Under **"Authorized redirect URIs"**, add:
   ```
   http://localhost:5173/
   http://localhost:3000/
   http://localhost:8000/
   ```
7. Click **"Create"**
8. A popup will show your credentials:
   - **Copy your Client ID** (looks like: `123456789-abc...apps.googleusercontent.com`)
   - **Copy your Client Secret** (looks like: `GOCSPX-...`)

---

## Step 6: Update Your Application

### Update Backend (.env file):

```env
GOOGLE_CLIENT_ID=YOUR_CLIENT_ID_HERE
GOOGLE_CLIENT_SECRET=YOUR_CLIENT_SECRET_HERE
```

### Update Frontend (Login.tsx):

In `frontend/src/components/Login.tsx`, change line ~29 from:
```typescript
client_id: '1045405970879-8o6pdds9gbltq728dg2lcg3u76l50msc.apps.googleusercontent.com',
```

To:
```typescript
client_id: 'YOUR_CLIENT_ID_HERE',
```

---

## Step 7: Restart Your App

1. Restart the **backend** (Ctrl+C and run again)
2. Restart the **frontend** (Ctrl+C and run again)
3. Clear your browser cache (Ctrl+Shift+Delete)
4. Try Google Sign-In again

---

## Common Issues & Fixes

### "origin_mismatch" error:
- Make sure you added `http://localhost:5173` to "Authorized JavaScript origins" in Google Console
- Clear browser cache and refresh

### "The given m-credential button library is not allowed...":
- You're using the wrong Client ID
- Generate a new one as described above

### "Failed to load resource: status 403":
- Google Cloud Console needs to process your changes (wait 2-3 minutes)
- Or origin isn't registered correctly

---

## Quick Checklist:

- [ ] Created Google Cloud Project
- [ ] Enabled Google+ API
- [ ] Created OAuth consent screen
- [ ] Created OAuth 2.0 Client ID
- [ ] Added http://localhost:5173 to Authorized JavaScript origins
- [ ] Copied Client ID and Client Secret
- [ ] Updated backend/.env
- [ ] Updated frontend/src/components/Login.tsx
- [ ] Restarted backend
- [ ] Restarted frontend
- [ ] Cleared browser cache
- [ ] Tested Google Sign-In
