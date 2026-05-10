// GET /api/companies/[ticker]/ir-docs
//
// Hybrid endpoint: merges results from:
//  1. Custom per-company IR scrapers (CompanyDocumentsBundle) when registered
//  2. NSE India API  — quarterly results (with XBRL) + annual reports (with XBRL)
//  3. BSE India filings API — investor presentations, concalls, KPI handbooks only
//     (BSE quarterly-results and annual-reports are dropped; NSE is authoritative)
//
// Returns IRDocument[] grouped under 5 categories:
//   quarterly-results | investor-presentation | concall | annual-report | kpi-handbook

import { NextRequest, NextResponse } from "next/server";
import { getScraper } from "@/lib/scrapers/registry";
import { lookupBSECode, fetchBSEFilings } from "@/lib/bse-filings";
import { fetchNSEQuarterlyResults, fetchNSEAnnualReports, fetchNSEAnnouncements } from "@/lib/nse-filings";
import type { IRCategory, IRDocument } from "@/types/financial";
import type { CompanyDocumentsBundle } from "@/lib/scrapers/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ─── Mapping from scraper categoryKey → IRCategory ────────────────────────────

const SCRAPER_KEY_MAP: Record<string, IRCategory> = {
  earningsRelease: "quarterly-results",
  financialResults: "quarterly-results",
  quarterlyResults: "quarterly-results",
  presentation: "investor-presentation",
  investorPresentation: "investor-presentation",
  transcript: "concall",
  concall: "concall",
  earnCall: "concall",
  annualReport: "annual-report",
  kpiHandbook: "kpi-handbook",
  kpiBooklet: "kpi-handbook",
  factSheet: "kpi-handbook",
};

function mapScraperCategoryKey(key: string): IRCategory | null {
  // Direct lookup first
  if (SCRAPER_KEY_MAP[key]) return SCRAPER_KEY_MAP[key];
  // Substring fallback
  const k = key.toLowerCase();
  if (k.includes("result") || k.includes("quarterly")) return "quarterly-results";
  if (k.includes("presentation") || k.includes("investor")) return "investor-presentation";
  if (k.includes("transcript") || k.includes("concall") || k.includes("call")) return "concall";
  if (k.includes("annual")) return "annual-report";
  if (k.includes("kpi") || k.includes("fact") || k.includes("handbook")) return "kpi-handbook";
  return null;
}

/** Expand a CompanyDocumentsBundle from a scraper into flat IRDocument[]. */
function bundleToIRDocs(bundle: CompanyDocumentsBundle): IRDocument[] {
  const docs: IRDocument[] = [];

  for (const period of [...bundle.financialResults, ...bundle.annualReports]) {
    for (const entry of period.documents) {
      const category = mapScraperCategoryKey(entry.categoryKey);
      if (!category) continue;

      for (const link of entry.links) {
        docs.push({
          category,
          fiscalYear: period.fiscalYear,
          quarter: period.quarter || undefined,
          title: entry.category + (link.label ? ` — ${link.label}` : ""),
          url: link.url,
          type: link.type,
          source: "scraper",
        });
      }
    }
  }

  return docs;
}

/** Deduplicate by URL (prefer earlier entries). */
function dedup(docs: IRDocument[]): IRDocument[] {
  const seen = new Set<string>();
  return docs.filter((d) => {
    if (seen.has(d.url)) return false;
    seen.add(d.url);
    return true;
  });
}

/**
 * Normalize mixed URL formats into an absolute, valid URL string.
 * Returns null for unparseable or unsupported URL shapes.
 */
