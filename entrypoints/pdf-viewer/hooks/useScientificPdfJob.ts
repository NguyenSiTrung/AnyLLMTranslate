/**
 * Orchestrate a Scientific PDF bridge job from the viewer:
 * create → poll (with live log/progress) → fetch mono/dual blobs → user-driven download.
 */

import { useCallback, useRef, useState } from 'react';
import { loadSettings } from '@/lib/config';
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
    hint: 'Layout-preserving translation (pdf2zh). This can take several minutes.',
  },
  downloading: { label: 'Fetch', step: 4, hint: 'Fetching mono and dual PDFs…' },
  done: { label: 'Done', step: 5, hint: 'Choose a download format or open in the viewer.' },
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
  startJob: () => Promise<void>;
  cancel: () => Promise<void>;
  reset: () => void;
  openResultInViewer: (prefer?: 'dual' | 'mono') => void;
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
  const [healthOk, setHealthOk] = useState<boolean | null>(null);
  const [bridgeStatus, setBridgeStatus] = useState<ScientificPdfStatus>('not_configured');
  const abortRef = useRef(false);
  const jobIdRef = useRef<string | null>(null);
  const monoBlobRef = useRef<Blob | null>(null);
  const dualBlobRef = useRef<Blob | null>(null);
  const originalBytesRef = useRef<Uint8Array | null>(null);
  const monoBytesRef = useRef<Uint8Array | null>(null);
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

  const reset = useCallback(() => {
    abortRef.current = false;
    jobIdRef.current = null;
    monoBlobRef.current = null;
    dualBlobRef.current = null;
    originalBytesRef.current = null;
    monoBytesRef.current = null;
    if (resultUrlsRef.current.mono) URL.revokeObjectURL(resultUrlsRef.current.mono);
    if (resultUrlsRef.current.dual) URL.revokeObjectURL(resultUrlsRef.current.dual);
    resultUrlsRef.current = {};
    setProgress(IDLE);
  }, []);

  const startJob = useCallback(async () => {
    abortRef.current = false;
    reset();
    setProgress({
      ...IDLE,
      stage: 'checking',
      progress: 0.05,
      message: SCIENTIFIC_STAGE_META.checking.hint,
      logs: [stamp('Starting Scientific translation…')],
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

        push({
          stage: 'done',
          progress: 1,
          message: SCIENTIFIC_STAGE_META.done.hint,
          jobId,
          monoUrl,
          dualUrl,
          hasMono: Boolean(monoUrl),
          hasDual: Boolean(dualUrl),
          log: 'Complete — choose mono, dual, or side-by-side download (no auto-download)',
        });
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

  const openResultInViewer = useCallback((prefer: 'dual' | 'mono' = 'dual') => {
    const url =
      prefer === 'mono'
        ? resultUrlsRef.current.mono ?? resultUrlsRef.current.dual
        : resultUrlsRef.current.dual ?? resultUrlsRef.current.mono;
    if (!url) return;
    try {
      const viewerBase = chrome.runtime.getURL('pdf-viewer.html');
      const target = `${viewerBase}?file=${encodeURIComponent(url)}`;
      void chrome.tabs.create({ url: target });
    } catch {
      window.open(url, '_blank');
    }
  }, []);

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
    cancel,
    reset,
    openResultInViewer,
    downloadMono,
    downloadDual,
    downloadSideBySide,
  };
}
