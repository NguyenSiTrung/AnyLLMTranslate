/**
 * pdfDualExport — Assemble bilingual dual PDFs from mono translated + original.
 *
 * Modes:
 * - Side-by-side: each output page is [original | translated] (width sum, height max)
 * - Alternating: O1, T1, O2, T2… page sequence
 *
 * Dual pages reuse mono generation quality (caller supplies mono bytes from
 * generateTranslatedPdf). Methodology inspired by BabelDOC public dual-export
 * design; no AGPL source.
 */

import { PDFDocument } from 'pdf-lib';

/** Download / export format choice. */
export type DualExportMode = 'mono' | 'dual-side-by-side' | 'dual-alternating';

export interface PageSize {
  width: number;
  height: number;
}

export interface AlternatingPageRef {
  source: 'original' | 'translated';
  /** 0-based page index into the source document. */
  pageIndex: number;
}

export interface DualPagePair {
  originalIndex: number;
  /** null when mono document has no corresponding page. */
  translatedIndex: number | null;
  missingTranslated: boolean;
}

export interface DualExportProgress {
  completed: number;
  total: number;
}

/**
 * Side-by-side page geometry: width is sum of both pages; height is max.
 */
export function computeSideBySidePageSize(
  original: PageSize,
  translated: PageSize,
): PageSize {
  return {
    width: original.width + translated.width,
    height: Math.max(original.height, translated.height),
  };
}

/**
 * Build the alternating page sequence: O1, T1, O2, T2… for `pageCount` pairs.
 */
export function buildAlternatingPageOrder(pageCount: number): AlternatingPageRef[] {
  const order: AlternatingPageRef[] = [];
  for (let i = 0; i < pageCount; i++) {
    order.push({ source: 'original', pageIndex: i });
    order.push({ source: 'translated', pageIndex: i });
  }
  return order;
}

/**
 * Resolve original/translated indices for dual assembly at pair `pairIndex`.
 * `originalPageCount` is the source of truth; missing mono pages fall back.
 */
export function resolveDualPagePair(
  pairIndex: number,
  originalPageCount: number,
  translatedPageCount: number,
): DualPagePair {
  if (pairIndex < 0 || pairIndex >= originalPageCount) {
    return {
      originalIndex: Math.max(0, Math.min(pairIndex, originalPageCount - 1)),
      translatedIndex: null,
      missingTranslated: true,
    };
  }
  if (pairIndex >= translatedPageCount) {
    return {
      originalIndex: pairIndex,
      translatedIndex: null,
      missingTranslated: true,
    };
  }
  return {
    originalIndex: pairIndex,
    translatedIndex: pairIndex,
    missingTranslated: false,
  };
}

/**
 * Filename suffixes per FR-1:
 * - mono → `{base}_translated_{lang}.pdf`
 * - dual side-by-side → `{base}.dual_{lang}.pdf`
 * - dual alternating → `{base}.dual.alt_{lang}.pdf`
 */
export function dualExportFilename(
  baseName: string,
  targetLanguage: string,
  mode: DualExportMode,
): string {
  const safeBase = baseName || 'document';
  const lang = targetLanguage || 'translated';
  switch (mode) {
    case 'dual-side-by-side':
      return `${safeBase}.dual_${lang}.pdf`;
    case 'dual-alternating':
      return `${safeBase}.dual.alt_${lang}.pdf`;
    case 'mono':
    default:
      return `${safeBase}_translated_${lang}.pdf`;
  }
}

/**
 * Resolve pairs for a subset translation: mono page i corresponds to
 * original page monoToOriginalIndex[i] (0-based). The mapping length
 * defines the pairs; mono pages beyond it are ignored.
 */
export function resolveSubsetPagePairs(
  monoToOriginalIndex: number[],
  originalPageCount: number,
  translatedPageCount: number,
): DualPagePair[] {
  const clamp = (idx: number): number =>
    Math.max(0, Math.min(idx, Math.max(0, originalPageCount - 1)));
  return monoToOriginalIndex.map((originalIndex, monoIndex) => ({
    originalIndex: clamp(originalIndex),
    translatedIndex: monoIndex < translatedPageCount ? monoIndex : null,
    missingTranslated: monoIndex >= translatedPageCount,
  }));
}

export interface BuildDualPdfOptions {
  /** Bytes of the mono translated PDF (from generateTranslatedPdf). */
  monoBytes: Uint8Array;
  /** Bytes of the original PDF. */
  originalBytes: Uint8Array;
  /**
   * 0-based original page index for each mono page — set when only a page
   * subset was translated. Defaults to identity pairing over all originals.
   */
  monoToOriginalIndex?: number[];
  onProgress?: (progress: DualExportProgress) => void;
  signal?: AbortSignal;
}

/**
 * Build a side-by-side dual PDF: each page is original (left) + translated (right).
 * When a translation page is missing, places only the original (left-aligned)
 * on a page sized for the pair when possible, else original size alone.
 */
