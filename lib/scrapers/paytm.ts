// Scraper for Paytm (One 97 Communications) investor-relations site.
//
// Paytm's IR pages embed a structured JSON blob in the SSR HTML
// (look for `"view":"table","config":{...}`). We extract the JSON object
// using a brace matcher (no DOM parser needed) and map it to our shared
// scraper schema.

import {
  CompanyDocumentsBundle,
  DocumentEntry,
  IRScraper,
  PeriodDocuments,
  detectLinkType,
} from "./types";

const FINANCIAL_RESULTS_URL = "https://ir.paytm.com/financial-results";
const ANNUAL_REPORTS_URL = "https://ir.paytm.com/annual-reports";

interface PaytmCta {
  cta_text: string;
  cta_link: string;
  target?: string;
}

interface PaytmHeader {
  title: string;
  key: string;
}

interface PaytmTableConfig {
  page: string;
  headers: PaytmHeader[];
}

// Each leaf row carries arbitrary `headerKey -> PaytmCta[]` entries.
interface PaytmRowItem {
  title?: string;
  [key: string]: unknown;
}

interface PaytmFyGroup {
  type: string;
  title?: string;
  items?: PaytmRowItem[];
}

interface PaytmTableBlock {
  view: string;
  config: PaytmTableConfig;
  items: PaytmFyGroup[];
}

/**
 * Find the first `{"view":"table",...}` JSON object in the HTML and
 * return it as a parsed object. Uses a string-aware brace matcher so
 * embedded `{}` inside JSON strings don't throw it off.
 */
function extractTableBlock(html: string): PaytmTableBlock | null {
  const marker = '"view":"table"';
  const markerIdx = html.indexOf(marker);
  if (markerIdx === -1) return null;

  // Walk back to the opening `{` of the object containing the marker.
  let openIdx = markerIdx;
  while (openIdx >= 0 && html[openIdx] !== "{") openIdx--;
  if (openIdx < 0) return null;

  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = openIdx; i < html.length; i++) {
    const ch = html[i];
    if (escape) {
      escape = false;
      continue;
    }
    if (ch === "\\") {
      escape = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) {
        const slice = html.slice(openIdx, i + 1);
        try {
          return JSON.parse(slice) as PaytmTableBlock;
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

function normalizeCategory(title: string): string {
  return title.replace(/\s+/g, " ").trim();
}

function isCtaArray(value: unknown): value is PaytmCta[] {
  return (
    Array.isArray(value) &&
    value.every(
      (v) =>
        typeof v === "object" &&
        v !== null &&
        typeof (v as PaytmCta).cta_link === "string" &&
        typeof (v as PaytmCta).cta_text === "string"
    )
  );
}

function rowToDocuments(
  row: PaytmRowItem,
  headers: PaytmHeader[]
): DocumentEntry[] {
  const out: DocumentEntry[] = [];
  for (const header of headers) {
    const value = row[header.key];
    if (!isCtaArray(value) || value.length === 0) continue;
    out.push({
      category: normalizeCategory(header.title),
      categoryKey: header.key,
      links: value.map((cta) => ({
        label: cta.cta_text,
        url: cta.cta_link,
        type: detectLinkType(cta.cta_link, cta.cta_text),
      })),
    });
  }
  return out;
}

/**
 * Convert a Paytm table block into our PeriodDocuments[] shape.
 *
 * Two layouts are observed:
 *   - financial-results: outer item has `title:"FY 2026"` and inner items
 *     have `title:"Q4"` etc. ("quarter" rows).
 *   - annual-reports: outer item has no title, inner items carry the FY
 *     title ("FY 25-26") with no quarter granularity.
 */
function tableToPeriods(block: PaytmTableBlock): PeriodDocuments[] {
  const headers = block.config.headers ?? [];
  const out: PeriodDocuments[] = [];
  for (const fyGroup of block.items ?? []) {
    const outerTitle = (fyGroup.title ?? "").trim();
    const inner = fyGroup.items ?? [];
    for (const row of inner) {
      const innerTitle = (row.title ?? "").trim();
      const fiscalYear = outerTitle || innerTitle;
      const quarter = outerTitle ? innerTitle : "";
      const documents = rowToDocuments(row, headers);
      if (documents.length === 0) continue;
      out.push({ fiscalYear, quarter, documents });
    }
  }
  return out;
}

async function fetchTable(url: string): Promise<PaytmTableBlock | null> {
  const res = await fetch(url, {
    headers: {
      // Paytm's CDN serves the SSR HTML to most UAs. Use a real-looking
      // browser UA to avoid bot heuristics.
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
        "(KHTML, like Gecko) Chrome/124.0 Safari/537.36",
      Accept: "text/html,application/xhtml+xml",
    },
    // Always go to origin; the API route layer handles caching.
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`Paytm IR fetch failed (${url}): HTTP ${res.status}`);
  }
  const html = await res.text();
  return extractTableBlock(html);
}

async function fetchPaytmDocuments(): Promise<CompanyDocumentsBundle> {
  const [frBlock, arBlock] = await Promise.all([
    fetchTable(FINANCIAL_RESULTS_URL),
    fetchTable(ANNUAL_REPORTS_URL),
  ]);

  const financialResults = frBlock ? tableToPeriods(frBlock) : [];
  const annualReports = arBlock ? tableToPeriods(arBlock) : [];

  return {
    ticker: "PAYTM",
    companyName: "One 97 Communications (Paytm)",
    source: {
      financialResults: FINANCIAL_RESULTS_URL,
      annualReports: ANNUAL_REPORTS_URL,
    },
    fetchedAt: new Date().toISOString(),
    financialResults,
    annualReports,
  };
}

export const paytmScraper: IRScraper = {
  ticker: "PAYTM",
  companyName: "One 97 Communications (Paytm)",
  fetchDocuments: fetchPaytmDocuments,
};
