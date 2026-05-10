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
const BSE_FILINGDATA_BASE = "https://api.bseindia.com/BseIndiaAPI/api/FilingData/w?strFilePath=";

function isLikelyFileResponse(contentType: string | null, fileName: string): boolean {
  const ct = (contentType ?? "").toLowerCase();
  const lower = fileName.toLowerCase();

  // Explicitly reject known non-file payloads that BSE sometimes returns.
  if (ct.includes("text/html") || ct.includes("application/json") || ct.includes("text/plain")) {
    return false;
  }

  // Accept generic binary if upstream does not provide an accurate mime type.
  if (ct.includes("application/octet-stream")) return true;

  if (lower.endsWith(".pdf")) return ct.includes("application/pdf");
  if (lower.endsWith(".xlsx")) {
    return ct.includes("spreadsheetml") || ct.includes("application/vnd.openxmlformats");
  }
  if (lower.endsWith(".xls")) return ct.includes("application/vnd.ms-excel");
  if (lower.endsWith(".docx")) {
    return ct.includes("wordprocessingml") || ct.includes("application/vnd.openxmlformats");
  }
  if (lower.endsWith(".doc")) return ct.includes("application/msword");

  return false;
}

async function fetchBSEFile(upstream: string): Promise<Response | null> {
  try {
    const res = await fetch(upstream, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36",
        Referer: "https://www.bseindia.com/",
        Origin: "https://www.bseindia.com",
        Accept: "application/pdf,application/octet-stream,*/*",
      },
    });
    if (!res.ok) return null;
    return res;
  } catch {
    return null;
  }
}

export async function GET(request: NextRequest) {
  const name = request.nextUrl.searchParams.get("name")?.trim() ?? "";

  if (!name || !SAFE_NAME_RE.test(name)) {
    return new NextResponse("Invalid file name", { status: 400 });
  }

  const upstreamCandidates = [
    `${BSE_ATTACH_BASE}${encodeURIComponent(name)}`,
    `${BSE_FILINGDATA_BASE}${encodeURIComponent(name)}`,
  ];

  let res: Response | null = null;
  for (const upstream of upstreamCandidates) {
    const candidate = await fetchBSEFile(upstream);
    if (!candidate) continue;
    if (!isLikelyFileResponse(candidate.headers.get("content-type"), name)) continue;
    res = candidate;
    break;
  }

  if (!res) {
    return new NextResponse("BSE document unavailable", { status: 404 });
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
