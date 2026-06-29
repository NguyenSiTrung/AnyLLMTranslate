/**
 * Passive capture of HBO Max WebVTT segments fetched by the player (XHR/fetch).
 * When proactive MPD segment fetch fails (HTTP 0 / CDN echo), piggyback on the
 * player's own authenticated segment requests instead.
 */

import type { MessageBridgeSender } from '@/inject/messageBridge';
import { parseWebVTT } from '@/lib/subtitleParser';
import type { SubtitleCue } from '@/types/subtitle';

const MAX_VTT_SEGMENT_URL =
  /https?:\/\/[^/]*prd\.media\.max\.com\/.+\.vtt(?:\?|$)/i;

/** Representation id (e.g. t3) → BCP-47 language from the root MPD. */
const representationLanguages = new Map<string, string>();

/** Accumulated cues per representation id. */
const cueBuffers = new Map<string, SubtitleCue[]>();

let emittedRepresentation: string | null = null;
let preferredLanguage: string | null = null;

export function setVttCapturePreferredLanguage(lang: string | undefined): void {
  preferredLanguage = lang && lang !== 'auto' ? lang : null;
}

/** Reset state on SPA navigation / BFCache. */
export function resetMaxVttSegmentCapture(): void {
  representationLanguages.clear();
  cueBuffers.clear();
  emittedRepresentation = null;
  preferredLanguage = null;
}

/** Register representation → language mappings from a parsed MPD manifest. */
export function registerMpdRepresentationLanguages(
  tracks: Array<{ language: string; url: string; representationId?: string }>,
): void {
  for (const track of tracks) {
    const repId = track.representationId ?? extractRepresentationId(track.url);
    if (repId && track.language) {
      representationLanguages.set(repId, track.language);
    }
  }
}

export function isMaxVttSegmentUrl(url: string): boolean {
  return MAX_VTT_SEGMENT_URL.test(url);
}

/**
 * Handle a player-initiated VTT segment response (read-only intercept).
 * Merges cues and emits SUBTITLE_MANIFEST_CUES once substantive cues exist.
 */
export function captureMaxVttSegment(
  url: string,
  body: string,
  bridge: MessageBridgeSender,
): void {
  if (!isMaxVttSegmentUrl(url)) return;
  if (!body || (!body.includes('WEBVTT') && !body.trimStart().startsWith('WEBVTT'))) return;

  const repId = extractRepresentationId(url);
  if (!repId) return;

  const language = representationLanguages.get(repId) ?? '';
  const targetLang = preferredLanguage;
  if (targetLang && language && !languagesMatch(language, targetLang)) {
    return;
  }

  const newCues = parseWebVTT(body).map((cue) => ({
    startTime: cue.startTime,
    endTime: cue.endTime,
    text: cue.text,
  }));

  const substantive = newCues.filter((c) => c.text.trim().length > 0);
  if (substantive.length === 0) return;

  const merged = mergeCues(cueBuffers.get(repId) ?? [], newCues);
  cueBuffers.set(repId, merged);

  if (emittedRepresentation === repId) {
    bridge.send('SUBTITLE_MANIFEST_CUES', {
      cues: merged,
      platform: 'hbomax',
      language,
      url,
      append: true,
    });
    return;
  }

  if (emittedRepresentation !== null) return;

  emittedRepresentation = repId;
  console.log('AnyLLMTranslate: Captured Max VTT segment from player', {
    repId,
    language,
    url,
    cueCount: merged.length,
  });

  bridge.send('SUBTITLE_MANIFEST_CUES', {
    cues: merged,
    platform: 'hbomax',
    language,
    url,
  });
}

function extractRepresentationId(url: string): string | null {
  const match = url.match(/\/t\/[^/]+\/(t\d+)\/\d+\.vtt/i);
  return match?.[1] ?? null;
}

function mergeCues(existing: SubtitleCue[], incoming: SubtitleCue[]): SubtitleCue[] {
  const byStart = new Map<number, SubtitleCue>();
  for (const cue of existing) byStart.set(cue.startTime, cue);
  for (const cue of incoming) byStart.set(cue.startTime, cue);
  return Array.from(byStart.values()).sort((a, b) => a.startTime - b.startTime);
}

function languagesMatch(a: string, b: string): boolean {
  const norm = (lang: string) => lang.toLowerCase().split('-')[0];
  return norm(a) === norm(b);
}