// Shared types for IR (investor relations) scrapers.

export type DocumentLinkType = "pdf" | "xlsx" | "docx" | "audio" | "other";

export interface DocumentLink {
  /** Short label as shown on the IR page (e.g. "INR", "USD", "PDF", "Listen"). */
  label: string;
  url: string;
  type: DocumentLinkType;
}

export interface DocumentEntry {
  /** Human-readable category, e.g. "Earnings Release". */
  category: string;
  /** Stable machine key, e.g. "earningsRelease". */
  categoryKey: string;
  links: DocumentLink[];
}

export interface PeriodDocuments {
  /** "FY 2026", "FY 25-26", etc. */
  fiscalYear: string;
  /** "Q1"..."Q4". Empty string for annual rows. */
  quarter: string;
  documents: DocumentEntry[];
}

export interface CompanyDocumentsBundle {
  ticker: string;
  companyName: string;
  source: {
    financialResults?: string;
    annualReports?: string;
  };
  fetchedAt: string;
  /** Quarter-level docs (earnings release, presentation, transcript, etc.). */
  financialResults: PeriodDocuments[];
  /** FY-level docs (annual report, shareholder letter, etc.). */
  annualReports: PeriodDocuments[];
}

export interface IRScraper {
  ticker: string;
  companyName: string;
  fetchDocuments(): Promise<CompanyDocumentsBundle>;
}

export function detectLinkType(url: string, label: string): DocumentLinkType {
  const u = url.toLowerCase();
  if (u.endsWith(".pdf")) return "pdf";
  if (u.endsWith(".xlsx") || u.endsWith(".xls")) return "xlsx";
  if (u.endsWith(".docx") || u.endsWith(".doc")) return "docx";
  if (label.toLowerCase() === "listen" || u.includes("zoom.us")) return "audio";
  return "other";
}
