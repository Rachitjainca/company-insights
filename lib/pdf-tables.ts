/**
 * PDF table extraction tuned for Indian listed-company financial filings
 * (Reg-33 results, balance sheets, cash-flow statements).
 *
 * Approach:
 * 1. Use `unpdf` to fetch positioned text items per page.
 * 2. Group items into rows by Y-coordinate.
 * 3. Detect column boundaries:
 *      - text columns: cluster left-edge X
 *      - numeric columns: cluster *right-edge* X (since numbers are
 *        right-aligned in financial statements)
 *      - merge both into a single ordered column list.
 * 4. Snap each item to a column by edge proximity.
 * 5. Score each detected table block by a financial-statement signal
 *    (Reg-33 keywords, presence of "particulars" header, "quarter ended"
 *    headers, density of numeric cells). Rank, return only top blocks.
 */

import { extractText, getDocumentProxy } from "unpdf";

export interface ExtractedTable {
  rows: string[][];
  caption: string;
  /** 1-based page number where the table was found. */
  page?: number;
  /** How the table was extracted (for status/debugging). */
  source?: "pdf-positional" | "html";
  /** Heuristic financial-quality score (higher = more confident). */
  score?: number;
}

interface TextItem {
  str: string;
  x: number; // left edge
  y: number;
  width: number;
  height: number;
}

const FIN_KEYWORD_RE =
  /revenue|income|expense|ebitda|ebit\b|pbt|pat|profit|loss|eps|earning|margin|cash\s*flow|asset|liabilit|debt|borrow|capex|operat(?:ing|ional)|volume|utili[sz]ation|subscriber|arpu|aov|order|guidance|roe|roa|roce|gnpa|nnpa|aum|gmv|tpv|merchant|loan|disburs|interest|deposit|reserves|equity|share\s*capital|tax|depreciation|amortis|amortiz|particulars|quarter\s*ended|year\s*ended|standalone|consolidated|statement\s*of/i;

/** Strong Reg-33 / IndAS financial-statement signals (used for scoring). */
const REG33_SIGNAL_RE =
  /particulars|quarter\s*ended|year\s*ended|statement\s*of\s*(standalone|consolidated|profit|financial)|standalone\s+financial\s+results|consolidated\s+financial\s+results|balance\s*sheet|cash\s*flow\s*statement|earnings\s*per\s*equity\s*share/i;

const NUMERIC_CELL_RE = /^[\(\-]?\s*[\d][\d,]*(?:\.\d+)?\s*%?\s*\)?$/;

/* ------------------------------------------------------------------------- */
/*  Low-level: extract positioned text items from a PDF byte buffer          */
/* ------------------------------------------------------------------------- */

interface PdfTextItemRaw {
  str: string;
  transform?: number[];
  width?: number;
  height?: number;
}

interface PdfPageProxy {
  getTextContent: () => Promise<{ items: PdfTextItemRaw[] }>;
}

interface PdfDocumentProxy {
  numPages: number;
  getPage: (n: number) => Promise<PdfPageProxy>;
}

async function loadPositionedItems(
  pdfBytes: Uint8Array,
  maxPages = 30
): Promise<TextItem[][]> {
  const pdf = (await getDocumentProxy(pdfBytes)) as unknown as PdfDocumentProxy;
  const pageCount = Math.min(pdf.numPages, maxPages);
  const out: TextItem[][] = [];

  for (let p = 1; p <= pageCount; p += 1) {
    const page = await pdf.getPage(p);
    const tc = await page.getTextContent();
    const items: TextItem[] = [];
    for (const it of tc.items) {
      const str = (it.str ?? "").replace(/\s+/g, " ");
      if (!str.trim()) continue;
      const tr = it.transform ?? [1, 0, 0, 1, 0, 0];
      const x = tr[4] ?? 0;
      const y = tr[5] ?? 0;
      const width = it.width ?? 0;
      const height = it.height ?? (Math.abs(tr[3] ?? 0) || 10);
      items.push({ str, x, y, width, height });
    }
    out.push(items);
  }

  return out;
}

