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
  const [createGoogleDocs, setCreateGoogleDocs] = useState(true);

  // Whether any selected doc has an XBRL URL and is a quarterly result
  const hasXbrlDocs = selectedDocs.some(
    (d) => d.xbrlUrl && d.category === "quarterly-results"
  );

  useEffect(() => {
    if (!message) return;
    const t = setTimeout(() => { setMessage(""); setShowSuccess(false); }, 5000);
    return () => clearTimeout(t);
  }, [message]);

  useEffect(() => {
    // Guard against stale toggle state when selection changes.
    if (!hasXbrlDocs && xbrlMode) setXbrlMode(false);
  }, [hasXbrlDocs, xbrlMode]);

  useEffect(() => {
    if (!includeContent && createGoogleDocs) {
      setCreateGoogleDocs(false);
    }
  }, [includeContent, createGoogleDocs]);

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
        exportMode: xbrlMode ? "xbrl" : "metadata",
        includeContent,
        createGoogleDocs,
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
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
      <div className="flex items-start justify-between gap-4 mb-4">
        <div>
          <h3 className="font-semibold text-gray-900">Export to Google Sheets</h3>
          <p className="text-xs text-gray-400 mt-0.5">
            {selectedDocs.length === 0
              ? "Select documents above to enable export."
              : `${selectedDocs.length} document${selectedDocs.length !== 1 ? "s" : ""} selected`}
          </p>
        </div>
        {selectedDocs.length > 0 && (
          <span className="flex-none inline-flex items-center justify-center w-7 h-7 rounded-full bg-blue-600 text-white text-xs font-bold">
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
          {!xbrlMode && (
            <ToggleCard
              checked={includeContent}
              onChange={setIncludeContent}
              label="Include file content (not just URLs)"
              description="Extracts text from each selected file (HTML/XML/TXT) and writes it into the sheet."
            />
          )}
          {!xbrlMode && includeContent && (
            <ToggleCard
              checked={createGoogleDocs}
              onChange={setCreateGoogleDocs}
              label="Also create a Google Doc per file"
              description="Stores full extracted text in separate Google Docs and adds the doc links in your sheet."
            />
          )}
        </div>
      )}

      <button
        onClick={handleExport}
        disabled={disabled}
        title={selectedDocs.length === 0 ? "Select documents to export" : undefined}
        className="w-full inline-flex items-center justify-center gap-2 px-5 py-3 bg-blue-600 text-white rounded-xl hover:bg-blue-700 active:bg-blue-800 disabled:opacity-50 disabled:cursor-not-allowed font-semibold text-sm transition-colors shadow-sm"
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
        ) : xbrlMode ? (
          <>
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
            Export XBRL to Sheets
          </>
        ) : (
          <>
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            {includeContent ? "Export with Content to Sheets" : "Export Links to Sheets"}
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
        <p className="mt-3 text-xs text-gray-400">
          Requires a one-time Google OAuth authorisation.
        </p>
      )}
    </div>
  );
}
