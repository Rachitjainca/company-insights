"use client";

import { useEffect, useState, useCallback } from "react";
import type { IRCategory, IRDocument, IRSource, SelectedDoc, DocumentLinkType } from "@/types/financial";

interface DataSources {
  scraper: boolean;
  nseQuarterly: boolean;
  nseAnnual: boolean;
  nseAnnouncements: boolean;
  bseCode: string | null;
  bseFilings: boolean;
}

interface IRDocsResponse {
  ticker: string;
  companyName: string;
  bseCode: string | null;
  documents: Record<IRCategory, IRDocument[]>;
  totalCount: number;
  fetchedAt: string;
  sources?: DataSources;
}

interface CompanyDocumentsProps {
  ticker: string;
  onSelectionChange: (selected: SelectedDoc[]) => void;
}

type LoadState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; data: IRDocsResponse };

const ORDERED_CATEGORIES: IRCategory[] = [
  "quarterly-results",
  "investor-presentation",
  "concall",
  "annual-report",
  "kpi-handbook",
];

const CATEGORY_CONFIG: Record<
  IRCategory,
  { label: string; borderColor: string; light: string; text: string; icon: React.ReactNode }
> = {
  "quarterly-results": {
    label: "Quarterly Results",
    borderColor: "border-l-blue-500",
    light: "bg-blue-50",
    text: "text-blue-700",
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
      </svg>
    ),
  },
  "investor-presentation": {
    label: "Investor Presentations",
    borderColor: "border-l-violet-500",
    light: "bg-violet-50",
    text: "text-violet-700",
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z" />
      </svg>
    ),
  },
  "concall": {
    label: "Concall Transcripts",
    borderColor: "border-l-amber-500",
    light: "bg-amber-50",
    text: "text-amber-700",
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
      </svg>
    ),
  },
  "annual-report": {
    label: "Annual Reports",
    borderColor: "border-l-emerald-500",
    light: "bg-emerald-50",
    text: "text-emerald-700",
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
    ),
  },
  "kpi-handbook": {
    label: "KPI Handbooks",
    borderColor: "border-l-rose-500",
    light: "bg-rose-50",
    text: "text-rose-700",
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
      </svg>
    ),
  },
};

const TYPE_STYLE: Record<DocumentLinkType, string> = {
  pdf:   "bg-red-50 text-red-700 border-red-200",
  xlsx:  "bg-green-50 text-green-700 border-green-200",
  docx:  "bg-blue-50 text-blue-700 border-blue-200",
  audio: "bg-purple-50 text-purple-700 border-purple-200",
  other: "bg-gray-50 text-gray-500 border-gray-200",
};
const TYPE_LABEL: Record<DocumentLinkType, string> = {
  pdf: "PDF", xlsx: "Excel", docx: "Word", audio: "Audio", other: "Link",
};

function docKey(doc: IRDocument): string {
  return `${doc.category}::${doc.url}`;
}

function SkeletonRow() {
  return (
    <div className="flex items-center gap-3 px-5 py-3.5">
      <div className="h-4 w-4 rounded bg-gray-200 shrink-0" />
      <div className="flex-1 space-y-2 min-w-0">
        <div className="h-3 bg-gray-200 rounded w-3/4" />
        <div className="h-2 bg-gray-100 rounded w-1/4" />
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <div className="h-5 w-10 bg-gray-200 rounded" />
        <div className="h-4 w-4 bg-gray-100 rounded" />
      </div>
    </div>
  );
}

const SKELETON_ROW_COUNTS = [4, 3, 2, 3, 2];
const SKELETON_LABEL_WIDTHS = ["w-32", "w-44", "w-36", "w-28", "w-28"];

