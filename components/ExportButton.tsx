"use client";

import type { NSEEquity, SelectedDoc } from "@/types/financial";
import { useGoogleSheets } from "@/lib/useGoogleSheets";
import { useState, useEffect } from "react";

interface ExportButtonProps {
  company: NSEEquity;
  selectedDocs: SelectedDoc[];
}

export default function ExportButton({ company, selectedDocs }: ExportButtonProps) {
  const { isAuthenticated, loading, error, initiateAuth, exportToSheets } =
    useGoogleSheets();
  const [message, setMessage] = useState("");
  const [sheetUrl, setSheetUrl] = useState("");
  const [showSuccess, setShowSuccess] = useState(false);
  const [xbrlMode, setXbrlMode] = useState(false);

  // Whether any selected doc has an XBRL URL and is a quarterly result
  const hasXbrlDocs = selectedDocs.some(
    (d) => d.xbrlUrl && d.category === "quarterly-results"
  );

  useEffect(() => {
    if (!message) return;
    const t = setTimeout(() => { setMessage(""); setShowSuccess(false); }, 5000);
    return () => clearTimeout(t);
  }, [message]);

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
      <h3 className="font-semibold text-gray-900 mb-1">Export to Google Sheets</h3>
      <p className="text-xs text-gray-400 mb-4">
        {selectedDocs.length === 0
          ? "Select documents above to enable export."
          : `${selectedDocs.length} document${selectedDocs.length !== 1 ? "s" : ""} selected.`}
      </p>

      {/* XBRL mode toggle — only shown when quarterly results with XBRL are selected */}
      {hasXbrlDocs && (
        <label className="flex items-start gap-2 mb-4 cursor-pointer group">
          <input
            type="checkbox"
            checked={xbrlMode}
            onChange={(e) => setXbrlMode(e.target.checked)}
            className="mt-0.5 h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
          />
          <span className="text-sm text-gray-700 group-hover:text-gray-900 leading-snug">
            <span className="font-medium">Export XBRL financial data</span>
            <span className="block text-xs text-gray-400 mt-0.5">
              Parse Regulation 33 Ind-AS XBRL files and write structured financial metrics as columns
              (Revenue, PAT, EPS, etc.) instead of document URLs.
            </span>
          </span>
        </label>
      )}

      <button
        onClick={handleExport}
        disabled={disabled}
        title={selectedDocs.length === 0 ? "Select documents to export" : undefined}
        className="inline-flex items-center justify-center gap-2 px-5 py-3 bg-blue-600 text-white rounded-xl hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed font-semibold text-sm transition-colors"
      >
        {loading ? (
          <>
            <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
            </svg>
            {isAuthenticated ? "Creating Sheet…" : "Authorising…"}
          </>
        ) : isAuthenticated ? (
          <>{xbrlMode ? "📊 Export XBRL to Sheets" : "📊 Export to Google Sheets"}</>
        ) : (
          <>🔑 Connect Google Sheets</>
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
