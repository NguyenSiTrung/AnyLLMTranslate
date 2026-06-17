/**
 * PDF text extraction — uses PDF.js `page.getTextContent()` to pull raw text
 * items, then groups them into paragraphs based on vertical/horizontal spacing
 * and font size.
 *
 * Why group into paragraphs?
 * - Sending one LLM request per word is wasteful (network + token overhead).
 * - Sending one request per page can produce huge payloads for content-heavy
 *   pages and degrades cache reuse across pages.
 * - Paragraphs are the natural unit of LLM translation (matches the rest of
 *   the extension's translation pipeline).
 */

import type { PDFPageProxy } from 'pdfjs-dist';
// `TextItem` is exported from the internal display/api.d.ts but not re-exported
// from the package root. Importing via the deep path is the only stable way to
// reach it in pdfjs-dist v4+.
import type { TextItem } from 'pdfjs-dist/types/src/display/api';
import { isMathLine } from './pdfContentDetect';

/** A single extracted paragraph (one LLM translation unit). */
export interface PdfParagraph {
  /** Stable id within the page — `${pageNumber}-${paragraphIndex}`. */
  id: string;
  /** Concatenated paragraph text. */
  text: string;
  /** Average font size for the paragraph (used for display heuristics). */
  fontSize: number;
  /** True if the paragraph appears to be a heading (large font). */
  isHeading: boolean;
  /** X coordinate (left-most) in PDF space. */
  x: number;
  /** Y coordinate (top-most) in PDF space. */
  y: number;
  /** Width in PDF space. */
  width: number;
  /** Height in PDF space. */
  height: number;
}

/** Result of extracting text from one page. */
export interface PdfPageText {
  /** 1-indexed page number. */
  pageNumber: number;
  /** Paragraphs in reading order (top-to-bottom, left-to-right). */
  paragraphs: PdfParagraph[];
}

/**
 * Group text items into paragraphs.
 *
 * Heuristic:
 * - Items on the same y-coordinate (within `Y_TOLERANCE`) and overlapping
 *   horizontally are part of the same line.
 * - Consecutive lines are part of the same paragraph when the vertical gap
 *   between them is < `LINE_GAP_FACTOR * lineHeight`.
 * - A line whose font height is significantly larger than the median for the
 *   page is treated as a heading.
 */
const Y_TOLERANCE = 1.5; // PDF units
const LINE_GAP_FACTOR = 1.6;

function groupIntoLines(items: TextItem[]): Array<{ text: string; y: number; height: number; x: number; xEnd: number }> {
  if (items.length === 0) return [];

  // Sort by y descending (PDF y axis is bottom-up)
  const sorted = [...items].sort((a, b) => {
    const aY = a.transform[5];
    const bY = b.transform[5];
    if (Math.abs(aY - bY) > Y_TOLERANCE) return bY - aY;
    return a.transform[4] - b.transform[4];
  });

  const lines: Array<{ text: string; y: number; height: number; x: number; xEnd: number }> = [];
  let current: typeof lines[number] | null = null;

  for (const item of sorted) {
    const y = item.transform[5];
    const height = item.height || Math.abs(item.transform[3]) || 10;
    const x = item.transform[4];
    const xEnd = x + item.width;
    const text = item.str;

    if (current && Math.abs(current.y - y) <= Y_TOLERANCE) {
      // Same line — append a space when items do not visually touch
      const gap = x - current.xEnd;
      if (gap > 0 && !current.text.endsWith(' ') && !text.startsWith(' ')) {
        current.text += ' ';
      }
      current.text += text;
      current.xEnd = Math.max(current.xEnd, xEnd);
      current.height = Math.max(current.height, height);
    } else {
      current = { text: text.trim(), y, height, x, xEnd };
      lines.push(current);
    }
  }

  return lines;
}

