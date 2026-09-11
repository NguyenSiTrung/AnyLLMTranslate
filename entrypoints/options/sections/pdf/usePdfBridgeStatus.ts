/**
 * usePdfBridgeStatus — single owner of Scientific-PDF bridge health state.
 * Probes the extension background with SCIENTIFIC_PDF_HEALTH and resolves
 * status via resolveScientificPdfStatus. Skips probing entirely when the
 * bridge was never configured, matching the previous Advanced behavior.
 */

import { useCallback, useEffect, useState } from 'react';
import type { ScientificPdfSettings } from '@/types/config';
import {
  resolveScientificPdfStatus,
  type ScientificPdfStatus,
} from '@/lib/scientificPdf';

interface HealthResponse {
  success?: boolean;
  status?: string;
}

interface UsePdfBridgeStatusResult {
  status: ScientificPdfStatus;
  checking: boolean;
  error: string;
  refresh: () => Promise<void>;
}

export function usePdfBridgeStatus(
  scientificPdf: ScientificPdfSettings,
): UsePdfBridgeStatusResult {
  const { enabled, setupCompletedAt, serverUrl } = scientificPdf;
  const [status, setStatus] = useState<ScientificPdfStatus>('not_configured');
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState('');

  const refresh = useCallback(async () => {
    if (!enabled && !setupCompletedAt) {
      setStatus('not_configured');
      setError('');
      return;
    }
    setChecking(true);
    setError('');
    let healthOk = false;
    try {
      const res = (await chrome.runtime.sendMessage({
        action: 'SCIENTIFIC_PDF_HEALTH',
      })) as HealthResponse;
      healthOk = Boolean(res?.success && res.status === 'ok');
      if (!healthOk) {
        setError('Bridge health check failed');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Health check failed');
    }
    setStatus(
      resolveScientificPdfStatus({
        settings: { enabled, setupCompletedAt },
        healthOk,
      }),
    );
    setChecking(false);
  }, [enabled, setupCompletedAt, serverUrl]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { status, checking, error, refresh };
}
