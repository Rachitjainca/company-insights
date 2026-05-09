"use client";

import { CompanyInsights } from "@/types/financial";
import {
  calculateQoQAnalysis,
  calculateYoYAnalysis,
  formatPercentage,
} from "@/lib/analysis";
import { useState } from "react";

interface AnalysisProps {
  insights: CompanyInsights;
}

function GrowthCell({ value }: { value: number }) {
  const positive = value > 0;
  const neutral = value === 0;
  return (
    <td className="px-6 py-3 text-right">
      <span
        className={`inline-flex items-center gap-1 text-sm font-semibold ${
          neutral
            ? "text-gray-500"
            : positive
            ? "text-green-600"
            : "text-red-600"
        }`}
      >
        {!neutral && (
          <span className="text-xs">{positive ? "▲" : "▼"}</span>
        )}
        {formatPercentage(Math.abs(value))}
      </span>
    </td>
  );
}

export default function Analysis({ insights }: AnalysisProps) {
  const [activeTab, setActiveTab] = useState<"qoq" | "yoy">("qoq");

  const qoqData = calculateQoQAnalysis(insights.financialResults);
  const yoyData = calculateYoYAnalysis(insights.financialResults);

  if (qoqData.length === 0 && yoyData.length === 0) return null;

  const tabs = [
    { key: "qoq" as const, label: "QoQ Analysis" },
    { key: "yoy" as const, label: "YoY Analysis" },
  ];

  const cols = ["Quarter / Period", "Revenue Growth", "Profit Growth", "EPS Growth"];
  const activeData = activeTab === "qoq" ? qoqData : yoyData;

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
        <h3 className="font-semibold text-gray-900">Growth Analysis</h3>
        <div className="flex bg-gray-100 rounded-xl p-1 gap-1">
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => setActiveTab(t.key)}
              className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                activeTab === t.key
                  ? "bg-white text-blue-600 shadow-sm"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-100 text-xs text-gray-500 uppercase tracking-wide">
              {cols.map((c) => (
                <th
                  key={c}
                  className={`px-6 py-3 font-semibold ${c === "Quarter / Period" ? "text-left" : "text-right"}`}
                >
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {activeData.length > 0 ? (
              activeData.map((data, idx) => (
                <tr key={idx} className="hover:bg-blue-50/40 transition-colors">
                  <td className="px-6 py-3 font-medium text-gray-900">
                    {"quarter" in data && "year" in data
                      ? `${data.quarter} ${data.year}`
                      : (data as { quarter: string }).quarter}
                  </td>
                  <GrowthCell value={data.revenueGrowth} />
                  <GrowthCell value={data.profitGrowth} />
                  <GrowthCell value={data.epsGrowth} />
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={4} className="px-6 py-10 text-center text-gray-400 text-sm">
                  Insufficient data for {activeTab.toUpperCase()} analysis
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}


