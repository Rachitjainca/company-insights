import { NextRequest, NextResponse } from "next/server";
import { parseQuarterlyXBRL, ORDERED_METRICS } from "@/lib/xbrl-parser";
import { extractDocumentContent } from "@/lib/document-content";
import { extractTablesFromPdf, type ExtractedTable } from "@/lib/pdf-tables";

// Force the Node.js runtime so unpdf (uses Web APIs + Buffer) works on Vercel.
export const runtime = "nodejs";
export const maxDuration = 300;

// NSE headers used when fetching XBRL files server-side
const NSE_HEADERS: HeadersInit = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  Accept: "application/xml, text/xml, */*",
  "Accept-Language": "en-US,en;q=0.9",
  Referer: "https://www.nseindia.com/",
};

const SOURCE_FETCH_HEADERS: HeadersInit = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  Accept: "application/pdf,text/html,application/xhtml+xml,application/xml,text/xml,text/plain,*/*",
  "Accept-Language": "en-US,en;q=0.9",
  Referer: "https://www.nseindia.com/",
};

const MAX_SOURCE_FILE_BYTES = 50 * 1024 * 1024;
const MAX_DOC_TEXT_CHARS = 800000;
const MAX_SHEET_CONTENT_CHARS = 20000;
const SOURCE_CONVERSION_TIMEOUT_MS = 120000;

interface ExportDocument {
  category: string;
  fiscalYear: string;
  quarter?: string;
  title: string;
  url: string;
  type: string;
  xbrlUrl?: string;
  source?: string;
}

interface ExportRequest {
  company: {
    symbol: string;
    name: string;
    isin?: string;
  };
  documents: ExportDocument[];
  /** "metadata" (default): one row per document with URL.
   *  "xbrl": parse XBRL for quarterly-results docs and write financial metric columns. */
  exportMode?: "metadata" | "xbrl";
  /** When true (default), create a Google Doc per document with extracted finance/KPI tables. */
  createGoogleDocs?: boolean;
  /** When true, write extracted finance/KPI content into a sheet column for metadata mode. */
  includeContent?: boolean;
  /** When true, append a comparative XBRL repository tab pivoting metrics
   *  across all selected quarters (works in any export mode if quarterly XBRL
   *  filings are present in the selection). */
  includeXbrlComparative?: boolean;
}

interface AppendResult {
  ok: boolean;
  rowsWritten: number;
  docsCreated: number;
}

interface SourceTextResult {
  extractedText: string;
  status: string;
  /** Tables extracted from the converted-Doc HTML, if any. */
  tables: ExtractedTable[];
  /**
   * Drive file ID of the converted Google Doc. When present, the caller may
   * rename and re-use it as the final result Doc (preserves native tables)
   * instead of creating a new plain-text Doc.
   */
  convertedFileId?: string;
}

/**
 * Refresh the access token using refresh token
 */
async function refreshAccessToken(
  refreshToken: string
): Promise<string | null> {
  try {
    const response = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        refresh_token: refreshToken,
        client_id: process.env.GOOGLE_CLIENT_ID || "",
        client_secret: process.env.GOOGLE_CLIENT_SECRET || "",
        grant_type: "refresh_token",
      }).toString(),
    });

    if (!response.ok) {
      console.error("Token refresh failed:", await response.text());
      return null;
    }

    const data = await response.json();
    return data.access_token;
  } catch (error) {
    console.error("Error refreshing token:", error);
    return null;
  }
}

/**
 * Create a new Google Sheet
 */
async function createSpreadsheet(
  accessToken: string,
  title: string
): Promise<string | null> {
  try {
    const response = await fetch(
      "https://sheets.googleapis.com/v4/spreadsheets",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          properties: {
            title: title,
          },
        }),
      }
    );

    if (!response.ok) {
      console.error("Create spreadsheet failed:", await response.text());
      return null;
    }

    const data = await response.json();
    return data.spreadsheetId;
  } catch (error) {
    console.error("Error creating spreadsheet:", error);
    return null;
  }
}

interface CreateGoogleDocResult {
  url: string | null;
  status: string;
}

/**
 * Create a Google Doc by uploading plain text via the Drive API and letting
 * Drive convert it to a Google Doc. This avoids dependence on the Docs API
 * and the `documents` OAuth scope (only `drive.file` is required), while
 * preserving the same end result (a Google Doc containing the extracted text).
 */
async function attemptCreateGoogleDoc(
  accessToken: string,
  title: string,
  content: string
): Promise<CreateGoogleDocResult> {
  try {
    const boundary = `cgi-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const metadata = {
      name: title,
      mimeType: "application/vnd.google-apps.document",
    };

    const body =
      `--${boundary}\r\n` +
      `Content-Type: application/json; charset=UTF-8\r\n\r\n` +
      `${JSON.stringify(metadata)}\r\n` +
      `--${boundary}\r\n` +
      `Content-Type: text/plain; charset=UTF-8\r\n\r\n` +
      `${content}\r\n` +
      `--${boundary}--`;

    const res = await fetch(
      "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": `multipart/related; boundary=${boundary}`,
        },
        body,
      }
    );

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      console.error(
        `createGoogleDoc failed (HTTP ${res.status}):`,
        errText.slice(0, 500)
      );
      return { url: null, status: `http-${res.status}` };
    }

    const created = (await res.json().catch(() => null)) as
      | { id?: string }
      | null;
    const fileId = created?.id;
    if (!fileId) {
      console.error("createGoogleDoc: response missing file id");
      return { url: null, status: "missing-id" };
    }

    return {
      url: `https://docs.google.com/document/d/${fileId}/edit`,
      status: "ok",
    };
  } catch (error) {
    console.error("createGoogleDoc error:", error);
    return { url: null, status: "exception" };
  }
}

async function createGoogleDoc(
  accessToken: string,
  title: string,
  content: string
): Promise<{ url: string | null; status: string }> {
  let last: CreateGoogleDocResult = { url: null, status: "unknown" };
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    const result = await attemptCreateGoogleDoc(accessToken, title, content);
    if (result.url) return result;
    last = result;
    // Only retry on transient errors (5xx / network exception).
    const transient =
      result.status === "exception" ||
      /^http-5\d\d$/.test(result.status);
    if (!transient) break;
  }
  return last;
}

/**
 * Rename a Drive file (used to repurpose a Drive-converted Doc as the final
 * result document while preserving its native table structure).
 */
async function renameDriveFile(
  accessToken: string,
  fileId: string,
  name: string
): Promise<boolean> {
  try {
    const res = await fetch(
      `https://www.googleapis.com/drive/v3/files/${fileId}`,
      {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ name }),
      }
    );
    if (!res.ok) {
      console.error(
        `renameDriveFile failed (HTTP ${res.status}):`,
        (await res.text().catch(() => "")).slice(0, 300)
      );
    }
    return res.ok;
  } catch (error) {
    console.error("renameDriveFile error:", error);
    return false;
  }
}

/**
 * Export a Drive file as HTML (used to harvest table structure from a
 * Drive-converted Google Doc).
 */
