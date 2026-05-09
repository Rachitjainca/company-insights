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
