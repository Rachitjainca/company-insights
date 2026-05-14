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

interface NSEIntegratedFilingResult {
  seq_Id?: string;
  symbol?: string;
  smName?: string;
  cmName?: string;
  type?: string;
  qe_Date?: string;       // "31-MAR-2026"
  ixbrl?: string;         // details HTML (human-readable)
  type_Sub?: string;      // "Original" | "Revised"
  pdf_attach?: string;
  xbrl?: string;          // XBRL XML
  broadcast_Date?: string;
  revised_Date?: string | null;
  revision_Remark?: string | null;
  audited?: string;       // "Audited" | "Un-Audited"
  consolidated?: string;  // "Consolidated" | "Standalone"
}

interface NSEIntegratedFilingResponse {
  data?: NSEIntegratedFilingResult[];
  size?: number;
  page?: number;
  totalCount?: number;
}

interface IntegratedFilingFetchResult {
  ok: boolean;
  status: number | null;
  rows: NSEIntegratedFilingResult[];
  totalCount: number;
  error?: string;
}

export interface NSEIntegratedQuarterlyLastSuccessMeta {
  checkedAt: string;
  symbol: string;
  status: number;
  totalCount: number;
  rowsReceived: number;
  mar2025Rows: number;
  docsGenerated: number;
  latestQuarterEnd: string | null;
  oldestQuarterEnd: string | null;
}

