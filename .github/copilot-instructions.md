# Company Insights - Financial Data Platform

## Project Overview
A Next.js web application for entering listed company details and retrieving quarterly financial results, investor presentations, and concall transcripts. Features include Google Sheets export and QoQ/YoY financial analysis.

## Key Features
- Company details input form
- Quarterly financial results retrieval
- Investor presentations and concall transcript aggregation
- Google Sheets integration for data export
- QoQ (Quarter-over-Quarter) and YoY (Year-over-Year) financial analysis
- React-based responsive UI with Tailwind CSS

## Technology Stack
- Next.js 15+ with App Router
- TypeScript
- React 19+
- Tailwind CSS
- Google Sheets API
- ESLint

## Project Structure
```
src/
├── app/                    # Next.js App Router pages
├── components/             # Reusable React components
├── lib/                    # Utility functions and APIs
├── styles/                 # Global styles
└── types/                  # TypeScript type definitions
```

## Development Setup
1. Install dependencies: `npm install`
2. Create `.env.local` with Google API credentials
3. Run dev server: `npm run dev`
4. Open http://localhost:3000

## Key Workflows
- **Company Data Entry**: Form to input ticker/name and retrieve quarterly data
- **Data Export**: Export financial results to Google Sheets with formatting
- **Analysis**: Calculate and display QoQ and YoY metrics
