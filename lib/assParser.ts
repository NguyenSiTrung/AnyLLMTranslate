/**
 * Minimal ASS/SSA subtitle parser (Immersive Translate uses subsrtFormat: ass for Youku).
 * Handles standard [Events] Dialogue lines with H:MM:SS.cs timing.
 */

import type { SubtitleCue } from '@/types/subtitle';

/** Strip ASS override tags and line breaks for display text. */
export function stripAssTags(text: string): string {
  return text
    .replace(/\{[^}]*\}/g, '')
    .replace(/\\N/gi, '\n')
    .replace(/\\n/g, '\n')
    .trim();
}

/** Parse ASS timestamp (H:MM:SS.cs or H:MM:SS.cc) to seconds. */
export function parseAssTimestamp(ts: string): number {
  const m = ts.trim().match(/^(\d+):(\d{2}):(\d{2})\.(\d{2})$/);
  if (!m) return NaN;
  const hours = parseInt(m[1], 10);
  const minutes = parseInt(m[2], 10);
  const seconds = parseInt(m[3], 10);
  const centis = parseInt(m[4], 10);
  return hours * 3600 + minutes * 60 + seconds + centis / 100;
}

/**
 * Parse ASS/SSA content into SubtitleCue[].
 * Ignores [Script Info], [V4+ Styles], and non-Dialogue events.
 */
export function parseASS(ass: string): SubtitleCue[] {
  const content = ass.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const cues: SubtitleCue[] = [];

  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed.toLowerCase().startsWith('dialogue:')) continue;

    const payload = trimmed.slice(trimmed.indexOf(':') + 1).trim();
    const parts = payload.split(',');
    // Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
    if (parts.length < 10) continue;

    const startTime = parseAssTimestamp(parts[1]);
    const endTime = parseAssTimestamp(parts[2]);
    if (!Number.isFinite(startTime) || !Number.isFinite(endTime)) continue;

    const text = stripAssTags(parts.slice(9).join(','));
    if (!text) continue;

    cues.push({ startTime, endTime, text });
  }

  return cues;
}