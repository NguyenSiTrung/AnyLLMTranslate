/**
 * Bilingual VTT builder — reconstructs valid WebVTT files from translated cues.
 *
 * Supports:
 * - Bilingual mode: original + translation per cue (line break separated)
 * - Translation-only mode: replace original with translated text
 * - Preserving timing, positioning, and styling metadata
 */

import type { SubtitleCue } from '@/types/subtitle';

/**
 * Build a bilingual WebVTT string from subtitle cues.
 * Each cue displays original text (dimmer) + translation (brighter).
 */
export function buildBilingualVTT(
  cues: SubtitleCue[],
  options: BilingualOptions = {},
): string {
  const { mode = 'bilingual', includeOriginal = true } = options;

  let vtt = 'WEBVTT\n\n';

  cues.forEach((cue, index) => {
    const startTime = formatTimestamp(cue.startTime);
    const endTime = formatTimestamp(cue.endTime);

    // Build positioning metadata
    let metadata = '';
    if (cue.metadata) {
      for (const [key, value] of Object.entries(cue.metadata)) {
        metadata += ` ${key}:${value}`;
      }
    }
    if (cue.position) {
      if (cue.position.line !== undefined) metadata += ` line:${cue.position.line}`;
      if (cue.position.position !== undefined) metadata += ` position:${cue.position.position}`;
      if (cue.position.align !== undefined) metadata += ` align:${cue.position.align}`;
    }

    // Build cue text
    let cueText: string;
    const isIdentical = cue.originalText && cue.text.trim().toLowerCase() === cue.originalText.trim().toLowerCase();
    
    if (mode === 'bilingual' && includeOriginal && cue.originalText && !isIdentical) {
      cueText = `${cue.text}\n${cue.originalText}`;
    } else {
      cueText = cue.text;
    }

    vtt += `${index + 1}\n`;
    vtt += `${startTime} --> ${endTime}${metadata}\n`;
    vtt += `${cueText}\n\n`;
  });

  return vtt;
}

/**
 * Build a translation-only WebVTT string (no original text).
 */
export function buildTranslationOnlyVTT(cues: SubtitleCue[]): string {
  return buildBilingualVTT(cues, { mode: 'translation-only', includeOriginal: false });
}

/** Options for building bilingual VTT */
export interface BilingualOptions {
  /** Display mode: 'bilingual' shows both, 'translation-only' shows only translation */
  mode?: 'bilingual' | 'translation-only';
  /** Target language code for VTT header */
  language?: string;
  /** Whether to include original text in bilingual mode */
  includeOriginal?: boolean;
}

/**
 * Format a timestamp in seconds to VTT format (HH:MM:SS.mmm).
 */
export function formatTimestamp(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  const ms = Math.round((seconds % 1) * 1000);

  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}.${String(ms).padStart(3, '0')}`;
}
