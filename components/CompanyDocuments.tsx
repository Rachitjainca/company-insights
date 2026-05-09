"use client";

import { useEffect, useState } from "react";
import type { CompanyDocumentsBundle, PeriodDocuments } from "@/lib/scrapers/types";

interface CompanyDocumentsProps {
  ticker: string;
}

type LoadState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; data: CompanyDocumentsBundle };

const TYPE_STYLE: Record<string, string> = {
  pdf:   "bg-red-50 text-red-700 border-red-200 hover:bg-red-100",
  xlsx:  "bg-green-50 text-green-700 border-green-200 hover:bg-green-100",
  docx:  "bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100",
  audio: "bg-purple-50 text-purple-700 border-purple-200 hover:bg-purple-100",
};
const TYPE_ICON: Record<string, string> = {
  pdf: "📄", xlsx: "📊", docx: "📝", audio: "🎧",
};

function PeriodCard({ period }: { period: PeriodDocuments }) {
  const [open, setOpen] = useState(true);
  const heading = period.quarter
    ? `${period.fiscalYear} · ${period.quarter}`
    : period.fiscalYear;
  return (
    <div className="border border-gray-100 rounded-2xl overflow-hidden bg-white shadow-sm">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-5 py-3 bg-gray-50 hover:bg-gray-100 transition-colors"
      >
        <span className="font-semibold text-gray-900 text-sm">{heading}</span>
        <svg
          className={`w-4 h-4 text-gray-400 transition-transform ${open ? "rotate-180" : ""}`}
          fill="none" stroke="currentColor" viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && (
        <ul className="divide-y divide-gray-50">
          {period.documents.map((doc) => (
            <li key={doc.categoryKey} className="flex flex-wrap items-center gap-3 px-5 py-3">
              <span className="text-xs text-gray-600 font-medium min-w-[160px]">{doc.category}</span>
              <div className="flex flex-wrap gap-1.5">
                {doc.links.map((link, i) => {
                  const style = TYPE_STYLE[link.type] ?? "bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100";
                  const icon = TYPE_ICON[link.type] ?? "🔗";
                  return (
                    <a
                      key={`${link.url}-${i}`}
                      href={link.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={`inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold border rounded-lg transition ${style}`}
                    >
                      <span>{icon}</span>{link.label}
                    </a>
                  );
                })}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function CompanyDocuments({ ticker }: CompanyDocumentsProps) {
  const [state, setState] = useState<LoadState>({ status: "idle" });
  const [activeSection, setActiveSection] = useState<"quarterly" | "annual">("quarterly");

  useEffect(() => {
    let cancelled = false;
    setState({ status: "loading" });
    fetch(`/api/companies/${encodeURIComponent(ticker)}/documents`, { cache: "no-store" })
      .then(async (res) => {
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error((body && body.error) || `HTTP ${res.status}`);
        if (!cancelled) setState({ status: "ready", data: body as CompanyDocumentsBundle });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setState({ status: "error", message: err instanceof Error ? err.message : "Unknown error" });
      });
    return () => { cancelled = true; };
  }, [ticker]);

  if (state.status === "idle" || state.status === "loading") {
    return (
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 flex items-center gap-3">
        <svg className="animate-spin h-5 w-5 text-blue-500" viewBox="0 0 24 24" fill="none">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
        </svg>
        <span className="text-gray-600 text-sm">Loading investor documents from IR site…</span>
      </div>
    );
  }

  if (state.status === "error") {
    return (
      <div className="bg-white rounded-2xl border border-amber-200 shadow-sm p-6">
        <div className="flex items-center gap-2 text-amber-700 font-semibold mb-1">
          <span>⚠️</span> Investor Documents unavailable
        </div>
        <p className="text-sm text-gray-500">{state.message}</p>
        <p className="text-xs text-gray-400 mt-2">IR scraper is currently registered for PAYTM only. More companies coming soon.</p>
      </div>
    );
  }

  const { data } = state;
  const hasQ = data.financialResults.length > 0;
  const hasA = data.annualReports.length > 0;
  const sections: { key: "quarterly" | "annual"; label: string; count: number }[] = [
    { key: "quarterly", label: "Quarterly Disclosures", count: data.financialResults.length },
    { key: "annual",    label: "Annual Reports",        count: data.annualReports.length },
  ];

  const periods = activeSection === "quarterly" ? data.financialResults : data.annualReports;

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      {/* Header */}
      <div className="px-6 py-4 border-b border-gray-100 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="font-semibold text-gray-900">Investor Documents</h3>
          <p className="text-xs text-gray-400 mt-0.5">
            {data.companyName} · fetched {new Date(data.fetchedAt).toLocaleString()}
          </p>
        </div>
        <div className="flex gap-2 text-xs">
          {data.source.financialResults && (
            <a href={data.source.financialResults} target="_blank" rel="noopener noreferrer"
               className="text-blue-500 hover:underline">IR site ↗</a>
          )}
        </div>
      </div>

      {/* Section tabs */}
      <div className="flex border-b border-gray-100 bg-gray-50">
        {sections.map((s) => (
          <button
            key={s.key}
            onClick={() => setActiveSection(s.key)}
            className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
              activeSection === s.key
                ? "border-b-2 border-blue-600 text-blue-600 bg-white"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            {s.label}
            <span className={`ml-1.5 text-xs px-1.5 py-0.5 rounded-full ${
              activeSection === s.key ? "bg-blue-100 text-blue-600" : "bg-gray-200 text-gray-500"
            }`}>
              {s.count}
            </span>
          </button>
        ))}
      </div>

      {/* Period cards */}
      <div className="p-4 space-y-3">
        {periods.length > 0 ? (
          periods.map((p) => (
            <PeriodCard key={`${p.fiscalYear}-${p.quarter}`} period={p} />
          ))
        ) : (
          <p className="text-sm text-gray-400 text-center py-8">
            {activeSection === "quarterly" && !hasQ ? "No quarterly documents found." : ""}
            {activeSection === "annual" && !hasA ? "No annual documents found." : ""}
          </p>
        )}
      </div>
    </div>
  );
}
