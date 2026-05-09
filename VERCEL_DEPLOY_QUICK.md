# Vercel Deployment - Quick Start

Deploy Company Insights in 5 minutes ⚡

## 🚀 Quick Checklist

### 1️⃣ Push to GitHub
```powershell
cd C:\company-insights
git push -u origin main
```

### 2️⃣ Deploy to Vercel
Go to [vercel.com/new](https://vercel.com/new) and import your GitHub repo.

**Choose**: `company-insights` repository → Click **Deploy** → Wait 2 minutes

### 3️⃣ Get Your Production URL
After deploy, Vercel shows your URL:
```
https://company-insights-yourname.vercel.app
```

### 4️⃣ Update Google OAuth
1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. **APIs & Services** → **Credentials**
3. Click your OAuth app
4. Add this redirect URI:
   ```
   https://company-insights-yourname.vercel.app/api/sheets/callback
   ```
5. Click **Save**

### 5️⃣ Set Vercel Environment Variables

In [Vercel Dashboard](https://vercel.com/dashboard):
1. Click `company-insights` project
2. Go to **Settings** → **Environment Variables**
3. Add these (from your `.env.local`):

| Variable | Value |
|----------|-------|
| `GOOGLE_CLIENT_ID` | Your actual value from Google Cloud Console |
| `GOOGLE_CLIENT_SECRET` | Your actual value from Google Cloud Console |
| `GOOGLE_REDIRECT_URI` | `https://company-insights-yourname.vercel.app/api/sheets/callback` |

4. Click **Save**
5. Go to **Deployments** → Click latest → Three dots → **Redeploy** → **Redeploy**

## ✅ Testing Checklist

After deployment:
- [ ] App loads at production URL
- [ ] Company search works
- [ ] Financial data displays
- [ ] QoQ/YoY analysis works
- [ ] CSV export works
- [ ] **🔑 Authorize Google Sheets** button visible
- [ ] OAuth redirects to Google login
- [ ] After auth, button says **📊 Export to Google Sheets**
- [ ] Exporting creates new Google Sheet
- [ ] Sheet has all financial data

## 📊 Current Status

✅ Code: Ready  
✅ Google Sheets API: Configured  
✅ OAuth2: Implemented  
✅ Environment: Set up  
✅ Ready to deploy: YES

## 🔗 Important Links

| Item | URL |
|------|-----|
| Vercel Dashboard | https://vercel.com/dashboard |
| Google Cloud Console | https://console.cloud.google.com/ |
| Your Production App | `https://company-insights-yourname.vercel.app` |
| GitHub Repository | `https://github.com/YOUR_USERNAME/company-insights` |

## 🆘 Common Issues

**"Redirect URI mismatch"**  
→ Check URL in Google OAuth matches exactly (including `https://` and trailing slash)

**OAuth button doesn't work**  
→ Did you redeploy after setting env vars? Try redeploying now.

**Build failed on Vercel**  
→ Check Vercel logs. Usually means missing dependency. Ensure all dependencies are in package.json.

## ⚡ Automatic Redeploys

After deploying:
- Every time you `git push origin main`
- Vercel automatically redeploys
- New version live in ~2 minutes
- No manual steps needed

## 🎯 You're Done!

Your app is live with:
✅ Financial data platform  
✅ OAuth2 authentication  
✅ Google Sheets export  
✅ QoQ/YoY analysis  
✅ CSV export  

Share your production URL and start using it! 🚀
