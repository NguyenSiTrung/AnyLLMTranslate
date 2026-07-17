/**
 * Orchestrate a Scientific PDF bridge job from the viewer:
 * create → poll → download mono/dual → optional open dual in viewer.
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

export interface ScientificJobProgress {
  stage: ScientificJobStage;
  /** 0–1 overall progress estimate */
  progress: number;
  message: string;
  error?: string;
  errorCode?: string;
  jobId?: string;
  monoUrl?: string;
  dualUrl?: string;
}

const IDLE: ScientificJobProgress = {
  stage: 'idle',
  progress: 0,
  message: '',
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
  // Revoke after a tick so the download can start
  window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
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
  /** Probe bridge health and update bridgeStatus. */
  refreshHealth: () => Promise<boolean>;
  /** Start full scientific job for the current PDF URL. */
  startJob: () => Promise<void>;
  cancel: () => Promise<void>;
  reset: () => void;
  /** Open dual (or mono fallback) in the extension viewer. */
  openResultInViewer: () => void;
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
  const resultUrlsRef = useRef<{ mono?: string; dual?: string }>({});

  const refreshHealth = useCallback(async (): Promise<boolean> => {
    try {
      const settings = await loadSettings();
      const sci = mergeScientificPdfSettings(settings.scientificPdf);
      const res = (await chrome.runtime.sendMessage({
        action: 'SCIENTIFIC_PDF_HEALTH',
      })) as { success?: boolean; status?: string };
      const ok = Boolean(res?.success && res.status === 'ok');
      setHealthOk(ok);
      setBridgeStatus(
        resolveScientificPdfStatus({ settings: sci, healthOk: ok }),
      );
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
        : { ...p, stage: 'error', message: 'Cancelled', error: 'Job cancelled', errorCode: 'cancelled' },
    );
  }, []);

  const reset = useCallback(() => {
    abortRef.current = false;
    jobIdRef.current = null;
    if (resultUrlsRef.current.mono) URL.revokeObjectURL(resultUrlsRef.current.mono);
    if (resultUrlsRef.current.dual) URL.revokeObjectURL(resultUrlsRef.current.dual);
    resultUrlsRef.current = {};
    setProgress(IDLE);
  }, []);

  const startJob = useCallback(async () => {
    abortRef.current = false;
    reset();
    setProgress({ stage: 'checking', progress: 0.05, message: 'Checking bridge…' });

    const ok = await refreshHealth();
    if (abortRef.current) return;
    if (!ok) {
      setProgress({
        stage: 'error',
        progress: 0,
        message: 'Bridge offline',
        error: 'Scientific bridge is offline. Set up or start the Docker server.',
        errorCode: 'offline',
      });
      return;
    }

    setProgress({ stage: 'uploading', progress: 0.1, message: 'Uploading PDF…' });

    let fileBase64: string;
    try {
      const resp = await fetch(pdfUrl);
      if (!resp.ok) throw new Error(`Failed to read PDF (${resp.status})`);
      const buf = await resp.arrayBuffer();
      fileBase64 = arrayBufferToBase64(buf);
    } catch (err) {
      setProgress({
        stage: 'error',
        progress: 0,
        message: 'Could not read PDF',
        error: err instanceof Error ? err.message : 'Failed to load PDF bytes',
      });
      return;
    }

    if (abortRef.current) return;

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
      setProgress({
        stage: 'error',
        progress: 0,
        message: 'Job create failed',
        error: createRes?.error ?? 'Could not start Scientific job',
        errorCode: createRes?.code,
      });
      return;
    }

    const jobId = createRes.jobId;
    jobIdRef.current = jobId;
    setProgress({
      stage: 'running',
      progress: 0.2,
      message: 'Translating (layout-preserving)…',
      jobId,
    });

    // Poll until terminal state
    const pollMs = 1500;
    const maxPolls = 600; // ~15 min
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
        setProgress({
          stage: 'error',
          progress: 0,
          message: 'Poll failed',
          error: jobRes?.error ?? 'Lost contact with bridge',
          errorCode: jobRes?.code,
          jobId,
        });
        return;
      }

      const job = jobRes.job;
      const p =
        typeof job.progress === 'number'
          ? 0.2 + Math.min(0.6, Math.max(0, job.progress) * 0.6)
          : 0.2 + Math.min(0.6, (i / maxPolls) * 0.6);

      if (job.state === 'failed' || job.state === 'cancelled') {
        setProgress({
          stage: 'error',
          progress: p,
          message: job.state === 'cancelled' ? 'Cancelled' : 'Job failed',
          error: job.error?.message ?? jobRes.error ?? 'Scientific translation failed',
          errorCode: job.error?.code ?? jobRes.code,
          jobId,
        });
        return;
      }

      if (job.state === 'succeeded') {
        setProgress({
          stage: 'downloading',
          progress: 0.85,
          message: 'Downloading mono + dual…',
          jobId,
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
          monoUrl = URL.createObjectURL(blob);
          resultUrlsRef.current.mono = monoUrl;
          const base = fileName.replace(/\.pdf$/i, '') || 'document';
          triggerDownload(blob, `${base}.sci-mono.pdf`);
        }

        const dualRes = (await chrome.runtime.sendMessage({
          action: 'SCIENTIFIC_PDF_DOWNLOAD',
          jobId,
          artifact: 'dual',
        })) as { success?: boolean; fileBase64?: string; error?: string; code?: string };

        if (dualRes?.success && dualRes.fileBase64) {
          const blob = base64ToBlob(dualRes.fileBase64, 'application/pdf');
          dualUrl = URL.createObjectURL(blob);
          resultUrlsRef.current.dual = dualUrl;
          const base = fileName.replace(/\.pdf$/i, '') || 'document';
          triggerDownload(blob, `${base}.sci-dual.pdf`);
        }

        if (!monoUrl && !dualUrl) {
          setProgress({
            stage: 'error',
            progress: 0.9,
            message: 'Download failed',
            error: dualRes?.error ?? monoRes?.error ?? 'No artifacts returned',
            errorCode: dualRes?.code ?? monoRes?.code,
            jobId,
          });
          return;
        }

        setProgress({
          stage: 'done',
          progress: 1,
          message: dualUrl
            ? 'Scientific translation complete — dual + mono downloaded'
            : 'Scientific translation complete — mono downloaded (dual unavailable)',
          jobId,
          monoUrl,
          dualUrl,
        });
        return;
      }

      setProgress({
        stage: 'running',
        progress: p,
        message: job.message ?? 'Translating…',
        jobId,
      });
    }

    setProgress({
      stage: 'error',
      progress: 0.5,
      message: 'Timed out',
      error: 'Job did not finish in time',
      errorCode: 'timeout',
      jobId,
    });
  }, [pdfUrl, fileName, refreshHealth, reset]);

  const openResultInViewer = useCallback(() => {
    const url = resultUrlsRef.current.dual ?? resultUrlsRef.current.mono;
    if (!url) return;
    // Prefer opening dual (or mono) as the viewer `file` query via extension page
    try {
      const viewerBase = chrome.runtime.getURL('pdf-viewer.html');
      const target = `${viewerBase}?file=${encodeURIComponent(url)}`;
      void chrome.tabs.create({ url: target });
    } catch {
      window.open(url, '_blank');
    }
  }, []);

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
  };
}
