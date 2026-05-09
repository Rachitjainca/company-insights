// Financial data types
export interface CompanyData {
  ticker: string;
  name: string;
  sector: string;
  marketCap: string;
}

export interface FinancialResult {
  quarter: string;
  year: number;
  revenue: number;
  netIncome: number;
  eps: number;
  roe: number;
  roa: number;
  debtToEquity: number;
}

export interface InvestorPresentation {
  id: string;
  date: string;
  title: string;
  url: string;
  quarter: string;
}

export interface ConcallTranscript {
  id: string;
  date: string;
  eventTitle: string;
  url: string;
  quarter: string;
}

export interface CompanyInsights {
  company: CompanyData;
  financialResults: FinancialResult[];
  presentations: InvestorPresentation[];
  transcripts: ConcallTranscript[];
}

export interface QoQAnalysis {
  quarter: string;
  revenueGrowth: number;
  profitGrowth: number;
  epsGrowth: number;
}

export interface YoYAnalysis {
  year: number;
  quarter: string;
  revenueGrowth: number;
  profitGrowth: number;
  epsGrowth: number;
}
