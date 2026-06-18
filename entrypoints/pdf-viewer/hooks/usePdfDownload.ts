/**
 * usePdfDownload — Orchestration hook for the 3-stage PDF download pipeline:
 *
 * 1. Translate all remaining pages (if any are untranslated).
 * 2. Fetch/cache a Unicode font (Noto Sans from Google Fonts CDN).
 * 3. Generate a translated PDF via pdf-lib and trigger browser download.
 *
 * Returns reactive state so the UI can render a progress modal.
 */

import { useCallback, useRef, useState } from 'react';
import type { PDFPageProxy } from 'pdfjs-dist';
import type { PageTranslations } from '../lib/pdfTranslation';
import type { DownloadStage } from '../components/DownloadProgressModal';
import { translateAllPages } from '../lib/translateAllPages';
import { getFont } from '../lib/pdfFontManager';
import { generateTranslatedPdf } from '../lib/translatedPdfGenerator';
import { loadSettings } from '@/lib/config';

export interface UsePdfDownloadOptions {
  /** PDF source URL — used for cache keys and filename derivation. */
  pdfUrl: string;
  /** All loaded PDF page proxies. */
  pages: PDFPageProxy[];
  /** Current per-page translation state from usePdfPageTranslations. */
  translations: Map<number, PageTranslations>;
}

export interface UsePdfDownloadResult {
  /** Kick off the download pipeline. */
  startDownload: () => void;
  /** Cancel an in-progress download. */
  cancel: () => void;
  /** Current download stage. */
  stage: DownloadStage;
  /** Progress fraction (0–1) for the current stage. */
  progress: number;
  /** Human-readable status message. */
  message: string;
  /** Error message (if stage === 'error'). */
  error: string | undefined;
  /** Whether the download pipeline is active. */
  isDownloading: boolean;
}

/** Derive a clean base name from the PDF URL. */
function deriveBaseName(pdfUrl: string): string {
  try {
    const url = new URL(pdfUrl);
    const last = url.pathname.split('/').pop() || 'document';
    // Strip .pdf extension if present
    return last.replace(/\.pdf$/i, '');
  } catch {
    return 'document';
  }
}

/** Trigger a browser download via a temporary anchor element. */
function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  // Cleanup after a tick to allow the browser to start the download.
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 100);
}

export function usePdfDownload({
  pdfUrl,
  pages,
  translations,
}: UsePdfDownloadOptions): UsePdfDownloadResult {
  const [stage, setStage] = useState<DownloadStage>('translating');
  const [progress, setProgress] = useState(0);
  const [message, setMessage] = useState('');
  const [error, setError] = useState<string | undefined>(undefined);
  const [isDownloading, setIsDownloading] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const cancel = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setIsDownloading(false);
    setStage('translating');
    setProgress(0);
    setMessage('');
    setError(undefined);
  }, []);

  const runPipeline = useCallback(async () => {
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      // ── Stage 1: Translate all remaining pages ──────────────
      setStage('translating');
      setProgress(0);

      // Count how many pages still need translation
      const untranslatedCount = pages.filter((_, i) => {
        const pageNum = i + 1;
        return translations.get(pageNum)?.state !== 'translated';
      }).length;

      if (untranslatedCount > 0) {
        setMessage(`Translating remaining pages… (0/${untranslatedCount})`);
      } else {
        setMessage('All pages already translated');
      }

      const translateResult = await translateAllPages({
        pages,
        pdfUrl,
        existingTranslations: translations,
        signal: controller.signal,
        onProgress: (completed, total) => {
          setProgress(total > 0 ? completed / total : 1);
          setMessage(`Translating remaining pages… (${completed}/${total})`);
        },
      });

      if (controller.signal.aborted) return;

      // Check for failures
      if (translateResult.failedPages.length > 0) {
        const failedList = translateResult.failedPages.join(', ');
        setStage('error');
        setError(`Failed to translate page(s): ${failedList}`);
        setMessage('Some pages failed to translate');
        return;
      }

      // ── Stage 2: Download/cache font ────────────────────────
      setStage('font');
      setProgress(0);
      setMessage('Downloading font…');

      const fontBytes = await getFont((p) => {
        setProgress(p.bytesTotal > 0 ? p.bytesLoaded / p.bytesTotal : 0);
      });

      if (controller.signal.aborted) return;

      // ── Stage 3: Generate translated PDF ────────────────────
      setStage('generating');
      setProgress(0);
      setMessage('Generating PDF…');

      // Fetch original PDF bytes
      const pdfResponse = await fetch(pdfUrl);
      if (!pdfResponse.ok) {
        throw new Error(`Failed to fetch original PDF: ${pdfResponse.status}`);
      }
      const originalPdfBytes = new Uint8Array(await pdfResponse.arrayBuffer());

      if (controller.signal.aborted) return;

      const outputBytes = await generateTranslatedPdf({
        originalPdfBytes,
        pageTranslations: translateResult.translations,
        fontBytes,
        onProgress: (completed, total) => {
          setProgress(total > 0 ? completed / total : 1);
          setMessage(`Generating PDF… (${completed}/${total} pages)`);
        },
      });

      if (controller.signal.aborted) return;

      // ── Trigger download ────────────────────────────────────
      const settings = await loadSettings();
      const baseName = deriveBaseName(pdfUrl);
      const filename = `${baseName}_translated_${settings.targetLanguage}.pdf`;

      const blob = new Blob([outputBytes.buffer as ArrayBuffer], { type: 'application/pdf' });
      triggerDownload(blob, filename);

      setStage('done');
      setProgress(1);
      setMessage('Download complete!');

      // Auto-close after 2 seconds
      setTimeout(() => {
        if (!controller.signal.aborted) {
          setIsDownloading(false);
        }
      }, 2000);
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        // User cancelled — already handled by cancel()
        return;
      }
      setStage('error');
      setError(err instanceof Error ? err.message : String(err));
      setMessage('An error occurred during download');
    }
  }, [pages, pdfUrl, translations]);

  const startDownload = useCallback(() => {
    setIsDownloading(true);
    setError(undefined);
    void runPipeline();
  }, [runPipeline]);

  return {
    startDownload,
    cancel,
    stage,
    progress,
    message,
    error,
    isDownloading,
  };
}
