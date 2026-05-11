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

export default function Analysis({ insights }: AnalysisProps) {
  const [activeTab, setActiveTab] = useState<"qoq" | "yoy">("qoq");

  const qoqData = calculateQoQAnalysis(insights.financialResults);
  const yoyData = calculateYoYAnalysis(insights.financialResults);

  const getGrowthColor = (value: number) => {
    if (value > 0) return "text-green-600";
    if (value < 0) return "text-red-600";
    return "text-gray-600";
  };

  return (
    <div className="bg-white rounded-lg shadow overflow-hidden">
      <div className="px-6 py-4 border-b bg-gray-50">
        <h3 className="text-lg font-semibold">Financial Analysis</h3>
      </div>

      <div className="border-b">
        <div className="flex">
          <button
            onClick={() => setActiveTab("qoq")}
            className={`flex-1 px-6 py-3 font-medium text-center ${
              activeTab === "qoq"
                ? "border-b-2 border-blue-600 text-blue-600"
                : "text-gray-600 hover:text-gray-900"
            }`}
          >
            QoQ Analysis
          </button>
          <button
            onClick={() => setActiveTab("yoy")}
            className={`flex-1 px-6 py-3 font-medium text-center ${
              activeTab === "yoy"
                ? "border-b-2 border-blue-600 text-blue-600"
                : "text-gray-600 hover:text-gray-900"
            }`}
          >
            YoY Analysis
          </button>
        </div>
      </div>

      <div className="overflow-x-auto">
        {activeTab === "qoq" ? (
          <table className="w-full text-sm">
            <thead className="bg-gray-100 border-b">
              <tr>
                <th className="px-6 py-3 text-left font-semibold">Quarter</th>
                <th className="px-6 py-3 text-right font-semibold">
                  Revenue Growth
                </th>
                <th className="px-6 py-3 text-right font-semibold">
                  Profit Growth
                </th>
                <th className="px-6 py-3 text-right font-semibold">
                  EPS Growth
                </th>
              </tr>
            </thead>
            <tbody>
              {qoqData.length > 0 ? (
                qoqData.map((data, idx) => (
                  <tr
                    key={idx}
                    className={idx % 2 === 0 ? "bg-white" : "bg-gray-50"}
                  >
                    <td className="px-6 py-3 font-medium">{data.quarter}</td>
                    <td
                      className={`px-6 py-3 text-right font-medium ${getGrowthColor(
                        data.revenueGrowth
                      )}`}
                    >
                      {formatPercentage(data.revenueGrowth)}
                    </td>
                    <td
                      className={`px-6 py-3 text-right font-medium ${getGrowthColor(
                        data.profitGrowth
                      )}`}
                    >
                      {formatPercentage(data.profitGrowth)}
                    </td>
                    <td
                      className={`px-6 py-3 text-right font-medium ${getGrowthColor(
                        data.epsGrowth
                      )}`}
                    >
                      {formatPercentage(data.epsGrowth)}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={4} className="px-6 py-8 text-center text-gray-500">
                    Insufficient data for QoQ analysis
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-100 border-b">
              <tr>
                <th className="px-6 py-3 text-left font-semibold">
                  Period
                </th>
                <th className="px-6 py-3 text-right font-semibold">
                  Revenue Growth
                </th>
                <th className="px-6 py-3 text-right font-semibold">
                  Profit Growth
                </th>
                <th className="px-6 py-3 text-right font-semibold">
                  EPS Growth
                </th>
              </tr>
            </thead>
            <tbody>
              {yoyData.length > 0 ? (
                yoyData.map((data, idx) => (
                  <tr
                    key={idx}
                    className={idx % 2 === 0 ? "bg-white" : "bg-gray-50"}
                  >
                    <td className="px-6 py-3 font-medium">
                      {data.quarter} {data.year}
                    </td>
                    <td
                      className={`px-6 py-3 text-right font-medium ${getGrowthColor(
                        data.revenueGrowth
                      )}`}
                    >
                      {formatPercentage(data.revenueGrowth)}
                    </td>
                    <td
                      className={`px-6 py-3 text-right font-medium ${getGrowthColor(
                        data.profitGrowth
                      )}`}
                    >
                      {formatPercentage(data.profitGrowth)}
                    </td>
                    <td
                      className={`px-6 py-3 text-right font-medium ${getGrowthColor(
                        data.epsGrowth
                      )}`}
                    >
                      {formatPercentage(data.epsGrowth)}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={4} className="px-6 py-8 text-center text-gray-500">
                    Insufficient data for YoY analysis
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