function SkeletonSection({ index }: { index: number }) {
  return (
    <div className="border border-gray-100 border-l-4 border-l-gray-200 rounded-2xl overflow-hidden bg-white shadow-sm animate-pulse">
      <div className="flex items-center gap-3 px-4 py-3 bg-gray-50/70 border-b border-gray-100">
        <div className="h-4 w-4 rounded bg-gray-200 shrink-0" />
        <div className="h-4 w-4 rounded bg-gray-200 shrink-0" />
        <div className={`h-4 ${SKELETON_LABEL_WIDTHS[index]} bg-gray-200 rounded`} />
        <div className="ml-2 h-5 w-7 bg-gray-200 rounded-full" />
        <div className="ml-auto h-4 w-4 rounded bg-gray-100 shrink-0" />
      </div>
      <div className="divide-y divide-gray-50">
        {Array.from({ length: SKELETON_ROW_COUNTS[index] }).map((_, i) => (
          <SkeletonRow key={i} />
        ))}
      </div>
    </div>
  );
}

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
  const period = [doc.fiscalYear, doc.quarter].filter(Boolean).join(" \u00B7 ");
  const canOpen = /^https?:\/\//i.test(doc.url);

  return (
    <div
      className={`flex items-start gap-3 px-5 py-3.5 group transition-colors cursor-pointer select-none ${
        checked ? "bg-blue-50/50" : "hover:bg-gray-50/80"
      }`}
      onClick={() => onToggle(key, !checked)}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onToggle(key, e.target.checked)}
        onClick={(e) => e.stopPropagation()}
        className="mt-0.5 h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 shrink-0 cursor-pointer"
      />
      <div className="flex-1 min-w-0">
        <p className={`text-sm font-medium leading-snug line-clamp-2 transition-colors ${
          checked ? "text-blue-800" : "text-gray-800 group-hover:text-blue-700"
        }`}>
          {doc.title}
        </p>
        {period && <p className="text-xs text-gray-400 mt-0.5 font-mono">{period}</p>}
      </div>
      <div
        className="flex items-center gap-2 shrink-0 mt-0.5"
        onClick={(e) => e.stopPropagation()}
      >
        <span className={`text-[11px] font-semibold px-1.5 py-0.5 rounded border ${TYPE_STYLE[doc.type]}`}>
          {TYPE_LABEL[doc.type]}
        </span>
        {canOpen ? (
          <a
            href={doc.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-gray-300 hover:text-blue-500 transition-colors p-0.5 rounded"
            title="Open document"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
            </svg>
          </a>
        ) : (
          <span className="text-gray-200 p-0.5" title="No link available">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
            </svg>
          </span>
        )}
      </div>
    </div>
  );
}

