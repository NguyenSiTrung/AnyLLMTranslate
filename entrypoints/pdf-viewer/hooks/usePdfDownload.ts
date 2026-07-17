/**
 * usePdfDownload — Orchestration hook for the PDF download pipeline:
 *
 * 1. **Concurrent translation** — translate all remaining pages (if any).
 * 2. Fetch/cache a Unicode font (Noto Sans from Google Fonts CDN).
 * 3. **Serial mono PDF generation** — generateTranslatedPdf via pdf-lib.
 * 4. **Optional dual assembly** — side-by-side or alternating from mono + original.
 * 5. Trigger browser download with mode-specific filename.
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
import {
  buildAlternatingDualPdf,
  buildSideBySideDualPdf,
  dualExportFilename,
  type DualExportMode,
} from '../lib/pdfDualExport';
import { loadSettings } from '@/lib/config';

export type { DualExportMode };

export interface UsePdfDownloadOptions {
  /** PDF source URL — used for cache keys and filename derivation. */
  pdfUrl: string;
  /** All loaded PDF page proxies. */
  pages: PDFPageProxy[];
  /** Current per-page translation state from usePdfPageTranslations. */
  translations: Map<number, PageTranslations>;
}

export interface UsePdfDownloadResult {
  /** Kick off the download pipeline for the given export mode. */
  startDownload: (mode?: DualExportMode) => void;
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
  /** Export mode for the active/last run. */
  exportMode: DualExportMode;
}

/** Derive a clean base name from the PDF URL. */
function deriveBaseName(pdfUrl: string): string {
  try {
    const url = new URL(pdfUrl);
    const last = url.pathname.split('/').pop() || 'document';
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
  setTimeout(() => {
    if (a.parentNode) document.body.removeChild(a);
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
  const [exportMode, setExportMode] = useState<DualExportMode>('mono');
  const abortRef = useRef<AbortController | null>(null);
  const modeRef = useRef<DualExportMode>('mono');

  const cancel = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setIsDownloading(false);
    setStage('translating');
    setProgress(0);
    setMessage('');
    setError(undefined);
  }, []);

  const runPipeline = useCallback(async (mode: DualExportMode) => {
    const controller = new AbortController();
    abortRef.current = controller;
    modeRef.current = mode;
    setExportMode(mode);

    try {
      // ── Stage 1: Translate all remaining pages (concurrent) ──
      setStage('translating');
      setProgress(0);

      const totalPages = pages.length;
      const untranslatedCount = pages.filter((_, i) => {
        const pageNum = i + 1;
        return translations.get(pageNum)?.state !== 'translated';
      }).length;
      const alreadyTranslated = totalPages - untranslatedCount;

      if (untranslatedCount > 0) {
        setMessage(
          `Translating ${alreadyTranslated}/${totalPages} pages done — translating remaining ${untranslatedCount}… (0/${untranslatedCount})`,
        );
      } else {
        setMessage(`All ${totalPages} pages already translated`);
      }

      const translateResult =
        untranslatedCount > 0
          ? await translateAllPages({
              pages,
              pdfUrl,
              existingTranslations: translations,
              signal: controller.signal,
              onProgress: (completed, total) => {
                setProgress(total > 0 ? completed / total : 1);
                setMessage(`Translating remaining pages… (${completed}/${total})`);
              },
            })
          : {
              translations: new Map(translations),
              failedPages: [],
              errors: new Map(),
            };

      if (controller.signal.aborted) return;

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

      // ── Stage 3: Generate mono translated PDF (serial, pdf-lib) ──
      setStage('generating');
      setProgress(0);
      setMessage('Generating translated PDF…');

      const pdfResponse = await fetch(pdfUrl);
      if (!pdfResponse.ok) {
        throw new Error(`Failed to fetch original PDF: ${pdfResponse.status}`);
      }
      const originalPdfBytes = new Uint8Array(await pdfResponse.arrayBuffer());

      if (controller.signal.aborted) return;

      const monoBytes = await generateTranslatedPdf({
        originalPdfBytes,
        pageTranslations: translateResult.translations,
        fontBytes,
        signal: undefined,
        onProgress: (completed, total) => {
          setProgress(total > 0 ? completed / total : 1);
          setMessage(`Generating translated PDF… (${completed}/${total} pages)`);
        },
      });

      if (controller.signal.aborted) return;

      // ── Stage 4: Optional dual assembly ─────────────────────
      let outputBytes: Uint8Array = monoBytes;
      if (mode === 'dual-side-by-side' || mode === 'dual-alternating') {
        setStage('assembling');
        setProgress(0);
        setMessage(
          mode === 'dual-side-by-side'
            ? 'Assembling side-by-side dual PDF…'
            : 'Assembling alternating dual PDF…',
        );

        const dualOpts = {
          monoBytes,
          originalBytes: originalPdfBytes,
          onProgress: (p: { completed: number; total: number }) => {
            setProgress(p.total > 0 ? p.completed / p.total : 1);
            setMessage(
              mode === 'dual-side-by-side'
                ? `Assembling side-by-side… (${p.completed}/${p.total} pages)`
                : `Assembling alternating… (${p.completed}/${p.total} pages)`,
            );
          },
        };

        outputBytes =
          mode === 'dual-side-by-side'
            ? await buildSideBySideDualPdf(dualOpts)
            : await buildAlternatingDualPdf(dualOpts);
      }

      if (controller.signal.aborted) return;

      // ── Trigger download ────────────────────────────────────
      const settings = await loadSettings();
      const baseName = deriveBaseName(pdfUrl);
      const filename = dualExportFilename(baseName, settings.targetLanguage, mode);

      const blob = new Blob([outputBytes.buffer as ArrayBuffer], { type: 'application/pdf' });
      triggerDownload(blob, filename);

      setStage('done');
      setProgress(1);
      setMessage('Download complete!');

      setTimeout(() => {
        if (!controller.signal.aborted) {
          setIsDownloading(false);
        }
      }, 2000);
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        return;
      }
      setStage('error');
      setError(err instanceof Error ? err.message : String(err));
      setMessage('An error occurred during download');
    }
  }, [pages, pdfUrl, translations]);

  const startDownload = useCallback(
    (mode: DualExportMode = 'mono') => {
      setIsDownloading(true);
      setError(undefined);
      void runPipeline(mode);
    },
    [runPipeline],
  );

  return {
    startDownload,
    cancel,
    stage,
    progress,
    message,
    error,
    isDownloading,
    exportMode,
  };
}
