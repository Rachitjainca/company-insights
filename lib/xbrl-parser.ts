// XBRL instance document parser for NSE Regulation 33 Ind-AS quarterly results.
//
// Fetches an NSE XBRL XML URL and extracts structured financial metrics
// from the XBRL instance document using fast-xml-parser.
//
// Returns a flat Record<label, value> for use in Google Sheets export.

import { XMLParser } from "fast-xml-parser";

// ─── Metric label map ─────────────────────────────────────────────────────────
// Maps XBRL element local names (without namespace prefix) → display label.
// Multiple element names may map to the same label (taxonomy variation).

const METRIC_LABELS: Record<string, string> = {
  // Revenue
  RevenueFromOperations: "Revenue from Operations",
  RevenueFromOperationsNet: "Revenue from Operations",
  RevenueFromOperationsNetOfExcise: "Revenue from Operations",
  NetSales: "Revenue from Operations",
  OtherIncome: "Other Income",
  TotalRevenue: "Total Income",
  TotalIncome: "Total Income",

  // Expenses
  CostOfMaterialsConsumed: "Cost of Materials Consumed",
  PurchasesOfStockInTrade: "Purchases of Stock-in-Trade",
  ChangesInInventories: "Changes in Inventories",
  ChangesInInventoriesOfFinishedGoodsWorkInProgressAndStockInTrade:
    "Changes in Inventories",
  EmployeeBenefitExpense: "Employee Benefit Expense",
  FinanceCosts: "Finance Costs",
  InterestExpense: "Finance Costs",
  DepreciationDepletionAndAmortisationExpense: "Depreciation & Amortisation",
  DepreciationAndAmortisationExpense: "Depreciation & Amortisation",
  OtherExpenses: "Other Expenses",
  TotalExpenses: "Total Expenses",

  // Profit line items
  EBITDABeforeExceptionalItems: "EBITDA",
  ProfitBeforeInterestAndTax: "EBIT",
  ProfitBeforeDepreciationInterestAndTax: "EBITDA",
  ProfitBeforeTaxAndExceptionalItems: "PBT (before exceptional)",
  ExceptionalItems: "Exceptional Items",
  ProfitBeforeTax: "PBT",
  ProfitBeforeIncomeTax: "PBT",
  TaxExpense: "Tax Expense",
  IncomeTaxExpense: "Tax Expense",
  ProfitLossForThePeriod: "Net Profit (PAT)",
  ProfitAfterTax: "Net Profit (PAT)",
  NetProfitForThePeriod: "Net Profit (PAT)",
  ProfitForThePeriod: "Net Profit (PAT)",
  ProfitLossAttributableToOwnersOfParent: "PAT (attributable to owners)",

  // EPS
  BasicEarningsPerShare: "Basic EPS (₹)",
  BasicEarningsLossPerShareFromContinuingOperations: "Basic EPS (₹)",
  BasicEarningsLossPerShare: "Basic EPS (₹)",
  DilutedEarningsPerShare: "Diluted EPS (₹)",
  DilutedEarningsLossPerShareFromContinuingOperations: "Diluted EPS (₹)",
  DilutedEarningsLossPerShare: "Diluted EPS (₹)",

  // Balance sheet (if present)
  TotalAssets: "Total Assets",
  TotalEquity: "Total Equity",
  Equity: "Total Equity",
};

// Ordered list of labels for consistent column ordering in Sheets export
export const ORDERED_METRICS: string[] = [
  "Revenue from Operations",
  "Other Income",
  "Total Income",
  "Cost of Materials Consumed",
  "Purchases of Stock-in-Trade",
  "Changes in Inventories",
  "Employee Benefit Expense",
  "Finance Costs",
  "Depreciation & Amortisation",
  "Other Expenses",
  "Total Expenses",
  "EBITDA",
  "EBIT",
  "PBT (before exceptional)",
  "Exceptional Items",
  "PBT",
  "Tax Expense",
  "Net Profit (PAT)",
  "PAT (attributable to owners)",
  "Basic EPS (₹)",
  "Diluted EPS (₹)",
  "Total Assets",
  "Total Equity",
];

// Context ref patterns that indicate "current period" (not comparative prior period)
const PRIOR_PERIOD_PATTERNS = ["PY", "Prior", "p1", "Prev"];

