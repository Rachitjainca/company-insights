"use client";

import { CompanyInsights } from "@/types/financial";
import { useGoogleSheets } from "@/lib/useGoogleSheets";
import { useState, useEffect } from "react";

interface ExportButtonProps {
  insights: CompanyInsights;
}

export default function ExportButton({ insights }: ExportButtonProps) {
  const { isAuthenticated, loading, error, initiateAuth, exportToSheets } =
    useGoogleSheets();
  const [message, setMessage] = useState("");
  const [sheetUrl, setSheetUrl] = useState("");
  const [showSuccessMessage, setShowSuccessMessage] = useState(false);

  useEffect(() => {
    // Clear message after 5 seconds
    if (message) {
      const timer = setTimeout(() => {
        setMessage("");
        setShowSuccessMessage(false);
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [message]);

  const handleExportToSheets = async () => {
    setMessage("");
    setShowSuccessMessage(false);

    try {
      if (!isAuthenticated) {
        initiateAuth();
        return;
      }

      // Prepare data for export
      const data = {
        company: insights.company,
        financialResults: insights.financialResults,
        presentations: insights.presentations,
        transcripts: insights.transcripts,
      };

      const result = await exportToSheets(data);

      if (result.success) {
        setSheetUrl(result.sheetUrl);
        setMessage(`✓ ${result.message}`);
        setShowSuccessMessage(true);
      }
    } catch (err) {
      const errorMsg =
        err instanceof Error ? err.message : "Export failed";
      setMessage(`✗ ${errorMsg}`);
    }
  };

  const handleDownloadCSV = () => {
    const headers = [
      "Company",
      "Ticker",
      "Quarter",
      "Year",
      "Revenue",
      "Net Income",
      "EPS",
      "ROE",
      "ROA",
      "Debt/Equity",
    ];

    const rows = insights.financialResults.map((result) => [
      insights.company.name,
      insights.company.ticker,
      result.quarter,
      result.year,
      result.revenue,
      result.netIncome,
      result.eps,
      result.roe,
      result.roa,
      result.debtToEquity,
    ]);

    const csv = [
      headers.join(","),
      ...rows.map((row) => row.join(",")),
    ].join("\n");

    const blob = new Blob([csv], { type: "text/csv" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${insights.company.ticker}_financial_data.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
      <h3 className="font-semibold text-gray-900 mb-4">Export Data</h3>

      <div className="flex flex-col sm:flex-row gap-3">
        <button
          onClick={handleExportToSheets}
          disabled={loading}
          className="flex-1 inline-flex items-center justify-center gap-2 px-5 py-3 bg-blue-600 text-white rounded-xl hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed font-semibold text-sm transition-colors"
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
            <>📊 Export to Google Sheets</>
          ) : (
            <>🔑 Connect Google Sheets</>
          )}
        </button>

        <button
          onClick={handleDownloadCSV}
          disabled={loading || insights.financialResults.length === 0}
          className="flex-1 inline-flex items-center justify-center gap-2 px-5 py-3 bg-gray-100 text-gray-800 rounded-xl hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed font-semibold text-sm transition-colors"
        >
          📥 Download CSV
        </button>
      </div>

      {message && (
        <div
          className={`mt-4 flex items-center justify-between gap-3 px-4 py-3 rounded-xl text-sm font-medium ${
            showSuccessMessage
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

      {error && (
        <div className="mt-4 px-4 py-3 bg-amber-50 rounded-xl text-sm text-amber-800 border border-amber-200">
          {error}
        </div>
      )}

      {!isAuthenticated && (
        <p className="mt-3 text-xs text-gray-400">
          Google Sheets export requires a one-time OAuth authorisation. CSV download works without any login.
        </p>
      )}
    </div>
  );
}
