// BSE India API client for fetching company IR documents.
// Provides broad coverage across all NSE/BSE-listed companies.

import type { IRCategory, IRDocument, DocumentLinkType } from "@/types/financial";

// ─── BSE API response shapes ──────────────────────────────────────────────────

interface BSEScripHeader {
  Scrip_Cd: string; // BSE scrip code, e.g. "500112"
  long_name?: string;
}

interface BSEScripHeaderResponse {
  Header?: BSEScripHeader;
}

interface BSEFilingRaw {
  SLNO?: string;
  NEWSID?: string;
  DissemDT?: string;     // "20240115120000" or similar
  HEADLINE?: string;
  ATTACHMENTNAME?: string; // filename used to derive type
  ATTACHMENTURL?: string;  // relative path on BSE CDN
  NEWSSUB?: string;        // sub-category label
}

interface BSEFilingsResponse {
  Table?: BSEFilingRaw[];
}

// ─── Constants ────────────────────────────────────────────────────────────────

const BSE_CDN = "https://www.bseindia.com";

// Keyword patterns to classify filing headlines into IR categories
const CATEGORY_PATTERNS: Array<{ category: IRCategory; patterns: RegExp[] }> = [
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
    ],
  },
  {
    category: "concall",
    patterns: [
      /earnings\s+call/i,
      /concall/i,
      /con\s+call/i,
      /analyst\s+(meet|call|day)/i,
      /investor\s+(meet|call)/i,
      /transcript/i,
    ],
  },
  {
    category: "annual-report",
    patterns: [
      /annual\s+report/i,
      /annual\s+general\s+meeting/i,
      /\bagm\b/i,
      /integrated\s+report/i,
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
  const attach = raw.ATTACHMENTURL ?? "";
  if (attach.startsWith("http")) return attach;
  if (attach) return `${BSE_CDN}/${attach.replace(/^\//, "")}`;
  // Fallback: link to BSE filing detail page
  if (raw.NEWSID) return `${BSE_CDN}/xml-data/corpfiling/AttachLive/${raw.NEWSID}.pdf`;
  return BSE_CDN;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Resolve the BSE scrip code for an NSE symbol.
 * Returns null if not found or the request fails.
 */
export async function lookupBSECode(nseSymbol: string): Promise<string | null> {
  try {
    const url = `https://api.bseindia.com/BseIndiaAPI/api/getScripHeaderData/w?Scripname=${encodeURIComponent(nseSymbol)}`;
    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36",
        Referer: "https://www.bseindia.com/",
        Accept: "application/json",
      },
      next: { revalidate: 86400 },
    });
    if (!res.ok) return null;
    const data: BSEScripHeaderResponse = await res.json();
    return data?.Header?.Scrip_Cd ?? null;
  } catch {
    return null;
  }
}

/**
 * Fetch investor-relations filings for a BSE scrip code.
 * Covers announcements going back to 2020.
 */
export async function fetchBSEFilings(bseCode: string): Promise<IRDocument[]> {
  try {
    const today = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    const url =
      `https://api.bseindia.com/BseIndiaAPI/api/AnnSubCategoryGetData/w` +
      `?pageno=1&strCat=-1&strPrevDate=20200101&strScrip=${encodeURIComponent(bseCode)}` +
      `&strSearch=P&strToDate=${today}&strType=C`;

    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36",
        Referer: "https://www.bseindia.com/",
        Accept: "application/json",
      },
      next: { revalidate: 3600 },
    });
    if (!res.ok) return [];
    const data: BSEFilingsResponse = await res.json();
    const rows = data?.Table ?? [];

    const docs: IRDocument[] = [];
    for (const row of rows) {
      const headline = row.HEADLINE ?? "";
      const category = classifyFiling(headline);
      if (!category) continue;

      const { fiscalYear, quarter } = extractPeriod(headline);
      const filename = row.ATTACHMENTNAME ?? "";
      const url2 = buildDocUrl(row);

      docs.push({
        category,
        fiscalYear,
        quarter,
        title: headline.trim(),
        url: url2,
        type: detectType(filename),
      });
    }
    return docs;
  } catch {
    return [];
  }
}
