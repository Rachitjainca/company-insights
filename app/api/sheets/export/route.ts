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

const MAX_SOURCE_FILE_BYTES = 12 * 1024 * 1024;
const MAX_DOC_TEXT_CHARS = 800000;
const MAX_PREVIEW_CHARS = 45000;

interface ExportDocument {
  category: string;
  fiscalYear: string;
  quarter?: string;
  title: string;
  url: string;
  type: string;
  xbrlUrl?: string;
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
  /** When true, fetch and extract file text content into sheet columns. */
  includeContent?: boolean;
  /** When true, create a Google Doc per extracted file and include doc URL in sheet. */
  createGoogleDocs?: boolean;
}

interface AppendResult {
  ok: boolean;
  rowsWritten: number;
  docsCreated: number;
}

interface SourceToDocResult {
  docUrl: string | null;
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

function toPreview(text: string): string {
  if (text.length <= MAX_PREVIEW_CHARS) return text;
  return `${text.slice(0, MAX_PREVIEW_CHARS - 80)}\n\n[Truncated in sheet preview]`;
}

function toDocText(text: string): string {
  if (text.length <= MAX_DOC_TEXT_CHARS) return text;
  return `${text.slice(0, MAX_DOC_TEXT_CHARS - 80)}\n\n[Truncated for Google Doc size limit]`;
}

async function createGoogleDocFromSourceUrl(
  accessToken: string,
  title: string,
  sourceUrl: string
): Promise<SourceToDocResult> {
  if (!/^https?:\/\//i.test(sourceUrl)) {
    return { docUrl: null, extractedText: "", status: "invalid-url" };
  }

  try {
    const sourceRes = await fetch(sourceUrl, {
      method: "GET",
      headers: SOURCE_FETCH_HEADERS,
      cache: "no-store",
      redirect: "follow",
    });

    if (!sourceRes.ok) {
      return {
        docUrl: null,
        extractedText: "",
        status: `source-fetch-failed-${sourceRes.status}`,
      };
    }

    const contentLength = Number(sourceRes.headers.get("content-length") || "0");
    if (contentLength > 0 && contentLength > MAX_SOURCE_FILE_BYTES) {
      return { docUrl: null, extractedText: "", status: "source-too-large" };
    }

    const sourceMimeType =
      (sourceRes.headers.get("content-type") || "application/octet-stream")
        .split(";")[0]
        .trim();

    const sourceBytes = new Uint8Array(await sourceRes.arrayBuffer());
    if (sourceBytes.byteLength > MAX_SOURCE_FILE_BYTES) {
      return { docUrl: null, extractedText: "", status: "source-too-large" };
    }

    const boundary = `drive-upload-${Date.now()}`;
    const encoder = new TextEncoder();

    const metadataPart = encoder.encode(
      `--${boundary}\r\n` +
        "Content-Type: application/json; charset=UTF-8\r\n\r\n" +
        `${JSON.stringify({
          name: title,
          mimeType: "application/vnd.google-apps.document",
        })}\r\n`
    );

    const mediaHeader = encoder.encode(
      `--${boundary}\r\n` +
        `Content-Type: ${sourceMimeType}\r\n\r\n`
    );

    const closePart = encoder.encode(`\r\n--${boundary}--`);

    const body = new Uint8Array(
      metadataPart.length + mediaHeader.length + sourceBytes.length + closePart.length
    );
    body.set(metadataPart, 0);
    body.set(mediaHeader, metadataPart.length);
    body.set(sourceBytes, metadataPart.length + mediaHeader.length);
    body.set(
      closePart,
      metadataPart.length + mediaHeader.length + sourceBytes.length
    );

    const uploadRes = await fetch(
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

    if (!uploadRes.ok) {
      return { docUrl: null, extractedText: "", status: "doc-conversion-failed" };
    }

    const uploaded = await uploadRes.json();
    const fileId = uploaded?.id as string | undefined;
    if (!fileId) {
      return { docUrl: null, extractedText: "", status: "doc-id-missing" };
    }

    const docUrl = `https://docs.google.com/document/d/${fileId}/edit`;

    const exportRes = await fetch(
      `https://www.googleapis.com/drive/v3/files/${fileId}/export?mimeType=text/plain`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    );

    if (!exportRes.ok) {
      return { docUrl, extractedText: "", status: "doc-created-no-text-export" };
    }

    const exportedText = normalizeWhitespace(await exportRes.text());
    return {
      docUrl,
      extractedText: toDocText(exportedText),
      status: exportedText ? "ok-via-doc-conversion" : "doc-created-empty-text",
    };
  } catch {
    return { docUrl: null, extractedText: "", status: "doc-conversion-error" };
  }
}

/**
 * Append IR document metadata rows to Google Sheet (one row per document).
 */
async function appendDocumentRows(
  accessToken: string,
  spreadsheetId: string,
  data: ExportRequest
): Promise<AppendResult> {
  try {
    const CATEGORY_LABELS: Record<string, string> = {
      "quarterly-results": "Quarterly Results",
      "investor-presentation": "Investor Presentation",
      "concall": "Concall",
      "annual-report": "Annual Report",
      "kpi-handbook": "KPI Handbook",
    };

    const includeContent = data.includeContent !== false;
    const createGoogleDocs = includeContent && data.createGoogleDocs !== false;

    const headers = [
      "Company",
      "Ticker",
      "Category",
      "Period",
      "Title",
      "URL",
      "Type",
    ];

    if (includeContent) {
      headers.push("Content Status", "Content Type", "Content Preview", "Google Doc URL");
    }

    const rows: string[][] = [];
    let docsCreated = 0;

    for (const doc of data.documents) {
      const period = [doc.fiscalYear, doc.quarter].filter(Boolean).join(" · ");
      const row = [
        data.company.name,
        data.company.symbol,
        CATEGORY_LABELS[doc.category] ?? doc.category,
        period,
        doc.title,
        doc.url,
        doc.type.toUpperCase(),
      ];

      if (includeContent) {
        const extracted = await extractDocumentContent(doc.url);
        let contentStatus = extracted.status;
        let contentType = extracted.mimeType || "";
        let contentPreview = extracted.preview;
        let googleDocUrl = "";

        if (createGoogleDocs && extracted.fullText) {
          const safeTitle = `${data.company.symbol} - ${doc.title}`.slice(0, 120);
          const createdDoc = await createGoogleDoc(
            accessToken,
            safeTitle,
            extracted.fullText
          );
          if (createdDoc) {
            googleDocUrl = createdDoc;
            docsCreated += 1;
          }
        } else if (createGoogleDocs && !extracted.fullText) {
          const safeTitle = `${data.company.symbol} - ${doc.title}`.slice(0, 120);
          const converted = await createGoogleDocFromSourceUrl(
            accessToken,
            safeTitle,
            doc.url
          );

          if (converted.docUrl) {
            googleDocUrl = converted.docUrl;
            docsCreated += 1;
          }

          if (!contentPreview && converted.extractedText) {
            contentPreview = toPreview(converted.extractedText);
            contentStatus = converted.status;
          } else if (contentStatus !== "ok") {
            contentStatus = converted.status;
          }
        }

        row.push(
          contentStatus,
          contentType,
          contentPreview,
          googleDocUrl
        );
      }

      rows.push(row);
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
    const includeContent =
      exportMode === "metadata" ? companyData.includeContent !== false : false;
    const createGoogleDocs =
      exportMode === "metadata" && includeContent
        ? companyData.createGoogleDocs !== false
        : false;

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
        ? "IR Content Export"
        : "IR Documents";
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
            includeContent,
            createGoogleDocs,
          });

    if (!appendResult.ok) {
      return NextResponse.json(
        {
          error:
            exportMode === "xbrl"
              ? "Failed to append parsed XBRL data to Google Sheet."
              : "Failed to append document content rows to Google Sheet.",
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