export async function buildSideBySideDualPdf(
  options: BuildDualPdfOptions,
): Promise<Uint8Array> {
  const { monoBytes, originalBytes, monoToOriginalIndex, onProgress, signal } = options;
  const originalDoc = await PDFDocument.load(originalBytes);
  const monoDoc = await PDFDocument.load(monoBytes);
  const output = await PDFDocument.create();

  const origCount = originalDoc.getPageCount();
  const monoCount = monoDoc.getPageCount();
  const pairs = monoToOriginalIndex
    ? resolveSubsetPagePairs(monoToOriginalIndex, origCount, monoCount)
    : Array.from({ length: origCount }, (_, i) => resolveDualPagePair(i, origCount, monoCount));
  const total = pairs.length;

  for (let i = 0; i < pairs.length; i++) {
    if (signal?.aborted) break;

    const pair = pairs[i];
    const [origEmbedded] = await output.embedPdf(originalDoc, [pair.originalIndex]);
    const origSize = {
      width: origEmbedded.width,
      height: origEmbedded.height,
    };

    if (pair.missingTranslated || pair.translatedIndex === null) {
      // Fallback: original-only page when mono page missing.
      const page = output.addPage([origSize.width, origSize.height]);
      page.drawPage(origEmbedded, {
        x: 0,
        y: 0,
        width: origSize.width,
        height: origSize.height,
      });
    } else {
      const [transEmbedded] = await output.embedPdf(monoDoc, [pair.translatedIndex]);
      const transSize = {
        width: transEmbedded.width,
        height: transEmbedded.height,
      };
      const pageSize = computeSideBySidePageSize(origSize, transSize);
      const page = output.addPage([pageSize.width, pageSize.height]);

      // Bottom-align both when heights differ.
      const origY = pageSize.height - origSize.height;
      const transY = pageSize.height - transSize.height;

      page.drawPage(origEmbedded, {
        x: 0,
        y: origY,
        width: origSize.width,
        height: origSize.height,
      });
      page.drawPage(transEmbedded, {
        x: origSize.width,
        y: transY,
        width: transSize.width,
        height: transSize.height,
      });
    }

    onProgress?.({ completed: i + 1, total });
  }

  return output.save();
}

export interface MergedRunInput {
  /** Mono translated bytes from one successful job (subset or whole doc). */
  monoBytes: Uint8Array;
  /** 0-based original page index for each mono page (see BuildDualPdfOptions). */
  monoToOriginalIndex: number[];
}

export interface BuildMergedMonoOptions {
  originalBytes: Uint8Array;
  /** Chronological runs; on overlap, later runs override earlier ones. */
  runs: MergedRunInput[];
  onProgress?: (progress: DualExportProgress) => void;
  signal?: AbortSignal;
}

/**
 * Accumulate page-range translations into one full-length document: for each
 * original page, embed the translated page from the latest run covering it,
 * falling back to the original page when no run covered it.
 */
export async function buildMergedMonoPdf(
  options: BuildMergedMonoOptions,
): Promise<Uint8Array> {
  const { originalBytes, runs, onProgress, signal } = options;
  const originalDoc = await PDFDocument.load(originalBytes);
  const output = await PDFDocument.create();
  const origCount = originalDoc.getPageCount();

  // Latest-wins map from original page index → {run, monoIndex}.
  const pageSource = new Map<number, { run: number; monoIndex: number }>();
  runs.forEach((run, runIdx) => {
    const mapped = run.monoToOriginalIndex.slice(0, origCount);
    mapped.forEach((originalIndex, monoIndex) => {
      pageSource.set(originalIndex, { run: runIdx, monoIndex });
    });
  });

  // Load run docs lazily only when a page is actually needed.
  const runDocs = new Map<number, PDFDocument>();
  const getRunDoc = async (runIdx: number): Promise<PDFDocument> => {
    let doc = runDocs.get(runIdx);
    if (!doc) {
      doc = await PDFDocument.load(runs[runIdx].monoBytes);
      runDocs.set(runIdx, doc);
    }
    return doc;
  };

  for (let i = 0; i < origCount; i++) {
    if (signal?.aborted) break;
    const source = pageSource.get(i);
    if (source) {
      const runDoc = await getRunDoc(source.run);
      const [embedded] = await output.embedPdf(runDoc, [source.monoIndex]);
      const page = output.addPage([embedded.width, embedded.height]);
      page.drawPage(embedded, {
        x: 0,
        y: 0,
        width: embedded.width,
        height: embedded.height,
      });
    } else {
      const [embedded] = await output.embedPdf(originalDoc, [i]);
      const page = output.addPage([embedded.width, embedded.height]);
      page.drawPage(embedded, {
        x: 0,
        y: 0,
        width: embedded.width,
        height: embedded.height,
      });
    }
    onProgress?.({ completed: i + 1, total: origCount });
  }

  return output.save();
}

/**
 * Build an alternating dual PDF: O1, T1, O2, T2…
 * Missing translation pages are skipped (original only for that pair).
 */
export async function buildAlternatingDualPdf(
  options: BuildDualPdfOptions,
): Promise<Uint8Array> {
  const { monoBytes, originalBytes, onProgress, signal } = options;
  const originalDoc = await PDFDocument.load(originalBytes);
  const monoDoc = await PDFDocument.load(monoBytes);
  const output = await PDFDocument.create();

  const origCount = originalDoc.getPageCount();
  const monoCount = monoDoc.getPageCount();
  const order = buildAlternatingPageOrder(origCount);
  // Filter out translated refs that don't exist
  const filtered = order.filter((ref) => {
    if (ref.source === 'original') return ref.pageIndex < origCount;
    return ref.pageIndex < monoCount;
  });
  const total = filtered.length;

  for (let i = 0; i < filtered.length; i++) {
    if (signal?.aborted) break;
    const ref = filtered[i];
    if (!ref) continue;
    const sourceDoc = ref.source === 'original' ? originalDoc : monoDoc;
    const [embedded] = await output.embedPdf(sourceDoc, [ref.pageIndex]);
    const page = output.addPage([embedded.width, embedded.height]);
    page.drawPage(embedded, {
      x: 0,
      y: 0,
      width: embedded.width,
      height: embedded.height,
    });
    onProgress?.({ completed: i + 1, total });
  }

  return output.save();
}
