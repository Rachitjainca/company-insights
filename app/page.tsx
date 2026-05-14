"use client";

import { useState } from "react";
import CompanySearch from "@/components/CompanySearch";
import CompanyDocuments from "@/components/CompanyDocuments";
import ExportButton from "@/components/ExportButton";
import CompanyLogo from "@/components/CompanyLogo";
import type { NSEEquity, SelectedDoc } from "@/types/financial";

export default function Home() {
  const [selectedCompany, setSelectedCompany] = useState<NSEEquity | null>(null);
  const [selectedDocs, setSelectedDocs] = useState<SelectedDoc[]>([]);

  const handleSelect = (equity: NSEEquity) => {
    setSelectedCompany(equity);
    setSelectedDocs([]);
  };

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-900">
      {/* Top nav */}
      <header className="sticky top-0 z-30 bg-white/80 backdrop-blur supports-[backdrop-filter]:bg-white/70 border-b border-slate-200/80">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center justify-between h-16">
          <button
            onClick={() => { setSelectedCompany(null); setSelectedDocs([]); }}
            className="flex items-center gap-2.5 group"
          >
            <span className="flex items-center justify-center w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-600 to-blue-600 text-white shadow-sm ring-1 ring-inset ring-white/20">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
            </span>
            <span className="flex flex-col items-start leading-tight">
              <span className="font-semibold text-slate-900 text-[15px] tracking-tight group-hover:text-indigo-700 transition-colors">
                Company Insights
              </span>
              <span className="text-[10px] uppercase tracking-[0.14em] text-slate-400 font-medium">
                NSE / BSE Research
              </span>
            </span>
          </button>

          {selectedCompany && (
            <div className="flex items-center gap-2 text-sm text-slate-600">
              <span className="hidden sm:block max-w-[260px] truncate">{selectedCompany.name}</span>
              <span className="font-mono bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded text-xs font-semibold ring-1 ring-inset ring-indigo-100">
                {selectedCompany.symbol}
              </span>
            </div>
          )}

          <a
            href="https://www.nseindia.com/"
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-slate-400 hover:text-slate-700 transition-colors hidden sm:flex items-center gap-1.5"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
            Live NSE &amp; BSE feeds
          </a>
        </div>
      </header>

      {!selectedCompany ? (
        /* Hero / Search screen */
        <main>
          <div className="relative overflow-hidden bg-gradient-to-br from-slate-900 via-indigo-900 to-blue-900 text-white">
            {/* Subtle grid overlay */}
            <div
              aria-hidden
              className="absolute inset-0 opacity-[0.07]"
              style={{
                backgroundImage:
                  "linear-gradient(to right, white 1px, transparent 1px), linear-gradient(to bottom, white 1px, transparent 1px)",
                backgroundSize: "40px 40px",
              }}
            />
            {/* Glow */}
            <div aria-hidden className="absolute -top-32 -left-24 w-96 h-96 bg-indigo-500/30 rounded-full blur-3xl" />
            <div aria-hidden className="absolute -bottom-32 -right-24 w-96 h-96 bg-blue-500/20 rounded-full blur-3xl" />

            <div className="relative max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 pt-20 pb-24 text-center">
              <div className="inline-flex items-center gap-2 bg-white/10 backdrop-blur-sm ring-1 ring-inset ring-white/15 text-white text-[11px] font-semibold uppercase tracking-[0.14em] px-3 py-1.5 rounded-full mb-7">
                <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-pulse shadow-[0_0_8px_rgba(52,211,153,0.8)]" />
                Live exchange data
              </div>
              <h1 className="font-serif text-5xl sm:text-6xl lg:text-7xl tracking-tight mb-6 [text-wrap:balance] leading-[1.05]">
                Indian-listed company research,
                <br className="hidden sm:block" />
                <span className="italic bg-gradient-to-r from-sky-300 via-indigo-200 to-white bg-clip-text text-transparent">
                  consolidated and exportable.
                </span>
              </h1>
      {/* Hero / Search dropdown placeholder hint */}
              <p className="text-slate-300 text-base sm:text-lg mb-10 max-w-2xl mx-auto leading-relaxed [text-wrap:balance]">
                Search any NSE or BSE-listed company — by ticker <span className="font-mono text-white">TCS</span>, brand name <span className="font-mono text-white">Zomato</span>, or full legal name —
                to retrieve quarterly results, investor presentations, concall transcripts and KPI handbooks.
                Export the underlying financials to Google Sheets in seconds.
              </p>
              <CompanySearch onSelect={handleSelect} />

              {/* Feature pills */}
              <div className="flex flex-wrap justify-center gap-2 mt-9">
                {[
                  "Quarterly Results",
                  "Investor Presentations",
                  "Concall Transcripts",
                  "Annual Reports",
                  "KPI Handbooks",
                ].map((label) => (
                  <span
                    key={label}
                    className="text-[11px] font-medium uppercase tracking-wider px-3 py-1.5 rounded-full bg-white/5 backdrop-blur-sm ring-1 ring-inset ring-white/10 text-slate-200"
                  >
                    {label}
                  </span>
                ))}
              </div>
            </div>
          </div>

          {/* Value props */}
          <section className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 -mt-10 pb-16 relative z-10">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {[
                {
                  title: "Direct from the source",
                  body: "Filings pulled live from NSE and BSE, with XBRL-grade financial data when issuers file in machine-readable form.",
                  icon: (
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
                  ),
                },
                {
                  title: "Sheet-native exports",
                  body: "One-click export to Google Sheets with structured columns, optional XBRL metric extraction, and per-document Google Docs.",
                  icon: (
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M9 17v-2a4 4 0 014-4h4M9 17H5a2 2 0 01-2-2V5a2 2 0 012-2h14a2 2 0 012 2v6m-6 6l3 3m0 0l-3 3m3-3H9" />
                  ),
                },
                {
                  title: "Built for analysts",
                  body: "Multi-quarter selection, source-of-truth links, and content extraction designed for buy-side and sell-side workflows.",
                  icon: (
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M13 10V3L4 14h7v7l9-11h-7z" />
                  ),
                },
              ].map((card) => (
                <div
                  key={card.title}
                  className="bg-white rounded-2xl border border-slate-200/70 shadow-sm hover:shadow-md hover:border-indigo-200 transition-all p-5"
                >
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-50 to-blue-50 text-indigo-600 ring-1 ring-inset ring-indigo-100 flex items-center justify-center mb-4">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      {card.icon}
                    </svg>
                  </div>
                  <h3 className="text-sm font-semibold text-slate-900 mb-1.5 tracking-tight">{card.title}</h3>
                  <p className="text-[13px] text-slate-500 leading-relaxed">{card.body}</p>
                </div>
              ))}
            </div>
          </section>
        </main>
      ) : (
        /* Results screen */
        <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-5">
          <ExportButton company={selectedCompany} selectedDocs={selectedDocs} />

          {/* Company header */}
          <div className="bg-white rounded-2xl border border-slate-200/70 shadow-sm px-6 py-5 flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-4 min-w-0">
              <CompanyLogo
                symbol={selectedCompany.symbol}
                name={selectedCompany.name}
                className="w-14 h-14 rounded-xl"
              />
              <div className="min-w-0">
                <h2 className="font-serif text-2xl sm:text-[26px] text-slate-900 leading-tight truncate tracking-tight">
                  {selectedCompany.name}
                </h2>
                <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                  <span className="bg-indigo-50 text-indigo-700 text-[11px] font-bold px-2 py-0.5 rounded-md ring-1 ring-inset ring-indigo-100">
                    {selectedCompany.symbol}
                  </span>
                  <span className="bg-slate-50 text-slate-500 text-[11px] px-2 py-0.5 rounded-md font-mono ring-1 ring-inset ring-slate-200">
                    {selectedCompany.isin}
                  </span>
                  {selectedDocs.length > 0 && (
                    <span className="bg-indigo-600 text-white text-[11px] font-semibold px-2 py-0.5 rounded-md">
                      {selectedDocs.length} selected
                    </span>
                  )}
                </div>
              </div>
            </div>
            <button
              onClick={() => { setSelectedCompany(null); setSelectedDocs([]); }}
              className="inline-flex items-center gap-1.5 text-sm text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 px-3.5 py-2 rounded-xl font-medium transition-colors shrink-0"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              New search
            </button>
          </div>

          <CompanyDocuments
            key={selectedCompany.symbol}
            ticker={selectedCompany.symbol}
            onSelectionChange={setSelectedDocs}
          />
        </main>
      )}

      <footer className="border-t border-slate-200 bg-white mt-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-500">
          <div className="flex items-center gap-2">
            <span className="flex items-center justify-center w-6 h-6 rounded-md bg-gradient-to-br from-indigo-600 to-blue-600 text-white">
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
            </span>
            <span className="font-medium text-slate-700">Company Insights</span>
            <span className="text-slate-300">·</span>
            <span>&copy; {new Date().getFullYear()}</span>
          </div>
          <div className="flex items-center gap-4 text-slate-400">
            <span>
              Data sourced from{" "}
              <a
                href="https://www.nseindia.com/"
                className="underline decoration-dotted underline-offset-2 hover:text-slate-700"
                target="_blank"
                rel="noopener noreferrer"
              >
                NSE
              </a>
              {" "}and{" "}
              <a
                href="https://www.bseindia.com/"
                className="underline decoration-dotted underline-offset-2 hover:text-slate-700"
                target="_blank"
                rel="noopener noreferrer"
              >
                BSE
              </a>
            </span>
            <span className="hidden sm:inline text-slate-300">·</span>
            <span className="hidden sm:inline">For research purposes only. Not investment advice.</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
