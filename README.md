# Company Insights - Financial Data Platform

A modern Next.js web application for exploring listed company financial data, quarterly results, investor presentations, and earnings call transcripts with QoQ/YoY analysis and Google Sheets export capabilities.

## 🎯 Features

- **Company Search**: Search and select companies by ticker or name
- **Financial Results**: View quarterly financial metrics including revenue, net income, EPS, ROE, ROA, and debt-to-equity ratios
- **Investor Presentations**: Browse and access investor presentations linked to quarterly results
- **Earnings Call Transcripts**: Access concall transcripts for deeper insights
- **QoQ Analysis**: Compare quarter-over-quarter growth metrics
- **YoY Analysis**: Compare year-over-year growth trends
- **Data Export**: Download financial data as CSV or export to Google Sheets
- **Responsive Design**: Modern UI with Tailwind CSS

## 🛠️ Technology Stack

- **Framework**: Next.js 15+ with App Router
- **Language**: TypeScript
- **Frontend**: React 19+
- **Styling**: Tailwind CSS
- **APIs**: Google Sheets API (for export functionality)
- **Development**: ESLint, npm

## 📦 Installation

### Prerequisites
- Node.js 18+ installed
- npm package manager
- Git

### Setup Steps

1. **Install dependencies**
   ```bash
   npm install
   ```

2. **Configure environment variables**
   ```bash
   cp .env.example .env.local
   ```

3. **Run the development server**
   ```bash
   npm run dev
   ```

4. **Open in browser**
   ```
   http://localhost:3000
   ```

## 🚀 Usage

### Searching for Companies
1. Open the application
2. Enter a company ticker (e.g., TCS, INFY) or company name
3. Select from the suggestions

### Viewing Financial Data
- **Quarterly Results**: Table with key financial metrics
- **Presentations**: Links to investor presentations
- **Transcripts**: Links to earnings call transcripts

### Analyzing Data
- Switch between **QoQ Analysis** and **YoY Analysis** tabs
- View growth percentages color-coded (Green = positive, Red = negative)

### Exporting Data
- **CSV Download**: Download all financial data as CSV file
- **Google Sheets**: Export to Google Sheets (requires authentication)

## 🔐 Google Sheets Integration & OAuth2 Setup

The application supports exporting financial data directly to Google Sheets using OAuth2 authentication.

### Prerequisites
- Google Account
- Google Cloud Project with Sheets API enabled
- OAuth2 credentials (Client ID and Secret)

### Quick Setup
1. Follow the **[Google Sheets Setup Guide](./GOOGLE_SHEETS_SETUP.md)** for detailed instructions
2. Create `.env.local` with your Google credentials:
   ```env
   GOOGLE_CLIENT_ID=your_client_id_here
   GOOGLE_CLIENT_SECRET=your_client_secret_here
   GOOGLE_REDIRECT_URI=http://localhost:3000/api/sheets/callback
   ```
3. Restart the dev server
4. Click "🔑 Authorize Google Sheets" when exporting data

### How OAuth2 Works in This App
1. User clicks "Authorize Google Sheets" button
2. Redirected to Google login/authorization page
3. User grants permission to create and edit spreadsheets
4. Auth tokens stored securely in HTTP-only cookies
5. Subsequent exports use these tokens (no re-authorization needed)

**For more technical details**: See [OAuth2 Implementation Guide](./OAUTH2_IMPLEMENTATION.md)

## 📁 Project Structure

```
src/
├── app/              # Next.js App Router pages
├── components/       # React components
├── lib/              # Utility functions
├── types/            # TypeScript definitions
└── styles/           # Global styles
```

## 🧪 Available Scripts

```bash
npm run dev      # Start development server
npm run build    # Build for production
npm start        # Start production server
npm run lint     # Run linting
```

## 📊 Sample Companies

- **TCS**: Tata Consultancy Services
- **INFY**: Infosys Limited
- **RELIANCE**: Reliance Industries

## 🔐 Security

- Environment variables for sensitive data
- Input validation
- TypeScript for type safety

## 📄 License

MIT License

---

**Built with ❤️ using Next.js and React**
