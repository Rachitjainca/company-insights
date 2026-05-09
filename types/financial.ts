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

export interface IRDocument {
  category: IRCategory;
  fiscalYear: string;
  quarter?: string;
  title: string;
  url: string;
  type: DocumentLinkType;
}

export interface SelectedDoc extends IRDocument {
  /** Unique key for React lists and deduplication */
  key: string;
}