async function exportDriveFileAsHtml(
  accessToken: string,
  fileId: string,
  signal?: AbortSignal
): Promise<string | null> {
  try {
    const res = await fetch(
      `https://www.googleapis.com/drive/v3/files/${fileId}/export?mimeType=text/html`,
      {
        method: "GET",
        headers: { Authorization: `Bearer ${accessToken}` },
        signal,
      }
    );
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

// ───────────────────────────────────────────────────────────────────────────
//  HTML table parsing — extract <table>…<tr>…<td|th> structures into 2-D
//  string grids. Designed for the HTML produced by Google Docs export.
// ───────────────────────────────────────────────────────────────────────────

function htmlEntitiesToText(s: string): string {
  return s
    .replace(/<br\s*\/?>(?=)/gi, "\n")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&#(\d+);/g, (_, code) =>
      String.fromCharCode(parseInt(code, 10))
    );
}

function cleanCell(html: string): string {
  // Remove tags, decode entities, collapse whitespace, trim.
  const noTags = html.replace(/<[^>]+>/g, " ");
  return htmlEntitiesToText(noTags)
    .replace(/\s+/g, " ")
    .trim();
}

function parseHtmlTables(html: string): string[][][] {
  const tables: string[][][] = [];
  const tableRe = /<table\b[^>]*>([\s\S]*?)<\/table>/gi;
  const trRe = /<tr\b[^>]*>([\s\S]*?)<\/tr>/gi;
  const cellRe = /<(t[hd])\b([^>]*)>([\s\S]*?)<\/\1>/gi;

  let tableMatch: RegExpExecArray | null;
  while ((tableMatch = tableRe.exec(html))) {
    const tableInner = tableMatch[1];
    const rows: string[][] = [];

    let trMatch: RegExpExecArray | null;
    trRe.lastIndex = 0;
    while ((trMatch = trRe.exec(tableInner))) {
      const trInner = trMatch[1];
      const cells: string[] = [];
      let cellMatch: RegExpExecArray | null;
      cellRe.lastIndex = 0;
      while ((cellMatch = cellRe.exec(trInner))) {
        const attrs = cellMatch[2];
        const inner = cellMatch[3];
        const text = cleanCell(inner);
        const colspanMatch = /colspan\s*=\s*"?(\d+)"?/i.exec(attrs);
        const colspan = colspanMatch
          ? Math.min(parseInt(colspanMatch[1], 10) || 1, 8)
          : 1;
        cells.push(text);
        // Pad colspans with empties so columns line up.
        for (let i = 1; i < colspan; i += 1) cells.push("");
      }
      if (cells.length > 0) rows.push(cells);
    }
    if (rows.length > 0) tables.push(rows);
  }

  return tables;
}

function tableLooksFinancial(rows: string[][]): boolean {
  if (rows.length < 2) return false;

  // Flatten all cells to a single string and check for finance/KPI keywords.
  const flat = rows
    .flat()
    .filter(Boolean)
    .join(" ");
  if (FINANCIAL_KPI_RE.test(flat)) return true;

  // Or: the table must have at least two columns and ≥40% numeric cells.
  let numericCount = 0;
  let totalCells = 0;
  for (const row of rows) {
    for (const cell of row) {
      if (!cell) continue;
      totalCells += 1;
      if (/-?\d[\d,]*(?:\.\d+)?%?/.test(cell)) numericCount += 1;
    }
  }
  return totalCells >= 6 && numericCount / totalCells >= 0.4;
}

function captionForTable(rows: string[][], index: number): string {
  // Use the first row text (truncated) as a caption when meaningful, else fallback.
  const headerText = rows[0]?.filter(Boolean).join(" · ").slice(0, 120).trim();
  if (headerText && /[a-z]/i.test(headerText)) {
    return headerText;
  }
  return `Table ${index + 1}`;
}

function normalizeTableWidth(rows: string[][]): string[][] {
  const width = rows.reduce((m, r) => Math.max(m, r.length), 0);
  return rows.map((r) => {
    if (r.length === width) return r;
    const padded = r.slice();
    while (padded.length < width) padded.push("");
    return padded;
  });
}

function extractFinancialTablesFromHtml(html: string): ExtractedTable[] {
  const all = parseHtmlTables(html);
  const filtered: ExtractedTable[] = [];
  let kept = 0;
  for (const t of all) {
    if (!tableLooksFinancial(t)) continue;
    const normalized = normalizeTableWidth(t);
    filtered.push({
      rows: normalized,
      caption: captionForTable(normalized, kept),
    });
    kept += 1;
    if (kept >= 30) break; // Safety cap.
  }
  return filtered;
}

// ───────────────────────────────────────────────────────────────────────────
//  Sheet helpers — add a new tab and append rows for table data.
// ───────────────────────────────────────────────────────────────────────────

function sanitizeSheetTitle(input: string, fallback: string): string {
  // Sheets disallows : \ / ? * [ ] and titles must be ≤100 chars and unique.
  const cleaned = input.replace(/[:\\\/?*\[\]]/g, " ").replace(/\s+/g, " ").trim();
  return (cleaned || fallback).slice(0, 90);
}

async function addSheetTab(
  accessToken: string,
  spreadsheetId: string,
  title: string
): Promise<{ title: string; sheetId: number } | null> {
  try {
    const res = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          requests: [{ addSheet: { properties: { title } } }],
        }),
      }
    );
    if (!res.ok) {
      console.error(
        `addSheetTab failed (HTTP ${res.status}):`,
        (await res.text().catch(() => "")).slice(0, 300)
      );
      return null;
    }
    const body = (await res.json().catch(() => null)) as {
      replies?: Array<{ addSheet?: { properties?: { sheetId?: number; title?: string } } }>;
    } | null;
    const props = body?.replies?.[0]?.addSheet?.properties;
    return {
      title: props?.title ?? title,
      sheetId: props?.sheetId ?? 0,
    };
  } catch (error) {
    console.error("addSheetTab error:", error);
    return null;
  }
}

/**
 * Apply nice formatting to a freshly-written financial table tab:
 *  - bold header row
 *  - frozen first row + first column
 *  - auto-resize all columns
 *  - thin border under header
 */
async function formatFinancialTab(
  accessToken: string,
  spreadsheetId: string,
  sheetId: number,
  headerRowIndex: number,
  numColumns: number
): Promise<void> {
  if (numColumns < 1) return;
  try {
    const requests: unknown[] = [
      // Freeze top header row + first label column
      {
        updateSheetProperties: {
          properties: {
            sheetId,
            gridProperties: { frozenRowCount: 1, frozenColumnCount: 1 },
          },
          fields: "gridProperties.frozenRowCount,gridProperties.frozenColumnCount",
        },
      },
      // Bold the header row
      {
        repeatCell: {
          range: {
            sheetId,
            startRowIndex: headerRowIndex,
            endRowIndex: headerRowIndex + 1,
            startColumnIndex: 0,
            endColumnIndex: numColumns,
          },
          cell: {
            userEnteredFormat: {
              textFormat: { bold: true },
              backgroundColor: { red: 0.95, green: 0.96, blue: 0.99 },
            },
          },
          fields: "userEnteredFormat(textFormat,backgroundColor)",
        },
      },
      // Auto-resize all columns
      {
        autoResizeDimensions: {
          dimensions: {
            sheetId,
            dimension: "COLUMNS",
            startIndex: 0,
            endIndex: numColumns,
          },
        },
      },
    ];
    const res = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ requests }),
      }
    );
    if (!res.ok) {
      console.warn(
        `formatFinancialTab non-fatal failure (HTTP ${res.status}):`,
        (await res.text().catch(() => "")).slice(0, 300)
      );
    }
  } catch (error) {
    console.warn("formatFinancialTab error (non-fatal):", error);
  }
}