function CategorySection({
  category,
  docs,
  checkedKeys,
  onToggle,
  onToggleAll,
}: {
  category: IRCategory;
  docs: IRDocument[];
  checkedKeys: Set<string>;
  onToggle: (key: string, checked: boolean) => void;
  onToggleAll: (keys: string[], checked: boolean) => void;
}) {
  const config = CATEGORY_CONFIG[category];
  const [open, setOpen] = useState(true);
  const keys = docs.map(docKey);
  const allChecked = keys.length > 0 && keys.every((k) => checkedKeys.has(k));
  const someChecked = keys.some((k) => checkedKeys.has(k));
  const checkedCount = keys.filter((k) => checkedKeys.has(k)).length;

  return (
    <div className={`border border-gray-100 border-l-4 ${config.borderColor} rounded-2xl overflow-hidden bg-white shadow-sm`}>
      <div className="flex items-center gap-3 px-4 py-3 bg-gray-50/60 border-b border-gray-100">
        <input
          type="checkbox"
          checked={allChecked}
          ref={(el) => { if (el) el.indeterminate = !allChecked && someChecked; }}
          onChange={(e) => onToggleAll(keys, e.target.checked)}
          disabled={docs.length === 0}
          className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 disabled:opacity-30 cursor-pointer"
          aria-label={`Select all ${config.label}`}
        />
        <button
          onClick={() => setOpen((o) => !o)}
          className="flex-1 flex items-center gap-2.5 text-left min-w-0"
        >
          <span className={`flex-none ${config.text}`}>{config.icon}</span>
          <span className="font-semibold text-gray-900 text-sm">{config.label}</span>
          {docs.length > 0 ? (
            <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${config.light} ${config.text}`}>
              {docs.length}
            </span>
          ) : (
            <span className="text-xs text-gray-400 font-normal">None found</span>
          )}
          {checkedCount > 0 && (
            <span className="text-[11px] font-semibold text-blue-700 bg-blue-100 px-1.5 py-0.5 rounded-full">
              {checkedCount} selected
            </span>
          )}
          <svg
            className={`ml-auto flex-none w-4 h-4 text-gray-400 transition-transform duration-200 ${open ? "rotate-180" : ""}`}
            fill="none" stroke="currentColor" viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
      </div>

      {open && (
        docs.length === 0 ? (
          <div className="px-5 py-8 flex flex-col items-center gap-2 text-center">
            <div className={`w-9 h-9 rounded-full ${config.light} flex items-center justify-center ${config.text} opacity-60`}>
              {config.icon}
            </div>
            <p className="text-sm text-gray-400">No {config.label.toLowerCase()} found for this company.</p>
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

function SourceBadge({ label, ok }: { label: string; ok: boolean }) {
  return (
    <span className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full border ${
      ok
        ? "bg-green-50 text-green-700 border-green-200"
        : "bg-gray-50 text-gray-400 border-gray-200"
    }`}>
      <span className={`w-1.5 h-1.5 rounded-full ${ok ? "bg-green-500" : "bg-gray-300"}`} />
      {label}
    </span>
  );
}

export default function CompanyDocuments({
  ticker,
  onSelectionChange,
}: CompanyDocumentsProps) {
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [checkedKeys, setCheckedKeys] = useState<Set<string>>(new Set());
  const [sourceFilter, setSourceFilter] = useState<"all" | IRSource | "xbrl">(
    "all"
  );

  const fetchDocs = useCallback(() => {
    let cancelled = false;

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

  const load = useCallback(() => {
    setState({ status: "loading" });
    setCheckedKeys(new Set());
    void fetchDocs();
  }, [fetchDocs]);

  useEffect(() => {
    return fetchDocs();
  }, [fetchDocs]);

  useEffect(() => {
    if (state.status !== "ready") return;
    const allDocs = ORDERED_CATEGORIES.flatMap((cat) => state.data.documents[cat] ?? []);
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
      <div className="space-y-3">
        <div className="flex items-center justify-between px-1 animate-pulse">
          <div className="h-4 w-40 bg-gray-200 rounded" />
          <div className="flex gap-2">
            <div className="h-5 w-12 bg-gray-200 rounded-full" />
            <div className="h-5 w-12 bg-gray-200 rounded-full" />
          </div>
        </div>
        {Array.from({ length: 5 }).map((_, i) => (
          <SkeletonSection key={i} index={i} />
        ))}
      </div>
    );
  }

  if (state.status === "error") {
    return (
      <div className="bg-white rounded-2xl border border-red-100 shadow-sm p-10 text-center">
        <div className="w-12 h-12 rounded-full bg-red-50 flex items-center justify-center mx-auto mb-3">
          <svg className="w-6 h-6 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <p className="font-semibold text-gray-900 mb-1">Could not load documents</p>
        <p className="text-sm text-gray-400 mb-5">{state.message}</p>
        <button
          onClick={() => load()}
          className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-xl text-sm font-semibold hover:bg-blue-700 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          Try again
        </button>
      </div>
    );
  }

  const { data } = state;
  const src = data.sources;
  const nseOk = !!(src?.nseQuarterly || src?.nseAnnual || src?.nseAnnouncements);
  const bseOk = !!(src?.bseFilings && src?.bseCode);

  // Filter docs by source when a filter is active
  function filterBySource(docs: IRDocument[]): IRDocument[] {
    if (sourceFilter === "all") return docs;
    if (sourceFilter === "xbrl") return docs.filter((d) => !!d.xbrlUrl);
    return docs.filter((d) => d.source === sourceFilter);
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2 px-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-semibold text-gray-700">
            {data.totalCount > 0
              ? `${data.totalCount} document${data.totalCount !== 1 ? "s" : ""} found`
              : "No documents found"}
          </span>
          {src && (
            <div className="flex items-center gap-1.5">
              <SourceBadge label="NSE" ok={nseOk} />
              <SourceBadge label="BSE" ok={bseOk} />
            </div>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          {checkedKeys.size > 0 && (
            <span className="text-sm font-semibold text-blue-600 mr-2">
              {checkedKeys.size} selected
            </span>
          )}
          {/* Source toggle */}
          {(nseOk || bseOk) && (
            <div className="flex items-center rounded-xl border border-gray-200 bg-gray-50 p-0.5 gap-0.5 text-xs font-semibold">
              {(
                [
                  { v: "all", label: "All" },
                  { v: "nse", label: "NSE" },
                  { v: "bse", label: "BSE" },
                  { v: "xbrl", label: "XBRL" },
                ] as const
              ).map(({ v, label }) => (
                <button
                  key={v}
                  onClick={() => setSourceFilter(v)}
                  className={`px-2.5 py-1 rounded-lg transition-colors ${
                    sourceFilter === v
                      ? "bg-white shadow-sm text-gray-900 border border-gray-200"
                      : "text-gray-500 hover:text-gray-700"
                  }`}
                  title={
                    v === "xbrl"
                      ? "Show only filings with machine-readable XBRL data"
                      : v === "all"
                        ? "Show every filing"
                        : `Show only filings sourced from ${label}`
                  }
                >
                  {label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {ORDERED_CATEGORIES.map((cat) => (
        <CategorySection
          key={cat}
          category={cat}
          docs={filterBySource(data.documents[cat] ?? [])}
          checkedKeys={checkedKeys}
          onToggle={handleToggle}
          onToggleAll={handleToggleAll}
        />
      ))}
    </div>
  );
}
