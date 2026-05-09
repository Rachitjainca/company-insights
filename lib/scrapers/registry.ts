// Registry of company-specific IR scrapers. Add new entries here as
// scrapers are implemented for additional issuers.

import { IRScraper } from "./types";
import { paytmScraper } from "./paytm";

const scrapers: Record<string, IRScraper> = {
  PAYTM: paytmScraper,
};

export function getScraper(ticker: string): IRScraper | null {
  return scrapers[ticker.toUpperCase()] ?? null;
}

export function listSupportedTickers(): string[] {
  return Object.keys(scrapers);
}
