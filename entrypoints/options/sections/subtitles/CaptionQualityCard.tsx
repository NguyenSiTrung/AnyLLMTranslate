/**
 * YouTube ASR re-alignment (local + optional AI/BYOK) + saved cache summary.
 */

import { useCallback, useEffect, useState } from 'react';
import { Sparkles } from 'lucide-react';
import { Card } from '@/ui/Card';
import { Badge } from '@/ui/Badge';
import { Button } from '@/ui/Button';
import { Modal } from '@/ui/Modal';
import { DisabledDimmer } from '@/ui/DisabledDimmer';
import { Toggle } from '@/ui/Toggle';
import { DEFAULT_YOUTUBE_ASR_RESEGMENT_SETTINGS } from '@/types/config';
import { formatAsrRealignBytes } from '@/lib/youtubeAsrRealignCache';
import type { AsrRealignCacheStatsResult } from '@/types/messages';
import type { SubtitleCardBaseProps } from './types';

export const SAVED_CAPTION_REALIGNS_SECTION_ID = 'saved-caption-realigns';

export function CaptionQualityCard({ settings, disabled, onUpdate }: SubtitleCardBaseProps) {
  const asr = settings.youtubeAsrResegment ?? DEFAULT_YOUTUBE_ASR_RESEGMENT_SETTINGS;
  const masterOn = asr.enable;

  const [statsLoading, setStatsLoading] = useState(true);
  const [entryCount, setEntryCount] = useState(0);
  const [totalBytes, setTotalBytes] = useState(0);
  const [showClearModal, setShowClearModal] = useState(false);
  const [clearing, setClearing] = useState(false);

  const refreshStats = useCallback(async () => {
    setStatsLoading(true);
    try {
      const res = (await chrome.runtime.sendMessage({
        action: 'ASR_REALIGN_CACHE_STATS',
      })) as AsrRealignCacheStatsResult | undefined;
      if (res?.success) {
        setEntryCount(res.entryCount ?? 0);
        setTotalBytes(res.totalBytes ?? 0);
      }
    } catch {
      // keep previous
    } finally {
      setStatsLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshStats();
    const onMsg = (msg: { action?: string }) => {
      if (msg?.action === 'ASR_REALIGN_CACHE_UPDATED') void refreshStats();
    };
    chrome.runtime.onMessage.addListener(onMsg);
    const onVis = () => {
      if (document.visibilityState === 'visible') void refreshStats();
    };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      chrome.runtime.onMessage.removeListener(onMsg);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [refreshStats]);

  const scrollToManager = () => {
    const el = document.getElementById(SAVED_CAPTION_REALIGNS_SECTION_ID);
    el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    if (el instanceof HTMLElement) {
      el.focus({ preventScroll: true });
    }
  };

  const handleClearAll = async () => {
    setClearing(true);
    try {
      await chrome.runtime.sendMessage({ action: 'CLEAR_ASR_REALIGN_CACHE' });
      await refreshStats();
    } finally {
      setClearing(false);
      setShowClearModal(false);
    }
  };

  return (
    <Card
      title="Caption quality"
      description="Improve auto-generated YouTube captions before translation."
      icon={<Sparkles className="w-3.5 h-3.5" />}
      variant="bordered"
      headerExtra={<Badge variant="info">YouTube</Badge>}
    >
      <DisabledDimmer disabled={disabled}>
        <div className="space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-sm text-zinc-200">Improve auto-generated captions</p>
              <p className="text-xs text-zinc-500 mt-0.5 leading-relaxed">
                Re-chunk fragmented ASR captions into clearer sentences before translation.
                Human-uploaded tracks are unchanged.
              </p>
            </div>
            <Toggle
              id="youtube-asr-resegment-enable"
              ariaLabel="Improve auto-generated captions"
              checked={masterOn}
              disabled={disabled}
              onChange={(checked) => {
                onUpdate({
                  youtubeAsrResegment: {
                    ...asr,
                    enable: checked,
                    aiEnable: checked ? asr.aiEnable : false,
                  },
                });
              }}
            />
          </div>

          <div
            className={`rounded-lg border p-3 space-y-2 ${
              masterOn
                ? 'border-cyan-500/15 bg-cyan-500/[0.03]'
                : 'border-zinc-800/50 bg-transparent opacity-70'
            }`}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm text-zinc-300">AI re-align</p>
                <p className="text-xs text-zinc-500 mt-0.5 leading-relaxed">
                  Use your configured LLM (BYOK) for smarter sentence boundaries. Falls back
                  to local rules if the AI call fails. Uses extra tokens. Successful runs are
                  saved on this device. Changing models does not auto-invalidate — use Force
                  re-run in Saved caption re-aligns.
                </p>
              </div>
              <Toggle
                id="youtube-asr-resegment-ai-enable"
                ariaLabel="AI re-align auto-generated captions"
                checked={asr.aiEnable}
                disabled={disabled || !masterOn}
                onChange={(checked) => {
                  onUpdate({
                    youtubeAsrResegment: { ...asr, aiEnable: checked },
                  });
                }}
              />
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-zinc-800/60">
              <p className="text-xs text-zinc-500" data-testid="asr-realign-summary">
                {statsLoading
                  ? 'Measuring saved re-aligns…'
                  : entryCount === 0
                    ? 'No saved re-aligns yet'
                    : `${entryCount} saved · ${formatAsrRealignBytes(totalBytes)}`}
              </p>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={scrollToManager}
                  disabled={disabled}
                >
                  Manage
                </Button>
                <Button
                  size="sm"
                  variant="warning"
                  disabled={disabled || entryCount === 0 || clearing}
                  loading={clearing}
                  onClick={() => setShowClearModal(true)}
                >
                  Clear all
                </Button>
              </div>
            </div>
          </div>
        </div>
      </DisabledDimmer>

      {showClearModal && (
        <Modal
          title="Clear saved caption re-aligns?"
          message="This deletes all AI re-aligned caption saves on this device. The next watch will re-run AI re-align (token cost). Translation cache is not affected."
          variant="danger"
          confirmLabel="Clear all"
          cancelLabel="Keep"
          onConfirm={() => {
            void handleClearAll();
          }}
          onCancel={() => setShowClearModal(false)}
        />
      )}
    </Card>
  );
}
