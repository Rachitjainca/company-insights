export interface ExtractedDocumentContent {
  status: string;
  mimeType: string;
  preview: string;
  fullText: string;
}

const MAX_DOWNLOAD_BYTES = 12 * 1024 * 1024; // 12 MB
const MAX_SHEET_CELL_CHARS = 45000; // below Sheets cell limit
const MAX_DOC_TEXT_CHARS = 800000; // keep docs manageable

const FETCH_HEADERS: HeadersInit = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  Accept: "application/pdf,text/html,application/xhtml+xml,application/xml,text/xml,text/plain,*/*",
  "Accept-Language": "en-US,en;q=0.9",
  Referer: "https://www.nseindia.com/",
};

function normalizeWhitespace(text: string): string {
  return text.replace(/\r/g, "\n").replace(/\t/g, " ").replace(/[ ]{2,}/g, " ").replace(/\n{3,}/g, "\n\n").trim();
}

function decodeBasicEntities(text: string): string {
  return text
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'");
}

function stripHtml(html: string): string {
  const noScript = html
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?>[\s\S]*?<\/style>/gi, " ");

  const withBreaks = noScript
    .replace(/<\s*br\s*\/?>/gi, "\n")
    .replace(/<\s*\/p\s*>/gi, "\n")
    .replace(/<\s*\/div\s*>/gi, "\n")
    .replace(/<\s*\/h[1-6]\s*>/gi, "\n")
    .replace(/<\s*li\b[^>]*>/gi, "\n- ");

  const noTags = withBreaks.replace(/<[^>]+>/g, " ");
  return normalizeWhitespace(decodeBasicEntities(noTags));
}

function stripXmlTags(xml: string): string {
  return normalizeWhitespace(decodeBasicEntities(xml.replace(/<[^>]+>/g, " ")));
}

function toPreview(text: string): string {
  if (text.length <= MAX_SHEET_CELL_CHARS) return text;
  return `${text.slice(0, MAX_SHEET_CELL_CHARS - 80)}\n\n[Truncated in sheet preview]`;
}

function toDocText(text: string): string {
  if (text.length <= MAX_DOC_TEXT_CHARS) return text;
  return `${text.slice(0, MAX_DOC_TEXT_CHARS - 80)}\n\n[Truncated for Google Doc size limit]`;
}

function inferType(url: string, mimeType: string):
  | "html"
  | "xml"
  | "text"
  | "binary" {
  const u = url.toLowerCase();
  const m = mimeType.toLowerCase();

  if (m.includes("pdf") || u.endsWith(".pdf")) return "binary";
  if (m.includes("html") || u.endsWith(".html") || u.endsWith(".htm")) return "html";
  if (m.includes("xml") || u.endsWith(".xml") || u.endsWith(".xbrl")) return "xml";
  if (m.startsWith("text/") || m.includes("json") || m.includes("csv")) return "text";
  return "binary";
}

export async function extractDocumentContent(
  url: string
): Promise<ExtractedDocumentContent> {
  if (!/^https?:\/\//i.test(url)) {
    return {
      status: "invalid-url",
      mimeType: "",
      preview: "",
      fullText: "",
    };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 25000);

  try {
    const res = await fetch(url, {
      method: "GET",
      redirect: "follow",
      cache: "no-store",
      headers: FETCH_HEADERS,
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!res.ok) {
      return {
        status: `fetch-failed-${res.status}`,
        mimeType: res.headers.get("content-type") || "",
        preview: "",
        fullText: "",
      };
    }

    const contentLength = Number(res.headers.get("content-length") || "0");
    if (contentLength > 0 && contentLength > MAX_DOWNLOAD_BYTES) {
      return {
        status: "too-large",
        mimeType: res.headers.get("content-type") || "",
        preview: "",
        fullText: "",
      };
    }

    const mimeType = (res.headers.get("content-type") || "").split(";")[0].trim();
    const inferred = inferType(url, mimeType);

    let normalized = "";

    const text = await res.text();
    if (inferred === "html") normalized = stripHtml(text);
    else if (inferred === "xml") normalized = stripXmlTags(text);
    else if (inferred === "text") normalized = normalizeWhitespace(text);
    else {
      return {
        status: "unsupported-binary",
        mimeType,
        preview: "",
        fullText: "",
      };
    }

    if (!normalized) {
      return {
        status: "empty-content",
        mimeType,
        preview: "",
        fullText: "",
      };
    }

    return {
      status: "ok",
      mimeType,
      preview: toPreview(normalized),
      fullText: toDocText(normalized),
    };
  } catch (error) {
    clearTimeout(timeout);

    const isAbort =
      error instanceof Error &&
      (error.name === "AbortError" || error.message.toLowerCase().includes("abort"));

    return {
      status: isAbort ? "timeout" : "fetch-error",
      mimeType: "",
      preview: "",
      fullText: "",
    };
  }
}
