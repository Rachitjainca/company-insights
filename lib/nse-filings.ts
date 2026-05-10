// NSE India API client for fetching company IR documents.
// Covers quarterly financial results and annual reports with XBRL links.
//
// All API calls are made server-side (no client exposure of NSE API keys).
// Each function returns an empty array on failure — callers should treat
// this as graceful degradation, not an error.

import type { IRCategory, IRDocument, DocumentLinkType } from "@/types/financial";

// ─── NSE API response shapes ──────────────────────────────────────────────────

interface NSEFinancialResult {
  symbol: string;
  companyName: string;
  period: string;         // "Quarterly" | "Half-Yearly" | "Annual"
  relatingTo: string;     // "First Quarter" | "Second Quarter" | "Third Quarter" | "Fourth Quarter"
  financialYear: string;  // "01-Apr-2024 To 31-Mar-2025"
  filingDate: string;     // "09-Jan-2025 21:39"
  audited: string;        // "Audited" | "Un-Audited"
  consolidated: string;   // "Consolidated" | "Non-Consolidated"
  indAs: string;
  xbrl: string;           // absolute XML URL or "-" or "https://.../xbrl/-"
  format: string;         // "New" | "Old"
  resultDetailedDataLink: string | null;
  fromDate: string;
  toDate: string;
  seqNumber?: string;
}

interface NSEAnnualReport {
  companyName: string;
  fromYr: string;         // "2024"
  toYr: string;           // "2025"
  submission_type: string; // "Standalone" | "Consolidated"
  broadcast_dttm: string;
  fileName: string;       // absolute PDF/ZIP URL
}

interface NSEAnnualReportXBRL {
  companyName: string;
  fromYr: string;
  toYr: string;
  report_type: string;    // "IND-AS"
  submission_type: string; // "Standalone" | "Consolidated"
  broadcast_dttm: string;
  fileName: string;       // absolute XML URL
}

// ─── Shared fetch headers (NSE requires Referer) ──────────────────────────────

const NSE_HEADERS: HeadersInit = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  Accept: "application/json, text/plain, */*",
  "Accept-Language": "en-US,en;q=0.9",
  Referer: "https://www.nseindia.com/",
  "X-Requested-With": "XMLHttpRequest",
};

// ─── NSE session cookie preflight ─────────────────────────────────────────────
//
// NSE uses Akamai bot-detection.  API calls without a valid session cookie
// return HTML error pages (HTTP 200 with non-JSON body) or HTTP 403/401.
// We establish a session by hitting the public market-data page first, then
// re-use those cookies across all API calls within the same process.

interface NSESession {
  cookie: string;
  ts: number;
}

let nseSession: NSESession | null = null;
const NSE_SESSION_TTL_MS = 8 * 60 * 1000; // 8 minutes (NSE tokens short-lived)

async function getNSECookie(): Promise<string> {
  if (nseSession && Date.now() - nseSession.ts < NSE_SESSION_TTL_MS) {
    return nseSession.cookie;
  }
  try {
    const res = await fetch("https://www.nseindia.com/market-data/live-equity-market", {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
      },
      redirect: "follow",
    });
    // getSetCookie() is available in Node 18+ / undici; use unknown cast to avoid TS overlap error
    const hdrs = res.headers as unknown as { getSetCookie?(): string[] };
    const setCookieHeaders: string[] =
      typeof hdrs.getSetCookie === "function" ? hdrs.getSetCookie() : [];
    const cookiePairs = setCookieHeaders.map((c) => c.split(";")[0].trim());
    const cookie = cookiePairs.filter(Boolean).join("; ");
    nseSession = { cookie, ts: Date.now() };
    return cookie;
  } catch {
    return "";
  }
}

// Maximum number of quarterly results to return (newest first).
// 40 results ≈ 5 years of Consolidated + Non-Consolidated pairs per quarter.
const QUARTERLY_RESULT_LIMIT = 40;

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Validate that a string looks like a real NSE XBRL XML URL.
 * Rejects "-" and paths ending in "/xbrl/-" (placeholder values from NSE).
 */
function isValidXbrlUrl(url: string): boolean {
  if (!url || url === "-") return false;
  if (url.endsWith("/xbrl/-")) return false;
  return url.startsWith("https://") && url.endsWith(".xml");
}

/**
 * Convert "First Quarter" → "Q1", etc.
 */
function relatingToQuarter(relatingTo: string): string | undefined {
  const map: Record<string, string> = {
    "first quarter": "Q1",
    "second quarter": "Q2",
    "third quarter": "Q3",
    "fourth quarter": "Q4",
  };
  return map[relatingTo.toLowerCase().trim()];
}

/**
 * Extract the fiscal year end from NSE's financialYear string.
 * "01-Apr-2024 To 31-Mar-2025" → "FY2025"
 */
function parseFiscalYear(financialYear: string): string {
  // Try to find the end year (the year in the second date segment)
  const match = financialYear.match(/\d{1,2}-\w+-(\d{4})\s*$/);
  if (match) return `FY${match[1]}`;
  // Fallback: grab the last 4-digit year
  const years = financialYear.match(/\d{4}/g);
  if (years && years.length >= 2) return `FY${years[years.length - 1]}`;
  if (years && years.length === 1) return `FY${years[0]}`;
  return financialYear;
}

