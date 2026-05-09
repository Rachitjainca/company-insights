"use client";

import { useEffect, useState, useCallback } from "react";
import type { IRCategory, IRDocument, SelectedDoc, DocumentLinkType } from "@/types/financial";

interface IRDocsResponse {
  ticker: string;
  companyName: string;
  bseCode: string | null;
  documents: Record<IRCategory, IRDocument[]>;
  totalCount: number;
  fetchedAt: string;
}

interface CompanyDocumentsProps {
  ticker: string;
  companyName: string;
  onSelectionChange: (selected: SelectedDoc[]) => void;
}

type LoadState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; data: IRDocsResponse };

// ─── Category meta ────────────────────────────────────────────────────────────

const CATEGORIES: Array<{ key: IRCategory; label: string; icon: string }> = [
  { key: "quarterly-results",     label: "Quarterly Results",          icon: "📊" },
  { key: "investor-presentation", label: "Investor Presentation",      icon: "📈" },
  { key: "concall",               label: "Concall Audio & Transcript",  icon: "🎧" },
  { key: "annual-report",         label: "Annual Report",              icon: "📋" },
  { key: "kpi-handbook",          label: "KPI Handbooks",              icon: "📑" },
];

const TYPE_STYLE: Record<DocumentLinkType, string> = {
  pdf:   "bg-red-50 text-red-700 border-red-200",
  xlsx:  "bg-green-50 text-green-700 border-green-200",
  docx:  "bg-blue-50 text-blue-700 border-blue-200",
  audio: "bg-purple-50 text-purple-700 border-purple-200",
  other: "bg-gray-50 text-gray-600 border-gray-200",
};
const TYPE_LABEL: Record<DocumentLinkType, string> = {
  pdf: "PDF", xlsx: "Excel", docx: "Word", audio: "Audio", other: "File",
};

function docKey(doc: IRDocument): string {
  return `${doc.category}::${doc.url}`;
}

// ─── Document row ─────────────────────────────────────────────────────────────

function DocRow({
  doc,
  checked,
  onToggle,
}: {
  doc: IRDocument;
  checked: boolean;
  onToggle: (key: string, checked: boolean) => void;
}) {
  const key = docKey(doc);
  const period = [doc.fiscalYear, doc.quarter].filter(Boolean).join(" · ");

  return (
    <label className="flex items-start gap-3 px-5 py-3 hover:bg-gray-50 cursor-pointer group">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onToggle(key, e.target.checked)}
        className="mt-0.5 h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 shrink-0"
      />
      <div className="flex-1 min-w-0">
        <p className="text-sm text-gray-900 font-medium leading-snug line-clamp-2 group-hover:text-blue-700">
          {doc.title}
        </p>
        <p className="text-xs text-gray-400 mt-0.5">{period}</p>
      </div>
      <div className="flex items-center gap-2 shrink-0 mt-0.5">
        <span
          className={`text-[11px] font-semibold px-1.5 py-0.5 rounded border ${TYPE_STYLE[doc.type]}`}
        >
          {TYPE_LABEL[doc.type]}
        </span>
        <a
          href={doc.url}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="text-gray-400 hover:text-blue-600 transition-colors"
          title="Open document"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
          </svg>
        </a>
      </div>
    </label>
  );
}

// ─── Category section ──────────────────────────────────────────────────────────

