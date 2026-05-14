/**
 * PDF table extraction using positional text clustering.
 *
 * Approach:
 * 1. Use `unpdf` (serverless-friendly pdfjs build) to fetch text items per
 *    page along with their (x, y, width) positions.
 * 2. Group items into rows by Y-coordinate (within a tolerance).
 * 3. Detect column boundaries by clustering item start-X across rows.
 * 4. Emit a 2-D grid per page, then keep "table-like" / financial-looking
 *    blocks as `ExtractedTable` entries.
 *
 * This is intentionally heuristic — financial PDFs vary widely. We tune the
 * thresholds to favour recall on tabular regions and filter strict financial
 * keywords downstream.
 */

import { extractText, getDocumentProxy } from "unpdf";

export interface ExtractedTable {
  rows: string[][];
  caption: string;
  /** 1-based page number where the table was found. */
  page?: number;
  /** How the table was extracted (for status/debugging). */
  source?: "pdf-positional" | "html";
}

interface TextItem {
  str: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

const FIN_KEYWORD_RE =
  /revenue|income|expense|ebitda|ebit\b|pbt|pat|profit|loss|eps|margin|cash\s*flow|asset|liabilit|debt|borrow|capex|operat(?:ing|ional)|volume|utili[sz]ation|subscriber|arpu|aov|order|guidance|roe|roa|roce|gnpa|nnpa|aum|gmv|tpv|merchant|loan|disburs|interest|deposit|reserves|equity|share\s*capital|tax|depreciation|amortis|amortiz/i;

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
  getViewport?: (params: { scale: number }) => { height: number; width: number };
}

interface PdfDocumentProxy {
  numPages: number;
  getPage: (n: number) => Promise<PdfPageProxy>;
}

