/**
 * PDF document loader — wraps `pdfjs-dist` with extension-friendly defaults.
 *
 * Why a custom loader?
 * - PDF.js's worker must be bundled locally for MV3 (CSP forbids remote scripts).
 *   We expose it via Vite's `?url` import and the manifest's web_accessible_resources.
 * - We disable `useWorkerFetch` so the worker does not need to fetch from the
 *   network — everything stays in the extension context.
 * - `cMapUrl` and `standardFontDataUrl` point at the package's bundled assets
 *   (copied to our output by Vite when the entrypoint references them).
 */

import * as pdfjs from 'pdfjs-dist';
import type { PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist';
// Vite ?url import — emits the worker file under the extension's web_accessible assets
// and returns a runtime URL. WXT detects this asset and includes it in
// web_accessible_resources via the manifest config.
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

let workerConfigured = false;

/** Configure the global PDF.js worker exactly once. */
function ensureWorker(): void {
  if (workerConfigured) return;
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
  workerConfigured = true;
}

export interface LoadPdfOptions {
  /** Source URL (http/https/file) for the PDF */
  url: string;
  /** Optional password for encrypted PDFs */
  password?: string;
  /** Hook fired with the loading progress (0..1) */
  onProgress?: (loaded: number, total: number) => void;
}

/** Load a PDF document from a URL using the bundled worker. */
export async function loadPdfDocument(options: LoadPdfOptions): Promise<PDFDocumentProxy> {
  ensureWorker();
  const task = pdfjs.getDocument({
    url: options.url,
    password: options.password,
    isEvalSupported: false,
    useSystemFonts: true,
    disableFontFace: false,
    // The bundled worker is local; no need for worker-side fetch proxying
    useWorkerFetch: false,
    verbosity: pdfjs.VerbosityLevel.ERRORS,
  });
  if (options.onProgress) {
    task.onProgress = (params: { loaded: number; total: number }) => {
      options.onProgress?.(params.loaded, params.total);
    };
  }
  return task.promise;
}

/** Get one page (1-indexed) from a loaded document. */
export async function getPdfPage(doc: PDFDocumentProxy, pageNumber: number): Promise<PDFPageProxy> {
  return doc.getPage(pageNumber);
}
