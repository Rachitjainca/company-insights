"use client";

import { CompanyData, CompanyInsights } from "@/types/financial";
import { fetchCompanyInsights, searchCompanies } from "@/lib/mockData";
import { useState } from "react";

interface CompanySearchProps {
  onSelect: (insights: CompanyInsights) => void;
}

export default function CompanySearch({ onSelect }: CompanySearchProps) {
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<CompanyData[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setQuery(value);
    setError("");

    if (value.length > 0) {
      const results = searchCompanies(value);
      setSuggestions(results);
    } else {
      setSuggestions([]);
    }
  };

  const handleSelectCompany = async (company: CompanyData) => {
    setLoading(true);
    setError("");

    try {
      const insights = await fetchCompanyInsights(company.ticker);
      if (insights) {
        onSelect(insights);
        setQuery("");
        setSuggestions([]);
      } else {
        setError("Failed to fetch company data");
      }
    } catch (err) {
      setError("Error fetching data. Please try again.");
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full max-w-md">
      <div className="relative">
        <input
          type="text"
          value={query}
          onChange={handleInputChange}
          placeholder="Search by ticker or company name (e.g., TCS, INFY)"
          disabled={loading}
          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
        />

        {suggestions.length > 0 && (
          <div className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg">
            {suggestions.map((company) => (
              <button
                key={company.ticker}
                onClick={() => handleSelectCompany(company)}
                disabled={loading}
                className="w-full px-4 py-2 text-left hover:bg-blue-50 border-b last:border-b-0 disabled:bg-gray-100"
              >
                <div className="font-semibold">{company.ticker}</div>
                <div className="text-sm text-gray-600">{company.name}</div>
              </button>
            ))}
          </div>
        )}
      </div>

      {error && (
        <div className="mt-2 text-red-600 text-sm font-medium">{error}</div>
      )}

      {loading && (
        <div className="mt-2 text-blue-600 text-sm font-medium">
          Loading company data...
        </div>
      )}
    </div>
  );
}