async function loadPositionedItems(
  pdfBytes: Uint8Array,
  maxPages = 30
): Promise<TextItem[][]> {
  // `getDocumentProxy` works in node serverless contexts (no DOM/canvas).
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
      // pdfjs transform = [a,b,c,d,e,f] where (e,f) ~= (x,y); y origin is bottom-left.
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

/** Group text items into rows by Y (PDF coords: larger y = higher on page). */
function groupIntoRows(items: TextItem[]): TextItem[][] {
  if (items.length === 0) return [];
  const sorted = [...items].sort((a, b) => b.y - a.y || a.x - b.x);

  // Tolerance ~ 0.6 * median height
  const heights = sorted.map((i) => i.height || 10).filter((h) => h > 0);
  heights.sort((a, b) => a - b);
  const medianHeight = heights[Math.floor(heights.length / 2)] || 10;
  const yTol = Math.max(2, medianHeight * 0.6);

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

/** Merge adjacent items inside a row that are visually contiguous (same word). */
function mergeRowItems(row: TextItem[]): TextItem[] {
  if (row.length === 0) return row;
  const merged: TextItem[] = [];
  let cur = { ...row[0] };
  for (let i = 1; i < row.length; i += 1) {
    const next = row[i];
    const gap = next.x - (cur.x + cur.width);
    // If gap is < 0.4 * height treat as same logical token (e.g. "1," + "234.56")
    const tol = (cur.height || 10) * 0.4;
    if (gap < tol) {
      cur.str = `${cur.str}${gap > 0 ? "" : ""}${next.str}`;
      cur.width = next.x + next.width - cur.x;
    } else {
      merged.push(cur);
      cur = { ...next };
    }
  }
  merged.push(cur);
  return merged;
}

/**
 * Detect column boundaries from a set of rows by clustering item start-X.
 * Returns the X cut-points (sorted ascending).
 */
function detectColumns(rows: TextItem[][]): number[] {
  const xs: number[] = [];
  for (const row of rows) for (const it of row) xs.push(it.x);
  if (xs.length < 4) return [];
  xs.sort((a, b) => a - b);

  // Bin into clusters with width ~ tolerance
  const tol = 8; // points
  const clusters: { center: number; count: number }[] = [];
  for (const x of xs) {
    const last = clusters[clusters.length - 1];
    if (last && Math.abs(x - last.center) <= tol) {
      last.center = (last.center * last.count + x) / (last.count + 1);
      last.count += 1;
    } else {
      clusters.push({ center: x, count: 1 });
    }
  }
  // Keep clusters that appear in a meaningful fraction of rows
  const minCount = Math.max(2, Math.floor(rows.length * 0.25));
  const significant = clusters.filter((c) => c.count >= minCount);
  return significant.map((c) => c.center).sort((a, b) => a - b);
}

function assignToColumns(row: TextItem[], cols: number[]): string[] {
  if (cols.length === 0) return [row.map((i) => i.str).join(" ").trim()];
  const cells: string[] = new Array(cols.length).fill("");
  for (const it of row) {
    // Pick the column whose start-X is closest *and* not greater than item start-X.
    let best = 0;
    let bestDist = Infinity;
    for (let i = 0; i < cols.length; i += 1) {
      const d = it.x - cols[i];
      if (d < -10) continue; // item is to the left of this col
      if (d < bestDist) {
        bestDist = d;
        best = i;
      }
    }
    cells[best] = cells[best] ? `${cells[best]} ${it.str}` : it.str;
  }
  return cells.map((c) => c.trim());
}

/* ------------------------------------------------------------------------- */
/*  Table block detection                                                    */
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

function tableBlockLooksFinancial(rows: string[][]): boolean {
  if (rows.length < 3) return false;
  const flat = rows.flat().filter(Boolean).join(" ");
  if (FIN_KEYWORD_RE.test(flat)) return true;
  // Or ≥40% numeric across all cells
  let n = 0,
    t = 0;
  for (const r of rows) for (const c of r) {
    if (!c) continue;
    t += 1;
    if (NUMERIC_CELL_RE.test(c.trim())) n += 1;
  }
  return t >= 12 && n / t >= 0.4;
}

function captionFromRows(rows: string[][], pageNum: number, idx: number): string {
  for (const r of rows) {
    const text = r.filter(Boolean).join(" · ").trim();
    if (text && /[a-z]/i.test(text) && !rowIsNumeric(r)) {
      return text.slice(0, 120);
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

/**
 * Detect contiguous "table" runs in a list of grid-rows on a page.
 * A run is a sequence of rows where ≥half of consecutive rows look numeric
 * (or share the same column count with non-trivial content).
 */
function detectTableRuns(grid: string[][]): { start: number; end: number }[] {
  const runs: { start: number; end: number }[] = [];
  let i = 0;
  while (i < grid.length) {
    if (rowIsNumeric(grid[i])) {
      // Walk forward including up to 2 surrounding header/text rows.
      let start = i;
      // Include header rows above
      while (
        start > 0 &&
        i - start < 4 &&
        rowIsHeaderLike(grid[start - 1])
      ) {
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

/* ------------------------------------------------------------------------- */
/*  Public API                                                               */
/* ------------------------------------------------------------------------- */

export interface PdfTableExtractionResult {
  tables: ExtractedTable[];
  /** Concatenated text fallback (rows joined with spaces). */
  text: string;
  /** Total pages parsed. */
  pages: number;
  status: "ok" | "no-tables" | "empty" | "error";
}

/**
 * Extract tables from a PDF byte buffer using positional clustering.
 * Returns financial-looking tables only; non-financial tables are filtered out.
 */
export async function extractTablesFromPdf(
  pdfBytes: Uint8Array,
  opts: { maxPages?: number; financialOnly?: boolean } = {}
): Promise<PdfTableExtractionResult> {
  const { maxPages = 30, financialOnly = true } = opts;

  try {
    // Quick text fallback (used when no tables are found)
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
    const tables: ExtractedTable[] = [];

    pages.forEach((items, idx) => {
      if (items.length === 0) return;
      const pageNum = idx + 1;
      const rawRows = groupIntoRows(items).map(mergeRowItems);
      if (rawRows.length === 0) return;
      const cols = detectColumns(rawRows);
      // Build grid of cells
      const grid = rawRows.map((r) => assignToColumns(r, cols));
      const runs = detectTableRuns(grid);
      runs.forEach((run, i) => {
        const block = grid.slice(run.start, run.end + 1);
        if (financialOnly && !tableBlockLooksFinancial(block)) return;
        const norm = normalizeWidth(block);
        tables.push({
          rows: norm,
          caption: captionFromRows(norm, pageNum, i),
          page: pageNum,
          source: "pdf-positional",
        });
      });
    });

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
