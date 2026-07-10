/**
 * Poll live pool key circuit-breaker statuses while the Providers tab is open.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { PoolKeyLiveStatus } from '@/lib/poolDashboardStatus';
import type { GetPoolKeyStatusesResponse } from '@/types/messages';

const POLL_MS = 3000;

export function usePoolKeyStatuses(enabled: boolean): {
  statuses: Record<string, PoolKeyLiveStatus> | null;
  liveAvailable: boolean;
  refresh: () => Promise<void>;
} {
  const [statuses, setStatuses] = useState<Record<string, PoolKeyLiveStatus> | null>(null);
  const [liveAvailable, setLiveAvailable] = useState(true);
  const mountedRef = useRef(true);

  const refresh = useCallback(async () => {
    try {
      const response = (await chrome.runtime.sendMessage({
        action: 'GET_POOL_KEY_STATUSES',
      })) as GetPoolKeyStatusesResponse | undefined;

      if (!mountedRef.current) return;

      if (!response || response.success === false) {
        setLiveAvailable(false);
        return;
      }

      setLiveAvailable(true);
      setStatuses(response.statuses ?? {});
    } catch {
      if (!mountedRef.current) return;
      setLiveAvailable(false);
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!enabled) return;

    const tick = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
        return;
      }
      void refresh();
    };

    tick();
    const id = window.setInterval(tick, POLL_MS);

    const onFocus = () => {
      void refresh();
    };
    const onVisibility = () => {
      if (document.visibilityState === 'visible') void refresh();
    };

    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      window.clearInterval(id);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [enabled, refresh]);

  return { statuses, liveAvailable, refresh };
}