function detectType(fileName: string): DocumentLinkType {
  const f = (fileName ?? "").toLowerCase();
  if (f.endsWith(".pdf")) return "pdf";
  if (f.endsWith(".xlsx") || f.endsWith(".xls")) return "xlsx";
  if (f.endsWith(".zip")) return "other";
  return "other";
}

function buildQuarterlyFallbackUrl(symbol: string, row: NSEFinancialResult): string {
  const seq = row.seqNumber ?? `${row.fromDate}-${row.toDate}-${row.consolidated}`;
  return (
    "https://www.nseindia.com/companies-listing/corporate-filings-financial-results" +
    `?symbol=${encodeURIComponent(symbol)}&seq=${encodeURIComponent(seq)}`
  );
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Fetch quarterly financial results for an NSE symbol.
 *
 * Uses: GET /api/corporates-financial-results?index=equities&symbol={SYMBOL}
 *
 * Returns IRDocument[] ordered newest-first.
 * Each document's `url` is the XBRL XML link (if valid) or the HTML result link.
 * `xbrlUrl` always carries the XBRL XML link when available.
 */
export async function fetchNSEQuarterlyResults(symbol: string): Promise<IRDocument[]> {
  try {
    const url =
      `https://www.nseindia.com/api/corporates-financial-results` +
      `?index=equities&symbol=${encodeURIComponent(symbol)}`;

    const cookie = await getNSECookie();
    const res = await fetch(url, {
      headers: { ...NSE_HEADERS, ...(cookie ? { Cookie: cookie } : {}) },
      next: { revalidate: 3600 },
    });

    if (!res.ok) return [];

    // NSE returns HTML error pages (bot-blocked) with status 200 — validate JSON
    const text = await res.text();
    if (!text.trimStart().startsWith("[") && !text.trimStart().startsWith("{")) return [];

    const data: NSEFinancialResult[] = JSON.parse(text);

    const docs: IRDocument[] = [];

    for (const row of data) {
      // Only quarterly; skip half-yearly and annual from this endpoint
      if (row.period !== "Quarterly") continue;
      if (docs.length >= QUARTERLY_RESULT_LIMIT) break;

      const quarter = relatingToQuarter(row.relatingTo);
      const fiscalYear = parseFiscalYear(row.financialYear);
      const consolidated =
        row.consolidated === "Consolidated" ? "Consolidated" : "Standalone";
      const audited = row.audited;

      const quarterLabel = quarter ?? row.relatingTo;
      const title = `${quarterLabel} ${fiscalYear} — ${consolidated} — ${audited}`;

      // Determine the display URL: prefer XBRL → HTML result link → "#"
      const xbrlValid = isValidXbrlUrl(row.xbrl);
      const htmlLink = row.resultDetailedDataLink;

      const displayUrl = xbrlValid
        ? row.xbrl
        : htmlLink && htmlLink !== "-"
        ? htmlLink
        : buildQuarterlyFallbackUrl(symbol, row);

      const doc: IRDocument = {
        category: "quarterly-results" as IRCategory,
        fiscalYear,
        quarter,
        title,
        url: displayUrl,
        type: xbrlValid ? "other" : "other",
        xbrlUrl: xbrlValid ? row.xbrl : undefined,
        source: "nse",
      };

      docs.push(doc);
    }

    return docs;
  } catch {
    return [];
  }
}

/**
 * Fetch annual reports (PDF/ZIP) and their XBRL counterparts for an NSE symbol.
 *
 * Uses:
 *   GET /api/annual-reports?index=equities&symbol={SYMBOL}
 *   GET /api/annual-reports-xbrl?index=equities&symbol={SYMBOL}
 *
 * Returns IRDocument[] ordered newest-first with xbrlUrl populated where matched.
 */
export async function fetchNSEAnnualReports(symbol: string): Promise<IRDocument[]> {
  try {
    const base = `https://www.nseindia.com/api`;
    const sym = encodeURIComponent(symbol);
    const cookie = await getNSECookie();
    const headers = { ...NSE_HEADERS, ...(cookie ? { Cookie: cookie } : {}) };

    const [annualRes, xbrlRes] = await Promise.allSettled([
      fetch(`${base}/annual-reports?index=equities&symbol=${sym}`, {
        headers,
        next: { revalidate: 86400 },
      }),
      fetch(`${base}/annual-reports-xbrl?index=equities&symbol=${sym}`, {
        headers,
        next: { revalidate: 86400 },
      }),
    ]);

    // Parse annual reports — validate JSON body before parsing
    const annualData: NSEAnnualReport[] = [];
    if (annualRes.status === "fulfilled" && annualRes.value.ok) {
      const text = await annualRes.value.text();
      if (text.trimStart().startsWith("{") || text.trimStart().startsWith("[")) {
        const json = JSON.parse(text);
        if (Array.isArray(json?.data)) annualData.push(...json.data);
      }
    }

    // Parse XBRL annual reports — build a lookup keyed by "toYr|submission_type"
    const xbrlByKey = new Map<string, string>();
    if (xbrlRes.status === "fulfilled" && xbrlRes.value.ok) {
      const text = await xbrlRes.value.text();
      if (text.trimStart().startsWith("{") || text.trimStart().startsWith("[")) {
        const json = JSON.parse(text);
        if (Array.isArray(json?.data)) {
          for (const row of json.data as NSEAnnualReportXBRL[]) {
            if (row.fileName && row.fileName.endsWith(".xml")) {
              const key = `${row.toYr}|${row.submission_type}`;
              if (!xbrlByKey.has(key)) xbrlByKey.set(key, row.fileName);
            }
          }
        }
      }
    }

    // Map annual reports → IRDocument[]
    const docs: IRDocument[] = annualData.map((row) => {
      const fiscalYear = `FY${row.toYr}`;
      const key = `${row.toYr}|${row.submission_type}`;
      const xbrlUrl = xbrlByKey.get(key);

      return {
        category: "annual-report" as IRCategory,
        fiscalYear,
        title: `Annual Report ${fiscalYear} (${row.submission_type})`,
        url: row.fileName,
        type: detectType(row.fileName),
        xbrlUrl,
        source: "nse" as const,
      };
    });

    return docs;
  } catch {
    return [];
  }
}

// ─── NSE Corporate Announcements ─────────────────────────────────────────────
//
// NSE lists investor presentations and concall transcripts under
// /api/corporate-announcements.  Requires the same session cookie preflight
// as the other NSE APIs.  Returns [] gracefully if API is unavailable.

interface NSEAnnouncement {
  symbol?: string;
  desc?: string;
  attchmntText?: string;
  an_dt?: string;          // date string e.g. "14-Jan-2025"
  attchmntFile?: string;   // absolute PDF URL
  // Keep older field names as optional fallbacks for compatibility.
  subject?: string;
  attachmentFile?: string;
  pdate?: string;
  attchmnt?: string;
}

const ANNOUNCEMENT_LIMIT = 120;

// Keyword patterns for announcement subject classification
const NSE_PRES_RE = /investor\s+presentation|analyst\s+(meet|day|briefing)|earnings\s+presentation|roadshow|business\s+update|earnings\s+update|\bpresentation\b/i;
const NSE_CONCALL_RE = /concall|con\s+call|conference\s+call|transcript|earnings\s+call/i;

function parseAnnounceDate(raw: NSEAnnouncement): string {
  const s = raw.an_dt ?? raw.pdate ?? "";
  // "14-Jan-2025" → extract year
  const m = s.match(/(\d{4})/);
  return m ? `FY${m[1]}` : "N/A";
}

/**
 * Fetch investor presentations and concall transcripts from NSE corporate
 * announcements.  Covers the last 3 years of filings.
 */
export async function fetchNSEAnnouncements(symbol: string): Promise<IRDocument[]> {
  try {
    const cookie = await getNSECookie();
    const headers = { ...NSE_HEADERS, ...(cookie ? { Cookie: cookie } : {}) };

    // Build a 3-year date range; NSE expects DD-MM-YYYY
    const now = new Date();
    const toDate = `${String(now.getDate()).padStart(2, "0")}-${String(now.getMonth() + 1).padStart(2, "0")}-${now.getFullYear()}`;
    const fromDate = `01-01-${now.getFullYear() - 3}`;

    const url =
      `https://www.nseindia.com/api/corporate-announcements` +
      `?index=equities&symbol=${encodeURIComponent(symbol)}` +
      `&from_date=${encodeURIComponent(fromDate)}&to_date=${encodeURIComponent(toDate)}`;

    const res = await fetch(url, { headers, next: { revalidate: 3600 } });
    if (!res.ok) return [];

    const text = await res.text();
    if (!text.trimStart().startsWith("[") && !text.trimStart().startsWith("{")) return [];

    const data: NSEAnnouncement[] = JSON.parse(text);
    if (!Array.isArray(data)) return [];

    const docs: IRDocument[] = [];
    for (const row of data) {
      if (docs.length >= ANNOUNCEMENT_LIMIT) break;

      const subject = (row.desc ?? row.attchmntText ?? row.subject ?? "").trim();
      const fileUrl = row.attchmntFile ?? row.attachmentFile ?? row.attchmnt ?? "";
      if (!fileUrl || !fileUrl.startsWith("https://")) continue;

      let category: IRCategory | null = null;
      if (NSE_CONCALL_RE.test(subject)) category = "concall";
      else if (NSE_PRES_RE.test(subject)) category = "investor-presentation";
      if (!category) continue;

      docs.push({
        category,
        fiscalYear: parseAnnounceDate(row),
        title: subject.trim() || fileUrl.split("/").pop() || "NSE Document",
        url: fileUrl,
        type: detectType(fileUrl),
        source: "nse",
      });
    }
    return docs;
  } catch {
    return [];
  }
}
