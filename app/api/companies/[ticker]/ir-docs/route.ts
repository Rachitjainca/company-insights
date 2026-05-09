// GET /api/companies/[ticker]/ir-docs
//
// Hybrid endpoint: merges results from:
//  1. Custom per-company IR scrapers (CompanyDocumentsBundle) when registered
//  2. BSE India filings API (broad coverage for all listed companies)
//
// Returns IRDocument[] grouped under 5 categories:
//   quarterly-results | investor-presentation | concall | annual-report | kpi-handbook

import { NextRequest, NextResponse } from "next/server";
import { getScraper } from "@/lib/scrapers/registry";
import { lookupBSECode, fetchBSEFilings } from "@/lib/bse-filings";
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

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ ticker: string }> }
) {
  const { ticker } = await params;
  const upperTicker = ticker.toUpperCase();

  // Run scraper + BSE lookup in parallel
  const [scraperResult, bseCode] = await Promise.allSettled([
    (async () => {
      const scraper = getScraper(upperTicker);
      if (!scraper) return null;
      return scraper.fetchDocuments();
    })(),
    lookupBSECode(upperTicker),
  ]);

  const docs: IRDocument[] = [];
  let companyName = upperTicker;

  // 1. Scraper results
  if (scraperResult.status === "fulfilled" && scraperResult.value) {
    const bundle = scraperResult.value;
    companyName = bundle.companyName || companyName;
    docs.push(...bundleToIRDocs(bundle));
  }

  // 2. BSE filings
  const bseCodeValue =
    bseCode.status === "fulfilled" ? bseCode.value : null;

  if (bseCodeValue) {
    const bseDocs = await fetchBSEFilings(bseCodeValue);
    docs.push(...bseDocs);
  }

  const dedupedDocs = dedup(docs);

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

  return NextResponse.json(
    {
      ticker: upperTicker,
      companyName,
      bseCode: bseCodeValue ?? null,
      documents: grouped,
      totalCount: dedupedDocs.length,
      fetchedAt: new Date().toISOString(),
    },
    {
      headers: {
        "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
      },
    }
  );
}
