/**
 * Subtitle parser for WebVTT (.vtt) and SRT (.srt) formats.
 * Parses both formats into a common SubtitleCue[] internal representation.
 * Auto-detects format based on file content.
 */

import type { SubtitleCue, SubtitleFormat } from '@/types/subtitle';

/**
 * Parse a WebVTT string into an array of SubtitleCue objects.
 *
 * Handles:
 * - VTT header ("WEBVTT" + optional metadata)
 * - Cue timing (HH:MM:SS.mmm --> HH:MM:SS.mmm)
 * - Multi-line cues
 * - HTML tags in cue text (preserved)
 * - BOM markers
 * - Positioning metadata
 */
export function parseWebVTT(vtt: string): SubtitleCue[] {
  // Strip BOM if present
  let content = vtt.replace(/^\uFEFF/, '');

  // Remove VTT header (everything before first blank line after WEBVTT)
  const headerEndIndex = content.indexOf('\n\n');
  if (headerEndIndex === -1) return [];

  content = content.slice(headerEndIndex + 2);

  const cues: SubtitleCue[] = [];
  const cueBlocks = content.split(/\n\n+/);

  for (const block of cueBlocks) {
    const trimmed = block.trim();
    if (!trimmed) continue;

    const cue = parseVttCueBlock(trimmed);
    if (cue) cues.push(cue);
  }

  return cues;
}

/**
 * Parse a single VTT cue block into a SubtitleCue.
 */
function parseVttCueBlock(block: string): SubtitleCue | null {
  const lines = block.split('\n');

  // Find the timing line
  let timingLineIndex = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes('-->')) {
      timingLineIndex = i;
      break;
    }
  }

  if (timingLineIndex === -1) return null;

  const timingLine = lines[timingLineIndex];
  const textLines = lines.slice(timingLineIndex + 1);

  // Parse timing
  const timingMatch = timingLine.match(
    /(\d{1,2}:\d{2}:\d{2}\.\d{3})\s*-->\s*(\d{1,2}:\d{2}:\d{2}\.\d{3})(.*)/,
  );

  if (!timingMatch) return null;

  const startTime = parseTimestamp(timingMatch[1]);
  const endTime = parseTimestamp(timingMatch[2]);

  // Parse optional positioning metadata from timing line
  const metadataStr = timingMatch[3]?.trim() || '';
  const metadata: Record<string, string> = {};
  const metadataRegex = /(\w+):(\S+)/g;
  let metaMatch;
  while ((metaMatch = metadataRegex.exec(metadataStr)) !== null) {
    metadata[metaMatch[1]] = metaMatch[2];
  }

  // Parse text (preserve HTML tags)
  const text = textLines.join('\n').trim();

  return {
    startTime,
    endTime,
    text,
    metadata: Object.keys(metadata).length > 0 ? metadata : undefined,
  };
}

/**
 * Parse an SRT string into an array of SubtitleCue objects.
 *
 * Handles:
 * - Sequence numbers
 * - Timing with comma separator (HH:MM:SS,mmm --> HH:MM:SS,mmm)
 * - Multi-line cues
 * - HTML tags in cue text (preserved)
 */
export function parseSRT(srt: string): SubtitleCue[] {
  // Strip BOM if present
  let content = srt.replace(/^\uFEFF/, '');

  // Normalize line endings
  content = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  const cues: SubtitleCue[] = [];
  const cueBlocks = content.split(/\n\n+/);

  for (const block of cueBlocks) {
    const trimmed = block.trim();
    if (!trimmed) continue;

    const cue = parseSrtCueBlock(trimmed);
    if (cue) cues.push(cue);
  }

  return cues;
}

/**
 * Parse a single SRT cue block into a SubtitleCue.
 */
function parseSrtCueBlock(block: string): SubtitleCue | null {
  const lines = block.split('\n');

  // Find the timing line (contains -->)
  let timingLineIndex = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes('-->')) {
      timingLineIndex = i;
      break;
    }
  }

  if (timingLineIndex === -1) return null;

  // SRT timing uses comma instead of period for milliseconds
  const timingLine = lines[timingLineIndex].replace(/,/g, '.');
  const textLines = lines.slice(timingLineIndex + 1);

  const timingMatch = timingLine.match(
    /(\d{1,2}:\d{2}:\d{2}\.\d{3})\s*-->\s*(\d{1,2}:\d{2}:\d{2}\.\d{3})/,
  );

  if (!timingMatch) return null;

  const startTime = parseTimestamp(timingMatch[1]);
  const endTime = parseTimestamp(timingMatch[2]);
  const text = textLines.join('\n').trim();

  return {
    startTime,
    endTime,
    text,
  };
}

/**
 * Auto-detect format and parse into SubtitleCue[].
 */
export function parseSubtitles(content: string): SubtitleCue[] {
  const format = detectFormat(content);
  if (format === 'vtt') {
    return parseWebVTT(content);
  }
  if (format === 'srt') {
    return parseSRT(content);
  }
  return [];
}

/**
 * Detect whether content is WebVTT or SRT format.
 */
export function detectFormat(content: string): SubtitleFormat | null {
  const stripped = content.replace(/^\uFEFF/, '').trim();

  // WebVTT files start with "WEBVTT"
  if (stripped.startsWith('WEBVTT')) {
    return 'vtt';
  }

  // SRT files typically start with a sequence number followed by timing
  if (/^\d+\s*\n/.test(stripped)) {
    return 'srt';
  }

  // Heuristic: check for comma vs period in timing
  if (/\d{2}:\d{2}:\d{2},\d{3}\s*-->/.test(stripped)) {
    return 'srt';
  }

  if (/\d{2}:\d{2}:\d{2}\.\d{3}\s*-->/.test(stripped)) {
    return 'vtt';
  }

  return null;
}

/**
 * Parse a timestamp string (HH:MM:SS.mmm) into seconds.
 */
export function parseTimestamp(ts: string): number {
  const match = ts.match(/(\d{1,2}):(\d{2}):(\d{2})\.(\d{3})/);
  if (!match) return 0;

  const hours = parseInt(match[1], 10);
  const minutes = parseInt(match[2], 10);
  const seconds = parseInt(match[3], 10);
  const milliseconds = parseInt(match[4], 10);

  return hours * 3600 + minutes * 60 + seconds + milliseconds / 1000;
}
