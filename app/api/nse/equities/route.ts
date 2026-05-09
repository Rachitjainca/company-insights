// GET /api/nse/equities
// Fetches the NSE listed equities CSV server-side (bypasses CORS/Referer),
// filters to EQ series only, and returns clean JSON.
// Edge-cached 24 h; NSE refreshes the file daily.

import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NSE_CSV_URL =
  "https://nsearchives.nseindia.com/content/equities/EQUITY_L.csv";

export interface NSEEquity {
  symbol: string;
  name: string;
  isin: string;
}

function parseCSVLine(line: string): string[] {
  const cols: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
    } else if (ch === "," && !inQuotes) {
      cols.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  cols.push(cur);
  return cols;
}

export async function GET() {
  try {
    const res = await fetch(NSE_CSV_URL, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
          "(KHTML, like Gecko) Chrome/124.0 Safari/537.36",
        Referer: "https://www.nseindia.com/",
        Accept: "text/html,application/xhtml+xml,*/*",
      },
      next: { revalidate: 86400 },
    });

    if (!res.ok) {
      throw new Error(`NSE returned HTTP ${res.status}`);
    }

    const text = await res.text();
    const lines = text.split("\n");
    const equities: NSEEquity[] = [];

    // Header: SYMBOL,"NAME OF COMPANY",SERIES,DATE OF LISTING,...,ISIN NUMBER,...
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;
      const cols = parseCSVLine(line);
      if (cols.length < 7) continue;
      const symbol = cols[0]?.trim();
      const name = cols[1]?.trim().replace(/^"|"$/g, "");
      const series = cols[2]?.trim();
      const isin = cols[6]?.trim();
      // Only common equity shares
      if (symbol && name && series === "EQ") {
        equities.push({ symbol, name, isin });
      }
    }

    return NextResponse.json(
      { equities, count: equities.length, fetchedAt: new Date().toISOString() },
      {
        headers: {
          "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=3600",
        },
      }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