function CategorySection({
  category,
  docs,
  checkedKeys,
  onToggle,
  onToggleAll,
}: {
  category: typeof CATEGORIES[number];
  docs: IRDocument[];
  checkedKeys: Set<string>;
  onToggle: (key: string, checked: boolean) => void;
  onToggleAll: (keys: string[], checked: boolean) => void;
}) {
  const [open, setOpen] = useState(true);
  const keys = docs.map(docKey);
  const allChecked = keys.length > 0 && keys.every((k) => checkedKeys.has(k));
  const someChecked = keys.some((k) => checkedKeys.has(k));

  return (
    <div className="border border-gray-100 rounded-2xl overflow-hidden bg-white shadow-sm">
      <div className="flex items-center gap-3 px-5 py-3 bg-gray-50 border-b border-gray-100">
        <input
          type="checkbox"
          checked={allChecked}
          ref={(el) => { if (el) el.indeterminate = !allChecked && someChecked; }}
          onChange={(e) => onToggleAll(keys, e.target.checked)}
          disabled={docs.length === 0}
          className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 disabled:opacity-40"
          aria-label={`Select all ${category.label}`}
        />
        <button
          onClick={() => setOpen((o) => !o)}
          className="flex-1 flex items-center gap-2 text-left"
        >
          <span className="text-base">{category.icon}</span>
          <span className="font-semibold text-gray-900 text-sm">{category.label}</span>
          <span className="ml-1 text-xs text-gray-400 font-normal">
            {docs.length === 0
              ? "No documents found"
              : `${docs.length} document${docs.length !== 1 ? "s" : ""}`}
          </span>
          <svg
            className={`ml-auto w-4 h-4 text-gray-400 transition-transform ${open ? "rotate-180" : ""}`}
            fill="none" stroke="currentColor" viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
      </div>

      {open && (
        docs.length === 0 ? (
          <div className="px-5 py-4 text-sm text-gray-400 italic">
            No documents found for this company.
          </div>
        ) : (
          <div className="divide-y divide-gray-50">
            {docs.map((doc) => (
              <DocRow
                key={docKey(doc)}
                doc={doc}
                checked={checkedKeys.has(docKey(doc))}
                onToggle={onToggle}
              />
            ))}
          </div>
        )
      )}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function CompanyDocuments({
  ticker,
  companyName,
  onSelectionChange,
}: CompanyDocumentsProps) {
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [checkedKeys, setCheckedKeys] = useState<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;
    setState({ status: "loading" });
    setCheckedKeys(new Set());

    fetch(`/api/companies/${encodeURIComponent(ticker)}/ir-docs`, { cache: "no-store" })
      .then(async (res) => {
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error((body as { error?: string }).error ?? `HTTP ${res.status}`);
        if (!cancelled) setState({ status: "ready", data: body as IRDocsResponse });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setState({
          status: "error",
          message: err instanceof Error ? err.message : "Unknown error",
        });
      });

    return () => { cancelled = true; };
  }, [ticker]);

  useEffect(() => {
    if (state.status !== "ready") return;
    const allDocs = CATEGORIES.flatMap(({ key }) => state.data.documents[key] ?? []);
    const selected: SelectedDoc[] = allDocs
      .filter((doc) => checkedKeys.has(docKey(doc)))
      .map((doc) => ({ ...doc, key: docKey(doc) }));
    onSelectionChange(selected);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checkedKeys, state]);

  const handleToggle = useCallback((key: string, checked: boolean) => {
    setCheckedKeys((prev) => {
      const next = new Set(prev);
      if (checked) next.add(key); else next.delete(key);
      return next;
    });
  }, []);

  const handleToggleAll = useCallback((keys: string[], checked: boolean) => {
    setCheckedKeys((prev) => {
      const next = new Set(prev);
      if (checked) keys.forEach((k) => next.add(k));
      else keys.forEach((k) => next.delete(k));
      return next;
    });
  }, []);

  if (state.status === "loading") {
    return (
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 flex items-center gap-3">
        <svg className="animate-spin h-5 w-5 text-blue-500 shrink-0" viewBox="0 0 24 24" fill="none">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
        </svg>
        <span className="text-gray-600 text-sm">Fetching investor documents for {companyName}…</span>
      </div>
    );
  }

  if (state.status === "error") {
    return (
      <div className="bg-white rounded-2xl border border-amber-200 shadow-sm p-6">
        <div className="flex items-center gap-2 text-amber-700 font-semibold mb-1">
          <span>⚠️</span> Could not load documents
        </div>
        <p className="text-sm text-gray-500">{state.message}</p>
      </div>
    );
  }

  const { data } = state;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-gray-700">
          Investor Documents
          {data.totalCount > 0 && (
            <span className="ml-2 text-gray-400 font-normal">{data.totalCount} total</span>
          )}
        </h2>
        {checkedKeys.size > 0 && (
          <span className="text-xs text-blue-600 font-medium">
            {checkedKeys.size} selected
          </span>
        )}
      </div>

      {CATEGORIES.map((cat) => (
        <CategorySection
          key={cat.key}
          category={cat}
          docs={data.documents[cat.key] ?? []}
          checkedKeys={checkedKeys}
          onToggle={handleToggle}
          onToggleAll={handleToggleAll}
        />
      ))}
    </div>
  );
}
