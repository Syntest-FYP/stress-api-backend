# Backend Setup Instructions

## ⚠️ SUPABASE CONFIGURATION REQUIRED

Your backend is currently running **without Supabase credentials**, which is causing the registration API to fail.

## Quick Fix Steps:

### 1. Create `.env` File
Create a `.env` file in the `stress-api-backend` directory with:

```bash
# Supabase Configuration (REQUIRED)
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key-here
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key-here

# Server Configuration
NODE_ENV=development
PORT=3000
SESSION_SECRET=generate-a-random-secret-key-here
```

### 2. Get Your Supabase Credentials

1. Go to [https://supabase.com](https://supabase.com)
2. Sign in to your account
3. Select your project
4. Go to **Settings** → **API**
5. Copy:
   - **Project URL** → Use as `SUPABASE_URL`
   - **anon/public** key → Use as `SUPABASE_ANON_KEY`  
   - **service_role** key → Use as `SUPABASE_SERVICE_ROLE_KEY`

### 3. Restart Backend Server

After creating the `.env` file:

```bash
# Stop the current server (Ctrl+C)
# Then restart:
npm run dev
```

### 4. Test the API

Once configured, test the endpoint:

```bash
# Test registration endpoint
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"password123"}'
```

You should see a successful response instead of an error.

## Current Error

Without the `.env` file, your backend shows:
```
❌ SUPABASE_URL environment variable is missing!
❌ SUPABASE_ANON_KEY environment variable is missing!
❌ SUPABASE_SERVICE_ROLE_KEY environment variable is missing!
```

And the registration API returns:
```
"Email address \"test@example.com\" is invalid"
```

This happens because Supabase can't validate the email without proper credentials.

