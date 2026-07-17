/**
 * Session-scoped scanned-PDF assessment for the active document.
 * Pure storage + helpers; detection runs once per (url, lang) sample.
 */

import type { DocumentScanAssessment } from './pdfScannedDetect';

export interface PdfScanSessionState {
  assessment: DocumentScanAssessment | null;
  ocrWorkaround: boolean;
  pureScanBlocked: boolean;
  message: string | null;
}

const defaultState = (): PdfScanSessionState => ({
  assessment: null,
  ocrWorkaround: false,
  pureScanBlocked: false,
  message: null,
});

let state: PdfScanSessionState = defaultState();
let assessedUrl: string | null = null;

export function getPdfScanSession(): PdfScanSessionState {
  return state;
}

export function isOcrWorkaroundActive(): boolean {
  return state.ocrWorkaround;
}

export function resetPdfScanSession(): void {
  state = defaultState();
  assessedUrl = null;
}

export function setPdfScanSession(
  pdfUrl: string,
  next: PdfScanSessionState,
): void {
  assessedUrl = pdfUrl;
  state = next;
}

export function hasAssessedPdfUrl(pdfUrl: string): boolean {
  return assessedUrl === pdfUrl && state.assessment !== null;
}
