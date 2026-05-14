// Brand alias dictionary + logo URL resolution.
//
// Many investors search by *brand* (Zomato, Jio, Vi) instead of the
// listed-entity name (ETERNAL, RELIANCE, IDEA). This module maps such
// aliases back to the canonical NSE symbol so search resolves correctly,
// and exposes a domain lookup used to fetch a company logo.

/**
 * Alias -> canonical NSE symbol.
 * Keys MUST be lowercase; matched against query in CompanySearch.
 */
export const BRAND_ALIASES: Record<string, string> = {
  // Eternal (formerly Zomato) — rebranded April 2025
  zomato: "ETERNAL",
  blinkit: "ETERNAL",
  hyperpure: "ETERNAL",
  // Reliance ecosystem
  jio: "RELIANCE",
  "jio platforms": "RELIANCE",
  reliance: "RELIANCE",
  ril: "RELIANCE",
  // Telcos
  vi: "IDEA",
  "vodafone idea": "IDEA",
  airtel: "BHARTIARTL",
  "bharti airtel": "BHARTIARTL",
  // Banks
  hdfc: "HDFCBANK",
  icici: "ICICIBANK",
  sbi: "SBIN",
  axis: "AXISBANK",
  kotak: "KOTAKBANK",
  // FMCG / retail
  paytm: "PAYTM",
  "one 97": "PAYTM",
  swiggy: "SWIGGY",
  nykaa: "NYKAA",
  policybazaar: "POLICYBZR",
  pb: "POLICYBZR",
  zaggle: "ZAGGLE",
  // IT
  tcs: "TCS",
  infy: "INFY",
  infosys: "INFY",
  wipro: "WIPRO",
  hcl: "HCLTECH",
  techm: "TECHM",
  // Auto
  tatamotors: "TATAMOTORS",
  marutisuzuki: "MARUTI",
  m_m: "M&M",
  mahindra: "M&M",
  bajajauto: "BAJAJ-AUTO",
  // Energy / metals
  ongc: "ONGC",
  coal: "COALINDIA",
  ntpc: "NTPC",
  tatasteel: "TATASTEEL",
  jsw: "JSWSTEEL",
  // Pharma
  drreddy: "DRREDDY",
  cipla: "CIPLA",
  sunpharma: "SUNPHARMA",
};

/**
 * NSE symbol -> primary brand domain (used for logo fetching).
 * Only includes companies where the listed name differs from the brand
 * domain or where reliable inference would fail.
 */
const SYMBOL_TO_DOMAIN: Record<string, string> = {
  ETERNAL: "zomato.com",
  RELIANCE: "ril.com",
  IDEA: "myvi.in",
  BHARTIARTL: "airtel.in",
  HDFCBANK: "hdfcbank.com",
  ICICIBANK: "icicibank.com",
  SBIN: "sbi.co.in",
  AXISBANK: "axisbank.com",
  KOTAKBANK: "kotak.com",
  PAYTM: "paytm.com",
  SWIGGY: "swiggy.com",
  NYKAA: "nykaa.com",
  POLICYBZR: "policybazaar.com",
  ZAGGLE: "zaggle.in",
  TCS: "tcs.com",
  INFY: "infosys.com",
  WIPRO: "wipro.com",
  HCLTECH: "hcltech.com",
  TECHM: "techmahindra.com",
  TATAMOTORS: "tatamotors.com",
  MARUTI: "marutisuzuki.com",
  "M&M": "mahindra.com",
  "BAJAJ-AUTO": "bajajauto.com",
  BAJFINANCE: "bajajfinserv.in",
  ONGC: "ongcindia.com",
  COALINDIA: "coalindia.in",
  NTPC: "ntpc.co.in",
  TATASTEEL: "tatasteel.com",
  JSWSTEEL: "jsw.in",
  DRREDDY: "drreddys.com",
  CIPLA: "cipla.com",
  SUNPHARMA: "sunpharma.com",
  ASIANPAINT: "asianpaints.com",
  HINDUNILVR: "hul.co.in",
  ITC: "itcportal.com",
  LT: "larsentoubro.com",
  ADANIENT: "adani.com",
  ADANIPORTS: "adaniports.com",
};

/**
 * Best-effort domain inference from the company name when no override
 * exists. Strips legal suffixes, removes spaces, lowercases, then
 * appends `.com`. Used as one of several logo fetch attempts.
 */
function inferDomainFromName(name: string): string | null {
  if (!name) return null;
  const cleaned = name
    .toLowerCase()
    .replace(/\b(limited|ltd|inc|corp|corporation|company|co|holdings|industries|enterprises)\b\.?/g, "")
    .replace(/[^a-z0-9]+/g, "")
    .trim();
  if (cleaned.length < 3 || cleaned.length > 30) return null;
  return `${cleaned}.com`;
}

/**
 * Returns an ordered list of candidate logo URLs for a company.
 * The first URL that resolves should be used; consumers are expected
 * to fall through onError to subsequent entries, ending with an
 * initials block.
 */
export function getCompanyLogoCandidates(symbol: string, name: string): string[] {
  const candidates: string[] = [];
  const domain =
    SYMBOL_TO_DOMAIN[symbol.toUpperCase()] || inferDomainFromName(name);
  if (domain) {
    // Clearbit is free, fast, returns transparent PNG. May 404 for unknowns.
    candidates.push(`https://logo.clearbit.com/${domain}`);
    // Google s2 favicons — slower, lower quality, but extremely reliable.
    candidates.push(
      `https://www.google.com/s2/favicons?sz=128&domain_url=${encodeURIComponent(
        `https://${domain}`,
      )}`,
    );
  }
  return candidates;
}

/**
 * Resolve a free-text query (symbol, brand name) to a canonical NSE
 * symbol via the alias dictionary. Returns null if no alias matches.
 */
export function resolveBrandAlias(query: string): string | null {
  const q = query.trim().toLowerCase();
  if (!q) return null;
  if (BRAND_ALIASES[q]) return BRAND_ALIASES[q];
  // Fuzzy: try common variants
  const stripped = q.replace(/[^a-z0-9]/g, "");
  if (BRAND_ALIASES[stripped]) return BRAND_ALIASES[stripped];
  return null;
}
