# OAuth2 & Google Sheets Integration - Implementation Guide

This guide explains how the OAuth2 and Google Sheets API integration works in the Company Insights application.

## Architecture Overview

```
┌─────────────────┐
│   Browser App   │
├─────────────────┤
│ ExportButton    │
└────────┬────────┘
         │
         │ 1. Click "Authorize Google Sheets"
         │
    ┌────▼─────────────────────┐
    │ /api/sheets/auth         │
    │ (OAuth Initiation)       │
    └────┬──────────────────────┘
         │
         │ 2. Redirect to Google
         │
    ┌────▼──────────────────────────────┐
    │ https://accounts.google.com/       │
    │ (User Logs in & Authorizes)       │
    └────┬───────────────────────────────┘
         │
         │ 3. Callback with Auth Code
         │
    ┌────▼────────────────────────────┐
    │ /api/sheets/callback             │
    │ (Exchange Code for Tokens)       │
    └────┬─────────────────────────────┘
         │
         │ 4. Store Tokens in Cookies
         │
    ┌────▼────────────────────────┐
    │ Browser (Secure HTTP-only   │
    │ cookies with tokens)        │
    └────┬─────────────────────────┘
         │
         │ 5. User clicks "Export to Google Sheets"
         │
    ┌────▼───────────────────────────┐
    │ /api/sheets/export              │
    │ (Uses token from cookies)       │
    └────┬──────────────────────────┤
         │
         │ 6. Call Google Sheets API
         │
    ┌────▼──────────────────────────────┐
    │ Google Sheets API                  │
    │ - Create spreadsheet               │
    │ - Populate with financial data     │
    │ - Return spreadsheet URL           │
    └───────────────────────────────────┘
```

## API Endpoints

### 1. `/api/sheets/auth` - OAuth2 Initiation
**Method:** GET  
**Description:** Initiates OAuth2 flow by redirecting to Google login  
**Response:** Redirect to Google authorization URL

**Scopes Requested:**
- `https://www.googleapis.com/auth/spreadsheets` - Create and edit spreadsheets
- `https://www.googleapis.com/auth/drive.file` - Manage files created by the app

### 2. `/api/sheets/callback` - OAuth2 Callback
**Method:** GET  
**Description:** Handles callback from Google after user authorization  
**Query Parameters:**
- `code` - Authorization code from Google
- `state` - CSRF protection token
- `error` - Error code if authorization failed

**Response:**
- Sets secure HTTP-only cookies with tokens:
  - `google_access_token` - Short-lived token (1 hour)
  - `google_refresh_token` - Long-lived token (30 days)
- Redirects to home page with success/error status

### 3. `/api/sheets/status` - Check Authentication Status
**Method:** GET  
**Description:** Verifies if user has valid Google authentication tokens  
**Response:**
```json
{ "authenticated": true/false }
```

### 4. `/api/sheets/export` - Export to Google Sheets
**Method:** POST  
**Description:** Creates a new Google Sheet and populates it with financial data  
**Request Body:**
```json
{
  "company": {
    "ticker": "TCS",
    "name": "Tata Consultancy Services",
    "sector": "IT Services",
    "marketCap": "$150B"
  },
  "financialResults": [
    {
      "quarter": "Q1",
      "year": 2024,
      "revenue": 3350,
      "netIncome": 1200,
      "eps": 20.5,
      "roe": 26.8,
      "roa": 22.4,
      "debtToEquity": 0.38
    }
  ],
  "presentations": [...],
  "transcripts": [...]
}
```

**Response:**
```json
{
  "success": true,
  "spreadsheetId": "1a2b3c4d5e...",
  "sheetUrl": "https://docs.google.com/spreadsheets/d/1a2b3c4d5e/edit",
  "message": "Successfully created Google Sheet: TCS - Financial Data - 2026-05-09"
}
```

## Security Implementation

### Token Management
- **Access Tokens**: Stored in secure HTTP-only cookies (1 hour expiry)
- **Refresh Tokens**: Stored in secure HTTP-only cookies (30 days expiry)
- **Token Refresh**: Automatic refresh if access token expires
- **HTTPS Only**: Secure flag enabled in production
- **SameSite**: Lax restriction to prevent CSRF attacks

### Error Handling
- Invalid or expired tokens automatically trigger re-authorization
- Secure error messages without exposing sensitive data
- Failed token exchanges prevent access to sensitive APIs

## Frontend Implementation

### `useGoogleSheets` Hook
Located in `lib/useGoogleSheets.ts`

```typescript
const {
  isAuthenticated,  // boolean - Is user logged in?
  loading,          // boolean - Is an operation in progress?
  error,           // string | null - Current error message
  initiateAuth,    // () => void - Start OAuth2 flow
  exportToSheets,  // (data) => Promise - Export data to sheets
  setError        // (msg) => void - Set custom error
} = useGoogleSheets();
```

