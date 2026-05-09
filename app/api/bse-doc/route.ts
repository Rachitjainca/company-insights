// GET /api/bse-doc?name={uuid-filename.pdf}
//
// Proxy for BSE attachment PDFs. BSE uses hotlink-protection: the CDN serves
// PDF content only when the request carries Referer: https://www.bseindia.com/
// Browsers clicking a link from our domain send our domain as Referer → 404.
// This route fetches server-side with the correct Referer and streams back.

import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

// Only allow UUID-named PDF/Excel files from BSE's AttachLive path
const SAFE_NAME_RE = /^[0-9a-f-]{36}\.(pdf|xlsx|xls|docx|doc)$/i;
const BSE_ATTACH_BASE = "https://www.bseindia.com/xml-data/corpfiling/AttachLive/";

export async function GET(request: NextRequest) {
  const name = request.nextUrl.searchParams.get("name")?.trim() ?? "";

  if (!name || !SAFE_NAME_RE.test(name)) {
    return new NextResponse("Invalid file name", { status: 400 });
  }

  const upstream = `${BSE_ATTACH_BASE}${encodeURIComponent(name)}`;

  let res: Response;
  try {
    res = await fetch(upstream, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36",
        Referer: "https://www.bseindia.com/",
        Accept: "application/pdf,application/octet-stream,*/*",
      },
    });
  } catch {
    return new NextResponse("BSE fetch failed", { status: 502 });
  }

  if (!res.ok) {
    return new NextResponse(`BSE returned ${res.status}`, { status: res.status });
  }

  const contentType = res.headers.get("content-type") ?? "application/octet-stream";
  const contentLength = res.headers.get("content-length");

  const headers: Record<string, string> = {
    "Content-Type": contentType,
    "Content-Disposition": `inline; filename="${name}"`,
    // Cache for 7 days — BSE filings are immutable
    "Cache-Control": "public, max-age=604800, immutable",
  };
  if (contentLength) headers["Content-Length"] = contentLength;

  return new NextResponse(res.body, { status: 200, headers });
}