// ─── Types ────────────────────────────────────────────────────────────────────

export interface XBRLMetrics {
  [label: string]: number | null;
}

// Internal type for raw XBRL data points (before context filtering)
interface DataPoint {
  value: number;
  contextRef: string;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Fetch and parse an NSE XBRL quarterly results file.
 *
 * Returns a map of { metricLabel: numericValue } for the current period.
 * Returns an empty object on any fetch or parse error.
 *
 * Values are raw numbers as reported (typically ₹ lakhs for P&L, ₹ for EPS).
 */
export async function parseQuarterlyXBRL(
  xbrlUrl: string,
  fetchHeaders: HeadersInit
): Promise<XBRLMetrics> {
  try {
    const res = await fetch(xbrlUrl, {
      headers: fetchHeaders,
      cache: "no-store",
    });
    if (!res.ok) return {};
    const xml = await res.text();
    return extractXBRLMetrics(xml);
  } catch {
    return {};
  }
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

function extractXBRLMetrics(xml: string): XBRLMetrics {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "@_",
    parseTagValue: true,
    numberParseOptions: { leadingZeros: false, hex: false },
    trimValues: true,
    isArray: () => false,
    allowBooleanAttributes: true,
  });

  let parsed: unknown;
  try {
    parsed = parser.parse(xml);
  } catch {
    return {};
  }

  // Collect all XBRL data points keyed by element local name
  const rawPoints: Record<string, DataPoint[]> = {};
  collectDataPoints(parsed, rawPoints);

  // Convert to labeled metrics, preferring current-period contexts
  const result: XBRLMetrics = {};

  for (const [localName, points] of Object.entries(rawPoints)) {
    const label = METRIC_LABELS[localName];
    if (!label) continue;
    if (result[label] !== undefined) continue; // first match wins

    // Exclude prior-period contexts (comparative data)
    const currentPoints = points.filter(
      (p) => !isPriorPeriodContext(p.contextRef)
    );
    const chosen = currentPoints[0] ?? points[0];
    if (chosen != null) result[label] = chosen.value;
  }

  return result;
}

function isPriorPeriodContext(contextRef: string): boolean {
  const lower = contextRef.toLowerCase();
  return PRIOR_PERIOD_PATTERNS.some((pat) => lower.includes(pat.toLowerCase()));
}

/**
 * Recursively walk a fast-xml-parser output object and collect all
 * elements that look like XBRL data points:
 *   { "#text": <number>, "@_contextRef": <string>, ... }
 */
function collectDataPoints(
  obj: unknown,
  out: Record<string, DataPoint[]>
): void {
  if (typeof obj !== "object" || obj === null) return;

  for (const [key, value] of Object.entries(
    obj as Record<string, unknown>
  )) {
    if (key.startsWith("@_")) continue;

    // Strip namespace prefix: "in-fin:ProfitBeforeTax" → "ProfitBeforeTax"
    const localName = key.includes(":")
      ? key.split(":").slice(1).join(":")
      : key;

    if (Array.isArray(value)) {
      // Multiple elements with the same tag (different contexts)
      for (const item of value) {
        if (typeof item === "object" && item !== null) {
          const v = item as Record<string, unknown>;
          const extracted = tryExtract(localName, v, out);
          if (!extracted) {
            collectDataPoints(item, out);
          }
        }
      }
    } else if (typeof value === "object" && value !== null) {
      const v = value as Record<string, unknown>;
      if (!tryExtract(localName, v, out)) {
        collectDataPoints(value, out);
      }
    }
  }
}

/**
 * Attempt to read an element as a XBRL data point.
 * Returns true if the element was recognized as a data point.
 */
function tryExtract(
  localName: string,
  v: Record<string, unknown>,
  out: Record<string, DataPoint[]>
): boolean {
  const rawText = v["#text"];
  const contextRef = v["@_contextRef"];

  if (rawText === undefined || contextRef === undefined) return false;

  const normalized =
    typeof rawText === "string" ? rawText.replace(/,/g, "").trim() : rawText;
  const num = Number(normalized);
  if (isNaN(num)) return false;

  if (!out[localName]) out[localName] = [];
  out[localName].push({ value: num, contextRef: String(contextRef) });
  return true;
}
