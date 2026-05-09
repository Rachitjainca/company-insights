"use client";

import { CompanyInsights, FinancialResult } from "@/types/financial";
import { formatCurrency } from "@/lib/analysis";

interface FinancialResultsProps {
  insights: CompanyInsights;
}

export default function FinancialResults({
  insights,
}: FinancialResultsProps) {
  const sortedResults = [...insights.financialResults].sort(
    (a, b) => b.year - a.year || b.year * 4 - a.year * 4
  );

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-2xl font-bold mb-2">
          {insights.company.name}
        </h2>
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <span className="text-gray-600">Ticker:</span>
            <span className="font-semibold ml-2">{insights.company.ticker}</span>
          </div>
          <div>
            <span className="text-gray-600">Sector:</span>
            <span className="font-semibold ml-2">{insights.company.sector}</span>
          </div>
          <div>
            <span className="text-gray-600">Market Cap:</span>
            <span className="font-semibold ml-2">
              {insights.company.marketCap}
            </span>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="px-6 py-4 border-b bg-gray-50">
          <h3 className="text-lg font-semibold">Quarterly Financial Results</h3>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-100 border-b">
              <tr>
                <th className="px-6 py-3 text-left font-semibold">Quarter</th>
                <th className="px-6 py-3 text-right font-semibold">Revenue</th>
                <th className="px-6 py-3 text-right font-semibold">
                  Net Income
                </th>
                <th className="px-6 py-3 text-right font-semibold">EPS</th>
                <th className="px-6 py-3 text-right font-semibold">ROE</th>
                <th className="px-6 py-3 text-right font-semibold">ROA</th>
                <th className="px-6 py-3 text-right font-semibold">
                  Debt/Equity
                </th>
              </tr>
            </thead>
            <tbody>
              {sortedResults.map((result: FinancialResult, idx: number) => (
                <tr
                  key={idx}
                  className={idx % 2 === 0 ? "bg-white" : "bg-gray-50"}
                >
                  <td className="px-6 py-3 font-medium">
                    {result.quarter} {result.year}
                  </td>
                  <td className="px-6 py-3 text-right">
                    {formatCurrency(result.revenue)}
                  </td>
                  <td className="px-6 py-3 text-right">
                    {formatCurrency(result.netIncome)}
                  </td>
                  <td className="px-6 py-3 text-right">₹{result.eps}</td>
                  <td className="px-6 py-3 text-right">
                    {result.roe.toFixed(1)}%
                  </td>
                  <td className="px-6 py-3 text-right">
                    {result.roa.toFixed(1)}%
                  </td>
                  <td className="px-6 py-3 text-right">
                    {result.debtToEquity.toFixed(2)}x
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {insights.presentations.length > 0 && (
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <div className="px-6 py-4 border-b bg-gray-50">
            <h3 className="text-lg font-semibold">
              Investor Presentations
            </h3>
          </div>
          <div className="p-6 space-y-3">
            {insights.presentations.map((pres) => (
              <div
                key={pres.id}
                className="flex items-center justify-between p-3 border rounded hover:bg-gray-50"
              >
                <div>
                  <p className="font-medium">{pres.title}</p>
                  <p className="text-sm text-gray-600">{pres.date}</p>
                </div>
                <a
                  href={pres.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 hover:text-blue-800 font-medium"
                >
                  View →
                </a>
              </div>
            ))}
          </div>
        </div>
      )}

      {insights.transcripts.length > 0 && (
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <div className="px-6 py-4 border-b bg-gray-50">
            <h3 className="text-lg font-semibold">Concall Transcripts</h3>
          </div>
          <div className="p-6 space-y-3">
            {insights.transcripts.map((trans) => (
              <div
                key={trans.id}
                className="flex items-center justify-between p-3 border rounded hover:bg-gray-50"
              >
                <div>
                  <p className="font-medium">{trans.eventTitle}</p>
                  <p className="text-sm text-gray-600">{trans.date}</p>
                </div>
                <a
                  href={trans.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 hover:text-blue-800 font-medium"
                >
                  View →
                </a>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