### Component Integration
The `ExportButton` component automatically:
1. Checks authentication status on mount
2. Handles OAuth flow initiation
3. Manages loading states during API calls
4. Displays success/error messages
5. Provides links to created sheets

## Testing the OAuth2 Flow

### Step 1: Manual Testing in Browser

```bash
# 1. Start dev server
node ./node_modules/next/dist/bin/next dev

# 2. Open http://localhost:3000

# 3. Search for a company (e.g., TCS)

# 4. Click "🔑 Authorize Google Sheets"

# 5. Follow the Google login flow

# 6. After authorization, button changes to "📊 Export to Google Sheets"

# 7. Click export button

# 8. A new Google Sheet is created and link is provided
```

### Step 2: Verify Token Storage

In browser DevTools:

```javascript
// Check cookies
document.cookie

// Should see:
// google_access_token=...
// google_refresh_token=...
```

### Step 3: Test Token Refresh

```javascript
// The system automatically refreshes tokens when they expire
// To test manually, wait 1 hour or modify cookie expiry

// Try exporting again after access token expires
// Should work because refresh token is used to get new access token
```

## Troubleshooting

### "Redirect URI mismatch" Error
**Problem:** The redirect URI in the code doesn't match what's in Google Cloud Console

**Solution:**
1. Go to Google Cloud Console
2. Go to Credentials
3. Edit the OAuth client
4. Verify "Authorized redirect URIs" includes:
   - `http://localhost:3000/api/sheets/callback`
   - `https://your-production-domain.com/api/sheets/callback` (for production)

### "Invalid client" Error
**Problem:** Client ID or Client Secret is incorrect

**Solution:**
1. Verify `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` in `.env.local`
2. Recopy from Google Cloud Console
3. Restart dev server after changing env vars

### "Not authenticated" When Exporting
**Problem:** Cookies were cleared or session expired

**Solution:**
1. Click "🔑 Authorize Google Sheets" again
2. Follow the OAuth flow
3. Try exporting again

### Sheet Not Creating
**Problem:** Google Sheets API is not enabled

**Solution:**
1. Go to Google Cloud Console
2. Go to APIs & Services → Library
3. Search for "Google Sheets API"
4. Click and enable it

### "Too many redirect" Loops
**Problem:** Circular redirect between auth and callback

**Solution:**
1. Clear browser cookies for localhost:3000
2. Clear browser cache
3. Hard refresh (Ctrl+Shift+R)
4. Try again

## Production Deployment

### Environment Variables
Set these in your production environment:

```env
GOOGLE_CLIENT_ID=your_production_client_id
GOOGLE_CLIENT_SECRET=your_production_client_secret
GOOGLE_REDIRECT_URI=https://your-production-domain.com/api/sheets/callback
```

### Google Cloud Console Setup
1. Create a new OAuth client for production
2. Add production domain to authorized redirect URIs
3. Set up OAuth consent screen for production users
4. Consider using separate Google Cloud projects for dev/prod

### Security Best Practices
1. **Never commit secrets** to version control
2. Use environment variable management from your hosting platform
3. Enable HTTPS in production (secure cookies require this)
4. Monitor token usage in Google Cloud Console
5. Set up audit logging for API calls

## Performance Optimization

### Token Caching
- Access tokens are cached in HTTP-only cookies
- Reduces number of token validation calls
- Automatic refresh before expiration

### API Rate Limiting
- Google Sheets API has rate limits per user/project
- Implement caching for large data exports
- Consider queuing multiple exports

### Cold Start Optimization
- First OAuth flow takes 2-3 seconds (redirects)
- Subsequent exports are 1-2 seconds (API calls only)
- Token refresh happens automatically in background

## Monitoring & Debugging

### Enable Logging

In `.env.local`:
```env
DEBUG=company-insights:*
NODE_DEBUG_LOG=true
```

### Check API Quotas

Google Cloud Console → APIs & Services → Quotas
- Monitor Google Sheets API usage
- Set up alerts for quota warnings

### Test API Directly

```bash
# Test access token validity
curl -X GET "https://www.googleapis.com/oauth2/v1/tokeninfo?access_token=YOUR_ACCESS_TOKEN"

# Should return token info without error
```

## References

- [Google Sheets API Documentation](https://developers.google.com/sheets/api)
- [OAuth2 Protocol Documentation](https://datatracker.ietf.org/doc/html/rfc6749)
- [Google OAuth2 Implementation Guide](https://developers.google.com/identity/protocols/oauth2)
- [Next.js API Routes Documentation](https://nextjs.org/docs/app/building-your-application/routing/route-handlers)
