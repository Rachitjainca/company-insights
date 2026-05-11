import { NextRequest, NextResponse } from "next/server";
import { probeNSEIntegratedQuarterlyHealth } from "@/lib/nse-filings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function normalizeSymbol(raw: string | null): string {
  const value = (raw ?? "TCS").trim().toUpperCase();
  if (!value) return "TCS";
  return value;
}

export async function GET(request: NextRequest) {
  const symbol = normalizeSymbol(request.nextUrl.searchParams.get("symbol"));

  if (!/^[A-Z0-9._-]{1,30}$/.test(symbol)) {
    return NextResponse.json(
      {
        ok: false,
        error: "Invalid symbol format.",
      },
      { status: 400 }
    );
  }

  const report = await probeNSEIntegratedQuarterlyHealth(symbol);

  return NextResponse.json(
    {
      ...report,
      note:
        "lastSuccess is process-memory metadata and may reset on cold starts in serverless environments.",
    },
    {
      status: report.ok ? 200 : 503,
      headers: {
        "Cache-Control": "no-store",
      },
    }
  );
}
