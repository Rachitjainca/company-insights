// @ts-nocheck
"use client";

import { CompanyInsights, FinancialResult } from "@/types/financial";
import { formatCurrency } from "@/lib/analysis";

interface FinancialResultsProps {
  insights: CompanyInsights;
}

function GrowthBadge({ value }: { value: number }) {
  const positive = value > 0;
  return (
    <span
      className={`inline-flex items-center gap-0.5 text-xs font-semibold px-1.5 py-0.5 rounded-full ${
        positive ? "bg-green-100 text-green-700" : "bg-red-100 text-red-600"
      }`}
    >
      {positive ? "▲" : "▼"} {Math.abs(value).toFixed(1)}%
    </span>
  );
}

export default function FinancialResults({ insights }: FinancialResultsProps) {
  const sortedResults = [...insights.financialResults].sort(
    (a, b) => b.year - a.year || 0
  );

  if (sortedResults.length === 0) {
    return null;
  }

  const latest = sortedResults[0];
  const prev = sortedResults[1];
  const revenueChg = prev
    ? ((latest.revenue - prev.revenue) / prev.revenue) * 100
    : null;
  const incomeChg = prev
    ? ((latest.netIncome - prev.netIncome) / prev.netIncome) * 100
    : null;

  return (
    <div className="space-y-4">
      {/* KPI strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          {
            label: "Revenue",
            value: formatCurrency(latest.revenue),
            chg: revenueChg,
            sub: `${latest.quarter} ${latest.year}`,
          },
          {
            label: "Net Income",
            value: formatCurrency(latest.netIncome),
            chg: incomeChg,
            sub: `${latest.quarter} ${latest.year}`,
          },
          {
            label: "EPS",
            value: `₹${latest.eps}`,
            chg: null,
            sub: "Earnings per share",
          },
          {
            label: "ROE",
            value: `${latest.roe.toFixed(1)}%`,
            chg: null,
            sub: "Return on equity",
          },
        ].map((kpi) => (
          <div
            key={kpi.label}
            className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4"
          >
            <p className="text-xs text-gray-500 font-medium mb-1">{kpi.label}</p>
            <p className="text-xl font-bold text-gray-900">{kpi.value}</p>
            <div className="flex items-center gap-2 mt-1">
              {kpi.chg !== null ? (
                <GrowthBadge value={kpi.chg} />
              ) : (
                <span className="text-xs text-gray-400">{kpi.sub}</span>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Full quarterly table */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <h3 className="font-semibold text-gray-900">Quarterly Results</h3>
          <span className="text-xs text-gray-400">{sortedResults.length} quarters</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100 text-xs text-gray-500 uppercase tracking-wide">
                <th className="px-6 py-3 text-left font-semibold">Quarter</th>
                <th className="px-6 py-3 text-right font-semibold">Revenue</th>
                <th className="px-6 py-3 text-right font-semibold">Net Income</th>
                <th className="px-6 py-3 text-right font-semibold">EPS</th>
                <th className="px-6 py-3 text-right font-semibold">ROE</th>
                <th className="px-6 py-3 text-right font-semibold">ROA</th>
                <th className="px-6 py-3 text-right font-semibold">D/E</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {sortedResults.map((result: FinancialResult, idx: number) => (
                <tr
                  key={idx}
                  className="hover:bg-blue-50/40 transition-colors"
                >
                  <td className="px-6 py-3 font-medium text-gray-900">
                    {result.quarter} {result.year}
                  </td>
                  <td className="px-6 py-3 text-right text-gray-700 font-mono">
                    {formatCurrency(result.revenue)}
                  </td>
                  <td className="px-6 py-3 text-right font-mono">
                    <span className={result.netIncome >= 0 ? "text-green-700" : "text-red-600"}>
                      {formatCurrency(result.netIncome)}
                    </span>
                  </td>
                  <td className="px-6 py-3 text-right text-gray-700 font-mono">₹{result.eps}</td>
                  <td className="px-6 py-3 text-right text-gray-700">{result.roe.toFixed(1)}%</td>
                  <td className="px-6 py-3 text-right text-gray-700">{result.roa.toFixed(1)}%</td>
                  <td className="px-6 py-3 text-right text-gray-700">{result.debtToEquity.toFixed(2)}x</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Investor Presentations */}
      {insights.presentations.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100">
            <h3 className="font-semibold text-gray-900">Investor Presentations</h3>
          </div>
          <div className="divide-y divide-gray-50">
            {insights.presentations.map((pres) => (
              <div key={pres.id} className="flex items-center justify-between px-6 py-3 hover:bg-gray-50 transition-colors">
                <div>
                  <p className="font-medium text-gray-900 text-sm">{pres.title}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{pres.date}</p>
                </div>
                <a
                  href={pres.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 hover:text-blue-700 text-sm font-semibold flex items-center gap-1"
                >
                  View
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                  </svg>
                </a>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Concall Transcripts */}
      {insights.transcripts.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100">
            <h3 className="font-semibold text-gray-900">Concall Transcripts</h3>
          </div>
          <div className="divide-y divide-gray-50">
            {insights.transcripts.map((trans) => (
              <div key={trans.id} className="flex items-center justify-between px-6 py-3 hover:bg-gray-50 transition-colors">
                <div>
                  <p className="font-medium text-gray-900 text-sm">{trans.eventTitle}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{trans.date}</p>
                </div>
                <a
                  href={trans.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 hover:text-blue-700 text-sm font-semibold flex items-center gap-1"
                >
                  View
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                  </svg>
                </a>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}