function groupLinesIntoParagraphs(
  lines: Array<{ text: string; y: number; height: number; x: number; xEnd: number }>,
  pageNumber: number,
): PdfParagraph[] {
  if (lines.length === 0) return [];

  // Compute the median line height to use as the "normal" size
  const heights = lines.map((l) => l.height).sort((a, b) => a - b);
  const medianHeight = heights[Math.floor(heights.length / 2)] || 10;
  const headingThreshold = medianHeight * 1.4;

  const paragraphs: PdfParagraph[] = [];
  let current: {
    text: string;
    totalHeight: number;
    samples: number;
    startIndex: number;
    xMin: number;
    xMax: number;
    yMin: number;
    yMax: number;
  } | null = null;
  let lastY: number | null = null;

  const flush = (): void => {
    if (!current) return;
    const text = current.text.trim();
    if (text.length > 0) {
      const avgHeight = current.totalHeight / current.samples;
      paragraphs.push({
        id: `${pageNumber}-${paragraphs.length}`,
        text,
        fontSize: avgHeight,
        isHeading: avgHeight >= headingThreshold,
        x: current.xMin,
        y: current.yMax,
        width: current.xMax - current.xMin,
        height: current.yMax - current.yMin,
      });
    }
    current = null;
    lastY = null;
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineText = line.text.trim();
    if (!lineText) continue;

    if (current === null) {
      current = {
        text: lineText,
        totalHeight: line.height,
        samples: 1,
        startIndex: i,
        xMin: line.x,
        xMax: line.xEnd,
        yMin: line.y,
        yMax: line.y + line.height,
      };
      lastY = line.y;
      continue;
    }

    const verticalGap = (lastY ?? line.y) - line.y; // top-to-bottom is decreasing y
    const sameLineGap = verticalGap <= 0;

    // Math-aware paragraph splitting: do not group standalone math lines with other lines
    const isCurrentMath = isMathLine(current.text);
    const isLineMath = isMathLine(lineText);
    const paraBreakGap =
      verticalGap > (LINE_GAP_FACTOR * current.totalHeight) / current.samples ||
      isCurrentMath ||
      isLineMath;

    if (paraBreakGap) {
      flush();
      current = {
        text: lineText,
        totalHeight: line.height,
        samples: 1,
        startIndex: i,
        xMin: line.x,
        xMax: line.xEnd,
        yMin: line.y,
        yMax: line.y + line.height,
      };
      lastY = line.y;
    } else {
      if (!sameLineGap) {
        // Concatenate a single space between lines, unless the previous line
        // ended with a hyphen (word continuation across line breaks)
        const joiner = current.text.endsWith('-') ? '' : ' ';
        current.text += joiner + lineText;
        current.totalHeight += line.height;
        current.samples += 1;
      } else {
        current.text += lineText;
        current.totalHeight += line.height;
        current.samples += 1;
      }
      current.xMin = Math.min(current.xMin, line.x);
      current.xMax = Math.max(current.xMax, line.xEnd);
      current.yMin = Math.min(current.yMin, line.y);
      current.yMax = Math.max(current.yMax, line.y + line.height);
      lastY = line.y;
    }
  }

  flush();
  return paragraphs;
}

/**
 * Extract paragraphs of text from a single PDF page.
 * Returns an empty array if the page has no extractable text (e.g. scanned PDF).
 */
export async function extractPageText(page: PDFPageProxy, pageNumber: number): Promise<PdfPageText> {
  const content = await page.getTextContent();
  // Filter out non-text items and empty strings
  const items = content.items.filter(
    (item): item is TextItem =>
      'str' in item && typeof (item as TextItem).str === 'string' && (item as TextItem).str.trim().length > 0,
  );
  const lines = groupIntoLines(items);
  const paragraphs = groupLinesIntoParagraphs(lines, pageNumber);
  return { pageNumber, paragraphs };
}

/** Extract text for every page in `pages`. Skips pages that error out. */
export async function extractAllPagesText(
  pages: PDFPageProxy[],
  onPageExtracted?: (page: PdfPageText) => void,
): Promise<PdfPageText[]> {
  const results: PdfPageText[] = [];
  for (let i = 0; i < pages.length; i++) {
    const page = pages[i];
    try {
      const result = await extractPageText(page, i + 1);
      results.push(result);
      onPageExtracted?.(result);
    } catch {
      results.push({ pageNumber: i + 1, paragraphs: [] });
    }
  }
  return results;
}
