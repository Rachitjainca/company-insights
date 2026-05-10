import { NextRequest, NextResponse } from "next/server";
import type { IRCategory, IRDocument } from "@/types/financial";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface DataSources {
  scraper: boolean;
  nseQuarterly: boolean;
  nseAnnual: boolean;
  nseAnnouncements?: boolean;
  bseCode: string | null;
  bseFilings: boolean;
}

interface IRDocsResponse {
  ticker: string;
  companyName: string;
  documents: Record<IRCategory, IRDocument[]>;
  totalCount: number;
  fetchedAt: string;
  sources?: DataSources;
}

const ORDERED_CATEGORIES: IRCategory[] = [
  "quarterly-results",
  "investor-presentation",
  "concall",
  "annual-report",
  "kpi-handbook",
];

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ ticker: string }> }
) {
  const { ticker } = await params;
  const upperTicker = ticker.toUpperCase();

  const irDocsUrl = new URL(
    `/api/companies/${encodeURIComponent(upperTicker)}/ir-docs`,
    request.url
  );

  const res = await fetch(irDocsUrl.toString(), { cache: "no-store" });
  if (!res.ok) {
    return NextResponse.json(
      {
        ticker: upperTicker,
        error: `Failed to fetch IR docs: HTTP ${res.status}`,
      },
      { status: res.status }
    );
  }

  const data = (await res.json()) as IRDocsResponse;
  const allDocs = ORDERED_CATEGORIES.flatMap((cat) => data.documents[cat] ?? []);

  const byCategory: Record<IRCategory, number> = {
    "quarterly-results": data.documents["quarterly-results"]?.length ?? 0,
    "investor-presentation": data.documents["investor-presentation"]?.length ?? 0,
    concall: data.documents.concall?.length ?? 0,
    "annual-report": data.documents["annual-report"]?.length ?? 0,
    "kpi-handbook": data.documents["kpi-handbook"]?.length ?? 0,
  };

  const bySource = {
    nse: allDocs.filter((d) => d.source === "nse").length,
    bse: allDocs.filter((d) => d.source === "bse").length,
    scraper: allDocs.filter((d) => d.source === "scraper").length,
    unknown: allDocs.filter((d) => !d.source).length,
  };

  return NextResponse.json(
    {
      ticker: data.ticker,
      companyName: data.companyName,
      totalCount: allDocs.length,
      byCategory,
      bySource,
      sourceFlags: data.sources ?? null,
      fetchedAt: new Date().toISOString(),
    },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    }
  );
}
