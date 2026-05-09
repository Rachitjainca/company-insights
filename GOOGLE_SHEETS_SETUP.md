# Google Sheets API Setup Guide

This guide walks you through setting up Google Cloud Project and enabling Google Sheets API for the Company Insights application.

## Step 1: Create a Google Cloud Project

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Click on the project dropdown at the top
3. Click **NEW PROJECT**
4. Enter project name: `Company Insights`
5. Click **CREATE**
6. Wait for the project to be created (1-2 minutes)

## Step 2: Enable Google Sheets API

1. In the Cloud Console, make sure you're in your new project
2. Go to **APIs & Services** → **Library**
3. Search for "Google Sheets API"
4. Click on **Google Sheets API**
5. Click **ENABLE**

## Step 3: Create OAuth2 Credentials

### A. Configure OAuth Consent Screen

1. Go to **APIs & Services** → **OAuth consent screen**
2. Select **External** (unless you're in a Google Workspace account)
3. Click **CREATE**
4. Fill in the form:
   - **App name**: `Company Insights`
   - **User support email**: Your email
   - **Developer contact**: Your email
5. Click **SAVE AND CONTINUE**
6. Skip the scopes screen (click **SAVE AND CONTINUE**)
7. Skip test users (click **SAVE AND CONTINUE**)
8. Review and click **BACK TO DASHBOARD**

### B. Create OAuth2 Client ID

1. Go to **APIs & Services** → **Credentials**
2. Click **+ CREATE CREDENTIALS** → **OAuth client ID**
3. Choose **Web application**
4. Fill in the form:
   - **Name**: `Company Insights Web Client`
   - **Authorized redirect URIs**: Add these:
     - `http://localhost:3000/api/auth/google/callback`
     - `http://localhost:3000/api/sheets/callback`
     - (Add your production URL later)
5. Click **CREATE**
6. Copy the **Client ID** and **Client Secret**
7. Click **OK**

## Step 4: Set Environment Variables

Create a `.env.local` file in your project root:

```env
# Google OAuth2
GOOGLE_CLIENT_ID=your_client_id_here
GOOGLE_CLIENT_SECRET=your_client_secret_here
GOOGLE_REDIRECT_URI=http://localhost:3000/api/sheets/callback

# Google Sheets
NEXT_PUBLIC_SPREADSHEET_ID=your_spreadsheet_id_here
```

Replace:
- `your_client_id_here` with the Client ID from Step 3B
- `your_client_secret_here` with the Client Secret from Step 3B

## Step 5: Test the Setup

1. Start the dev server: `node ./node_modules/next/dist/bin/next dev`
2. Open http://localhost:3000
3. Search for a company (e.g., TCS)
4. Click **Export to Google Sheets**
5. You should be redirected to Google login
6. After authorizing, the app creates a new Google Sheet with your data

## Troubleshooting

### "Redirect URI mismatch" error
- Make sure the redirect URI in your credentials matches exactly what's in your code
- Check for trailing slashes and http vs https

### "Invalid client" error
- Verify your Client ID and Client Secret are correct
- Make sure they're set in `.env.local`

### "Access denied" error
- Make sure the OAuth consent screen is configured
- Your app is set to "External" user type

### Sheet not creating
- Check the browser console for error messages
- Verify Google Sheets API is enabled in Cloud Console
- Make sure your Google account has permission to create sheets

## Production Deployment

When deploying to production:

1. Add your production URL to OAuth Redirect URIs:
   - `https://your-domain.com/api/sheets/callback`

2. Update environment variables in your hosting platform:
   - Set `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`

3. Create a new OAuth client ID specifically for production if desired

## References

- [Google Sheets API Documentation](https://developers.google.com/sheets/api)
- [Google OAuth2 Documentation](https://developers.google.com/identity/protocols/oauth2)
- [Next.js Environment Variables](https://nextjs.org/docs/basic-features/environment-variables)
