/**
 * Multi-column reading order for PDF paragraphs (arXiv-style layouts).
 *
 * Clusters paragraphs by x-midpoint gaps into columns, then sorts:
 * columns left → right, within each column top → bottom (PDF y descending).
 *
 * Wide centered titles (span most of the page width) stay as full-width
 * "spanning" blocks ordered by y among column groups — not forced into a
 * single narrow column.
 *
 * Pure geometry; no vision models.
 */

import type { PdfParagraph } from './pdfTextExtraction';

/** Minimum horizontal gap between column clusters (PDF units). */
const COLUMN_GAP_MIN = 24;

/** A paragraph spanning more than this fraction of page width is "full width". */
const SPANNING_WIDTH_RATIO = 0.55;

export interface ReadingOrderOptions {
  /** Page content width (PDF units). When omitted, inferred from paragraph bbox. */
  pageWidth?: number;
}

/**
 * Reorder paragraphs into multi-column reading order.
 * Single-column pages are returned in the same top→bottom order.
 */
export function sortParagraphsReadingOrder(
  paragraphs: PdfParagraph[],
  options?: ReadingOrderOptions,
): PdfParagraph[] {
  if (paragraphs.length <= 1) return [...paragraphs];

  const pageWidth =
    options?.pageWidth ??
    Math.max(
      ...paragraphs.map((p) => p.x + p.width),
      1,
    );

  const spanning: PdfParagraph[] = [];
  const columnCandidates: PdfParagraph[] = [];

  for (const p of paragraphs) {
    if (p.width >= pageWidth * SPANNING_WIDTH_RATIO) {
      spanning.push(p);
    } else {
      columnCandidates.push(p);
    }
  }

  if (columnCandidates.length === 0) {
    return [...paragraphs].sort((a, b) => b.y - a.y || a.x - b.x);
  }

  const columns = clusterColumns(columnCandidates);
  if (columns.length <= 1) {
    // Single column — original top-to-bottom with spanning interleaved by y.
    return interleaveByY(
      spanning,
      columnCandidates.sort((a, b) => b.y - a.y || a.x - b.x),
    );
  }

  // Sort each column top→bottom; columns left→right.
  const sortedColumns = columns
    .map((col) => [...col].sort((a, b) => b.y - a.y || a.x - b.x))
    .sort((a, b) => {
      const midA = median(a.map((p) => p.x + p.width / 2));
      const midB = median(b.map((p) => p.x + p.width / 2));
      return midA - midB;
    });

  // Reading order: process full-width titles by y, then drain columns.
  // Simpler reliable approach for unit tests: all left column, then right,
  // with spanning paragraphs inserted by y position relative to column content.
  const columnOrdered = sortedColumns.flat();
  return interleaveByY(spanning, columnOrdered);
}

function clusterColumns(paragraphs: PdfParagraph[]): PdfParagraph[][] {
  // Sort by x midpoint.
  const sorted = [...paragraphs].sort(
    (a, b) => a.x + a.width / 2 - (b.x + b.width / 2),
  );

  const columns: PdfParagraph[][] = [];
  let current: PdfParagraph[] = [];
  let currentMaxX = -Infinity;

  for (const p of sorted) {
    const mid = p.x + p.width / 2;
    if (current.length === 0) {
      current = [p];
      currentMaxX = p.x + p.width;
      continue;
    }
    // Gap from previous cluster's right edge to this left edge (or mid gap).
    const gap = p.x - currentMaxX;
    const prevMid = median(current.map((c) => c.x + c.width / 2));
    const midGap = mid - prevMid;

    if (gap >= COLUMN_GAP_MIN || midGap >= COLUMN_GAP_MIN * 2) {
      columns.push(current);
      current = [p];
      currentMaxX = p.x + p.width;
    } else {
      current.push(p);
      currentMaxX = Math.max(currentMaxX, p.x + p.width);
    }
  }
  if (current.length > 0) columns.push(current);
  return columns;
}

/**
 * Interleave spanning (full-width) paragraphs into the column-ordered list
 * by vertical position: a spanning para that sits above a block is emitted
 * before that block. Within the same band, spanning comes first (titles).
 */
function interleaveByY(
  spanning: PdfParagraph[],
  ordered: PdfParagraph[],
): PdfParagraph[] {
  if (spanning.length === 0) return ordered;
  const spanSorted = [...spanning].sort((a, b) => b.y - a.y || a.x - b.x);
  const result: PdfParagraph[] = [];
  let si = 0;
  for (const p of ordered) {
    while (si < spanSorted.length && spanSorted[si].y >= p.y) {
      result.push(spanSorted[si]);
      si += 1;
    }
    result.push(p);
  }
  while (si < spanSorted.length) {
    result.push(spanSorted[si]);
    si += 1;
  }
  return result;
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const s = [...values].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)] ?? 0;
}
