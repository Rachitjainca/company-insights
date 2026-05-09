import {
  CompanyData,
  CompanyInsights,
  ConcallTranscript,
  FinancialResult,
  InvestorPresentation,
} from "@/types/financial";

// Mock data service - in production, this would fetch from actual APIs
export const mockCompanyData: Record<string, CompanyData> = {
  TCS: {
    ticker: "TCS",
    name: "Tata Consultancy Services",
    sector: "IT Services",
    marketCap: "$150B",
  },
  INFY: {
    ticker: "INFY",
    name: "Infosys Limited",
    sector: "IT Services",
    marketCap: "$85B",
  },
  RELIANCE: {
    ticker: "RELIANCE",
    name: "Reliance Industries",
    sector: "Energy",
    marketCap: "$200B",
  },
};

export const mockFinancialResults: FinancialResult[] = [
  {
    quarter: "Q1",
    year: 2023,
    revenue: 2850,
    netIncome: 850,
    eps: 14.5,
    roe: 22.3,
    roa: 18.5,
    debtToEquity: 0.45,
  },
  {
    quarter: "Q2",
    year: 2023,
    revenue: 2950,
    netIncome: 920,
    eps: 15.8,
    roe: 23.1,
    roa: 19.2,
    debtToEquity: 0.43,
  },
  {
    quarter: "Q3",
    year: 2023,
    revenue: 3050,
    netIncome: 1000,
    eps: 17.1,
    roe: 24.2,
    roa: 20.1,
    debtToEquity: 0.42,
  },
  {
    quarter: "Q4",
    year: 2023,
    revenue: 3200,
    netIncome: 1100,
    eps: 18.8,
    roe: 25.5,
    roa: 21.3,
    debtToEquity: 0.40,
  },
  {
    quarter: "Q1",
    year: 2024,
    revenue: 3350,
    netIncome: 1200,
    eps: 20.5,
    roe: 26.8,
    roa: 22.4,
    debtToEquity: 0.38,
  },
  {
    quarter: "Q2",
    year: 2024,
    revenue: 3500,
    netIncome: 1350,
    eps: 23.1,
    roe: 28.2,
    roa: 23.8,
    debtToEquity: 0.36,
  },
];

export const mockPresentations: InvestorPresentation[] = [
  {
    id: "pres-001",
    date: "2024-07-20",
    title: "Q2 2024 Earnings Presentation",
    url: "https://example.com/presentations/q2-2024",
    quarter: "Q2",
  },
  {
    id: "pres-002",
    date: "2024-04-15",
    title: "Q1 2024 Earnings Presentation",
    url: "https://example.com/presentations/q1-2024",
    quarter: "Q1",
  },
  {
    id: "pres-003",
    date: "2024-01-20",
    title: "FY2023 Results & Outlook",
    url: "https://example.com/presentations/fy2023",
    quarter: "Q4",
  },
];

export const mockTranscripts: ConcallTranscript[] = [
  {
    id: "trans-001",
    date: "2024-07-22",
    eventTitle: "Q2 2024 Earnings Call",
    url: "https://example.com/transcripts/q2-2024",
    quarter: "Q2",
  },
  {
    id: "trans-002",
    date: "2024-04-17",
    eventTitle: "Q1 2024 Earnings Call",
    url: "https://example.com/transcripts/q1-2024",
    quarter: "Q1",
  },
  {
    id: "trans-003",
    date: "2024-01-22",
    eventTitle: "FY2023 Results Call",
    url: "https://example.com/transcripts/fy2023",
    quarter: "Q4",
  },
];

export async function fetchCompanyInsights(
  ticker: string
): Promise<CompanyInsights | null> {
  const company = mockCompanyData[ticker];

  if (!company) {
    return null;
  }

  return {
    company,
    financialResults: mockFinancialResults,
    presentations: mockPresentations,
    transcripts: mockTranscripts,
  };
}

export function searchCompanies(query: string): CompanyData[] {
  return Object.values(mockCompanyData).filter(
    (company) =>
      company.ticker.toUpperCase().includes(query.toUpperCase()) ||
      company.name.toUpperCase().includes(query.toUpperCase())
  );
}