async function appendValuesToTab(
  accessToken: string,
  spreadsheetId: string,
  tabTitle: string,
  values: (string | number | null)[][]
): Promise<boolean> {
  try {
    const range = `${tabTitle}!A1`;
    const res = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(
        range
      )}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ values }),
      }
    );
    if (!res.ok) {
      console.error(
        `appendValuesToTab failed (HTTP ${res.status}):`,
        (await res.text().catch(() => "")).slice(0, 300)
      );
    }
    return res.ok;
  } catch (error) {
    console.error("appendValuesToTab error:", error);
    return false;
  }
}

/**
 * Convert string cells to numbers when they look numeric (so Sheets formats
 * them as numbers, not text). Strips commas, percent signs, parentheses
 * (treated as negatives), and currency-like prefixes.
 */
function coerceCell(value: string): string | number {
  if (!value) return "";
  const trimmed = value.trim();
  if (!trimmed) return "";

  // Avoid coercing things like "Q1 FY24" or "2024-25"
  if (!/^[\(\-]?\s*[\d,.]+\s*%?\s*\)?$/.test(trimmed)) return trimmed;

  let s = trimmed;
  let negative = false;
  if (/^\(.*\)$/.test(s)) {
    negative = true;
    s = s.slice(1, -1);
  }
  s = s.replace(/[,\s]/g, "");
  const isPct = s.endsWith("%");
  if (isPct) s = s.slice(0, -1);
  const num = Number(s);
  if (!Number.isFinite(num)) return trimmed;
  const result = negative ? -num : num;
  return isPct ? result : result;
}

async function writeTablesAsSheetTabs(
  accessToken: string,
  spreadsheetId: string,
  doc: ExportDocument,
  tables: ExtractedTable[],
  usedTabTitles: Set<string>
): Promise<{ tabsCreated: number; tabTitles: string[] }> {
  const created: string[] = [];
  if (tables.length === 0) return { tabsCreated: 0, tabTitles: [] };

  // Build a base tab title from doc context.
  const periodPart = [doc.fiscalYear, doc.quarter].filter(Boolean).join(" ");
  const baseTitle = sanitizeSheetTitle(
    [periodPart, doc.title].filter(Boolean).join(" · "),
    "Tables"
  );

  // Single tab per document — concatenate tables with a header row separator.
  let title = baseTitle || "Tables";
  let suffix = 2;
  while (usedTabTitles.has(title.toLowerCase())) {
    const trySuffix = ` (${suffix})`;
    title = sanitizeSheetTitle(baseTitle.slice(0, 90 - trySuffix.length) + trySuffix, "Tables");
    suffix += 1;
    if (suffix > 50) break;
  }

  const tab = await addSheetTab(accessToken, spreadsheetId, title);
  if (!tab) return { tabsCreated: 0, tabTitles: [] };
  usedTabTitles.add(tab.title.toLowerCase());

  // Build a single values payload: a context block, then each financial
  // table with a caption row above it. The first table's first row becomes
  // the "header" we bold + freeze for analysts.
  const values: (string | number | null)[][] = [];
  values.push([doc.title]);
  values.push([`Source: ${doc.url}`]);
  if (periodPart) values.push([`Period: ${periodPart}`]);
  values.push([`Extracted: ${tables.length} financial table${tables.length !== 1 ? "s" : ""}`]);
  values.push([]);

  // Track which row is the first detected table's header (to bold + freeze).
  let headerRowIndex = -1;
  let headerColCount = 0;

  tables.forEach((t, i) => {
    values.push([`${i + 1}. ${t.caption}`]);
    if (i === 0 && t.rows.length > 0) {
      headerRowIndex = values.length; // 0-based — this is the row about to be pushed
      headerColCount = t.rows[0].length;
    }
    for (const row of t.rows) {
      values.push(row.map((c) => coerceCell(c)));
    }
    values.push([]);
  });

  const ok = await appendValuesToTab(accessToken, spreadsheetId, tab.title, values);
  if (!ok) return { tabsCreated: 0, tabTitles: [] };

  // Pretty formatting (best-effort, non-fatal).
  if (headerRowIndex >= 0 && headerColCount > 0) {
    await formatFinancialTab(
      accessToken,
      spreadsheetId,
      tab.sheetId,
      headerRowIndex,
      Math.max(headerColCount, 4)
    );
  }

  created.push(tab.title);
  return { tabsCreated: created.length, tabTitles: created };
}

function normalizeWhitespace(text: string): string {
  return text
    .replace(/\r/g, "\n")
    .replace(/\t/g, " ")
    .replace(/[ ]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function toDocText(text: string): string {
  if (text.length <= MAX_DOC_TEXT_CHARS) return text;
  return `${text.slice(0, MAX_DOC_TEXT_CHARS - 80)}\n\n[Truncated for Google Doc size limit]`;
}

function toSheetContent(text: string): string {
  const normalized = normalizeWhitespace(text);
  if (normalized.length <= MAX_SHEET_CONTENT_CHARS) return normalized;
  return `${normalized.slice(0, MAX_SHEET_CONTENT_CHARS - 40)}\n[Truncated for sheet cell size]`;
}

const CATEGORY_LABELS: Record<string, string> = {
  "quarterly-results": "Quarterly Results",
  "investor-presentation": "Investor Presentation",
  "concall": "Concall",
  "annual-report": "Annual Report",
  "kpi-handbook": "KPI Handbook",
};

const FINANCIAL_KPI_RE =
  /revenue|income|expense|ebitda|ebit|pbt|pat|profit|loss|eps|margin|cash\s*flow|asset|liabilit|debt|borrow|capex|kpi|key\s*performance|operat(?:ing|ional)|volume|utili[sz]ation|subscriber|arpu|aov|order|guidance|roe|roa|roce|gnpa|nnpa|aum/i;

function isTableLikeLine(line: string): boolean {
  const numericTokens = line.match(/-?\d[\d,]*(?:\.\d+)?%?/g) ?? [];
  const hasDelimiter = /\t|\|| {2,}/.test(line);
  return numericTokens.length >= 2 && (hasDelimiter || line.length <= 160);
}

function extractFinancialKpiText(rawText: string): string {
  const lines = normalizeWhitespace(rawText)
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  const picked: string[] = [];
  const seen = new Set<string>();

  const pushUnique = (line: string) => {
    if (!line || seen.has(line)) return;
    seen.add(line);
    picked.push(line);
  };

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (!FINANCIAL_KPI_RE.test(line)) continue;

    pushUnique(line);

    let misses = 0;
    for (let j = i + 1; j < Math.min(lines.length, i + 20); j += 1) {
      const next = lines[j];
      const keep = FINANCIAL_KPI_RE.test(next) || isTableLikeLine(next);
      if (keep) {
        pushUnique(next);
        misses = 0;
      } else {
        misses += 1;
        if (misses >= 3) break;
      }
    }
  }

  if (picked.length === 0) {
    lines
      .filter((line) => FINANCIAL_KPI_RE.test(line))
      .slice(0, 150)
      .forEach((line) => pushUnique(line));
  }

  if (picked.length === 0) return "";
  return toDocText(picked.join("\n"));
}

function buildDocHeader(data: ExportRequest, doc: ExportDocument): string {
  const period = [doc.fiscalYear, doc.quarter].filter(Boolean).join(" · ");
  const sourceLabel = doc.source ? String(doc.source).toUpperCase() : "N/A";

  return [
    `Company: ${data.company.name} (${data.company.symbol})`,
    `Category: ${CATEGORY_LABELS[doc.category] ?? doc.category}`,
    `Title: ${doc.title}`,
    `Period: ${period || "N/A"}`,
    `Source: ${sourceLabel}`,
    `Source URL: ${doc.url}`,
    doc.xbrlUrl ? `XBRL URL: ${doc.xbrlUrl}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

function formatMetricValue(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return "";
  return Number(value).toLocaleString("en-IN", { maximumFractionDigits: 2 });
}

function buildXbrlFinancialDoc(
  data: ExportRequest,
  doc: ExportDocument,
  metrics: Record<string, number | null>
): string {
  const metricRows = ORDERED_METRICS.filter((label) => metrics[label] !== undefined)
    .map((label) => `${label}\t${formatMetricValue(metrics[label])}`);

  if (metricRows.length === 0) return "";

  return toDocText(
    [
      buildDocHeader(data, doc),
      "",
      "Financial and Key KPI Table (XBRL taxonomy mapped)",
      "Metric\tValue",
      ...metricRows,
    ].join("\n")
  );
}

async function deleteDriveFile(accessToken: string, fileId: string): Promise<void> {
  try {
    await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}`, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });
  } catch {
    // Best effort cleanup only.
  }
}

