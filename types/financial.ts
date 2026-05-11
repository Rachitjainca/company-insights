// Core types for IR document hub

export type IRCategory =
  | "quarterly-results"
  | "investor-presentation"
  | "concall"
  | "annual-report"
  | "kpi-handbook";

export type DocumentLinkType = "pdf" | "xlsx" | "docx" | "audio" | "other";

export interface NSEEquity {
  symbol: string;
  name: string;
  isin: string;
}

export type IRSource = "nse" | "bse" | "scraper";

export interface IRDocument {
  category: IRCategory;
  fiscalYear: string;
  quarter?: string;
  title: string;
  url: string;
  type: DocumentLinkType;
  /** XBRL XML download URL, when available from NSE */
  xbrlUrl?: string;
  /** Data source — used for NSE/BSE toggle filter */
  source?: IRSource;
}

export interface SelectedDoc extends IRDocument {
  /** Unique key for React lists and deduplication */
  key: string;
}

// Legacy financial data model types

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
