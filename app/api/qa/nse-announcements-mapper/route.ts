import { NextResponse } from "next/server";
import {
  mapNSEAnnouncementsToIRDocs,
  type NSEAnnouncement,
} from "@/lib/nse-filings";

export const runtime = "nodejs";

const MOCK_ROWS: NSEAnnouncement[] = [
  {
    symbol: "RELIANCE",
    desc: "Investor Presentation",
    an_dt: "22-Apr-2026 09:00:00",
    attchmntFile:
      "https://nsearchives.nseindia.com/corporate/RELIANCE_INVESTOR_PRESENTATION.pdf",
  },
  {
    symbol: "RELIANCE",
    attchmntText: "Transcript of Analysts/Institutional Investor Meet/Con. Call",
    an_dt: "25-Apr-2026 18:30:00",
    attchmntFile:
      "https://nsearchives.nseindia.com/corporate/RELIANCE_CONCALL_TRANSCRIPT.pdf",
  },
  {
    symbol: "RELIANCE",
    desc: "Disclosure under Regulation 30",
    an_dt: "26-Apr-2026 10:00:00",
    attchmntFile:
      "https://nsearchives.nseindia.com/corporate/RELIANCE_MISC_DISCLOSURE.pdf",
  },
  {
    symbol: "RELIANCE",
    desc: "Earnings Presentation",
    an_dt: "26-Apr-2026 12:00:00",
    // Missing attachment should be ignored
    attchmntFile: "",
  },
];

export async function GET() {
  const docs = mapNSEAnnouncementsToIRDocs(MOCK_ROWS, 20);

  const checks = [
    {
      name: "maps investor presentation",
      pass: docs.some((d) => d.category === "investor-presentation"),
    },
    {
      name: "maps concall transcript",
      pass: docs.some((d) => d.category === "concall"),
    },
    {
      name: "ignores non-IR announcement rows",
      pass: docs.every((d) => d.title !== "Disclosure under Regulation 30"),
    },
    {
      name: "all mapped docs have NSE source",
      pass: docs.every((d) => d.source === "nse"),
    },
  ];

  const ok = checks.every((c) => c.pass);

  return NextResponse.json(
    {
      ok,
      checks,
      sampleCount: docs.length,
      sampleDocs: docs,
      note: "Mocked mapper QA route. No external API call is made.",
      fetchedAt: new Date().toISOString(),
    },
    { status: ok ? 200 : 500 }
  );
}
