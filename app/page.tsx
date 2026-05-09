"use client";

import { useState } from "react";
import CompanySearch from "@/components/CompanySearch";
import CompanyDocuments from "@/components/CompanyDocuments";
import ExportButton from "@/components/ExportButton";
import type { NSEEquity, SelectedDoc } from "@/types/financial";

export default function Home() {
  const [selectedCompany, setSelectedCompany] = useState<NSEEquity | null>(null);
  const [selectedDocs, setSelectedDocs] = useState<SelectedDoc[]>([]);

  const handleSelect = (equity: NSEEquity) => {
    setSelectedCompany(equity);
    setSelectedDocs([]);
  };

  return (
    <div className="min-h-screen bg-[#f5f7fa] font-sans">
      {/* Top nav */}
      <header className="sticky top-0 z-30 bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center justify-between h-14">
          <button
            onClick={() => { setSelectedCompany(null); setSelectedDocs([]); }}
            className="flex items-center gap-2 group"
          >
            <span className="flex items-center justify-center w-8 h-8 rounded-lg bg-blue-600 text-white">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
            </span>
            <span className="font-bold text-gray-900 text-base tracking-tight group-hover:text-blue-600 transition-colors">
              Company Insights
            </span>
          </button>

          {selectedCompany && (
            <div className="flex items-center gap-2 text-sm text-gray-600">
              <span className="hidden sm:block">{selectedCompany.name}</span>
              <span className="font-mono bg-blue-50 text-blue-700 px-2 py-0.5 rounded text-xs font-semibold">
                {selectedCompany.symbol}
              </span>
            </div>
          )}

          <a
            href="https://www.nseindia.com/"
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-gray-400 hover:text-gray-600 transition-colors hidden sm:block"
          >
            Data: NSE India
          </a>
        </div>
      </header>

      {!selectedCompany ? (
        /* Hero / Search screen */
        <main>
          <div className="bg-gradient-to-b from-blue-700 to-blue-500 text-white">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 text-center">
              <div className="inline-flex items-center gap-2 bg-white/20 text-white text-xs font-semibold px-3 py-1 rounded-full mb-6">
                <span className="w-2 h-2 bg-green-300 rounded-full animate-pulse" />
                Live NSE stock list
              </div>
              <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight mb-4">
                NSE Investor Relations,
                <br className="hidden sm:block" /> in one place.
              </h1>
              <p className="text-blue-100 text-lg mb-10 max-w-2xl mx-auto">
                Search any NSE-listed company to access quarterly results, investor presentations,
                concall transcripts, annual reports, and KPI handbooks � then export to Google Sheets.
              </p>
              <CompanySearch onSelect={handleSelect} />
            </div>
          </div>
        </main>
      ) : (
        /* Results screen */
        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
          {/* Company header */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-6 py-5 flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-blue-600 text-white flex items-center justify-center font-bold text-lg shrink-0">
                {selectedCompany.symbol.slice(0, 2)}
              </div>
              <div>
                <h2 className="text-xl font-bold text-gray-900 leading-tight">
                  {selectedCompany.name}
                </h2>
                <div className="flex flex-wrap gap-2 mt-1">
                  <span className="bg-blue-50 text-blue-700 text-xs font-semibold px-2 py-0.5 rounded-full">
                    {selectedCompany.symbol}
                  </span>
                  <span className="bg-gray-100 text-gray-500 text-xs px-2 py-0.5 rounded-full font-mono">
                    {selectedCompany.isin}
                  </span>
                </div>
              </div>
            </div>
            <button
              onClick={() => { setSelectedCompany(null); setSelectedDocs([]); }}
              className="inline-flex items-center gap-1.5 text-sm text-gray-600 hover:text-gray-900 bg-gray-100 hover:bg-gray-200 px-4 py-2 rounded-xl font-medium transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              Search again
            </button>
          </div>

          <CompanyDocuments
            ticker={selectedCompany.symbol}
            companyName={selectedCompany.name}
            onSelectionChange={setSelectedDocs}
          />

          <ExportButton company={selectedCompany} selectedDocs={selectedDocs} />
        </main>
      )}

      <footer className="border-t border-gray-200 bg-white mt-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-gray-400">
          <span>� {new Date().getFullYear()} Company Insights. Built with Next.js.</span>
          <span>
            Stock list sourced from{" "}
            <a
              href="https://www.nseindia.com/"
              className="underline hover:text-gray-600"
              target="_blank"
              rel="noopener noreferrer"
            >
              NSE India
            </a>
            , updated daily.
          </span>
        </div>
      </footer>
    </div>
  );
}