export interface NSEIntegratedQuarterlyHealthReport {
  ok: boolean;
  checkedAt: string;
  symbol: string;
  endpoint: string;
  query: {
    type: string;
    page: number;
    size: number;
  };
  upstream: {
    ok: boolean;
    status: number | null;
    totalCount: number;
    rowsReceived: number;
    error?: string;
  };
  transformed: {
    mar2025Rows: number;
    docsGenerated: number;
    latestQuarterEnd: string | null;
    oldestQuarterEnd: string | null;
  };
  lastSuccess: NSEIntegratedQuarterlyLastSuccessMeta | null;
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
// 40 results ≈ 5 years of Consolidated + Standalone pairs per quarter.
const QUARTERLY_RESULT_LIMIT = 40;
const INTEGRATED_FILING_TYPE = "Integrated Filing- Financials";
const INTEGRATED_MIN_DATE_UTC = Date.UTC(2025, 2, 1); // 01-Mar-2025
const INTEGRATED_FILING_ENDPOINT = "https://www.nseindia.com/api/integrated-filing-results";
const INTEGRATED_FETCH_PAGE = 1;
const INTEGRATED_FETCH_SIZE = 200;

let nseIntegratedQuarterlyLastSuccess: NSEIntegratedQuarterlyLastSuccessMeta | null =
  null;

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

function parseQuarterEndDate(raw: string): Date | null {
  const m = raw.match(/^(\d{1,2})-([A-Za-z]{3})-(\d{4})$/);
  if (!m) return null;

  const day = Number(m[1]);
  const mon = m[2].toUpperCase();
  const year = Number(m[3]);

  const monthByCode: Record<string, number> = {
    JAN: 0,
    FEB: 1,
    MAR: 2,
    APR: 3,
    MAY: 4,
    JUN: 5,
    JUL: 6,
    AUG: 7,
    SEP: 8,
    OCT: 9,
    NOV: 10,
    DEC: 11,
  };

  const month = monthByCode[mon];
  if (month === undefined) return null;
  return new Date(Date.UTC(year, month, day));
}

function isOnOrAfterIntegratedMinDate(rawQuarterEnd: string): boolean {
  const parsed = parseQuarterEndDate(rawQuarterEnd);
  if (!parsed) return false;
  return parsed.getTime() >= INTEGRATED_MIN_DATE_UTC;
}

function quarterAndFiscalYearFromQuarterEnd(
  rawQuarterEnd: string
): { quarter?: string; fiscalYear: string } {
  const parsed = parseQuarterEndDate(rawQuarterEnd);
  if (!parsed) return { fiscalYear: "N/A" };

  const month = parsed.getUTCMonth();
  const year = parsed.getUTCFullYear();

  if (month === 2) return { quarter: "Q4", fiscalYear: `FY${year}` };
  if (month === 5) return { quarter: "Q1", fiscalYear: `FY${year + 1}` };
  if (month === 8) return { quarter: "Q2", fiscalYear: `FY${year + 1}` };
  if (month === 11) return { quarter: "Q3", fiscalYear: `FY${year + 1}` };

  // Fallback for non-quarter-end dates (rare in this feed).
  const fy = month <= 2 ? year : year + 1;
  return { fiscalYear: `FY${fy}` };
}

function isValidDetailsUrl(url: string | undefined): boolean {
  if (!url || url === "-") return false;
  if (!url.startsWith("https://")) return false;
  if (url.endsWith("/null")) return false;
  return true;
}

/**
 * NSE integrated filings feed exposes `pdf_attach` — the actual PDF the
 * issuer attached. We treat it as a valid URL when it's a normal HTTPS link
 * (skipping the `"-"` sentinel and `null` placeholders).
 */
function isValidPdfAttachUrl(url: string | undefined | null): boolean {
  if (!url) return false;
  const trimmed = url.trim();
  if (!trimmed || trimmed === "-") return false;
  if (!trimmed.startsWith("https://")) return false;
  if (trimmed.endsWith("/null") || trimmed.endsWith("/-")) return false;
  return true;
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

function buildIntegratedFilingUrl(symbol: string, page: number, size: number): string {
  const params = new URLSearchParams({
    type: INTEGRATED_FILING_TYPE,
    symbol,
    page: String(page),
    size: String(size),
  });
  return `${INTEGRATED_FILING_ENDPOINT}?${params.toString()}`;
}

async function fetchNSEIntegratedFilingRows(
  symbol: string,
  page = INTEGRATED_FETCH_PAGE,
  size = INTEGRATED_FETCH_SIZE
): Promise<IntegratedFilingFetchResult> {
  const endpoint = buildIntegratedFilingUrl(symbol, page, size);

  try {
    const cookie = await getNSECookie();
    const res = await fetch(endpoint, {
      headers: { ...NSE_HEADERS, ...(cookie ? { Cookie: cookie } : {}) },
      next: { revalidate: 3600 },
    });

    if (!res.ok) {
      return {
        ok: false,
        status: res.status,
        rows: [],
        totalCount: 0,
        error: `http-${res.status}`,
      };
    }

    const text = await res.text();
    if (!text.trimStart().startsWith("{")) {
      return {
        ok: false,
        status: res.status,
        rows: [],
        totalCount: 0,
        error: "non-json-response",
      };
    }

    const payload: NSEIntegratedFilingResponse = JSON.parse(text);
    const rows = Array.isArray(payload.data) ? payload.data : [];

    return {
      ok: true,
      status: res.status,
      rows,
      totalCount:
        typeof payload.totalCount === "number" ? payload.totalCount : rows.length,
    };
  } catch {
    return {
      ok: false,
      status: null,
      rows: [],
      totalCount: 0,
      error: "fetch-error",
    };
  }
}

function summarizeQuarterEnds(
  rows: NSEIntegratedFilingResult[]
): { latestQuarterEnd: string | null; oldestQuarterEnd: string | null } {
  const dated = rows
    .filter((row) => !!row.qe_Date && isOnOrAfterIntegratedMinDate(row.qe_Date))
    .map((row) => ({
      qeDate: row.qe_Date!,
      ts: parseQuarterEndDate(row.qe_Date!)?.getTime() ?? -1,
    }))
    .filter((d) => d.ts >= 0)
    .sort((a, b) => b.ts - a.ts);

  if (dated.length === 0) {
    return {
      latestQuarterEnd: null,
      oldestQuarterEnd: null,
    };
  }

  return {
    latestQuarterEnd: dated[0].qeDate,
    oldestQuarterEnd: dated[dated.length - 1].qeDate,
  };
}

function mapIntegratedRowsToQuarterlyDocs(
  rows: NSEIntegratedFilingResult[],
  limit = QUARTERLY_RESULT_LIMIT
): IRDocument[] {
  const docs: IRDocument[] = [];

  for (const row of rows) {
    if (docs.length >= limit) break;
    if (!row.qe_Date || !isOnOrAfterIntegratedMinDate(row.qe_Date)) continue;

    const { quarter, fiscalYear } = quarterAndFiscalYearFromQuarterEnd(row.qe_Date);
    const consolidated =
      row.consolidated === "Consolidated" ? "Consolidated" : "Standalone";
    const audited = row.audited ?? "Audited/Un-Audited";

    const xbrlValid = isValidXbrlUrl(row.xbrl ?? "");
    const detailsValid = isValidDetailsUrl(row.ixbrl);
    const pdfValid = isValidPdfAttachUrl(row.pdf_attach);

    // Prefer the actual PDF the issuer attached — this is what users expect
    // to see when they open a quarterly result. Fall back to the iXBRL HTML
    // detail page, then the raw XBRL XML, then the NSE listing page.
    const displayUrl = pdfValid
      ? row.pdf_attach!
      : detailsValid
      ? row.ixbrl!
      : xbrlValid
      ? row.xbrl!
      : "https://www.nseindia.com/companies-listing/corporate-integrated-filing";

    docs.push({
      category: "quarterly-results" as IRCategory,
      fiscalYear,
      quarter,
      title: `${quarter ?? row.qe_Date} ${fiscalYear} — ${consolidated} — ${audited}`,
      url: displayUrl,
      type: pdfValid ? "pdf" : "other",
      xbrlUrl: xbrlValid ? row.xbrl : undefined,
      source: "nse",
    });
  }

  return docs;
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
  const integratedDocs = await fetchNSEQuarterlyResultsIntegrated(symbol);
  if (integratedDocs.length > 0) return integratedDocs;
  return fetchNSEQuarterlyResultsLegacy(symbol);
}

export async function probeNSEIntegratedQuarterlyHealth(
  symbol: string
): Promise<NSEIntegratedQuarterlyHealthReport> {
  const checkedAt = new Date().toISOString();
  const normalizedSymbol = symbol.toUpperCase().trim();

  const raw = await fetchNSEIntegratedFilingRows(
    normalizedSymbol,
    INTEGRATED_FETCH_PAGE,
    INTEGRATED_FETCH_SIZE
  );

  const mar2025Rows = raw.rows.filter(
    (row) => !!row.qe_Date && isOnOrAfterIntegratedMinDate(row.qe_Date)
  ).length;
  const docs = mapIntegratedRowsToQuarterlyDocs(raw.rows, QUARTERLY_RESULT_LIMIT);
  const quarterRange = summarizeQuarterEnds(raw.rows);

  if (raw.ok && raw.status !== null && raw.rows.length > 0) {
    nseIntegratedQuarterlyLastSuccess = {
      checkedAt,
      symbol: normalizedSymbol,
      status: raw.status,
      totalCount: raw.totalCount,
      rowsReceived: raw.rows.length,
      mar2025Rows,
      docsGenerated: docs.length,
      latestQuarterEnd: quarterRange.latestQuarterEnd,
      oldestQuarterEnd: quarterRange.oldestQuarterEnd,
    };
  }

  return {
    ok: raw.ok && mar2025Rows > 0 && docs.length > 0,
    checkedAt,
    symbol: normalizedSymbol,
    endpoint: INTEGRATED_FILING_ENDPOINT,
    query: {
      type: INTEGRATED_FILING_TYPE,
      page: INTEGRATED_FETCH_PAGE,
      size: INTEGRATED_FETCH_SIZE,
    },
    upstream: {
      ok: raw.ok,
      status: raw.status,
      totalCount: raw.totalCount,
      rowsReceived: raw.rows.length,
      ...(raw.error ? { error: raw.error } : {}),
    },
    transformed: {
      mar2025Rows,
      docsGenerated: docs.length,
      latestQuarterEnd: quarterRange.latestQuarterEnd,
      oldestQuarterEnd: quarterRange.oldestQuarterEnd,
    },
    lastSuccess: nseIntegratedQuarterlyLastSuccess,
  };
}

async function fetchNSEQuarterlyResultsIntegrated(symbol: string): Promise<IRDocument[]> {
  const raw = await fetchNSEIntegratedFilingRows(
    symbol,
    INTEGRATED_FETCH_PAGE,
    INTEGRATED_FETCH_SIZE
  );
  if (!raw.ok || raw.rows.length === 0) return [];

  const docs = mapIntegratedRowsToQuarterlyDocs(raw.rows, QUARTERLY_RESULT_LIMIT);
  const mar2025Rows = raw.rows.filter(
    (row) => !!row.qe_Date && isOnOrAfterIntegratedMinDate(row.qe_Date)
  ).length;
  const quarterRange = summarizeQuarterEnds(raw.rows);

  if (raw.status !== null && docs.length > 0) {
    nseIntegratedQuarterlyLastSuccess = {
      checkedAt: new Date().toISOString(),
      symbol: symbol.toUpperCase(),
      status: raw.status,
      totalCount: raw.totalCount,
      rowsReceived: raw.rows.length,
      mar2025Rows,
      docsGenerated: docs.length,
      latestQuarterEnd: quarterRange.latestQuarterEnd,
      oldestQuarterEnd: quarterRange.oldestQuarterEnd,
    };
  }

  return docs;
}

async function fetchNSEQuarterlyResultsLegacy(symbol: string): Promise<IRDocument[]> {
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

      // Determine the display URL: prefer details HTML → XBRL XML → fallback page.
      const xbrlValid = isValidXbrlUrl(row.xbrl);
      const htmlLink = row.resultDetailedDataLink;

      const displayUrl = htmlLink && htmlLink !== "-"
        ? htmlLink
        : xbrlValid
        ? row.xbrl
        : buildQuarterlyFallbackUrl(symbol, row);

      const doc: IRDocument = {
        category: "quarterly-results" as IRCategory,
        fiscalYear,
        quarter,
        title,
        url: displayUrl,
        type: "other",
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

export interface NSEAnnouncement {
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

const ANNOUNCEMENT_LIMIT = 300;

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
 * Map raw NSE announcement rows to IR documents.
 * Exported so QA routes can validate classification using mocked payloads.
 */
export function mapNSEAnnouncementsToIRDocs(
  rows: NSEAnnouncement[],
  limit = ANNOUNCEMENT_LIMIT
): IRDocument[] {
  const docs: IRDocument[] = [];

  for (const row of rows) {
    if (docs.length >= limit) break;

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
      title: subject || fileUrl.split("/").pop() || "NSE Document",
      url: fileUrl,
      type: detectType(fileUrl),
      source: "nse",
    });
  }

  return docs;
}

/**
 * Fetch investor presentations and concall transcripts from NSE corporate
 * announcements.  Covers the last 3 years of filings.
 */
export async function fetchNSEAnnouncements(symbol: string): Promise<IRDocument[]> {
  try {
    const cookie = await getNSECookie();
    const headers = { ...NSE_HEADERS, ...(cookie ? { Cookie: cookie } : {}) };

    // Build a 5-year date range; NSE expects DD-MM-YYYY
    const now = new Date();
    const toDate = `${String(now.getDate()).padStart(2, "0")}-${String(now.getMonth() + 1).padStart(2, "0")}-${now.getFullYear()}`;
    const fromDate = `01-01-${now.getFullYear() - 5}`;

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

    return mapNSEAnnouncementsToIRDocs(data);
  } catch {
    return [];
  }
}
