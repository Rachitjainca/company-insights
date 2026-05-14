"use client";

import type { NSEEquity, SelectedDoc } from "@/types/financial";
import { useGoogleSheets } from "@/lib/useGoogleSheets";
import { useState, useEffect } from "react";

interface ExportButtonProps {
  company: NSEEquity;
  selectedDocs: SelectedDoc[];
}

// ─── Toggle switch card ───────────────────────────────────────────────────────

function ToggleCard({
  checked,
  onChange,
  label,
  description,
  disabled = false,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  description?: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={() => !disabled && onChange(!checked)}
      disabled={disabled}
      className={`flex items-start gap-3 w-full p-3.5 rounded-xl border text-left transition-all ${
        checked
          ? "bg-blue-50 border-blue-300 shadow-sm"
          : "bg-white border-gray-200 hover:border-gray-300"
      } ${disabled ? "opacity-40 cursor-not-allowed" : "cursor-pointer"}`}
    >
      {/* Pill toggle */}
      <div
        className={`relative flex-none mt-0.5 w-9 h-5 rounded-full transition-colors duration-200 ${
          checked ? "bg-blue-600" : "bg-gray-300"
        }`}
      >
        <span
          className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform duration-200 ${
            checked ? "translate-x-4" : "translate-x-0.5"
          }`}
        />
      </div>
      <div className="min-w-0">
        <div className="text-sm font-semibold text-gray-900 leading-tight">{label}</div>
        {description && (
          <div className="text-xs text-gray-400 mt-0.5 leading-relaxed">{description}</div>
        )}
      </div>
    </button>
  );
}

export default function ExportButton({ company, selectedDocs }: ExportButtonProps) {
  const { isAuthenticated, loading, error, initiateAuth, exportToSheets } =
    useGoogleSheets();
  const [message, setMessage] = useState("");
  const [sheetUrl, setSheetUrl] = useState("");
  const [showSuccess, setShowSuccess] = useState(false);
  const [xbrlMode, setXbrlMode] = useState(false);
  const [includeContent, setIncludeContent] = useState(true);

  // Whether any selected doc has an XBRL URL and is a quarterly result
  const hasXbrlDocs = selectedDocs.some(
    (d) => d.xbrlUrl && d.category === "quarterly-results"
  );

  useEffect(() => {
    if (!message) return;
    const t = setTimeout(() => { setMessage(""); setShowSuccess(false); }, 5000);
    return () => clearTimeout(t);
  }, [message]);

  // Derive a safe mode so stale toggle state cannot leak into requests.
  const effectiveXbrlMode = hasXbrlDocs ? xbrlMode : false;

  const handleExport = async () => {
    setMessage("");
    setShowSuccess(false);

    if (!isAuthenticated) {
      initiateAuth();
      return;
    }

    try {
      const result = await exportToSheets({
        company,
        documents: selectedDocs,
        exportMode: effectiveXbrlMode ? "xbrl" : "metadata",
        createGoogleDocs: true,
        includeContent: effectiveXbrlMode ? false : includeContent,
      });
      if (result.success) {
        setSheetUrl(result.sheetUrl ?? "");
        setMessage(`✓ ${result.message}`);
        setShowSuccess(true);
      }
    } catch (err) {
      setMessage(`✗ ${err instanceof Error ? err.message : "Export failed"}`);
    }
  };

  const disabled = loading || selectedDocs.length === 0;

  return (
    <div className="bg-white rounded-2xl border border-slate-200/70 shadow-sm p-6">
      <div className="flex items-start justify-between gap-4 mb-5">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="flex items-center justify-center w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 ring-1 ring-inset ring-emerald-100">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2a4 4 0 014-4h4M9 17H5a2 2 0 01-2-2V5a2 2 0 012-2h14a2 2 0 012 2v6m-6 6l3 3m0 0l-3 3m3-3H9" />
              </svg>
            </span>
            <h3 className="font-semibold text-slate-900 tracking-tight">Export to Google Sheets</h3>
          </div>
          <p className="text-xs text-slate-500 mt-1.5 leading-relaxed">
            {selectedDocs.length === 0
              ? "Select one or more documents below to enable export. A new spreadsheet will be created in your Google Drive."
              : `Ready to export ${selectedDocs.length} document${selectedDocs.length !== 1 ? "s" : ""} — a new spreadsheet will be created in your Google Drive.`}
          </p>
        </div>
        {selectedDocs.length > 0 && (
          <span className="flex-none inline-flex items-center justify-center min-w-[28px] h-7 px-2 rounded-full bg-indigo-600 text-white text-xs font-semibold">
            {selectedDocs.length}
          </span>
        )}
      </div>

      {/* Export options */}
      {selectedDocs.length > 0 && (
        <div className="space-y-2 mb-4">
          {hasXbrlDocs && (
            <ToggleCard
              checked={xbrlMode}
              onChange={setXbrlMode}
              label="Export XBRL financial data"
              description="Parse Reg 33 Ind-AS XBRL files — writes Revenue, PAT, EPS and other metrics as columns instead of document links."
            />
          )}
          {!effectiveXbrlMode && (
            <ToggleCard
              checked={includeContent}
              onChange={setIncludeContent}
              label="Include extracted content in Sheet"
              description="Adds financial and KPI text extracted from each file into a content column in Google Sheets."
            />
          )}
          {!effectiveXbrlMode && (
            <div className="px-3.5 py-3 rounded-xl border border-slate-200 bg-slate-50 text-xs text-slate-600 leading-relaxed">
              {includeContent
                ? "Each row in the sheet will include the source URL, a generated Google Doc URL, and the extracted financial / KPI text. Best for offline review and downstream analysis."
                : "Each row in the sheet will include the source URL and a generated Google Doc URL. The Doc is populated with extracted financial and KPI tables when available — ideal for lighter exports."}
            </div>
          )}
        </div>
      )}

      <button
        onClick={handleExport}
        disabled={disabled}
        title={selectedDocs.length === 0 ? "Select documents to export" : undefined}
        className="w-full inline-flex items-center justify-center gap-2 px-5 py-3 bg-gradient-to-br from-indigo-600 to-blue-600 text-white rounded-xl hover:from-indigo-700 hover:to-blue-700 active:from-indigo-800 active:to-blue-800 disabled:opacity-50 disabled:cursor-not-allowed disabled:from-slate-400 disabled:to-slate-400 font-semibold text-sm transition-all shadow-sm hover:shadow ring-1 ring-inset ring-white/10"
      >
        {loading ? (
          <>
            <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
            </svg>
            {isAuthenticated ? "Creating Sheet…" : "Authorising…"}
          </>
        ) : !isAuthenticated ? (
          <>
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
            </svg>
            Connect Google Sheets
          </>
        ) : effectiveXbrlMode ? (
          <>
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
            Export XBRL to Sheets
          </>
        ) : includeContent ? (
          <>
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6l4 2m5-2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            Export Content + Docs to Sheets
          </>
        ) : (
          <>
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            Export Links + Docs to Sheets
          </>
        )}
      </button>

      {message && (
        <div
          className={`mt-4 flex items-center justify-between gap-3 px-4 py-3 rounded-xl text-sm font-medium ${
            showSuccess
              ? "bg-green-50 text-green-800 border border-green-200"
              : "bg-red-50 text-red-800 border border-red-200"
          }`}
        >
          <span>{message}</span>
          {sheetUrl && (
            <a
              href={sheetUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="underline font-semibold hover:opacity-75 whitespace-nowrap"
            >
              View Sheet ↗
            </a>
          )}
        </div>
      )}

      {error && !message && (
        <div className="mt-4 px-4 py-3 bg-amber-50 rounded-xl text-sm text-amber-800 border border-amber-200">
          {error}
        </div>
      )}

      {!isAuthenticated && (
        <p className="mt-3 text-xs text-slate-400">
          Requires a one-time Google authorisation. We only request access to create the spreadsheet and Doc — no other Drive files are read.
        </p>
      )}
    </div>
  );
}
