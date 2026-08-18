/**
 * Orchestrate a Scientific PDF bridge job from the viewer:
 * create → poll (with live log/progress) → fetch mono/dual blobs → user-driven download.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { loadSettings } from '@/lib/config';
import { parsePagesSpec } from '@/lib/pdfPageSelection';
import {
  mergeScientificPdfSettings,
  resolveScientificPdfStatus,
  type ScientificPdfStatus,
} from '@/lib/scientificPdf';

export type ScientificJobStage =
  | 'idle'
  | 'checking'
  | 'uploading'
  | 'running'
  | 'downloading'
  | 'done'
  | 'error';

export const SCIENTIFIC_STAGE_META: Record<
  ScientificJobStage,
  { label: string; step: number; hint: string }
> = {
  idle: { label: 'Ready', step: 0, hint: '' },
  checking: { label: 'Connect', step: 1, hint: 'Checking local Scientific bridge…' },
  uploading: { label: 'Upload', step: 2, hint: 'Sending PDF to the bridge…' },
  running: {
    label: 'Translate',
    step: 3,
    hint: 'Layout-preserving translation. This can take several minutes.',
  },
  downloading: { label: 'Fetch', step: 4, hint: 'Fetching mono and dual PDFs…' },
  done: { label: 'Done', step: 5, hint: 'Choose a format, then download.' },
  error: { label: 'Error', step: 0, hint: 'Job failed or was cancelled.' },
};

const MAX_LOG_LINES = 80;

export interface ScientificJobProgress {
  stage: ScientificJobStage;
  /** 0–1 overall progress estimate */
  progress: number;
  message: string;
  /** Rolling activity log for the modal console */
  logs: string[];
  error?: string;
  errorCode?: string;
  jobId?: string;
  monoUrl?: string;
  dualUrl?: string;
  /** Whether dual artifact is available for download */
  hasMono: boolean;
  hasDual: boolean;
  /** One-line coverage summary on the done stage (e.g. "5 pages translated"). */
  resultSummary?: string;
}

const IDLE: ScientificJobProgress = {
  stage: 'idle',
  progress: 0,
  message: '',
  logs: [],
  hasMono: false,
  hasDual: false,
};

function arrayBufferToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

function base64ToBlob(b64: string, mime: string): Blob {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new Blob([bytes], { type: mime });
}

