/**
 * pdfScannedDetect — Heuristic detection of scanned / image-only PDF pages.
 *
 * Compares extractable text density to page area. Heavily scanned documents
 * get a high scan score so the viewer can enable an OCR workaround path
 * (white underlay + forced text overlay assumptions) or surface a clear
 * "cannot translate" message when there is no text layer.
 *
 * Inspired by BabelDOC scanned-detect methodology; pure helpers, no network.
 */

/** Metrics for one page used to score how "scanned" it looks. */
export interface PageScanMetrics {
  /** Page width in PDF units (or any consistent unit). */
  pageWidth: number;
  /** Page height in PDF units. */
  pageHeight: number;
  /** Total characters extracted from the text layer. */
  textCharCount: number;
  /** Number of text items / paragraphs extracted (optional signal). */
  textItemCount?: number;
}

export interface DocumentScanAssessment {
  /** Mean page scan score in [0, 1]. */
  averageScore: number;
  /** Max page score in [0, 1]. */
  maxScore: number;
  /** True when the document is heavily scanned (threshold crossed). */
  heavilyScanned: boolean;
  /** True when essentially no extractable text exists on sampled pages. */
  pureScanNoText: boolean;
  /** Per-page scores (same order as input). */
  pageScores: number[];
}

/** Default threshold for "heavily scanned" document average score. */
export const HEAVY_SCAN_THRESHOLD = 0.72;
/** Char density (chars per unit area) below which a page looks empty/scanned. */
export const LOW_DENSITY_THRESHOLD = 0.00015;
/** Absolute char count below which a large page is treated as empty. */
export const EMPTY_TEXT_CHAR_THRESHOLD = 12;

/**
 * Score a single page in [0, 1] where 1 = heavily scanned / no text.
 *
 * Signals:
 * - Empty or near-empty text layer on a large page → high score
 * - Low characters-per-area density → elevated score
 * - Dense text → low score
 */
export function scorePageScan(metrics: PageScanMetrics): number {
  const area = Math.max(metrics.pageWidth, 1) * Math.max(metrics.pageHeight, 1);
  const chars = Math.max(0, metrics.textCharCount);
  const density = chars / area;

  // Pure empty text layer on a non-tiny page → near 1.0
  if (chars <= EMPTY_TEXT_CHAR_THRESHOLD) {
    // Tiny pages (e.g. icons) shouldn't always force scan mode.
    if (area < 10_000) return 0.55;
    return 0.98;
  }

  // Map density to score: lower density → higher scan score.
  // dens ~0.001+ is "dense text"; dens ~LOW_DENSITY_THRESHOLD is sparse.
  if (density >= 0.001) return 0.05;
  if (density >= 0.0004) return 0.25;
  if (density >= LOW_DENSITY_THRESHOLD) return 0.55;
  return 0.85;
}

/**
 * Aggregate page scores into a document-level assessment.
 */
export function assessDocumentScan(
  pages: PageScanMetrics[],
  heavyThreshold = HEAVY_SCAN_THRESHOLD,
): DocumentScanAssessment {
  if (pages.length === 0) {
    return {
      averageScore: 0,
      maxScore: 0,
      heavilyScanned: false,
      pureScanNoText: false,
      pageScores: [],
    };
  }

  const pageScores = pages.map(scorePageScan);
  const averageScore = pageScores.reduce((a, b) => a + b, 0) / pageScores.length;
  const maxScore = Math.max(...pageScores);
  const pureScanNoText = pages.every((p) => p.textCharCount <= EMPTY_TEXT_CHAR_THRESHOLD);
  const heavilyScanned = averageScore >= heavyThreshold || (pureScanNoText && pages.length > 0);

  return {
    averageScore,
    maxScore,
    heavilyScanned,
    pureScanNoText,
    pageScores,
  };
}

/**
 * Whether OCR workaround should auto-enable given settings + assessment.
 */
export function shouldEnableOcrWorkaround(
  assessment: DocumentScanAssessment,
  settings: { detectScanned: boolean; autoOcrWorkaround: boolean },
): boolean {
  if (!settings.detectScanned) return false;
  if (!settings.autoOcrWorkaround) return false;
  return assessment.heavilyScanned && !assessment.pureScanNoText;
}

/**
 * User-facing message when PDF has no usable text layer.
 */
export function scannedOnlyMessage(): string {
  return (
    'This PDF looks like a scan with no extractable text layer. ' +
    'Translation requires selectable text (or OCR). ' +
    'Try a text-based PDF export from the source.'
  );
}
