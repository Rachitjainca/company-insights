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
                Live NSE + BSE data
              </div>
              <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight mb-4">
                NSE Investor Relations,
                <br className="hidden sm:block" /> in one place.
              </h1>
              <p className="text-blue-100 text-lg mb-8 max-w-2xl mx-auto">
                Search any NSE-listed company to instantly access IR documents across 5 categories
                — then export to Google Sheets with one click.
              </p>
              <CompanySearch onSelect={handleSelect} />

              {/* Feature pills */}
              <div className="flex flex-wrap justify-center gap-2.5 mt-8">
                {[
                  { label: "Quarterly Results", color: "bg-blue-500/30 text-blue-100" },
                  { label: "Investor Presentations", color: "bg-violet-500/30 text-violet-100" },
                  { label: "Concall Transcripts", color: "bg-amber-500/30 text-amber-100" },
                  { label: "Annual Reports", color: "bg-emerald-500/30 text-emerald-100" },
                  { label: "KPI Handbooks", color: "bg-rose-500/30 text-rose-100" },
                ].map(({ label, color }) => (
                  <span key={label} className={`text-xs font-semibold px-3 py-1.5 rounded-full ${color}`}>
                    {label}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </main>
      ) : (
        /* Results screen */
        <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-5">
          {/* Company header */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-6 py-4 flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-4 min-w-0">
              <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-blue-500 to-blue-700 text-white flex items-center justify-center font-black text-sm shrink-0 shadow-sm">
                {selectedCompany.symbol.slice(0, 2)}
              </div>
              <div className="min-w-0">
                <h2 className="text-lg font-bold text-gray-900 leading-tight truncate">
                  {selectedCompany.name}
                </h2>
                <div className="flex flex-wrap gap-1.5 mt-1">
                  <span className="bg-blue-50 text-blue-700 text-[11px] font-bold px-2 py-0.5 rounded-full border border-blue-100">
                    {selectedCompany.symbol}
                  </span>
                  <span className="bg-gray-50 text-gray-500 text-[11px] px-2 py-0.5 rounded-full font-mono border border-gray-100">
                    {selectedCompany.isin}
                  </span>
                  {selectedDocs.length > 0 && (
                    <span className="bg-blue-600 text-white text-[11px] font-bold px-2 py-0.5 rounded-full">
                      {selectedDocs.length} selected
                    </span>
                  )}
                </div>
              </div>
            </div>
            <button
              onClick={() => { setSelectedCompany(null); setSelectedDocs([]); }}
              className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900 bg-gray-100 hover:bg-gray-200 px-3 py-2 rounded-xl font-medium transition-colors shrink-0"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              Search again
            </button>
          </div>

          <ExportButton company={selectedCompany} selectedDocs={selectedDocs} />

          <CompanyDocuments
            key={selectedCompany.symbol}
            ticker={selectedCompany.symbol}
            onSelectionChange={setSelectedDocs}
          />
        </main>
      )}

      <footer className="border-t border-gray-200 bg-white mt-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-gray-400">
          <span>(c) {new Date().getFullYear()} Company Insights. Built with Next.js.</span>
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
