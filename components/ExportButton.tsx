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
    <div className="bg-white rounded-lg shadow p-6 space-y-4">
      <h3 className="text-lg font-semibold mb-4">Export Data</h3>

      <div className="space-y-3">
        <button
          onClick={handleExportToSheets}
          disabled={loading}
          className="w-full px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-blue-400 disabled:cursor-not-allowed font-medium transition flex items-center justify-center gap-2"
        >
          {loading ? (
            <>
              <span className="animate-spin">⚙️</span>
              {isAuthenticated ? "Creating Sheet..." : "Authorizing..."}
            </>
          ) : (
            <>
              {isAuthenticated ? "📊 Export to Google Sheets" : "🔑 Authorize Google Sheets"}
            </>
          )}
        </button>

        <button
          onClick={handleDownloadCSV}
          disabled={loading}
          className="w-full px-4 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:bg-green-400 disabled:cursor-not-allowed font-medium transition"
        >
          📥 Download as CSV
        </button>
      </div>

      {message && (
        <div
          className={`p-4 rounded text-sm font-medium transition-all ${
            showSuccessMessage
              ? "bg-green-50 text-green-800 border border-green-200"
              : "bg-red-50 text-red-800 border border-red-200"
          }`}
        >
          <div className="flex items-center justify-between gap-2">
            <span>{message}</span>
            {sheetUrl && (
              <a
                href={sheetUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="underline font-semibold hover:opacity-75"
              >
                View Sheet ↗
              </a>
            )}
          </div>
        </div>
      )}

      {error && (
        <div className="p-3 bg-yellow-50 rounded text-sm text-yellow-800 border border-yellow-200">
          <p className="font-medium">Error:</p>
          <p>{error}</p>
        </div>
      )}

      <div className="p-3 bg-blue-50 rounded text-sm text-gray-700 border border-blue-200">
        <p className="font-medium mb-2">How to use:</p>
        <ol className="list-decimal list-inside space-y-1">
          <li>
            {isAuthenticated
              ? "Click 'Export to Google Sheets' to create a new sheet"
              : "Click 'Authorize Google Sheets' to connect your account"}
          </li>
          <li>
            {isAuthenticated
              ? "The data will be automatically created in a new Google Sheet"
              : "Follow the Google login flow"}
          </li>
          <li>
            {isAuthenticated
              ? "Click 'View Sheet ↗' to open it in Google Sheets"
              : "After authorizing, you can export your data"}
          </li>
        </ol>
      </div>
    </div>
  );
}