/* ------------------------------------------------------------------------- */
/*  Row + column clustering                                                  */
/* ------------------------------------------------------------------------- */

function groupIntoRows(items: TextItem[]): TextItem[][] {
  if (items.length === 0) return [];
  const sorted = [...items].sort((a, b) => b.y - a.y || a.x - b.x);

  const heights = sorted.map((i) => i.height || 10).filter((h) => h > 0);
  heights.sort((a, b) => a - b);
  const medianHeight = heights[Math.floor(heights.length / 2)] || 10;
  const yTol = Math.max(2, medianHeight * 0.55);

  const rows: TextItem[][] = [];
  let current: TextItem[] = [];
  let currentY = sorted[0].y;
  for (const it of sorted) {
    if (Math.abs(it.y - currentY) <= yTol) {
      current.push(it);
    } else {
      rows.push(current.sort((a, b) => a.x - b.x));
      current = [it];
      currentY = it.y;
    }
  }
  if (current.length) rows.push(current.sort((a, b) => a.x - b.x));
  return rows;
}

function mergeRowItems(row: TextItem[]): TextItem[] {
  if (row.length === 0) return row;
  const merged: TextItem[] = [];
  let cur: TextItem = { ...row[0] };
  for (let i = 1; i < row.length; i += 1) {
    const next = row[i];
    const gap = next.x - (cur.x + cur.width);
    const tol = (cur.height || 10) * 0.45;
    if (gap < tol) {
      cur.str = `${cur.str}${next.str}`;
      cur.width = next.x + next.width - cur.x;
    } else {
      merged.push(cur);
      cur = { ...next };
    }
  }
  merged.push(cur);
  return merged;
}

interface ColumnDef {
  /** Anchor X (right edge for numeric, left edge for text). */
  anchor: number;
  /** Whether this column is right-aligned (numeric) or left-aligned (text). */
  align: "left" | "right";
  count: number;
}

function clusterPoints(
  sortedPoints: number[],
  tol: number
): { center: number; count: number }[] {
  if (sortedPoints.length === 0) return [];
  const out: { center: number; count: number }[] = [];
  for (const x of sortedPoints) {
    const last = out[out.length - 1];
    if (last && Math.abs(x - last.center) <= tol) {
      last.center = (last.center * last.count + x) / (last.count + 1);
      last.count += 1;
    } else {
      out.push({ center: x, count: 1 });
    }
  }
  return out;
}

/**
 * Detect column boundaries by clustering both left-edges (text columns) and
 * right-edges (numeric columns) of items across rows.
 */
function detectColumns(rows: TextItem[][]): ColumnDef[] {
  const lefts: number[] = [];
  const rightsNum: number[] = [];
  for (const row of rows) {
    for (const it of row) {
      lefts.push(it.x);
      if (NUMERIC_CELL_RE.test(it.str.trim())) {
        rightsNum.push(it.x + it.width);
      }
    }
  }
  if (lefts.length < 6) return [];

  const tol = 8; // pts
  const minCount = Math.max(2, Math.floor(rows.length * 0.25));

  const leftClusters = clusterPoints(
    lefts.slice().sort((a, b) => a - b),
    tol
  );
  const rightClusters = clusterPoints(
    rightsNum.slice().sort((a, b) => a - b),
    tol
  );

  const cols: ColumnDef[] = [];
  // Numeric (right-aligned) columns first — these are the most reliable
  for (const c of rightClusters) {
    if (c.count >= minCount) {
      cols.push({ anchor: c.center, align: "right", count: c.count });
    }
  }
  // Then add left-edge text columns that don't collide
  for (const c of leftClusters) {
    if (c.count >= minCount) {
      if (cols.some((x) => Math.abs(x.anchor - c.center) <= tol * 1.5)) continue;
      cols.push({ anchor: c.center, align: "left", count: c.count });
    }
  }
  cols.sort((a, b) => a.anchor - b.anchor);
  return cols;
}

