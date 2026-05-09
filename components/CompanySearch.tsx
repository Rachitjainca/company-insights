"use client";

import { useEffect, useRef, useState } from "react";
import { CompanyInsights } from "@/types/financial";
import { fetchCompanyInsights } from "@/lib/mockData";

interface NSEEquity {
  symbol: string;
  name: string;
  isin: string;
}

interface CompanySearchProps {
  onSelect: (insights: CompanyInsights) => void;
}

function highlight(text: string, query: string) {
  if (!query) return text;
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return text;
  return (
    <>
      {text.slice(0, idx)}
      <mark className="bg-blue-100 text-blue-800 rounded px-0.5">
        {text.slice(idx, idx + query.length)}
      </mark>
      {text.slice(idx + query.length)}
    </>
  );
}

export default function CompanySearch({ onSelect }: CompanySearchProps) {
  const [query, setQuery] = useState("");
  const [equities, setEquities] = useState<NSEEquity[]>([]);
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState("");
  const [suggestions, setSuggestions] = useState<NSEEquity[]>([]);
  const [highlighted, setHighlighted] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Fetch NSE list once on mount
  useEffect(() => {
    fetch("/api/nse/equities")
      .then((r) => r.json())
      .then((data) => {
        if (data.equities) setEquities(data.equities);
        else setListError("Could not load stock list");
      })
      .catch(() => setListError("Could not load stock list"))
      .finally(() => setListLoading(false));
  }, []);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node) &&
        inputRef.current &&
        !inputRef.current.contains(e.target as Node)
      ) {
        setSuggestions([]);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const handleInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setQuery(val);
    setError("");
    setHighlighted(0);
    if (val.trim().length < 1) {
      setSuggestions([]);
      return;
    }
    const q = val.trim().toLowerCase();
    const matches = equities
      .filter(
        (s) =>
          s.symbol.toLowerCase().startsWith(q) ||
          s.name.toLowerCase().includes(q)
      )
      .slice(0, 10);
    setSuggestions(matches);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!suggestions.length) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlighted((h) => Math.min(h + 1, suggestions.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlighted((h) => Math.max(h - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      selectEquity(suggestions[highlighted]);
    } else if (e.key === "Escape") {
      setSuggestions([]);
    }
  };

  const selectEquity = async (equity: NSEEquity) => {
    setLoading(true);
    setError("");
    setSuggestions([]);
    setQuery(equity.symbol);
    try {
      const insights = await fetchCompanyInsights(equity.symbol, equity.name);
      if (insights) {
        onSelect(insights);
        setQuery("");
      } else {
        setError(`No financial data available for ${equity.symbol} yet.`);
      }
    } catch {
      setError("Error fetching data. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full max-w-2xl mx-auto">
      <div className="relative">
        {/* Search icon */}
        <div className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none">
          {loading ? (
            <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
            </svg>
          ) : (
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
            </svg>
          )}
        </div>

        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={handleInput}
          onKeyDown={handleKeyDown}
          disabled={loading}
          placeholder={
            listLoading
              ? "Loading NSE stock list…"
              : listError
              ? "Stock list unavailable"
              : "Search by symbol or company name (e.g. TCS, RELIANCE, PAYTM)"
          }
          className="w-full pl-12 pr-4 py-4 text-base border-2 border-gray-200 rounded-2xl shadow-sm focus:outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100 disabled:bg-gray-50 disabled:cursor-not-allowed transition-all bg-white"
          autoComplete="off"
          aria-autocomplete="list"
          aria-haspopup="listbox"
        />

        {query && !loading && (
          <button
            onClick={() => { setQuery(""); setSuggestions([]); }}
            className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}

        {/* Dropdown */}
        {suggestions.length > 0 && (
          <div
            ref={dropdownRef}
            role="listbox"
            className="absolute z-20 w-full mt-2 bg-white border border-gray-200 rounded-2xl shadow-xl overflow-hidden"
          >
            {suggestions.map((s, idx) => (
              <button
                key={s.symbol}
                role="option"
                aria-selected={idx === highlighted}
                onMouseEnter={() => setHighlighted(idx)}
                onClick={() => selectEquity(s)}
                className={`w-full flex items-center gap-4 px-5 py-3 text-left transition-colors ${
                  idx === highlighted ? "bg-blue-50" : "hover:bg-gray-50"
                } ${idx < suggestions.length - 1 ? "border-b border-gray-100" : ""}`}
              >
                <span className="inline-flex items-center justify-center w-12 h-8 rounded-lg bg-blue-600 text-white text-xs font-bold shrink-0">
                  {s.symbol.slice(0, 4)}
                </span>
                <div className="min-w-0">
                  <div className="font-semibold text-gray-900 text-sm">
                    {highlight(s.symbol, query)}
                  </div>
                  <div className="text-xs text-gray-500 truncate">
                    {highlight(s.name, query)}
                  </div>
                </div>
                <span className="ml-auto text-xs text-gray-400 font-mono shrink-0">
                  {s.isin}
                </span>
              </button>
            ))}
            <div className="px-5 py-2 bg-gray-50 border-t border-gray-100 text-xs text-gray-400">
              {equities.length.toLocaleString()} NSE-listed equities • use ↑↓ to navigate
            </div>
          </div>
        )}
      </div>

      {error && (
        <div className="mt-3 flex items-center gap-2 text-red-600 text-sm font-medium bg-red-50 border border-red-200 rounded-xl px-4 py-2">
          <svg className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          {error}
        </div>
      )}

      {listError && !error && (
        <div className="mt-2 text-xs text-amber-600">{listError} — manual search unavailable</div>
      )}
    </div>
  );
}
