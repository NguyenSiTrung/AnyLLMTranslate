/**
 * Full manager for saved YouTube AI re-align cache entries.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Database, ExternalLink, Trash2, RefreshCw } from 'lucide-react';
import { Card } from '@/ui/Card';
import { Button } from '@/ui/Button';
import { Modal } from '@/ui/Modal';
import { DisabledDimmer } from '@/ui/DisabledDimmer';
import { EmptyState } from '@/ui/EmptyState';
import {
  formatAsrRealignBytes,
  sortAsrRealignSummaries,
  type YoutubeAsrRealignCacheSummary,
} from '@/lib/youtubeAsrRealignCache';
import type { ListAsrRealignCacheResult } from '@/types/messages';

export interface SavedCaptionRealignsCardProps {
  disabled?: boolean;
}

type SortMode = 'lastUsed' | 'newest';

export function SavedCaptionRealignsCard({ disabled = false }: SavedCaptionRealignsCardProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [entries, setEntries] = useState<YoutubeAsrRealignCacheSummary[]>([]);
  const [sort, setSort] = useState<SortMode>('lastUsed');
  const [showClearModal, setShowClearModal] = useState(false);
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = (await chrome.runtime.sendMessage({
        action: 'LIST_ASR_REALIGN_CACHE',
      })) as ListAsrRealignCacheResult | undefined;
      if (!res?.success) {
        setError(res?.error || 'Failed to load saved re-aligns');
        setEntries([]);
      } else {
        setEntries((res.entries ?? []) as YoutubeAsrRealignCacheSummary[]);
      }
    } catch (e) {
      setError(String(e));
      setEntries([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const onMsg = (msg: { action?: string }) => {
      if (msg?.action === 'ASR_REALIGN_CACHE_UPDATED') void refresh();
    };
    chrome.runtime.onMessage.addListener(onMsg);
    const onVis = () => {
      if (document.visibilityState === 'visible') void refresh();
    };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      chrome.runtime.onMessage.removeListener(onMsg);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [refresh]);

  const sorted = useMemo(() => sortAsrRealignSummaries(entries, sort), [entries, sort]);

  const deleteKey = async (key: string) => {
    setBusyKey(key);
    try {
      await chrome.runtime.sendMessage({ action: 'DELETE_ASR_REALIGN_CACHE', key });
      await refresh();
    } finally {
      setBusyKey(null);
    }
  };

  const clearAll = async () => {
    setBusyKey('__all__');
    try {
      await chrome.runtime.sendMessage({ action: 'CLEAR_ASR_REALIGN_CACHE' });
      await refresh();
    } finally {
      setBusyKey(null);
      setShowClearModal(false);
    }
  };

  return (
    <Card
      title="Saved caption re-aligns"
      description="AI re-aligned YouTube captions saved on this device. Force re-run removes a save so the next watch calls the LLM again."
      icon={<Database className="w-3.5 h-3.5" />}
      variant="bordered"
    >
      <DisabledDimmer disabled={disabled}>
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="inline-flex rounded-lg border border-zinc-800 p-0.5 text-xs">
              <button
                type="button"
                className={`px-2.5 py-1 rounded-md ${
                  sort === 'lastUsed' ? 'bg-zinc-800 text-zinc-100' : 'text-zinc-500'
                }`}
                onClick={() => setSort('lastUsed')}
              >
                Last used
              </button>
              <button
                type="button"
                className={`px-2.5 py-1 rounded-md ${
                  sort === 'newest' ? 'bg-zinc-800 text-zinc-100' : 'text-zinc-500'
                }`}
                onClick={() => setSort('newest')}
              >
                Newest
              </button>
            </div>
            <Button
              size="sm"
              variant="warning"
              disabled={disabled || entries.length === 0 || busyKey === '__all__'}
              onClick={() => setShowClearModal(true)}
              icon={<Trash2 className="w-3.5 h-3.5" />}
            >
              Clear all
            </Button>
          </div>

          {loading && (
            <p className="text-xs text-zinc-500" data-testid="asr-realign-list-loading">
              Loading saved re-aligns…
            </p>
          )}

          {!loading && error && (
            <div className="flex items-center justify-between gap-2 text-xs text-rose-400">
              <span>{error}</span>
              <Button size="sm" variant="ghost" onClick={() => void refresh()}>
                Retry
              </Button>
            </div>
          )}

          {!loading && !error && sorted.length === 0 && (
            <EmptyState
              icon={<Database className="h-8 w-8" />}
              message="No saved AI re-aligns yet. They appear after a successful AI re-align on a YouTube auto-caption track."
            />
          )}

          {!loading && sorted.length > 0 && (
            <ul className="space-y-2" data-testid="asr-realign-list">
              {sorted.map((entry) => (
                <li
                  key={entry.key}
                  className="flex gap-3 rounded-lg border border-zinc-800/80 bg-zinc-950/40 p-2.5"
                  data-testid="asr-realign-row"
                >
                  <div className="h-14 w-24 shrink-0 overflow-hidden rounded-md bg-zinc-900">
                    {entry.thumbnailUrl ? (
                      <img
                        src={entry.thumbnailUrl}
                        alt=""
                        className="h-full w-full object-cover"
                        onError={(e) => {
                          (e.currentTarget as HTMLImageElement).style.display = 'none';
                        }}
                      />
                    ) : null}
                  </div>
                  <div className="min-w-0 flex-1 space-y-1">
                    <p className="text-sm text-zinc-200 truncate">
                      {entry.title || entry.videoId}
                    </p>
                    <p className="text-[11px] text-zinc-500 leading-relaxed">
                      {entry.language} · {entry.cueCount} cues ·{' '}
                      {formatAsrRealignBytes(entry.byteSize)} · created{' '}
                      {new Date(entry.createdAt).toLocaleString()} · last used{' '}
                      {new Date(entry.lastUsedAt).toLocaleString()}
                    </p>
                    <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                      {entry.youtubeUrl && (
                        <a
                          href={entry.youtubeUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 text-[11px] text-cyan-400/90 hover:text-cyan-300"
                        >
                          <ExternalLink className="h-3 w-3" />
                          Open on YouTube
                        </a>
                      )}
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={busyKey === entry.key}
                        onClick={() => void deleteKey(entry.key)}
                        icon={<Trash2 className="w-3 h-3" />}
                      >
                        Delete
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={busyKey === entry.key}
                        onClick={() => void deleteKey(entry.key)}
                        icon={<RefreshCw className="w-3 h-3" />}
                        title="Removes save so the next watch re-runs AI"
                      >
                        Force re-run
                      </Button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </DisabledDimmer>

      {showClearModal && (
        <Modal
          title="Clear all saved re-aligns?"
          message="Deletes every AI re-align cache entry. Translation cache and settings stay intact."
          variant="danger"
          confirmLabel="Clear all"
          cancelLabel="Cancel"
          onConfirm={() => {
            void clearAll();
          }}
          onCancel={() => setShowClearModal(false)}
        />
      )}
    </Card>
  );
}
