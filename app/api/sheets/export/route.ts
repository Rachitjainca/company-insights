import { NextRequest, NextResponse } from "next/server";
import { parseQuarterlyXBRL, ORDERED_METRICS } from "@/lib/xbrl-parser";
import { extractDocumentContent } from "@/lib/document-content";

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
}

interface AppendResult {
  ok: boolean;
  rowsWritten: number;
  docsCreated: number;
}

interface SourceTextResult {
  extractedText: string;
  status: string;
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

/**
 * Create a Google Doc and insert extracted text content.
 */
async function createGoogleDoc(
  accessToken: string,
  title: string,
  content: string
): Promise<string | null> {
  try {
    const createRes = await fetch("https://docs.googleapis.com/v1/documents", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ title }),
    });

    if (!createRes.ok) {
      return null;
    }

    const created = await createRes.json();
    const documentId = created?.documentId as string | undefined;
    if (!documentId) return null;

    const insertRes = await fetch(
      `https://docs.googleapis.com/v1/documents/${documentId}:batchUpdate`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          requests: [
            {
              insertText: {
                location: { index: 1 },
                text: content,
              },
            },
          ],
        }),
      }
    );

    if (!insertRes.ok) {
      return null;
    }

    return `https://docs.google.com/document/d/${documentId}/edit`;
  } catch {
    return null;
  }
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
      };
    }

    const contentLength = Number(sourceRes.headers.get("content-length") || "0");
    if (contentLength > 0 && contentLength > MAX_SOURCE_FILE_BYTES) {
      return { extractedText: "", status: "source-too-large" };
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
        return { extractedText: "", status: "source-too-large" };
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
      };
    }

    const resumableUrl = initRes.headers.get("location");
    if (!resumableUrl) {
      return { extractedText: "", status: "doc-conversion-session-missing" };
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
      };
    }

    const uploaded = (await uploadRes.json().catch(() => null)) as
      | { id?: string }
      | null;
    const fileId = uploaded?.id;

    if (!fileId) {
      return { extractedText: "", status: "doc-id-missing" };
    }

    try {
      const exportRes = await fetch(
        `https://www.googleapis.com/drive/v3/files/${fileId}/export?mimeType=text/plain`,
        {
          method: "GET",
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
          signal: controller.signal,
        }
      );

      if (!exportRes.ok) {
        return {
          extractedText: "",
          status: `doc-created-no-text-export-${exportRes.status}`,
        };
      }

      const exportedText = normalizeWhitespace(await exportRes.text());
      return {
        extractedText: toDocText(exportedText),
        status: exportedText ? "ok-via-doc-conversion" : "doc-created-empty-text",
      };
    } finally {
      await deleteDriveFile(accessToken, fileId);
    }
  } catch (error) {
    const isAbort =
      error instanceof Error &&
      (error.name === "AbortError" || error.message.toLowerCase().includes("abort"));

    return {
      extractedText: "",
      status: isAbort ? "doc-conversion-timeout" : "doc-conversion-error",
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
    return { extractedText: "", status: "invalid-url" };
  }

  let lastResult: SourceTextResult = {
    extractedText: "",
    status: "doc-conversion-error",
  };

  for (let attempt = 1; attempt <= 2; attempt += 1) {
    const result = await attemptSourceTextViaGoogleConversion(
      accessToken,
      title,
      sourceUrl
    );

    if (result.extractedText) {
      return result;
    }

    lastResult = result;
    if (!shouldRetrySourceConversion(result.status)) {
      break;
    }
  }

  return lastResult;
}

async function buildGoogleDocContentForDocument(
  accessToken: string,
  data: ExportRequest,
  doc: ExportDocument
): Promise<{ docText: string; status: string }> {
  // Prefer taxonomy-based extraction for quarterly result docs with XBRL.
  if (doc.category === "quarterly-results" && doc.xbrlUrl) {
    const metrics = await parseQuarterlyXBRL(doc.xbrlUrl, NSE_HEADERS);
    const xbrlDocText = buildXbrlFinancialDoc(data, doc, metrics);
    if (xbrlDocText) {
      return { docText: xbrlDocText, status: "ok-xbrl-taxonomy" };
    }
  }

  const extracted = await extractDocumentContent(doc.url);
  if (extracted.fullText) {
    const filtered = extractFinancialKpiText(extracted.fullText);
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
        status: `ok-filtered-${extracted.status}`,
      };
    }
  }

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
  };
}

/**
 * Append IR document rows to Google Sheet (one row per document).
 * Can optionally include extracted financial/KPI content in a dedicated column.
 */
async function appendDocumentRows(
  accessToken: string,
  spreadsheetId: string,
  data: ExportRequest
): Promise<AppendResult> {
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
      "Source",
    ];

    if (includeContent) {
      headers.push("Extracted Content");
    }

    const rows: string[][] = [];
    let docsCreated = 0;

    for (const doc of data.documents) {
      const period = [doc.fiscalYear, doc.quarter].filter(Boolean).join(" · ");
      let googleDocUrl = "";
      let docStatus = createGoogleDocs ? "doc-pending" : "doc-disabled";
      let sheetContent = "";

      const needsExtraction = createGoogleDocs || includeContent;

      let extractedContent: { docText: string; status: string } | null = null;
      if (needsExtraction) {
        extractedContent = await buildGoogleDocContentForDocument(accessToken, data, doc);
        if (includeContent) {
          sheetContent = toSheetContent(extractedContent.docText);
        }
      }

      if (createGoogleDocs) {
        const safeTitle = `${data.company.symbol} - ${doc.title}`.slice(0, 120);
        const content = extractedContent ??
          (await buildGoogleDocContentForDocument(accessToken, data, doc));
        const createdDoc = await createGoogleDoc(accessToken, safeTitle, content.docText);

        if (createdDoc) {
          googleDocUrl = createdDoc;
          docsCreated += 1;
          docStatus = content.status;
        } else {
          docStatus = `doc-create-failed-${content.status}`;
        }
      }

      rows.push([
        data.company.name,
        data.company.symbol,
        CATEGORY_LABELS[doc.category] ?? doc.category,
        period,
        doc.title,
        doc.url,
        googleDocUrl,
        docStatus,
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
    };
  } catch {
    return { ok: false, rowsWritten: 0, docsCreated: 0 };
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

    return NextResponse.json(
      {
        success: true,
        spreadsheetId,
        sheetUrl,
        message: `Successfully exported ${appendResult.rowsWritten} ${rowNoun}${appendResult.rowsWritten !== 1 ? "s" : ""} to Google Sheets${docCreatedSuffix}`,
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