function assignToColumns(row: TextItem[], cols: ColumnDef[]): string[] {
  if (cols.length === 0) return [row.map((i) => i.str).join(" ").trim()];
  const cells: string[] = new Array(cols.length).fill("");
  for (const it of row) {
    const right = it.x + it.width;
    const isNum = NUMERIC_CELL_RE.test(it.str.trim());
    let best = -1;
    let bestDist = Infinity;
    for (let i = 0; i < cols.length; i += 1) {
      const c = cols[i];
      const itemAnchor = c.align === "right" || isNum ? right : it.x;
      const d = Math.abs(itemAnchor - c.anchor);
      if (d < bestDist) {
        bestDist = d;
        best = i;
      }
    }
    if (best < 0) best = 0;
    cells[best] = cells[best] ? `${cells[best]} ${it.str}` : it.str;
  }
  return cells.map((c) => c.trim());
}

/* ------------------------------------------------------------------------- */
/*  Table block detection + scoring                                          */
/* ------------------------------------------------------------------------- */

function rowIsNumeric(cells: string[]): boolean {
  let numeric = 0;
  let nonEmpty = 0;
  for (const c of cells) {
    if (!c) continue;
    nonEmpty += 1;
    if (NUMERIC_CELL_RE.test(c.trim())) numeric += 1;
  }
  return nonEmpty >= 2 && numeric >= Math.max(2, Math.floor(nonEmpty * 0.5));
}

function rowIsHeaderLike(cells: string[]): boolean {
  let textCells = 0;
  for (const c of cells) {
    const v = c.trim();
    if (!v) continue;
    if (/[a-zA-Z]/.test(v) && !NUMERIC_CELL_RE.test(v)) textCells += 1;
  }
  return textCells >= 2;
}

function scoreTable(rows: string[][]): number {
  if (rows.length < 3) return 0;
  const flat = rows.flat().filter(Boolean).join(" ");
  let score = 0;
  if (REG33_SIGNAL_RE.test(flat)) score += 50;
  const finMatches = flat.match(FIN_KEYWORD_RE);
  if (finMatches) score += Math.min(30, finMatches.length * 4);
  let n = 0;
  let t = 0;
  for (const r of rows)
    for (const c of r) {
      if (!c) continue;
      t += 1;
      if (NUMERIC_CELL_RE.test(c.trim())) n += 1;
    }
  if (t >= 12) {
    const density = n / t;
    score += Math.round(density * 30);
  }
  const maxCols = rows.reduce((m, r) => Math.max(m, r.length), 0);
  if (maxCols >= 3) score += 10;
  if (maxCols >= 5) score += 10;
  if (rows.length < 5) score -= 10;
  return score;
}

function captionFromRows(rows: string[][], pageNum: number, idx: number): string {
  for (const r of rows) {
    const text = r.filter(Boolean).join(" ").trim();
    if (text && REG33_SIGNAL_RE.test(text)) return text.slice(0, 140);
  }
  for (const r of rows) {
    const text = r.filter(Boolean).join(" · ").trim();
    if (text && /[a-z]/i.test(text) && !rowIsNumeric(r)) {
      return text.slice(0, 140);
    }
  }
  return `Page ${pageNum} · Table ${idx + 1}`;
}

function normalizeWidth(rows: string[][]): string[][] {
  const w = rows.reduce((m, r) => Math.max(m, r.length), 0);
  return rows.map((r) => {
    if (r.length === w) return r;
    const padded = r.slice();
    while (padded.length < w) padded.push("");
    return padded;
  });
}

