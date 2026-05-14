// BSE India API client for fetching company IR documents.
// Provides broad coverage across all NSE/BSE-listed companies.

import type { IRCategory, IRDocument, DocumentLinkType } from "@/types/financial";

// ─── BSE API response shapes ──────────────────────────────────────────────────

interface BSEScripListItem {
  SCRIP_CD: string;   // numeric BSE code, e.g. "532540"
  scrip_id: string;   // short ticker that matches NSE symbol, e.g. "TCS"
  Scrip_Name: string;
  Status: string;
  Segment: string;
}

interface BSEFilingRaw {
  SLNO?: string;
  NEWSID?: string;
  DissemDT?: string;     // "20240115120000" or similar
  HEADLINE?: string;
  ATTACHMENTNAME?: string; // UUID-based PDF filename, e.g. "b690d1d2-....pdf"
  NEWSSUB?: string;        // sub-category label
}

interface BSEFilingsResponse {
  Table?: BSEFilingRaw[];
}

// ─── Constants ────────────────────────────────────────────────────────────────

const BSE_CDN = "https://www.bseindia.com";
const BSE_FETCH_RETRIES = 3;

const BSE_HEADERS: HeadersInit = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36",
  Referer: "https://www.bseindia.com/",
  Origin: "https://www.bseindia.com",
  Accept: "application/json, text/plain, */*",
  "Accept-Language": "en-US,en;q=0.9",
};

