# Vercel Deployment Guide

This guide walks you through deploying Company Insights to Vercel with OAuth2 & Google Sheets integration.

## 📋 Prerequisites

- GitHub account (free at github.com)
- Vercel account (free at vercel.com)
- Git installed locally
- Project files ready (already committed to git ✅)

## 🚀 Step-by-Step Deployment

### Step 1: Create GitHub Repository (5 minutes)

1. Go to [github.com/new](https://github.com/new)
2. Fill in:
   - **Repository name**: `company-insights`
   - **Description**: `Financial data platform with OAuth2 & Google Sheets export`
   - **Visibility**: Public or Private (your choice)
3. Click **Create repository**
4. You'll see the setup instructions

### Step 2: Push Code to GitHub (5 minutes)

Copy these commands into PowerShell (one at a time):

```powershell
cd C:\company-insights

git branch -M main

git remote add origin https://github.com/YOUR_USERNAME/company-insights.git

git push -u origin main
```

**Note**: Replace `YOUR_USERNAME` with your actual GitHub username

When prompted, enter your GitHub credentials or use a personal access token.

### Step 3: Deploy to Vercel (3 minutes)

#### Option A: Quick Deploy with Vercel CLI

```powershell
npm install -g vercel

cd C:\company-insights

vercel
```

Then answer the prompts:
- **Project name**: `company-insights` (or your choice)
- **Which scope?**: Select your account
- **Link to existing project?**: No
- **Configure settings?**: No

#### Option B: Deploy via Dashboard (easier)

1. Go to [vercel.com/new](https://vercel.com/new)
2. Click **Import Project**
3. Paste: `https://github.com/YOUR_USERNAME/company-insights`
4. Click **Continue**
5. Click **Deploy**
6. Wait for deployment to complete (~2 minutes)

### Step 4: Update Google OAuth Credentials (5 minutes)

Your Vercel app URL will be something like:
```
https://company-insights-yourname.vercel.app
```

Now update Google OAuth to allow this domain:

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Go to **APIs & Services** → **Credentials**
3. Click on your OAuth2 credential
4. Add new authorized redirect URI:
   ```
   https://company-insights-yourname.vercel.app/api/sheets/callback
   ```
5. Click **Save**

### Step 5: Set Environment Variables in Vercel

1. Go to your [Vercel Dashboard](https://vercel.com/dashboard)
2. Click on your `company-insights` project
3. Go to **Settings** → **Environment Variables**
4. Add these variables (copy values from your `.env.local`):

| Variable | Value | Notes |
|----------|-------|-------|
| `GOOGLE_CLIENT_ID` | Your actual Client ID | From Google Cloud Console |
| `GOOGLE_CLIENT_SECRET` | Your actual Client Secret | From Google Cloud Console |
| `GOOGLE_REDIRECT_URI` | `https://company-insights-yourname.vercel.app/api/sheets/callback` | **Production redirect URI** |

5. Click **Save**
6. **Important**: Redeploy to apply environment variables

### Step 6: Redeploy with New Environment Variables

In Vercel Dashboard:

1. Go to **Deployments**
2. Find the latest deployment
3. Click the three dots (**...**)
4. Click **Redeploy**
5. Click **Redeploy** again
6. Wait for deployment to complete

## ✅ Verify Deployment

1. Open your Vercel app URL:
   ```
   https://company-insights-yourname.vercel.app
   ```

2. Test the app:
   - [ ] Company search works
   - [ ] Financial data displays
   - [ ] QoQ/YoY analysis shows
   - [ ] CSV download works
   - [ ] **🔑 Authorize Google Sheets** button appears
   - [ ] Click authorize button
   - [ ] Redirected to Google login
   - [ ] After login, button says **📊 Export to Google Sheets**
   - [ ] Click export and verify Google Sheet is created

## 🔐 Security Best Practices

### ✅ Do's
- ✅ Use Vercel environment variables for secrets (not in code)
- ✅ Never commit `.env.local` to Git
- ✅ Use different OAuth credentials for dev vs production
- ✅ Enable HTTPS (Vercel does this automatically)
- ✅ Rotate secrets regularly

### ❌ Don'ts
- ❌ Never hardcode secrets in code
- ❌ Never share `.env.local` files
- ❌ Never commit credentials to Git
- ❌ Never use same OAuth client for dev and production

## 🚨 Troubleshooting

### Issue: "Redirect URI mismatch"
**Solution**: Verify your Vercel URL matches exactly in Google OAuth settings
```
https://company-insights-yourname.vercel.app/api/sheets/callback
```

### Issue: OAuth button doesn't work
**Solution**: Check environment variables are set in Vercel:
1. Go to Vercel Settings
2. Check all three OAuth variables are present
3. Redeploy if you just added them

### Issue: Build fails
**Solution**: Check Vercel build logs:
1. Go to Vercel Dashboard
2. Click on the failed deployment
3. View the error in the logs
4. Common fixes:
   - Clear cache and redeploy
   - Check Node.js version compatibility
   - Verify all dependencies are in package.json

### Issue: App loads but OAuth redirects fail
**Solution**: Check browser console for errors:
1. Open browser DevTools (F12)
2. Go to Console tab
3. Look for error messages
4. Check Network tab for failed requests

## 📊 Monitoring Production

### Check Deployment Status
- Go to [vercel.com/dashboard](https://vercel.com/dashboard)
- Click your project
- View deployment history

### View Logs
1. Go to Deployments tab
2. Click on deployment
3. Click **View Function Logs**
4. Shows API endpoint requests

### Monitor Performance
- Vercel automatically tracks Core Web Vitals
- View analytics in **Analytics** tab
- Check edge function performance

## 🆕 Deploy Updates

Whenever you make changes:

```powershell
cd C:\company-insights

git add .

git commit -m "Your commit message"

git push origin main
```

Vercel automatically redeploys when you push to main!

## 🎯 Production Checklist

Before going live:

- [ ] App deployed to Vercel
- [ ] Google OAuth credentials updated
- [ ] Environment variables set in Vercel
- [ ] Redeployed after setting env vars
- [ ] Tested OAuth flow on production
- [ ] Tested Google Sheet export on production
- [ ] CSV export works
- [ ] Browser console shows no errors
- [ ] Performance is acceptable
- [ ] Mobile responsive (test on phone/tablet)
- [ ] Error messages are user-friendly

## 📞 Getting Help

### Vercel Support
- [Vercel Docs](https://vercel.com/docs)
- [Vercel Status Page](https://www.vercel-status.com/)
- [Vercel Community](https://github.com/vercel/vercel/discussions)

### Next.js Support
- [Next.js Documentation](https://nextjs.org/docs)
- [Next.js GitHub Discussions](https://github.com/vercel/next.js/discussions)

### Google OAuth Support
- [Google OAuth Documentation](https://developers.google.com/identity/protocols/oauth2)
- [Google Cloud Console](https://console.cloud.google.com/)

## 🎉 Congratulations!

Your Company Insights app is now deployed to production! 

### What's Live
✅ Financial data platform  
✅ Company search  
✅ QoQ/YoY analysis  
✅ CSV export  
✅ **Google Sheets export with OAuth2**  

### Next Steps
1. Share your production URL with users
2. Monitor usage in Vercel Analytics
3. Collect feedback
4. Deploy updates as needed

---

**Production URL**: `https://company-insights-yourname.vercel.app`  
**Repository**: `https://github.com/YOUR_USERNAME/company-insights`  
**Status**: ✅ Ready for Production