function shouldRetrySourceConversion(status: string): boolean {
  if (status === "invalid-url") return false;
  if (status.startsWith("source-too-large")) return false;
  if (/source-fetch-failed-4\d\d/.test(status)) return false;
  if (/doc-conversion-init-failed-4\d\d/.test(status)) return false;
  if (/doc-conversion-failed-4\d\d/.test(status)) return false;
  return true;
}

async function attemptSourceTextViaGoogleConversion(
  accessToken: string,
  title: string,
  sourceUrl: string
): Promise<SourceTextResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), SOURCE_CONVERSION_TIMEOUT_MS);

  try {
    const sourceRes = await fetch(sourceUrl, {
      method: "GET",
      headers: SOURCE_FETCH_HEADERS,
      cache: "no-store",
      redirect: "follow",
      signal: controller.signal,
    });

    if (!sourceRes.ok) {
      return {
        extractedText: "",
        status: `source-fetch-failed-${sourceRes.status}`,
        tables: [],
      };
    }

    const contentLength = Number(sourceRes.headers.get("content-length") || "0");
    if (contentLength > 0 && contentLength > MAX_SOURCE_FILE_BYTES) {
      return { extractedText: "", status: "source-too-large", tables: [] };
    }

    const sourceMimeType =
      (sourceRes.headers.get("content-type") || "application/octet-stream")
        .split(";")[0]
        .trim();

    let uploadBody: BodyInit;
    let uploadByteLength = contentLength;

    // Prefer stream upload when size is known to reduce memory pressure.
    if (sourceRes.body && contentLength > 0) {
      uploadBody = sourceRes.body;
    } else {
      const sourceBytes = new Uint8Array(await sourceRes.arrayBuffer());
      if (sourceBytes.byteLength > MAX_SOURCE_FILE_BYTES) {
        return { extractedText: "", status: "source-too-large", tables: [] };
      }
      uploadBody = sourceBytes;
      uploadByteLength = sourceBytes.byteLength;
    }

    const initHeaders: Record<string, string> = {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json; charset=UTF-8",
      "X-Upload-Content-Type": sourceMimeType,
    };

    if (uploadByteLength > 0) {
      initHeaders["X-Upload-Content-Length"] = String(uploadByteLength);
    }

    const initRes = await fetch(
      "https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&fields=id",
      {
        method: "POST",
        headers: initHeaders,
        body: JSON.stringify({
          name: title,
          mimeType: "application/vnd.google-apps.document",
        }),
        signal: controller.signal,
      }
    );

    if (!initRes.ok) {
      return {
        extractedText: "",
        status: `doc-conversion-init-failed-${initRes.status}`,
        tables: [],
      };
    }

    const resumableUrl = initRes.headers.get("location");
    if (!resumableUrl) {
      return { extractedText: "", status: "doc-conversion-session-missing", tables: [] };
    }

    const uploadHeaders: Record<string, string> = {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": sourceMimeType,
    };

    if (uploadByteLength > 0) {
      uploadHeaders["Content-Length"] = String(uploadByteLength);
    }

    const uploadRequest: RequestInit & { duplex?: "half" } = {
      method: "PUT",
      headers: uploadHeaders,
      body: uploadBody,
      signal: controller.signal,
    };

    if (sourceRes.body && contentLength > 0) {
      uploadRequest.duplex = "half";
    }

    const uploadRes = await fetch(resumableUrl, uploadRequest);

    if (!uploadRes.ok) {
      return {
        extractedText: "",
        status: `doc-conversion-failed-${uploadRes.status}`,
        tables: [],
      };
    }

    const uploaded = (await uploadRes.json().catch(() => null)) as
      | { id?: string }
      | null;
    const fileId = uploaded?.id;

    if (!fileId) {
      return { extractedText: "", status: "doc-id-missing", tables: [] };
    }

    // Export as plain text (for KPI text extraction) and as HTML (for tables).
    // We deliberately KEEP the converted file so the caller can rename it and
    // reuse it as the final result Doc — the converted Doc preserves tables
    // natively, which a re-created text-only Doc would not.
    const [textRes, htmlRes] = await Promise.all([
      fetch(
        `https://www.googleapis.com/drive/v3/files/${fileId}/export?mimeType=text/plain`,
        {
          method: "GET",
          headers: { Authorization: `Bearer ${accessToken}` },
          signal: controller.signal,
        }
      ),
      fetch(
        `https://www.googleapis.com/drive/v3/files/${fileId}/export?mimeType=text/html`,
        {
          method: "GET",
          headers: { Authorization: `Bearer ${accessToken}` },
          signal: controller.signal,
        }
      ),
    ]);

    // First try direct text/plain export. Drive returns 400 / 403 when the
    // converted Doc exceeds the text-export size limit (~10 MB) — this is
    // common for investor decks. In that case we fall back to deriving text
    // from the HTML export, which has a more generous limit. We always keep
    // the converted file so the caller can still hand the user a Google Doc
    // with native tables intact.
    let exportedText = "";
    let textStatus: "text-ok" | "text-fallback-html" | "text-empty" = "text-empty";

    if (textRes.ok) {
      exportedText = normalizeWhitespace(await textRes.text());
      textStatus = exportedText ? "text-ok" : "text-empty";
    }

    let tables: ExtractedTable[] = [];
    let htmlBody: string | null = null;
    if (htmlRes.ok) {
      try {
        htmlBody = await htmlRes.text();
        tables = extractFinancialTablesFromHtml(htmlBody);
      } catch (err) {
        console.error("HTML table parse error:", err);
      }
    }

    if (!exportedText && htmlBody) {
      // Strip HTML tags + decode common entities for a passable plain-text view.
      const stripped = normalizeWhitespace(
        htmlBody
          .replace(/<style[\s\S]*?<\/style>/gi, " ")
          .replace(/<script[\s\S]*?<\/script>/gi, " ")
          .replace(/<\/(?:p|div|tr|li|h[1-6])>/gi, "\n")
          .replace(/<br\s*\/?\s*>/gi, "\n")
          .replace(/<[^>]+>/g, " ")
          .replace(/&nbsp;/gi, " ")
          .replace(/&amp;/gi, "&")
          .replace(/&lt;/gi, "<")
          .replace(/&gt;/gi, ">")
          .replace(/&quot;/gi, '"')
          .replace(/&#39;/gi, "'")
      );
      if (stripped) {
        exportedText = stripped;
        textStatus = "text-fallback-html";
      }
    }

    if (!exportedText && !textRes.ok && !htmlRes.ok) {
      // Both exports failed — keep the file id so caller can still produce
      // the renamed Doc. Plain text path is just unavailable.
      return {
        extractedText: "",
        status: `doc-export-failed-text-${textRes.status}-html-${htmlRes.status}`,
        tables: [],
        convertedFileId: fileId,
      };
    }

    const baseStatus =
      exportedText && textStatus === "text-fallback-html"
        ? "ok-via-doc-conversion-html-fallback"
        : exportedText
          ? "ok-via-doc-conversion"
          : "doc-created-empty-text";

    return {
      extractedText: toDocText(exportedText),
      status: baseStatus,
      tables,
      convertedFileId: fileId,
    };
  } catch (error) {
    const isAbort =
      error instanceof Error &&
      (error.name === "AbortError" || error.message.toLowerCase().includes("abort"));

    return {
      extractedText: "",
      status: isAbort ? "doc-conversion-timeout" : "doc-conversion-error",
      tables: [],
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function extractSourceTextViaGoogleConversion(
  accessToken: string,
  title: string,
  sourceUrl: string
): Promise<SourceTextResult> {
  if (!/^https?:\/\//i.test(sourceUrl)) {
    return { extractedText: "", status: "invalid-url", tables: [] };
  }

  let lastResult: SourceTextResult = {
    extractedText: "",
    status: "doc-conversion-error",
    tables: [],
  };

  for (let attempt = 1; attempt <= 2; attempt += 1) {
    const result = await attemptSourceTextViaGoogleConversion(
      accessToken,
      title,
      sourceUrl
    );

    if (result.extractedText || result.convertedFileId) {
      return result;
    }

    lastResult = result;
    if (!shouldRetrySourceConversion(result.status)) {
      break;
    }
  }

  return lastResult;
}

/* ──────────────────────────────────────────────────────────────────────── */
/*  Direct PDF table extraction via positional clustering (unpdf)           */
/* ──────────────────────────────────────────────────────────────────────── */

const PDF_FETCH_TIMEOUT_MS = 45000;
const MAX_PDF_BYTES = 30 * 1024 * 1024; // 30 MB safety cap
/**
 * PDFs above this size still get a Drive-conversion fallback (which streams
 * the upload), but skip the in-memory positional table extraction. Keeps
 * one giant filing from monopolising a worker slot for ~30s.
 */
const POSITIONAL_PDF_BUDGET_BYTES = 12 * 1024 * 1024; // 12 MB

/**
 * Quick HEAD probe to read content-length / content-type without downloading
 * the body. Returns `null` when the server doesn't support HEAD or the
 * request fails — callers should treat that as "size unknown" and proceed.
 */
async function probePdfHead(
  url: string
): Promise<{ size: number | null; type: string | null } | null> {
  if (!/^https?:\/\//i.test(url)) return null;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  try {
    const res = await fetch(url, {
      method: "HEAD",
      headers: SOURCE_FETCH_HEADERS,
      cache: "no-store",
      redirect: "follow",
      signal: controller.signal,
    });
    if (!res.ok) return null;
    const cl = Number(res.headers.get("content-length") || "0");
    return {
      size: cl > 0 ? cl : null,
      type: res.headers.get("content-type"),
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchPdfBytes(url: string): Promise<Uint8Array | null> {
  if (!/^https?:\/\//i.test(url)) return null;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), PDF_FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: SOURCE_FETCH_HEADERS,
      cache: "no-store",
      redirect: "follow",
      signal: controller.signal,
    });
    if (!res.ok) {
      console.error(`fetchPdfBytes HTTP ${res.status} for ${url}`);
      return null;
    }
    const cl = Number(res.headers.get("content-length") || "0");
    if (cl > 0 && cl > MAX_PDF_BYTES) {
      console.error(`fetchPdfBytes too large (${cl}B) for ${url}`);
      return null;
    }
    const buf = await res.arrayBuffer();
    if (buf.byteLength > MAX_PDF_BYTES) return null;
    return new Uint8Array(buf);
  } catch (err) {
    console.error("fetchPdfBytes error:", err);
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

function looksLikePdfUrl(url: string, type?: string): boolean {
  if (type && type.toLowerCase() === "pdf") return true;
  return /\.pdf(?:[?#]|$)/i.test(url);
}

async function tryPositionalPdfTables(
  doc: ExportDocument
): Promise<{ tables: ExtractedTable[]; text: string; status: string } | null> {
  if (!looksLikePdfUrl(doc.url, doc.type)) return null;

  // Cheap HEAD probe first — if the PDF exceeds the positional-extraction
  // budget, skip the heavy in-memory parse and let the Drive-conversion
  // fallback handle it (it streams the upload, no memory pressure).
  const head = await probePdfHead(doc.url);
  if (head?.size && head.size > POSITIONAL_PDF_BUDGET_BYTES) {
    console.warn(
      `tryPositionalPdfTables skipping large PDF ${head.size}B for ${doc.url}`
    );
    return { tables: [], text: "", status: `pdf-too-large-${head.size}` };
  }

  const bytes = await fetchPdfBytes(doc.url);
  if (!bytes) return { tables: [], text: "", status: "pdf-fetch-failed" };

  // Hard timeout on the parse itself so a malformed PDF can't stall a slot.
  const PARSE_TIMEOUT_MS = 30000;
  const parsePromise = extractTablesFromPdf(bytes, {
    maxPages: 30,
    financialOnly: true,
  });
  const result = await Promise.race([
    parsePromise,
    new Promise<null>((resolve) =>
      setTimeout(() => resolve(null), PARSE_TIMEOUT_MS)
    ),
  ]);

  if (!result) {
    console.warn(`tryPositionalPdfTables parse timed out for ${doc.url}`);
    return { tables: [], text: "", status: "pdf-parse-timeout" };
  }

  return {
    tables: result.tables,
    text: result.text,
    status: `pdf-${result.status}`,
  };
}

async function buildGoogleDocContentForDocument(
  accessToken: string,
  data: ExportRequest,
  doc: ExportDocument
): Promise<{
  docText: string;
  status: string;
  tables: ExtractedTable[];
  convertedFileId?: string;
}> {
  // 1) Taxonomy-based extraction for quarterly result docs with XBRL.
  if (doc.category === "quarterly-results" && doc.xbrlUrl) {
    const metrics = await parseQuarterlyXBRL(doc.xbrlUrl, NSE_HEADERS);
    const xbrlDocText = buildXbrlFinancialDoc(data, doc, metrics);
    if (xbrlDocText) {
      const metricRows: string[][] = [["Metric", "Value"]];
      for (const label of ORDERED_METRICS) {
        if (metrics[label] === undefined) continue;
        metricRows.push([label, formatMetricValue(metrics[label])]);
      }
      return {
        docText: xbrlDocText,
        status: "ok-xbrl-taxonomy",
        tables:
          metricRows.length > 1
            ? [{ rows: metricRows, caption: "XBRL taxonomy metrics" }]
            : [],
      };
    }
  }

  // 2) Direct PDF positional extraction — produces real cell-level tables.
  //    This is the ONLY path that reliably gets PDF tables into Sheet cells.
  const pdfResult = await tryPositionalPdfTables(doc);
  if (pdfResult && pdfResult.tables.length > 0) {
    const tableTextLines: string[] = [];
    for (const t of pdfResult.tables.slice(0, 6)) {
      tableTextLines.push(`\n${t.caption}`);
      for (const row of t.rows.slice(0, 30)) {
        tableTextLines.push(row.join("\t"));
      }
    }
    return {
      docText: toDocText(
        [
          buildDocHeader(data, doc),
          "",
          "Financial and Key KPI Tables (extracted from PDF)",
          ...tableTextLines,
        ].join("\n")
      ),
      status: `ok-pdf-positional-${pdfResult.tables.length}-tables`,
      tables: pdfResult.tables,
    };
  }

  // 3) Direct text-only fetch (HTML/XML/plain text resources).
  const extracted = await extractDocumentContent(doc.url);
  if (extracted.fullText) {
    const filtered = extractFinancialKpiText(extracted.fullText);
    if (filtered) {
      const converted = await extractSourceTextViaGoogleConversion(
        accessToken,
        `${data.company.symbol} - ${doc.title}`.slice(0, 120),
        doc.url
      );
      return {
        docText: toDocText(
          [
            buildDocHeader(data, doc),
            "",
            "Financial and Key KPI Tables",
            filtered,
          ].join("\n")
        ),
        status: `ok-filtered-${extracted.status}`,
        tables: converted.tables,
        convertedFileId: converted.convertedFileId,
      };
    }
  }

  // 4) Fall back to Drive conversion (preserves native Doc tables when present).
  const converted = await extractSourceTextViaGoogleConversion(
    accessToken,
    `${data.company.symbol} - ${doc.title}`.slice(0, 120),
    doc.url
  );
  if (converted.extractedText) {
    const filtered = extractFinancialKpiText(converted.extractedText);
    if (filtered) {
      return {
        docText: toDocText(
          [
            buildDocHeader(data, doc),
            "",
            "Financial and Key KPI Tables",
            filtered,
          ].join("\n")
        ),
        status: `ok-filtered-${converted.status}`,
        tables: converted.tables,
        convertedFileId: converted.convertedFileId,
      };
    }
  }

  return {
    docText: toDocText(
      [
        buildDocHeader(data, doc),
        "",
        "Financial and KPI extraction was not available for this file.",
      ].join("\n")
    ),
    status: `no-financial-kpi-${converted.status || extracted.status}`,
    tables: converted.tables,
    convertedFileId: converted.convertedFileId,
  };
}

interface DocumentAppendResult extends AppendResult {
  tabsCreated: number;
}

/**
 * Append IR document rows to Google Sheet (one row per document).
 * Can optionally include extracted financial/KPI content in a dedicated column.
 * Also writes any extracted financial tables into per-document sheet tabs.
 */
async function appendDocumentRows(
  accessToken: string,
  spreadsheetId: string,
  data: ExportRequest
): Promise<DocumentAppendResult> {
  try {
    const createGoogleDocs = data.createGoogleDocs !== false;
    const includeContent = data.includeContent === true;

    const headers = [
      "Company",
      "Ticker",
      "Category",
      "Period",
      "Title",
      "Source URL",
      "Google Doc URL",
      "Doc Status",
      "Tables Tab",
      "Source",
    ];

    if (includeContent) {
      headers.push("Extracted Content");
    }

    const needsExtraction = createGoogleDocs || includeContent;

    // ── Phase 1: prep work in parallel ────────────────────────────────────
    // The expensive per-document operations (PDF download + positional
    // extraction + Drive multipart upload + Doc creation) are independent
    // and can run concurrently. Sheet writes still happen serially below to
    // preserve row order and keep tab-create batchUpdates conflict-free.
    const PREP_CONCURRENCY = 4;

    interface PrepResult {
      doc: ExportDocument;
      extracted: {
        docText: string;
        status: string;
        tables: ExtractedTable[];
        convertedFileId?: string;
      } | null;
      createdDocUrl: string;
      createdDocStatus: string;
      docCreated: boolean;
    }

    const prepOne = async (doc: ExportDocument): Promise<PrepResult> => {
      const extracted = needsExtraction
        ? await buildGoogleDocContentForDocument(accessToken, data, doc)
        : null;

      let createdDocUrl = "";
      let createdDocStatus = createGoogleDocs ? "doc-pending" : "doc-disabled";
      let docCreated = false;

      if (createGoogleDocs && extracted) {
        const safeTitle = `${data.company.symbol} - ${doc.title}`.slice(0, 120);
        if (extracted.convertedFileId) {
          const renamed = await renameDriveFile(
            accessToken,
            extracted.convertedFileId,
            safeTitle
          );
          createdDocUrl = `https://docs.google.com/document/d/${extracted.convertedFileId}/edit`;
          createdDocStatus = renamed
            ? `${extracted.status}+native-tables`
            : `${extracted.status}+native-tables (rename-failed)`;
          docCreated = true;
        } else {
          const made = await createGoogleDoc(accessToken, safeTitle, extracted.docText);
          if (made.url) {
            createdDocUrl = made.url;
            createdDocStatus = extracted.status;
            docCreated = true;
          } else {
            createdDocStatus = `doc-create-failed-${made.status}`;
          }
        }
      } else if (extracted?.convertedFileId && !createGoogleDocs) {
        // Not creating a Doc — clean up the helper file.
        await deleteDriveFile(accessToken, extracted.convertedFileId);
      }

      return { doc, extracted, createdDocUrl, createdDocStatus, docCreated };
    };

    // Run prep through a streaming async pool: as soon as a worker finishes
    // one document, it picks up the next available index. This means a single
    // slow PDF only blocks its own slot — the other workers keep flowing.
    const prepped: PrepResult[] = new Array(data.documents.length);
    {
      let nextIndex = 0;
      const workerCount = Math.min(PREP_CONCURRENCY, data.documents.length);
      const worker = async () => {
        while (true) {
          const i = nextIndex;
          nextIndex += 1;
          if (i >= data.documents.length) return;
          prepped[i] = await prepOne(data.documents[i]);
        }
      };
      await Promise.all(
        Array.from({ length: Math.max(1, workerCount) }, () => worker())
      );
    }

    // ── Phase 2: commit results serially (sheet tabs + row append) ────────
    const rows: string[][] = [];
    let docsCreated = 0;
    let tabsCreated = 0;
    const usedTabTitles = new Set<string>();

    for (const p of prepped) {
      const doc = p.doc;
      const period = [doc.fiscalYear, doc.quarter].filter(Boolean).join(" · ");
      let tablesTabLabel = "";
      let sheetContent = "";

      if (p.extracted && includeContent) {
        sheetContent = toSheetContent(p.extracted.docText);
      }

      // Write extracted tables into a dedicated tab (sequential — tab creation
      // requires unique titles tracked across the whole export).
      if (p.extracted && p.extracted.tables.length > 0) {
        const result = await writeTablesAsSheetTabs(
          accessToken,
          spreadsheetId,
          doc,
          p.extracted.tables,
          usedTabTitles
        );
        tabsCreated += result.tabsCreated;
        if (result.tabTitles.length > 0) {
          tablesTabLabel = result.tabTitles.join(", ");
        }
      }

      if (p.docCreated) docsCreated += 1;

      rows.push([
        data.company.name,
        data.company.symbol,
        CATEGORY_LABELS[doc.category] ?? doc.category,
        period,
        doc.title,
        doc.url,
        p.createdDocUrl,
        p.createdDocStatus,
        tablesTabLabel,
        doc.source ? String(doc.source).toUpperCase() : "",
      ]);

      if (includeContent) {
        rows[rows.length - 1].push(sheetContent);
      }
    }

    const values = [headers, ...rows];

    const response = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/Sheet1!A1:append?valueInputOption=USER_ENTERED`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ values }),
      }
    );

    return {
      ok: response.ok,
      rowsWritten: response.ok ? rows.length : 0,
      docsCreated: response.ok ? docsCreated : 0,
      tabsCreated: response.ok ? tabsCreated : 0,
    };
  } catch (error) {
    console.error("appendDocumentRows error:", error);
    return { ok: false, rowsWritten: 0, docsCreated: 0, tabsCreated: 0 };
  }
}

/**
 * Append XBRL financial data rows to Google Sheet (wide format).
 * One row per quarterly filing; metrics are columns.
 * Falls back to appending a metadata row for docs without a valid xbrlUrl.
 */
async function appendXBRLRows(
  accessToken: string,
  spreadsheetId: string,
  data: ExportRequest
): Promise<AppendResult> {
  try {
    // Header row
    const headers = [
      "Company",
      "Ticker",
      "Quarter",
      "Fiscal Year",
      "Type",
      ...ORDERED_METRICS,
    ];

    // Only process quarterly-results docs; skip others for XBRL mode
    const quarterlyDocs = data.documents.filter(
      (d) => d.category === "quarterly-results"
    );

    if (quarterlyDocs.length === 0) {
      return { ok: false, rowsWritten: 0, docsCreated: 0 };
    }

    const rows: (string | number | null)[][] = [];

    for (const doc of quarterlyDocs) {
      // Derive consolidated/standalone label from title
      const consolidated = doc.title.includes("Consolidated")
        ? "Consolidated"
        : doc.title.includes("Non-Consolidated") || doc.title.includes("Standalone")
        ? "Standalone"
        : "";

      if (doc.xbrlUrl) {
        const metrics = await parseQuarterlyXBRL(doc.xbrlUrl, NSE_HEADERS);
        const metricValues = ORDERED_METRICS.map((label) => metrics[label] ?? null);
        rows.push([
          data.company.name,
          data.company.symbol,
          doc.quarter ?? "",
          doc.fiscalYear,
          consolidated,
          ...metricValues,
        ]);
      } else {
        // No XBRL — write a row with nulls for metric columns
        rows.push([
          data.company.name,
          data.company.symbol,
          doc.quarter ?? "",
          doc.fiscalYear,
          consolidated,
          ...ORDERED_METRICS.map(() => null),
        ]);
      }
    }

    const values = [headers, ...rows];

    const response = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/Sheet1!A1:append?valueInputOption=USER_ENTERED`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ values }),
      }
    );

    return {
      ok: response.ok,
      rowsWritten: response.ok ? rows.length : 0,
      docsCreated: 0,
    };
  } catch {
    return { ok: false, rowsWritten: 0, docsCreated: 0 };
  }
}

/* ──────────────────────────────────────────────────────────────────────── */
/*  XBRL comparative repository — metrics as rows, quarters as columns      */
/*  (one consolidated sheet for QoQ / YoY analysis across all selected      */
/*   quarterly filings).                                                    */
/* ──────────────────────────────────────────────────────────────────────── */

interface QuarterColumn {
  doc: ExportDocument;
  metrics: Record<string, number | null>;
  /** Stable sort key: e.g. "2024-Q3" */
  sortKey: string;
  /** Display label: e.g. "Q3 FY24 (Cons)" */
  label: string;
}

const QUARTER_ORDER: Record<string, number> = {
  Q1: 1,
  Q2: 2,
  Q3: 3,
  Q4: 4,
};

function fyToCalendarYear(fy: string, quarter?: string): number {
  // FY24 = Apr-23 to Mar-24. Q1 falls in calendar 2023, Q4 in 2024.
  const m = /(\d{2,4})/.exec(fy ?? "");
  if (!m) return 0;
  let yy = parseInt(m[1], 10);
  if (yy < 100) yy += 2000;
  const q = (quarter || "").toUpperCase().replace(/\s+/g, "");
  if (q === "Q1") return yy - 1;
  if (q === "Q2") return yy - 1;
  if (q === "Q3") return yy;
  if (q === "Q4") return yy;
  return yy;
}

function buildQuarterSortKey(doc: ExportDocument): string {
  const calYear = fyToCalendarYear(doc.fiscalYear, doc.quarter);
  const q = QUARTER_ORDER[(doc.quarter || "").toUpperCase().trim()] ?? 5;
  return `${calYear.toString().padStart(4, "0")}-${q}`;
}

function quarterLabel(doc: ExportDocument): string {
  const consolidated = /Consolidated/i.test(doc.title)
    ? "Cons"
    : /Standalone|Non-Consolidated/i.test(doc.title)
    ? "Std"
    : "";
  const period = [doc.quarter, doc.fiscalYear].filter(Boolean).join(" ");
  return consolidated ? `${period} (${consolidated})` : period;
}

async function appendXBRLComparativeSheet(
  accessToken: string,
  spreadsheetId: string,
  data: ExportRequest,
  usedTabTitles: Set<string>
): Promise<{ ok: boolean; tabsCreated: number; quartersIncluded: number }> {
  const quarterlyDocs = data.documents.filter(
    (d) => d.category === "quarterly-results" && d.xbrlUrl
  );
  if (quarterlyDocs.length === 0) {
    return { ok: false, tabsCreated: 0, quartersIncluded: 0 };
  }

  // Parse all XBRL files in parallel for speed.
  const columns: QuarterColumn[] = await Promise.all(
    quarterlyDocs.map(async (doc) => {
      const metrics = await parseQuarterlyXBRL(doc.xbrlUrl!, NSE_HEADERS);
      return {
        doc,
        metrics,
        sortKey: buildQuarterSortKey(doc),
        label: quarterLabel(doc),
      };
    })
  );

  // Sort chronologically (oldest → newest, left → right).
  columns.sort((a, b) => a.sortKey.localeCompare(b.sortKey));

  // Build the comparative grid: header row + one row per metric.
  const headers: (string | number | null)[] = ["Metric", ...columns.map((c) => c.label)];

  const rows: (string | number | null)[][] = [];
  for (const metric of ORDERED_METRICS) {
    const row: (string | number | null)[] = [metric];
    let hasAny = false;
    for (const col of columns) {
      const v = col.metrics[metric];
      if (v != null) hasAny = true;
      row.push(v == null || Number.isNaN(v) ? null : Number(v));
    }
    if (hasAny) rows.push(row);
  }

  if (rows.length === 0) {
    return { ok: false, tabsCreated: 0, quartersIncluded: columns.length };
  }

  // Build tab title.
  let title = sanitizeSheetTitle(
    `${data.company.symbol} · XBRL Comparative`,
    "XBRL Comparative"
  );
  let suffix = 2;
  while (usedTabTitles.has(title.toLowerCase())) {
    title = sanitizeSheetTitle(`${data.company.symbol} XBRL Comparative (${suffix})`, "XBRL Comparative");
    suffix += 1;
    if (suffix > 50) break;
  }

  const tab = await addSheetTab(accessToken, spreadsheetId, title);
  if (!tab) return { ok: false, tabsCreated: 0, quartersIncluded: columns.length };
  usedTabTitles.add(tab.title.toLowerCase());

  // Optional context block above the table.
  const context: (string | number | null)[][] = [
    [`${data.company.name} (${data.company.symbol}) — XBRL comparative repository`],
    [
      `Quarters: ${columns.length} · Metrics: ${rows.length} · Source: NSE Reg-33 XBRL filings`,
    ],
    [],
    headers,
    ...rows,
    [],
    ["QoQ % change (latest two quarters)"],
  ];

  // QoQ block: only when ≥2 quarters available.
  if (columns.length >= 2) {
    const qoqHeader: (string | number | null)[] = ["Metric", "Prev", "Latest", "QoQ %"];
    context.push(qoqHeader);
    const last = columns.length - 1;
    for (const row of rows) {
      const metric = row[0] as string;
      const prev = row[last] as number | null; // sheets index of "prev" col is last column
      // Actually columns are at positions 1..N in row; prev = row[N-1], latest = row[N]
      const prevVal = row[columns.length - 1] as number | null;
      const latestVal = row[columns.length] as number | null;
      let pct: number | string = "";
      if (
        typeof prevVal === "number" &&
        typeof latestVal === "number" &&
        prevVal !== 0
      ) {
        pct = ((latestVal - prevVal) / Math.abs(prevVal)) * 100;
      }
      context.push([
        metric,
        prevVal,
        latestVal,
        typeof pct === "number" ? Number(pct.toFixed(2)) : "",
      ]);
      // (avoid unused warning)
      void prev;
    }
  }

  const ok = await appendValuesToTab(accessToken, spreadsheetId, tab.title, context);
  if (ok) {
    // Bold + freeze the metric header row (4 rows of context above it).
    await formatFinancialTab(
      accessToken,
      spreadsheetId,
      tab.sheetId,
      3, // headers row index (0-based: 3 context rows above)
      headers.length
    );
  }
  return {
    ok,
    tabsCreated: ok ? 1 : 0,
    quartersIncluded: columns.length,
  };
}

/**
 * Export financial data to Google Sheets
 */
export async function POST(request: NextRequest) {
  try {
    // Get access token from cookie
    const accessToken = request.cookies.get("google_access_token")?.value;
    const refreshToken = request.cookies.get("google_refresh_token")?.value;

    if (!accessToken && !refreshToken) {
      return NextResponse.json(
        {
          error: "Not authenticated. Please authorize Google Sheets access first.",
          code: "NOT_AUTHENTICATED",
        },
        { status: 401 }
      );
    }

    let token: string | undefined = accessToken;

    // If access token is expired, try to refresh it
    if (!token && refreshToken) {
      token = (await refreshAccessToken(refreshToken)) ?? undefined;
      if (!token) {
        return NextResponse.json(
          {
            error: "Failed to refresh authentication. Please authorize again.",
            code: "TOKEN_REFRESH_FAILED",
          },
          { status: 401 }
        );
      }
    }

    if (!token) {
      return NextResponse.json(
        {
          error: "Not authenticated. Please authorize Google Sheets access first.",
          code: "NOT_AUTHENTICATED",
        },
        { status: 401 }
      );
    }

    // Parse request body
    const companyData: ExportRequest = await request.json();

    if (!companyData.company || !Array.isArray(companyData.documents)) {
      return NextResponse.json(
        { error: "Missing required company or documents data" },
        { status: 400 }
      );
    }

    const exportMode = companyData.exportMode === "xbrl" ? "xbrl" : "metadata";
    const createGoogleDocs =
      exportMode === "metadata" ? companyData.createGoogleDocs !== false : false;
    const includeContent =
      exportMode === "metadata" ? companyData.includeContent === true : false;

    if (
      exportMode === "xbrl" &&
      !companyData.documents.some(
        (d) => d.category === "quarterly-results" && !!d.xbrlUrl
      )
    ) {
      return NextResponse.json(
        {
          error:
            "XBRL export requires at least one selected quarterly result with a valid XBRL link.",
          code: "XBRL_INPUT_INVALID",
        },
        { status: 400 }
      );
    }

    // Create spreadsheet
    const modeLabel =
      exportMode === "xbrl"
        ? "XBRL Financials"
        : includeContent
        ? "IR Content + Docs"
        : "IR Links + Docs";
    const title = `${companyData.company.symbol} - ${modeLabel} - ${new Date().toISOString().split("T")[0]}`;
    const spreadsheetId = await createSpreadsheet(token, title);

    if (!spreadsheetId) {
      return NextResponse.json(
        {
          error: "Failed to create Google Sheet. Make sure Google Sheets API is enabled.",
          code: "SHEET_CREATE_FAILED",
        },
        { status: 500 }
      );
    }

    // Append document rows (metadata or XBRL mode)
    const appendResult =
      exportMode === "xbrl"
        ? await appendXBRLRows(token, spreadsheetId, companyData)
        : await appendDocumentRows(token, spreadsheetId, {
            ...companyData,
            createGoogleDocs,
            includeContent,
          });

    if (!appendResult.ok) {
      return NextResponse.json(
        {
          error:
            exportMode === "xbrl"
              ? "Failed to append parsed XBRL data to Google Sheet."
              : includeContent
              ? "Failed to append document rows with content to Google Sheet."
              : "Failed to append document links rows to Google Sheet.",
          code: "SHEET_APPEND_FAILED",
        },
        { status: 500 }
      );
    }

    // Optional: append the XBRL comparative repository tab.
    let comparativeQuarters = 0;
    let comparativeTabsCreated = 0;
    if (companyData.includeXbrlComparative) {
      const compResult = await appendXBRLComparativeSheet(
        token,
        spreadsheetId,
        companyData,
        new Set<string>() // independent of per-doc tab title set; addSheetTab handles uniqueness
      );
      comparativeQuarters = compResult.quartersIncluded;
      comparativeTabsCreated = compResult.tabsCreated;
    }

    // Make the sheet shareable
    const permissionResponse = await fetch(
      `https://www.googleapis.com/drive/v3/files/${spreadsheetId}/permissions`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          role: "reader",
          type: "anyone",
        }),
      }
    );

    if (!permissionResponse.ok) {
      console.warn(
        "Failed to set sheet sharing permission:",
        await permissionResponse.text()
      );
    }

    const sheetUrl = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`;

    const rowNoun = exportMode === "xbrl" ? "XBRL filing" : "document";
    const docCreatedSuffix =
      appendResult.docsCreated > 0
        ? ` and created ${appendResult.docsCreated} Google Doc${appendResult.docsCreated !== 1 ? "s" : ""}`
        : "";
    const tabsCreated =
      "tabsCreated" in appendResult ? (appendResult as DocumentAppendResult).tabsCreated : 0;
    const tabsSuffix =
      tabsCreated > 0
        ? ` with ${tabsCreated} extracted-table tab${tabsCreated !== 1 ? "s" : ""}`
        : "";
    const comparativeSuffix =
      comparativeTabsCreated > 0
        ? ` plus an XBRL comparative tab covering ${comparativeQuarters} quarter${comparativeQuarters !== 1 ? "s" : ""}`
        : "";

    return NextResponse.json(
      {
        success: true,
        spreadsheetId,
        sheetUrl,
        message: `Successfully exported ${appendResult.rowsWritten} ${rowNoun}${appendResult.rowsWritten !== 1 ? "s" : ""} to Google Sheets${docCreatedSuffix}${tabsSuffix}${comparativeSuffix}`,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("Export error:", error);
    return NextResponse.json(
      {
        error: "Failed to export to Google Sheets",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
