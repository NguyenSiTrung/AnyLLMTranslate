/**
 * TextTrack cue extraction — reads the full `track.cues` from an HTML5
 * TextTrack and converts them into the internal `SubtitleCue[]` format.
 *
 * This is Tier 4 access: the entire subtitle track is available upfront
 * with exact timestamps from the browser's native TextTrack implementation.
 */

import type { SubtitleCue } from '@/types/subtitle';

/**
 * Extract all cues from a TextTrack as SubtitleCue[].
 *
 * Reads `track.cues` (the entire track) and converts each VTTCue into
 * the internal SubtitleCue format. Parses `<v Speaker>` voice tags.
 *
 * Returns `[]` for:
 * - Tracks with kind other than 'subtitles' or 'captions'
 * - Tracks with null/empty cues (not yet loaded)
 */
export function extractTrackCues(track: TextTrack): SubtitleCue[] {
  // Only process subtitles/captions tracks
  if (track.kind !== 'subtitles' && track.kind !== 'captions') {
    return [];
  }

  // Track may not have loaded yet — cues can be null
  if (!track.cues || track.cues.length === 0) {
    return [];
  }

  const cues: SubtitleCue[] = [];

  for (let i = 0; i < track.cues.length; i++) {
    const cue = track.cues[i] as VTTCue;
    if (!cue || typeof cue.startTime !== 'number' || typeof cue.endTime !== 'number') {
      continue;
    }

    const rawText = (cue.text || '').trim();

    // Parse WebVTT <v Speaker>...</v> voice tag
    const voiceMatch = rawText.match(/^<v(?:\s+([^>]+))?>/i);
    let voice: string | undefined;
    let text: string;

    if (voiceMatch) {
      voice = voiceMatch[1]?.trim() || undefined;
      // Strip the opening tag, then strip the closing </v> if present
      let inner = rawText.slice(voiceMatch[0].length);
      // Remove closing </v> tag (case-insensitive)
      inner = inner.replace(/<\/v>\s*$/i, '');
      text = inner.trim();
    } else {
      text = rawText;
    }

    cues.push({
      startTime: cue.startTime,
      endTime: cue.endTime,
      text,
      voice,
    });
  }

  return cues;
}
