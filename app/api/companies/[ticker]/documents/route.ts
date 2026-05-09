// GET /api/companies/[ticker]/documents
//
// Returns categorized investor-relations documents (earnings releases,
// presentations, transcripts, financial results, annual reports, etc.)
// scraped on demand from the company's IR site.

import { NextRequest, NextResponse } from "next/server";
import { getScraper, listSupportedTickers } from "@/lib/scrapers/registry";

export const runtime = "nodejs";
// Run fresh per request; we let Next/Vercel cache via fetch revalidation
// inside scrapers if/when we choose to enable it.
export const dynamic = "force-dynamic";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ ticker: string }> }
) {
  const { ticker } = await params;
  const scraper = getScraper(ticker);

  if (!scraper) {
    return NextResponse.json(
      {
        error: `No IR scraper registered for ticker "${ticker}".`,
        supported: listSupportedTickers(),
      },
      { status: 404 }
    );
  }

  try {
    const bundle = await scraper.fetchDocuments();
    return NextResponse.json(bundle, {
      headers: {
        // Cache at the edge for 1 hour, allow stale for a day while we revalidate.
        "Cache-Control":
          "public, s-maxage=3600, stale-while-revalidate=86400",
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      { error: `Failed to fetch documents for ${ticker}: ${message}` },
      { status: 502 }
    );
  }
}