// Keyword patterns to classify filing headlines into IR categories.
// Order matters: first match wins. More specific patterns are listed first.
const CATEGORY_PATTERNS: Array<{ category: IRCategory; patterns: RegExp[] }> = [
  {
    category: "concall",
    patterns: [
      /earnings\s+call/i,
      /concall/i,
      /con\s+call/i,
      /conference\s+call/i,
      /analyst\s+(meet|call|day|briefing)/i,
      /investor\s+(meet|call|briefing|conference)/i,
      /transcript/i,
      /q&a\s+session/i,
    ],
  },
  {
    category: "investor-presentation",
    patterns: [
      /investor\s+presentation/i,
      /earnings\s+presentation/i,
      /analyst\s+presentation/i,
      /investor\s+update/i,
      /corporate\s+presentation/i,
      /analyst\s+day/i,
      /capital\s+market[s]?\s+day/i,
      /investor\s+day/i,
      /media\s+briefing/i,
      /business\s+update/i,
      /earnings\s+update/i,
      /strategy\s+presentation/i,
      /management\s+presentation/i,
      /roadshow/i,
      /\bpresentation\b/i,
    ],
  },
  {
    category: "quarterly-results",
    patterns: [
      /quarterly\s+result/i,
      /financial\s+result/i,
      /q[1-4]\s*(fy|20)/i,
      /unaudited\s+result/i,
      /audited\s+result/i,
      /standalone\s+result/i,
      /consolidated\s+result/i,
      /half.?year(?:ly)?\s+result/i,
    ],
  },
  {
    category: "annual-report",
    patterns: [
      /annual\s+report/i,
      /annual\s+general\s+meeting/i,
      /\bagm\b/i,
      /integrated\s+report/i,
      /sustainability\s+report/i,
    ],
  },
  {
    category: "kpi-handbook",
    patterns: [
      /kpi\s+handbook/i,
      /kpi\s+booklet/i,
      /key\s+performance/i,
      /fact\s+sheet/i,
      /factsheet/i,
      /data\s+book/i,
      /statistical\s+supplement/i,
      /operating\s+data/i,
      /supplemental\s+data/i,
    ],
  },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function classifyFiling(headline: string): IRCategory | null {
  for (const { category, patterns } of CATEGORY_PATTERNS) {
    if (patterns.some((re) => re.test(headline))) return category;
  }
  return null;
}

function detectType(filename: string): DocumentLinkType {
  const f = (filename ?? "").toLowerCase();
  if (f.endsWith(".pdf")) return "pdf";
  if (f.endsWith(".xlsx") || f.endsWith(".xls")) return "xlsx";
  if (f.endsWith(".docx") || f.endsWith(".doc")) return "docx";
  if (f.includes("audio") || f.endsWith(".mp3") || f.endsWith(".mp4")) return "audio";
  return "other";
}

/** Extract fiscal year and quarter from a BSE headline like "Q3 FY25 Results" */
function extractPeriod(headline: string): { fiscalYear: string; quarter?: string } {
  // Match "Q1"/"Q2"/"Q3"/"Q4" with optional FY label
  const qMatch = headline.match(/\b(Q[1-4])\b/i);
  const fyMatch = headline.match(/\b(FY\s*\d{2,4}|20\d{2}[-–]\d{2,4}|20\d{2})\b/i);

  const quarter = qMatch ? qMatch[1].toUpperCase() : undefined;
  const fiscalYear = fyMatch ? fyMatch[1].replace(/\s+/, "") : "N/A";

  return { fiscalYear, quarter };
}

function buildDocUrl(raw: BSEFilingRaw): string {
  // BSE CDN uses hotlink-protection: direct links from external referrers get 404.
  // Route through our server-side proxy (/api/bse-doc) which adds the correct Referer.
  const name = raw.ATTACHMENTNAME?.trim();
  if (name) return `/api/bse-doc?name=${encodeURIComponent(name)}`;
  // Last-resort: BSE stock page for this company (human-readable fallback)
  if (raw.NEWSID)
    return `${BSE_CDN}/markets/MarketInfo/DispNewNoticesCirc.aspx?id=${raw.NEWSID}`;
  return BSE_CDN;
}

async function fetchBSEJsonWithRetry(url: string): Promise<BSEFilingsResponse | null> {
  for (let attempt = 0; attempt < BSE_FETCH_RETRIES; attempt += 1) {
    const attemptUrl = `${url}&_=${Date.now()}${attempt}`;
    try {
      const res = await fetch(attemptUrl, {
        headers: BSE_HEADERS,
        cache: "no-store",
        next: { revalidate: 3600 },
      });
      if (!res.ok) continue;

      // BSE can occasionally reply with non-JSON despite 200; guard parse.
      const text = await res.text();
      if (!text.trimStart().startsWith("{")) continue;

      const parsed = JSON.parse(text) as BSEFilingsResponse;
      if (Array.isArray(parsed?.Table)) return parsed;
    } catch {
      // Ignore and retry.
    }
  }

  return null;
}

// ─── BSE scrip master cache ────────────────────────────────────────────────────
//
// The BSE "getScripHeaderData" API returns null for NSE symbols.
// Instead, we download the full BSE equity scrip list once per process lifetime
// (≈1.7 MB / 4800 companies) and filter client-side by `scrip_id`, which
// matches NSE symbols for dual-listed companies.

let scripMasterCache: BSEScripListItem[] | null = null;
let scripMasterFetchedAt = 0;
const SCRIP_MASTER_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

async function getBSEScripMaster(): Promise<BSEScripListItem[]> {
  if (scripMasterCache && Date.now() - scripMasterFetchedAt < SCRIP_MASTER_TTL_MS) {
    return scripMasterCache;
  }
  try {
    const res = await fetch(
      "https://api.bseindia.com/BseIndiaAPI/api/ListofScripData/w" +
        "?Group=&Scripcode=&segment=Equity&Status=Active&industry=&scripname=",
      {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36",
          Referer: "https://www.bseindia.com/",
          Origin: "https://www.bseindia.com",
          Accept: "application/json",
        },
        next: { revalidate: 86400 },
      }
    );
    if (!res.ok) return scripMasterCache ?? [];
    const data: BSEScripListItem[] = await res.json();
    if (Array.isArray(data) && data.length > 0) {
      scripMasterCache = data;
      scripMasterFetchedAt = Date.now();
    }
    return scripMasterCache ?? [];
  } catch {
    return scripMasterCache ?? [];
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Resolve the BSE scrip code for an NSE symbol.
 *
 * Strategy: download the full BSE equity list (~4800 companies) and match by
 * `scrip_id` (BSE's own short ticker), which maps 1:1 to the NSE symbol for
 * dual-listed companies.  The list is cached for 24 h in process memory.
 *
 * Returns null if the symbol is not found or the request fails.
 */
export async function lookupBSECode(nseSymbol: string): Promise<string | null> {
  try {
    const master = await getBSEScripMaster();
    const upper = nseSymbol.toUpperCase().trim();
    const match = master.find(
      (s) => s.scrip_id?.toUpperCase().trim() === upper && s.Segment === "Equity"
    );
    return match?.SCRIP_CD ?? null;
  } catch {
    return null;
  }
}

/**
 * Fetch investor-relations filings for a BSE scrip code.
 * Covers announcements going back to 2020. Walks up to 5 pages of the BSE
 * announcements feed so older investor presentations / annual reports are
 * captured (each page returns ~25-50 rows).
 */
export async function fetchBSEFilings(bseCode: string): Promise<IRDocument[]> {
  try {
    const today = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    const buildUrl = (pageno: number, search: "P" | "") =>
      `https://api.bseindia.com/BseIndiaAPI/api/AnnSubCategoryGetData/w` +
      `?pageno=${pageno}&strCat=-1&strPrevDate=20200101&strScrip=${encodeURIComponent(bseCode)}` +
      `&strToDate=${today}&strType=C&strSearch=${search}`;

    const MAX_PAGES = 5;

    // Try the primary `strSearch=P` filter across all pages in parallel.
    // BSE's per-page latency is ~200-400ms; serial walking added 1-2s.
    let rows: BSEFilingRaw[] = [];

    const primaryPages = await Promise.all(
      Array.from({ length: MAX_PAGES }, (_, i) =>
        fetchBSEJsonWithRetry(buildUrl(i + 1, "P"))
      )
    );
    for (const data of primaryPages) {
      if (data?.Table && data.Table.length > 0) rows.push(...data.Table);
    }

    // Fall back to the unfiltered feed if the primary returned nothing.
    if (rows.length === 0) {
      const fallbackPages = await Promise.all(
        Array.from({ length: MAX_PAGES }, (_, i) =>
          fetchBSEJsonWithRetry(buildUrl(i + 1, ""))
        )
      );
      for (const data of fallbackPages) {
        if (data?.Table && data.Table.length > 0) rows.push(...data.Table);
      }
    }

    if (rows.length === 0) return [];

    const docs: IRDocument[] = [];
    const seenUrls = new Set<string>();
    for (const row of rows) {
      const headline = row.HEADLINE ?? "";
      const category = classifyFiling(headline);
      if (!category) continue;

      const { fiscalYear, quarter } = extractPeriod(headline);
      const filename = row.ATTACHMENTNAME ?? "";
      const url2 = buildDocUrl(row);
      if (seenUrls.has(url2)) continue;
      seenUrls.add(url2);

      docs.push({
        category,
        fiscalYear,
        quarter,
        title: headline.trim(),
        url: url2,
        type: detectType(filename),
        source: "bse",
      });
    }

    return docs;
  } catch {
    return [];
  }
}