function triggerDownload(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

function appendLog(logs: string[], line: string): string[] {
  const next = [...logs, line];
  if (next.length > MAX_LOG_LINES) {
    return next.slice(next.length - MAX_LOG_LINES);
  }
  return next;
}

function stamp(msg: string): string {
  const t = new Date().toLocaleTimeString(undefined, { hour12: false });
  return `${t}  ${msg}`;
}

/** Best-effort page count from raw PDF bytes ("/Type /Page" scan, no parser). */
async function countPdfPages(bytes: Uint8Array): Promise<number> {
  try {
    const { PDFDocument } = await import('pdf-lib');
    const doc = await PDFDocument.load(bytes, { updateMetadata: false });
    return doc.getPageCount();
  } catch {
    return 0;
  }
}

export interface UseScientificPdfJobOptions {
  pdfUrl: string;
  fileName?: string;
}

export interface UseScientificPdfJobResult {
  progress: ScientificJobProgress;
  isRunning: boolean;
  bridgeStatus: ScientificPdfStatus;
  healthOk: boolean | null;
  refreshHealth: () => Promise<boolean>;
  /**
   * Start a bridge translation job. `pages` is an optional pdf2zh-style
   * selection ("1-3, 5"); omit it for the whole document.
   * `mergeWithPrevious` (default true once a previous run exists) accumulates
   * this run onto earlier runs of the same document into one merged result.
   */
  startJob: (opts?: { pages?: string; mergeWithPrevious?: boolean }) => Promise<void>;
  /** Whether a successful run exists for the current document. */
  hasPreviousRun: boolean;
  cancel: () => Promise<void>;
  reset: () => void;
  /**
   * Resolve the blob: URL for the preferred result artifact.
   * Returns null if that artifact is missing.
   * Does not navigate — the viewer should set this URL as the active PDF.
   */
  resolveResultUrl: (prefer?: 'dual' | 'mono') => string | null;
  /** Preferred mono/dual Blob for adopting into the current viewer. */
  resolveResultBlob: (prefer?: 'dual' | 'mono') => Blob | null;
  /**
   * Load the preferred result into a viewer context.
   * Returns the blob: URL so the current viewer can adopt it (preferred).
   * Falls back to opening a new tab only when `openInNewTab` is true.
   */
  openResultInViewer: (prefer?: 'dual' | 'mono', opts?: { openInNewTab?: boolean }) => string | null;
  /**
   * Clear job progress UI state without revoking mono/dual blob URLs.
   * Use after adopting a result into the current viewer so the PDF keeps loading.
   */
  dismissProgress: () => void;
  /** User-triggered downloads (no auto-download on complete). */
  downloadMono: () => void;
  downloadDual: () => void;
  /**
   * Build left|right bilingual PDF from original + scientific mono using the
   * Fast dual assembler (explicit side-by-side pages).
   */
  downloadSideBySide: () => Promise<void>;
}

export function useScientificPdfJob({
  pdfUrl,
  fileName = 'document.pdf',
}: UseScientificPdfJobOptions): UseScientificPdfJobResult {
  const [progress, setProgress] = useState<ScientificJobProgress>(IDLE);
  // Clear accumulated runs when the document changes.
  useEffect(() => {
    runsRef.current = [];
    setHasPreviousRun(false);
  }, [pdfUrl]);
  const [healthOk, setHealthOk] = useState<boolean | null>(null);
  const [bridgeStatus, setBridgeStatus] = useState<ScientificPdfStatus>('not_configured');
  const abortRef = useRef(false);
  const jobIdRef = useRef<string | null>(null);
  const monoBlobRef = useRef<Blob | null>(null);
  const dualBlobRef = useRef<Blob | null>(null);
  const originalBytesRef = useRef<Uint8Array | null>(null);
  const monoBytesRef = useRef<Uint8Array | null>(null);
  /** Raw pages spec for this job (null = whole document). */
  const pagesSpecRef = useRef<string | null>(null);
  /** 0-based original page index per expected mono page (subset jobs). */
  const monoToOriginalRef = useRef<number[] | null>(null);
  /** Successful runs of the current document (for merge accumulation). */
  const runsRef = useRef<Array<{ monoBytes: Uint8Array; monoToOriginalIndex: number[] }>>([]);
  const [hasPreviousRun, setHasPreviousRun] = useState(false);
  const resultUrlsRef = useRef<{ mono?: string; dual?: string }>({});

  const push = useCallback(
    (patch: Partial<ScientificJobProgress> & { log?: string }) => {
      setProgress((prev) => {
        const logs = patch.log ? appendLog(prev.logs, stamp(patch.log)) : prev.logs;
        const { log: _log, ...rest } = patch;
        return { ...prev, ...rest, logs };
      });
    },
    [],
  );

  const refreshHealth = useCallback(async (): Promise<boolean> => {
    try {
      const settings = await loadSettings();
      const sci = mergeScientificPdfSettings(settings.scientificPdf);
      const res = (await chrome.runtime.sendMessage({
        action: 'SCIENTIFIC_PDF_HEALTH',
      })) as { success?: boolean; status?: string };
      const ok = Boolean(res?.success && res.status === 'ok');
      setHealthOk(ok);
      setBridgeStatus(resolveScientificPdfStatus({ settings: sci, healthOk: ok }));
      return ok;
    } catch {
      setHealthOk(false);
      try {
        const settings = await loadSettings();
        setBridgeStatus(
          resolveScientificPdfStatus({
            settings: mergeScientificPdfSettings(settings.scientificPdf),
            healthOk: false,
          }),
        );
      } catch {
        setBridgeStatus('offline');
      }
      return false;
    }
  }, []);

  const cancel = useCallback(async () => {
    abortRef.current = true;
    const jobId = jobIdRef.current;
    if (jobId) {
      try {
        await chrome.runtime.sendMessage({
          action: 'SCIENTIFIC_PDF_CANCEL',
          jobId,
        });
      } catch {
        /* best-effort */
      }
    }
    setProgress((p) =>
      p.stage === 'idle' || p.stage === 'done'
        ? p
        : {
            ...p,
            stage: 'error',
            message: 'Cancelled',
            error: 'Job cancelled',
            errorCode: 'cancelled',
            logs: appendLog(p.logs, stamp('Cancelled by user')),
          },
    );
  }, []);

  const dismissProgress = useCallback(() => {
    abortRef.current = false;
    jobIdRef.current = null;
    setProgress(IDLE);
  }, []);

  const reset = useCallback(() => {
    abortRef.current = false;
    jobIdRef.current = null;
    monoBlobRef.current = null;
    dualBlobRef.current = null;
    originalBytesRef.current = null;
    monoBytesRef.current = null;
    pagesSpecRef.current = null;
    monoToOriginalRef.current = null;
    if (resultUrlsRef.current.mono) URL.revokeObjectURL(resultUrlsRef.current.mono);
    if (resultUrlsRef.current.dual) URL.revokeObjectURL(resultUrlsRef.current.dual);
    resultUrlsRef.current = {};
    setProgress(IDLE);
    // NOTE: runsRef intentionally survives reset — startJob calls reset at the
    // top of every run, and accumulated runs must persist across runs. They
    // are cleared only when the document (pdfUrl) changes.
  }, []);

  const startJob = useCallback(async (opts?: { pages?: string; mergeWithPrevious?: boolean }) => {
    abortRef.current = false;
    reset();
    const pagesSpec = typeof opts?.pages === 'string' ? opts.pages.trim() : '';
    pagesSpecRef.current = pagesSpec || null;
    const expanded = pagesSpec ? parsePagesSpec(pagesSpec) : null;
    monoToOriginalRef.current = expanded ? expanded.map((p) => p - 1) : null;
    const mergeWithPrevious = opts?.mergeWithPrevious !== false && runsRef.current.length > 0;
    setProgress({
      ...IDLE,
      stage: 'checking',
      progress: 0.05,
      message: SCIENTIFIC_STAGE_META.checking.hint,
      logs: [
        stamp(
          pagesSpec
            ? `Starting Scientific translation (pages ${pagesSpec})…`
            : 'Starting Scientific translation…',
        ),
      ],
    });

    const ok = await refreshHealth();
    if (abortRef.current) return;
    if (!ok) {
      push({
        stage: 'error',
        progress: 0,
        message: 'Bridge offline',
        error: 'Scientific bridge is offline. Set up or start the Docker server.',
        errorCode: 'offline',
        log: 'Bridge health check failed — offline',
      });
      return;
    }
    push({ log: 'Bridge ready', message: 'Bridge online' });

    push({
      stage: 'uploading',
      progress: 0.1,
      message: SCIENTIFIC_STAGE_META.uploading.hint,
      log: 'Reading PDF bytes…',
    });

    let fileBase64: string;
    try {
      const resp = await fetch(pdfUrl);
      if (!resp.ok) throw new Error(`Failed to read PDF (${resp.status})`);
      const buf = await resp.arrayBuffer();
      originalBytesRef.current = new Uint8Array(buf.slice(0));
      fileBase64 = arrayBufferToBase64(buf);
      push({ log: `PDF loaded (${Math.round(buf.byteLength / 1024)} KB)` });
    } catch (err) {
      push({
        stage: 'error',
        progress: 0,
        message: 'Could not read PDF',
        error: err instanceof Error ? err.message : 'Failed to load PDF bytes',
        log: 'Failed to read source PDF',
      });
      return;
    }

    if (abortRef.current) return;

    push({ log: 'Creating job on bridge (uses active provider + throttle)…' });
    const createRes = (await chrome.runtime.sendMessage({
      action: 'SCIENTIFIC_PDF_CREATE_JOB',
      fileBase64,
      fileName,
      ...(pagesSpec ? { pages: pagesSpec } : {}),
    })) as {
      success?: boolean;
      jobId?: string;
      error?: string;
      code?: string;
    };

    if (!createRes?.success || !createRes.jobId) {
      push({
        stage: 'error',
        progress: 0,
        message: 'Job create failed',
        error: createRes?.error ?? 'Could not start Scientific job',
        errorCode: createRes?.code,
        log: `Create failed: ${createRes?.error ?? createRes?.code ?? 'unknown'}`,
      });
      return;
    }

    const jobId = createRes.jobId;
    jobIdRef.current = jobId;
    push({
      stage: 'running',
      progress: 0.2,
      message: SCIENTIFIC_STAGE_META.running.hint,
      jobId,
      log: `Job ${jobId} queued — translating…`,
    });

    const pollMs = 1500;
    const maxPolls = 600;
    let lastMsg = '';
    for (let i = 0; i < maxPolls; i++) {
      if (abortRef.current) return;
      await new Promise((r) => setTimeout(r, pollMs));
      if (abortRef.current) return;

      const jobRes = (await chrome.runtime.sendMessage({
        action: 'SCIENTIFIC_PDF_GET_JOB',
        jobId,
      })) as {
        success?: boolean;
        job?: {
          state: string;
          progress?: number;
          message?: string;
          error?: { code: string; message: string };
          artifacts?: { mono?: boolean; dual?: boolean };
        };
        error?: string;
        code?: string;
      };

      if (!jobRes?.success || !jobRes.job) {
        push({
          stage: 'error',
          progress: 0,
          message: 'Poll failed',
          error: jobRes?.error ?? 'Lost contact with bridge',
          errorCode: jobRes?.code,
          jobId,
          log: `Poll error: ${jobRes?.error ?? 'unknown'}`,
        });
        return;
      }

      const job = jobRes.job;
      const p =
        typeof job.progress === 'number'
          ? 0.15 + Math.min(0.7, Math.max(0, job.progress) * 0.7)
          : 0.2 + Math.min(0.6, (i / maxPolls) * 0.6);

      if (job.state === 'failed' || job.state === 'cancelled') {
        push({
          stage: 'error',
          progress: p,
          message: job.state === 'cancelled' ? 'Cancelled' : 'Job failed',
          error: job.error?.message ?? jobRes.error ?? 'Scientific translation failed',
          errorCode: job.error?.code ?? jobRes.code,
          jobId,
          log: `Job ${job.state}: ${job.error?.message ?? jobRes.error ?? ''}`,
        });
        return;
      }

      if (job.state === 'succeeded') {
        push({
          stage: 'downloading',
          progress: 0.88,
          message: SCIENTIFIC_STAGE_META.downloading.hint,
          jobId,
          log: 'Job succeeded — fetching mono & dual…',
        });

        let monoUrl: string | undefined;
        let dualUrl: string | undefined;

        const monoRes = (await chrome.runtime.sendMessage({
          action: 'SCIENTIFIC_PDF_DOWNLOAD',
          jobId,
          artifact: 'mono',
        })) as { success?: boolean; fileBase64?: string; error?: string; code?: string };

        if (monoRes?.success && monoRes.fileBase64) {
          const blob = base64ToBlob(monoRes.fileBase64, 'application/pdf');
          monoBlobRef.current = blob;
          const ab = await blob.arrayBuffer();
          monoBytesRef.current = new Uint8Array(ab);
          monoUrl = URL.createObjectURL(blob);
          resultUrlsRef.current.mono = monoUrl;
          push({ log: 'Mono PDF ready (translated only)' });

          // Record this run for merge accumulation.
          const original = originalBytesRef.current;
          const mapping = monoToOriginalRef.current;
          if (original && monoBytesRef.current) {
            if (mapping) {
              runsRef.current.push({ monoBytes: monoBytesRef.current, monoToOriginalIndex: mapping });
            } else {
              // Whole-document run: covers every original page in order.
              const origCount = await countPdfPages(original);
              runsRef.current.push({
                monoBytes: monoBytesRef.current,
                monoToOriginalIndex: Array.from({ length: origCount }, (_, i) => i),
              });
            }
          }

          // Replace the presented result with the merged document when asked.
          if (mergeWithPrevious && runsRef.current.length > 1 && original) {
            push({ log: 'Merging with previous translation runs…' });
            try {
              const { buildMergedMonoPdf } = await import('../lib/pdfDualExport');
              const mergedBytes = await buildMergedMonoPdf({
                originalBytes: original,
                runs: runsRef.current,
              });
              const mergedBlob = new Blob([new Uint8Array(mergedBytes)], {
                type: 'application/pdf',
              });
              monoBlobRef.current = mergedBlob;
              monoBytesRef.current = new Uint8Array(mergedBytes);
              if (monoUrl) URL.revokeObjectURL(monoUrl);
              monoUrl = URL.createObjectURL(mergedBlob);
              resultUrlsRef.current.mono = monoUrl;
              // Merged mono is full-length → side-by-side pairs identity.
              monoToOriginalRef.current = null;
              push({ log: 'Merged result ready (all runs combined)' });
            } catch (err) {
              push({
                log: `Merge failed — showing latest run only: ${
                  err instanceof Error ? err.message : String(err)
                }`,
              });
            }
          }
        }

        const dualRes = (await chrome.runtime.sendMessage({
          action: 'SCIENTIFIC_PDF_DOWNLOAD',
          jobId,
          artifact: 'dual',
        })) as { success?: boolean; fileBase64?: string; error?: string; code?: string };

        if (dualRes?.success && dualRes.fileBase64) {
          const blob = base64ToBlob(dualRes.fileBase64, 'application/pdf');
          dualBlobRef.current = blob;
          dualUrl = URL.createObjectURL(blob);
          resultUrlsRef.current.dual = dualUrl;
          push({
            log: 'Dual PDF ready (pdf2zh bilingual layout — often original||translated per page or interleaved)',
          });
        }

        if (!monoUrl && !dualUrl) {
          push({
            stage: 'error',
            progress: 0.9,
            message: 'Download failed',
            error: dualRes?.error ?? monoRes?.error ?? 'No artifacts returned',
            errorCode: dualRes?.code ?? monoRes?.code,
            jobId,
            log: 'No mono/dual artifacts returned',
          });
          return;
        }

        // Summary describes the presented result: union of runs when merged,
        // otherwise just the pages this run covered.
        const latestRun = runsRef.current[runsRef.current.length - 1];
        const summaryCount = mergeWithPrevious
          ? new Set(runsRef.current.flatMap((r) => r.monoToOriginalIndex)).size
          : (latestRun?.monoToOriginalIndex.length ?? 0);
        const resultSummary = mergeWithPrevious
          ? `${summaryCount} pages translated (merged with previous runs)`
          : `${summaryCount} pages translated`;

        push({
          stage: 'done',
          progress: 1,
          message: SCIENTIFIC_STAGE_META.done.hint,
          jobId,
          monoUrl,
          dualUrl,
          hasMono: Boolean(monoUrl),
          hasDual: Boolean(dualUrl),
          resultSummary,
          log: 'Complete — choose mono, dual, or side-by-side download (no auto-download)',
        });
        setHasPreviousRun(true);
        return;
      }

      // running / queued
      const msg = (job.message ?? 'Translating…').trim();
      const logLine = msg && msg !== lastMsg ? msg : undefined;
      if (logLine) lastMsg = msg;
      setProgress((prev) => ({
        ...prev,
        stage: 'running',
        progress: p,
        message: msg || SCIENTIFIC_STAGE_META.running.hint,
        jobId,
        logs: logLine ? appendLog(prev.logs, stamp(logLine)) : prev.logs,
      }));
    }

    push({
      stage: 'error',
      progress: 0.5,
      message: 'Timed out',
      error: 'Job did not finish in time',
      errorCode: 'timeout',
      jobId,
      log: 'Timed out waiting for job',
    });
  }, [pdfUrl, fileName, refreshHealth, reset, push]);

  const resolveResultUrl = useCallback((prefer: 'dual' | 'mono' = 'dual'): string | null => {
    const url =
      prefer === 'mono'
        ? resultUrlsRef.current.mono ?? resultUrlsRef.current.dual
        : resultUrlsRef.current.dual ?? resultUrlsRef.current.mono;
    return url ?? null;
  }, []);

  const resolveResultBlob = useCallback((prefer: 'dual' | 'mono' = 'dual'): Blob | null => {
    const blob =
      prefer === 'mono'
        ? monoBlobRef.current ?? dualBlobRef.current
        : dualBlobRef.current ?? monoBlobRef.current;
    return blob ?? null;
  }, []);

  /**
   * Prefer returning the blob URL for the **current** viewer to adopt.
   * Opening a new tab with `?file=blob:…` is unreliable: blob URLs are tied to
   * the creating document lifetime, and a full navigation / new document often
   * shows a blank viewer. New-tab is opt-in only.
   */
  const openResultInViewer = useCallback(
    (prefer: 'dual' | 'mono' = 'dual', opts?: { openInNewTab?: boolean }): string | null => {
      const url = resolveResultUrl(prefer);
      if (!url) return null;
      if (opts?.openInNewTab) {
        try {
          const viewerBase = chrome.runtime.getURL('pdf-viewer.html');
          const target = `${viewerBase}?file=${encodeURIComponent(url)}`;
          void chrome.tabs.create({ url: target });
        } catch {
          window.open(url, '_blank');
        }
      }
      return url;
    },
    [resolveResultUrl],
  );

  const downloadMono = useCallback(() => {
    const blob = monoBlobRef.current;
    if (!blob) return;
    const base = fileName.replace(/\.pdf$/i, '') || 'document';
    triggerDownload(blob, `${base}.sci-mono.pdf`);
  }, [fileName]);

  const downloadDual = useCallback(() => {
    const blob = dualBlobRef.current;
    if (!blob) return;
    const base = fileName.replace(/\.pdf$/i, '') || 'document';
    triggerDownload(blob, `${base}.sci-dual.pdf`);
  }, [fileName]);

  const downloadSideBySide = useCallback(async () => {
    const orig = originalBytesRef.current;
    const mono = monoBytesRef.current;
    if (!orig || !mono) {
      push({ log: 'Side-by-side needs both original and mono bytes' });
      return;
    }
    push({ log: 'Assembling left|right dual from original + mono…' });
    try {
      const { buildSideBySideDualPdf } = await import('../lib/pdfDualExport');
      const bytes = await buildSideBySideDualPdf({
        monoBytes: mono,
        originalBytes: orig,
        monoToOriginalIndex: monoToOriginalRef.current ?? undefined,
      });
      const copy = new Uint8Array(bytes.byteLength);
      copy.set(bytes);
      const blob = new Blob([copy], { type: 'application/pdf' });
      const base = fileName.replace(/\.pdf$/i, '') || 'document';
      triggerDownload(blob, `${base}.sci-dual-sbs.pdf`);
      push({ log: 'Side-by-side dual downloaded (original left | translation right)' });
    } catch (err) {
      push({
        log: `Side-by-side failed: ${err instanceof Error ? err.message : String(err)}`,
      });
    }
  }, [fileName, push]);

  const isRunning =
    progress.stage === 'checking' ||
    progress.stage === 'uploading' ||
    progress.stage === 'running' ||
    progress.stage === 'downloading';

  return {
    progress,
    isRunning,
    bridgeStatus,
    healthOk,
    refreshHealth,
    startJob,
    hasPreviousRun,
    cancel,
    reset,
    dismissProgress,
    resolveResultUrl,
    resolveResultBlob,
    openResultInViewer,
    downloadMono,
    downloadDual,
    downloadSideBySide,
  };
}
