"use client";

import { CompanyInsights } from "@/types/financial";
import { useState } from "react";

interface ExportButtonProps {
  insights: CompanyInsights;
}

export default function ExportButton({ insights }: ExportButtonProps) {
  const [exporting, setExporting] = useState(false);
  const [message, setMessage] = useState("");

  const handleExportToSheets = async () => {
    setExporting(true);
    setMessage("");

    try {
      // Prepare data for export
      const data = {
        company: insights.company,
        financialResults: insights.financialResults,
        presentations: insights.presentations,
        transcripts: insights.transcripts,
      };

      // In a real implementation, this would call an API endpoint
      // that authenticates with Google Sheets API and creates/updates a spreadsheet
      console.log("Exporting data:", data);

      // Simulate API call
      await new Promise((resolve) => setTimeout(resolve, 1000));

      setMessage(
        "✓ Data prepared for export! In production, this would create a Google Sheet."
      );
    } catch (error) {
      console.error("Export error:", error);
      setMessage("✗ Failed to prepare export data");
    } finally {
      setExporting(false);
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
    <div className="bg-white rounded-lg shadow p-6">
      <h3 className="text-lg font-semibold mb-4">Export Data</h3>

      <div className="space-y-3">
        <button
          onClick={handleExportToSheets}
          disabled={exporting}
          className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-blue-400 font-medium transition"
        >
          {exporting ? "Exporting..." : "Export to Google Sheets"}
        </button>

        <button
          onClick={handleDownloadCSV}
          disabled={exporting}
          className="w-full px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:bg-green-400 font-medium transition"
        >
          Download as CSV
        </button>
      </div>

      {message && (
        <div
          className={`mt-4 p-3 rounded text-sm font-medium ${
            message.startsWith("✓")
              ? "bg-green-50 text-green-800"
              : "bg-red-50 text-red-800"
          }`}
        >
          {message}
        </div>
      )}

      <div className="mt-4 p-3 bg-yellow-50 rounded text-sm text-gray-700">
        <p className="font-medium mb-2">Note:</p>
        <p>
          To enable Google Sheets export, you will need to:
        </p>
        <ol className="list-decimal list-inside mt-2 space-y-1">
          <li>Create a Google Cloud project</li>
          <li>Enable Google Sheets API</li>
          <li>Set up OAuth2 authentication</li>
          <li>Configure environment variables</li>
        </ol>
      </div>
    </div>
  );
}