function normalizeDocUrl(rawUrl: string, requestUrl: string): string | null {
  const trimmed = rawUrl.trim();
  if (!trimmed) return null;

  try {
    // Absolute HTTP(S) URL
    if (/^https?:\/\//i.test(trimmed)) {
      return new URL(trimmed).toString();
    }
    // Protocol-relative URL: //example.com/file.pdf
    if (trimmed.startsWith("//")) {
      return new URL(`https:${trimmed}`).toString();
    }
    // Relative app URL: /api/bse-doc?name=...
    if (trimmed.startsWith("/")) {
      return new URL(trimmed, requestUrl).toString();
    }
    // Bare host/path URL: example.com/file.pdf
    if (/^[a-z0-9.-]+\.[a-z]{2,}([/:?#]|$)/i.test(trimmed)) {
      return new URL(`https://${trimmed}`).toString();
    }
  } catch {
    return null;
  }

  return null;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ ticker: string }> }
) {
  const { ticker } = await params;
  const upperTicker = ticker.toUpperCase();

  // Run all data sources in parallel
  const [scraperResult, nseQuarterlyResult, nseAnnualResult, nseAnnouncementsResult, bseCode] =
    await Promise.allSettled([
      (async () => {
        const scraper = getScraper(upperTicker);
        if (!scraper) return null;
        return scraper.fetchDocuments();
      })(),
      fetchNSEQuarterlyResults(upperTicker),
      fetchNSEAnnualReports(upperTicker),
      fetchNSEAnnouncements(upperTicker),
      lookupBSECode(upperTicker),
    ]);

  const docs: IRDocument[] = [];
  let companyName = upperTicker;

  // 1. Custom scraper results (highest priority — company-specific)
  if (scraperResult.status === "fulfilled" && scraperResult.value) {
    const bundle = scraperResult.value;
    companyName = bundle.companyName || companyName;
    docs.push(...bundleToIRDocs(bundle));
  }

  // 2. NSE quarterly results (authoritative for quarterly-results category)
  if (nseQuarterlyResult.status === "fulfilled") {
    docs.push(...nseQuarterlyResult.value);
  }

  // 3. NSE annual reports (authoritative for annual-report category)
  if (nseAnnualResult.status === "fulfilled") {
    docs.push(...nseAnnualResult.value);
  }

  // 4. NSE corporate announcements — investor presentations and concalls from NSE
  if (nseAnnouncementsResult.status === "fulfilled") {
    docs.push(...nseAnnouncementsResult.value);
  }

  // 5. BSE filings — only keep investor-presentation, concall, kpi-handbook.
  //    NSE is now authoritative for quarterly-results and annual-report.
  const bseCodeValue = bseCode.status === "fulfilled" ? bseCode.value : null;
  if (bseCodeValue) {
    const bseDocs = await fetchBSEFilings(bseCodeValue);

    // BSE is primary for presentations/concalls/KPIs.
    // For quarterly-results and annual-report, prefer NSE but fall back to BSE
    // when NSE returned nothing (e.g., bot-blocked in production).
    const nseHasQuarterly = docs.some((d) => d.category === "quarterly-results");
    const nseHasAnnual = docs.some((d) => d.category === "annual-report");

    for (const d of bseDocs) {
      if (d.category === "quarterly-results" && nseHasQuarterly) continue;
      if (d.category === "annual-report" && nseHasAnnual) continue;
      docs.push(d);
    }
  }

  // Ensure API output always carries valid absolute URLs.
  const normalizedDocs = docs
    .map((doc) => {
      const normalizedUrl = normalizeDocUrl(doc.url, request.url);
      if (!normalizedUrl) return null;
      return { ...doc, url: normalizedUrl };
    })
    .filter((d): d is IRDocument => d !== null);

  const dedupedDocs = dedup(normalizedDocs);

  // Group by category for the response (makes UI rendering easier)
  const grouped: Record<IRCategory, IRDocument[]> = {
    "quarterly-results": [],
    "investor-presentation": [],
    "concall": [],
    "annual-report": [],
    "kpi-handbook": [],
  };
  for (const doc of dedupedDocs) {
    grouped[doc.category].push(doc);
  }

  // Diagnostic: report which sources returned data so the UI can show warnings
  const sources = {
    scraper: scraperResult.status === "fulfilled" && scraperResult.value !== null,
    nseQuarterly:
      nseQuarterlyResult.status === "fulfilled" && nseQuarterlyResult.value.length > 0,
    nseAnnual:
      nseAnnualResult.status === "fulfilled" && nseAnnualResult.value.length > 0,
    nseAnnouncements:
      nseAnnouncementsResult.status === "fulfilled" && nseAnnouncementsResult.value.length > 0,
    bseCode: bseCodeValue ?? null,
    bseFilings: bseCodeValue !== null,
  };

  return NextResponse.json(
    {
      ticker: upperTicker,
      companyName,
      bseCode: bseCodeValue ?? null,
      documents: grouped,
      totalCount: dedupedDocs.length,
      fetchedAt: new Date().toISOString(),
      sources,
    },
    {
      headers: {
        "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
      },
    }
  );
}
