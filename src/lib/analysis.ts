// @ts-nocheck
import {
  FinancialResult,
  QoQAnalysis,
  YoYAnalysis,
} from "@/types/financial";

export function calculateQoQAnalysis(results: FinancialResult[]): QoQAnalysis[] {
  if (results.length < 2) return [];

  const sorted = [...results].sort(
    (a, b) => a.year * 4 + parseQuarter(a.quarter) - (b.year * 4 + parseQuarter(b.quarter))
  );

  const analysis: QoQAnalysis[] = [];

  for (let i = 1; i < sorted.length; i++) {
    const current = sorted[i];
    const previous = sorted[i - 1];

    const revenueGrowth =
      ((current.revenue - previous.revenue) / previous.revenue) * 100;
    const profitGrowth =
      ((current.netIncome - previous.netIncome) / Math.abs(previous.netIncome)) *
      100;
    const epsGrowth = ((current.eps - previous.eps) / Math.abs(previous.eps)) * 100;

    analysis.push({
      quarter: `${current.quarter} ${current.year}`,
      revenueGrowth,
      profitGrowth,
      epsGrowth,
    });
  }

  return analysis;
}

export function calculateYoYAnalysis(results: FinancialResult[]): YoYAnalysis[] {
  const groupedByQuarter: {
    [key: string]: { [year: number]: FinancialResult };
  } = {};

  // Group results by quarter and year
  results.forEach((result) => {
    if (!groupedByQuarter[result.quarter]) {
      groupedByQuarter[result.quarter] = {};
    }
    groupedByQuarter[result.quarter][result.year] = result;
  });

  const analysis: YoYAnalysis[] = [];

  // Calculate YoY growth for each quarter
  Object.entries(groupedByQuarter).forEach(([quarter, years]) => {
    const yearKeys = Object.keys(years)
      .map(Number)
      .sort();

    for (let i = 1; i < yearKeys.length; i++) {
      const currentYear = yearKeys[i];
      const previousYear = yearKeys[i - 1];

      const current = years[currentYear];
      const previous = years[previousYear];

      const revenueGrowth =
        ((current.revenue - previous.revenue) / previous.revenue) * 100;
      const profitGrowth =
        ((current.netIncome - previous.netIncome) /
          Math.abs(previous.netIncome)) *
        100;
      const epsGrowth = ((current.eps - previous.eps) / Math.abs(previous.eps)) * 100;

      analysis.push({
        year: currentYear,
        quarter,
        revenueGrowth,
        profitGrowth,
        epsGrowth,
      });
    }
  });

  return analysis.sort((a, b) => a.year - b.year);
}

function parseQuarter(quarter: string): number {
  const num = parseInt(quarter.replace("Q", ""));
  return isNaN(num) ? 0 : num;
}

export function formatPercentage(value: number): string {
  return `${value > 0 ? "+" : ""}${value.toFixed(2)}%`;
}

export function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
  }).format(value);
}

