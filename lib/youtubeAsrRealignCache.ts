/**
 * Pure helpers for YouTube ASR AI re-align cache keys, meta URLs, size, LRU.
 * No I/O. Spec: docs/superpowers/specs/2026-07-27-youtube-asr-realign-cache-progress-design.md
 */

import type { SubtitleCue } from '@/types/subtitle';

export const ASR_REALIGN_CACHE_MODE = 'ai' as const;
export const ASR_REALIGN_MAX_ENTRIES = 50;
export const ASR_REALIGN_MAX_BYTES = 32 * 1024 * 1024;

export interface AsrRealignTimedUnit {
  text: string;
  startMs: number;
  endMs: number;
}

export interface YoutubeAsrRealignCacheEntry {
  key: string;
  videoId: string;
  language: string;
  mode: 'ai';
  title?: string;
  thumbnailUrl?: string;
  youtubeUrl?: string;
  cueCount: number;
  byteSize: number;
  contentHash: string;
  createdAt: number;
  lastUsedAt: number;
  cues: SubtitleCue[];
}

export type YoutubeAsrRealignCacheSummary = Omit<YoutubeAsrRealignCacheEntry, 'cues'>;

const encoder = new TextEncoder();

export function canonicalizeAsrRealignInput(units: AsrRealignTimedUnit[]): string {
  return units.map((u) => `${u.text}\t${u.startMs}\t${u.endMs}`).join('\n');
}

export async function hashAsrRealignContent(units: AsrRealignTimedUnit[]): Promise<string> {
  const input = canonicalizeAsrRealignInput(units);
  const data = encoder.encode(input);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(hashBuffer)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function buildAsrRealignCacheKey(
  videoId: string,
  language: string,
  contentHash: string,
): string {
  return `ai:${videoId}:${language}:${contentHash}`;
}

export function youtubeWatchUrl(videoId: string): string {
  return `https://www.youtube.com/watch?v=${videoId}`;
}

export function youtubeThumbnailUrl(videoId: string): string {
  return `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`;
}

export function stripYoutubeTitleSuffix(title: string): string {
  return title.replace(/\s*-\s*YouTube\s*$/i, '').trim();
}

/** Best-effort extract from watch URL or youtu.be short link. */
export function extractYoutubeVideoIdFromUrl(url: string): string | undefined {
  try {
    const u = new URL(url);
    if (u.hostname === 'youtu.be') {
      const id = u.pathname.split('/').filter(Boolean)[0];
      return id || undefined;
    }
    if (u.hostname.includes('youtube.com')) {
      const v = u.searchParams.get('v');
      if (v) return v;
      const parts = u.pathname.split('/').filter(Boolean);
      const embedIdx = parts.indexOf('embed');
      if (embedIdx >= 0 && parts[embedIdx + 1]) return parts[embedIdx + 1];
      const shortsIdx = parts.indexOf('shorts');
      if (shortsIdx >= 0 && parts[shortsIdx + 1]) return parts[shortsIdx + 1];
    }
  } catch {
    // fall through
  }
  return undefined;
}

export function estimateAsrRealignEntryBytes(
  entry: Omit<YoutubeAsrRealignCacheEntry, 'byteSize'> | YoutubeAsrRealignCacheEntry,
): number {
  const { byteSize: _ignore, ...rest } = entry as YoutubeAsrRealignCacheEntry;
  void _ignore;
  const payload = { ...rest, byteSize: 0 };
  return encoder.encode(entry.key).length + encoder.encode(JSON.stringify(payload)).length;
}

export function toAsrRealignSummary(
  entry: YoutubeAsrRealignCacheEntry,
): YoutubeAsrRealignCacheSummary {
  const { cues: _cues, ...summary } = entry;
  void _cues;
  return summary;
}

export function pickLruKeysToEvict(
  entries: Array<{ key: string; lastUsedAt: number; byteSize: number }>,
  opts: { maxEntries: number; maxBytes: number; incomingBytes: number },
): string[] {
  const sorted = [...entries].sort((a, b) => a.lastUsedAt - b.lastUsedAt);
  const kept = new Set(sorted.map((e) => e.key));
  const victims: string[] = [];
  const byteOf = (key: string) => entries.find((e) => e.key === key)?.byteSize ?? 0;

  const totalKeptBytes = () => {
    let sum = 0;
    for (const k of kept) sum += byteOf(k);
    return sum;
  };

  const overBudget = () =>
    kept.size + 1 > opts.maxEntries || totalKeptBytes() + opts.incomingBytes > opts.maxBytes;

  for (const e of sorted) {
    if (!overBudget()) break;
    if (!kept.has(e.key)) continue;
    kept.delete(e.key);
    victims.push(e.key);
  }
  return victims;
}

export function formatAsrRealignBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  if (bytes < 1024) return `${Math.round(bytes)} B`;
  if (bytes < 1024 * 1024) {
    const kb = bytes / 1024;
    return kb >= 10 ? `${Math.round(kb)} KB` : `${kb.toFixed(1)} KB`;
  }
  const mb = bytes / (1024 * 1024);
  return `${mb.toFixed(2)} MB`;
}

export function sortAsrRealignSummaries(
  list: YoutubeAsrRealignCacheSummary[],
  sort: 'lastUsed' | 'newest',
): YoutubeAsrRealignCacheSummary[] {
  const copy = [...list];
  if (sort === 'newest') {
    copy.sort((a, b) => b.createdAt - a.createdAt);
  } else {
    copy.sort((a, b) => b.lastUsedAt - a.lastUsedAt);
  }
  return copy;
}
