"use client";

import { useState } from "react";
import CompanySearch from "../components/CompanySearch";
import FinancialResults from "../components/FinancialResults";
import Analysis from "../components/Analysis";
import ExportButton from "../components/ExportButton";
import { CompanyInsights } from "../types/financial";

export default function Home() {
  const [selectedInsights, setSelectedInsights] =
    useState<CompanyInsights | null>(null);

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      {/* Header */}
      <header className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <h1 className="text-4xl font-bold text-gray-900">
            Company Insights
          </h1>
          <p className="mt-2 text-gray-600">
            Explore financial data, presentations, and earnings call transcripts
          </p>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {!selectedInsights ? (
          // Search Screen
          <div className="bg-white rounded-lg shadow-lg p-8 text-center">
            <h2 className="text-2xl font-semibold mb-6 text-gray-900">
              Search for a Company
            </h2>
            <p className="text-gray-600 mb-8">
              Enter a company ticker or name to view financial data and analysis
            </p>

            <div className="flex justify-center">
              <CompanySearch onSelect={setSelectedInsights} />
            </div>

            <div className="mt-12 grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="p-4 bg-blue-50 rounded-lg">
                <h3 className="font-semibold text-gray-900 mb-2">
                  📊 Financial Data
                </h3>
                <p className="text-sm text-gray-600">
                  View quarterly financial results with key metrics
                </p>
              </div>
              <div className="p-4 bg-green-50 rounded-lg">
                <h3 className="font-semibold text-gray-900 mb-2">
                  📈 Analysis
                </h3>
                <p className="text-sm text-gray-600">
                  Compare QoQ and YoY growth trends
                </p>
              </div>
              <div className="p-4 bg-purple-50 rounded-lg">
                <h3 className="font-semibold text-gray-900 mb-2">
                  📥 Export
                </h3>
                <p className="text-sm text-gray-600">
                  Download or export data to Google Sheets
                </p>
              </div>
            </div>
          </div>
        ) : (
          // Results Screen
          <div className="space-y-6">
            <button
              onClick={() => setSelectedInsights(null)}
              className="inline-flex items-center px-4 py-2 bg-gray-200 text-gray-900 rounded-lg hover:bg-gray-300 font-medium transition"
            >
              ← Back to Search
            </button>

            <FinancialResults insights={selectedInsights} />
            <Analysis insights={selectedInsights} />
            <ExportButton insights={selectedInsights} />
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="bg-gray-100 border-t mt-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 text-center text-gray-600">
          <p>
            Company Insights • Financial Data Platform • Built with Next.js &
            React
          </p>
        </div>
      </footer>
    </div>
  );
}