function detectTableRuns(grid: string[][]): { start: number; end: number }[] {
  const runs: { start: number; end: number }[] = [];
  let i = 0;
  while (i < grid.length) {
    if (rowIsNumeric(grid[i])) {
      let start = i;
      while (start > 0 && i - start < 5 && rowIsHeaderLike(grid[start - 1])) {
        start -= 1;
      }
      let end = i;
      let misses = 0;
      while (end + 1 < grid.length) {
        const next = grid[end + 1];
        if (rowIsNumeric(next) || rowIsHeaderLike(next)) {
          end += 1;
          misses = 0;
        } else {
          misses += 1;
          if (misses >= 2) break;
          end += 1;
        }
      }
      if (end - start >= 2) runs.push({ start, end });
      i = end + 1;
    } else {
      i += 1;
    }
  }
  return runs;
}

/**
 * Merge consecutive-page tables that share the same column structure
 * (financial statements often spill across pages with repeating headers).
 */
function mergeContinuationTables(tables: ExtractedTable[]): ExtractedTable[] {
  if (tables.length <= 1) return tables;
  const merged: ExtractedTable[] = [];
  for (const t of tables) {
    const last = merged[merged.length - 1];
    if (
      last &&
      last.page !== undefined &&
      t.page !== undefined &&
      t.page === last.page + 1 &&
      last.rows[0]?.length === t.rows[0]?.length &&
      (last.rows[0]?.length ?? 0) >= 3
    ) {
      const firstRow = t.rows[0]?.join(" ").toLowerCase() ?? "";
      const lastFirstRow = last.rows[0]?.join(" ").toLowerCase() ?? "";
      const startIdx = firstRow && firstRow === lastFirstRow ? 1 : 0;
      last.rows.push(...t.rows.slice(startIdx));
      last.score = Math.max(last.score ?? 0, t.score ?? 0) + 5;
      continue;
    }
    merged.push({ ...t, rows: [...t.rows] });
  }
  return merged;
}

/* ------------------------------------------------------------------------- */
/*  Public API                                                               */
/* ------------------------------------------------------------------------- */

export interface PdfTableExtractionResult {
  tables: ExtractedTable[];
  text: string;
  pages: number;
  status: "ok" | "no-tables" | "empty" | "error";
}

export async function extractTablesFromPdf(
  pdfBytes: Uint8Array,
  opts: { maxPages?: number; financialOnly?: boolean; maxTables?: number } = {}
): Promise<PdfTableExtractionResult> {
  const { maxPages = 30, financialOnly = true, maxTables = 8 } = opts;

  try {
    let textFallback = "";
    try {
      const t = await extractText(pdfBytes, { mergePages: true });
      textFallback = (
        Array.isArray(t.text) ? t.text.join("\n") : (t.text as string) ?? ""
      ).slice(0, 200000);
    } catch {
      // ignore
    }

    const pages = await loadPositionedItems(pdfBytes, maxPages);
    let tables: ExtractedTable[] = [];

    pages.forEach((items, idx) => {
      if (items.length === 0) return;
      const pageNum = idx + 1;
      const rawRows = groupIntoRows(items).map(mergeRowItems);
      if (rawRows.length === 0) return;
      const cols = detectColumns(rawRows);
      const grid = rawRows.map((r) => assignToColumns(r, cols));
      const runs = detectTableRuns(grid);
      runs.forEach((run, i) => {
        const block = grid.slice(run.start, run.end + 1);
        const norm = normalizeWidth(block);
        const score = scoreTable(norm);
        if (financialOnly && score < 30) return;
        tables.push({
          rows: norm,
          caption: captionFromRows(norm, pageNum, i),
          page: pageNum,
          source: "pdf-positional",
          score,
        });
      });
    });

    tables = mergeContinuationTables(tables);
    tables.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
    tables = tables.slice(0, maxTables);
    tables.sort((a, b) => (a.page ?? 0) - (b.page ?? 0));

    if (tables.length === 0) {
      return {
        tables: [],
        text: textFallback,
        pages: pages.length,
        status: textFallback ? "no-tables" : "empty",
      };
    }

    return {
      tables,
      text: textFallback,
      pages: pages.length,
      status: "ok",
    };
  } catch (err) {
    console.error("extractTablesFromPdf error:", err);
    return { tables: [], text: "", pages: 0, status: "error" };
  }
}
