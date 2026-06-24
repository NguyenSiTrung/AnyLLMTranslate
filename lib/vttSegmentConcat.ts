/**
 * WebVTT segment concatenation utility.
 *
 * Concatenates multiple WebVTT segment strings into a single valid WebVTT
 * document. Handles:
 * - WEBVTT header deduplication (only one header in output)
 * - X-TIMESTAMP-MAP headers (preserved but not re-emitted)
 * - Cue time offsetting when segments restart from 0 without TIMESTAMP-MAP
 * - BOM marker stripping
 * - NOTE/STYLE/REGION block preservation
 */

/** Timestamp pattern for VTT cue timing lines */
const TIMING_LINE_RE = /(\d{1,2}:)?(\d{2}):(\d{2})\.(\d{3})\s*-->\s*(\d{1,2}:)?(\d{2}):(\d{2})\.(\d{3})/;

/** Parse a VTT timestamp (HH:MM:SS.mmm or MM:SS.mmm) into seconds */
function parseVttTime(h: string | undefined, m: string, s: string, ms: string): number {
  return (h ? parseInt(h, 10) : 0) * 3600 + parseInt(m, 10) * 60 + parseInt(s, 10) + parseInt(ms, 10) / 1000;
}

/** Format seconds into VTT timestamp (HH:MM:SS.mmm) */
function formatVttTime(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = Math.floor(totalSeconds % 60);
  const ms = Math.round((totalSeconds % 1) * 1000);
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(ms).padStart(3, '0')}`;
}

/** Extract all cue blocks (timing line + text) from a VTT body (post-header) */
interface CueBlock {
  /** Full block text including timing line and cue text */
  text: string;
  /** Start time in seconds */
  startTime: number;
  /** End time in seconds */
  endTime: number;
  /** Whether this segment uses X-TIMESTAMP-MAP (absolute timing) */
  hasTimestampMap: boolean;
}

/** Parse a VTT segment body (without WEBVTT header) into cue blocks */
function parseSegment(body: string, hasTimestampMap: boolean): CueBlock[] {
  const cues: CueBlock[] = [];
  const blocks = body.split(/\n\n+/);

  for (const block of blocks) {
    const trimmed = block.trim();
    if (!trimmed) continue;

    const firstLine = trimmed.split('\n')[0].trim();
    // Skip non-cue blocks
    if (firstLine === 'NOTE' || firstLine === 'STYLE' || firstLine === 'REGION') continue;

    // Find the timing line
    const lines = trimmed.split('\n');
    let timingLineIndex = -1;
    for (let i = 0; i < lines.length; i++) {
      if (TIMING_LINE_RE.test(lines[i])) {
        timingLineIndex = i;
        break;
      }
    }

    if (timingLineIndex === -1) continue;

    const match = lines[timingLineIndex].match(TIMING_LINE_RE);
    if (!match) continue;

    const startTime = parseVttTime(match[1], match[2], match[3], match[4]);
    const endTime = parseVttTime(match[5], match[6], match[7], match[8]);

    // Preserve everything: timing line (minus offset, to be re-applied) + text lines
    const textLines = lines.slice(timingLineIndex + 1);
    const timingLine = lines[timingLineIndex];

    cues.push({
      text: [timingLine, ...textLines].join('\n'),
      startTime,
      endTime,
      hasTimestampMap,
    });
  }

  return cues;
}

/**
 * Concatenate multiple WebVTT segments into a single valid WebVTT document.
 *
 * - Strips BOM markers
 * - Deduplicates WEBVTT headers
 * - Offsets cue times for segments that restart from 0 without X-TIMESTAMP-MAP
 * - Preserves NOTE/STYLE/REGION blocks
 */
export function concatVttSegments(segments: string[]): string {
  if (segments.length === 0) return '';

  const allCues: CueBlock[] = [];
  const allNoteBlocks: string[] = [];
  let timeOffset = 0;
  let firstSegmentProcessed = false;

  for (const rawSegment of segments) {
    // Strip BOM
    let segment = rawSegment.replace(/^\uFEFF/, '');
    // Normalize line endings
    segment = segment.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    if (!segment.trim()) continue;

    // Check for X-TIMESTAMP-MAP
    const hasTimestampMap = /X-TIMESTAMP-MAP=/.test(segment);

    // Remove WEBVTT header (everything up to and including first blank line
    // after the WEBVTT line, plus any X-TIMESTAMP-MAP lines)
    // Keep NOTE/STYLE/REGION blocks from the header area
    const lines = segment.split('\n');
    let headerEnd = 0;
    let foundBlank = false;
    const headerLines: string[] = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (i === 0 && line.startsWith('WEBVTT')) {
        headerEnd = i + 1;
        continue;
      }
      if (line.startsWith('X-TIMESTAMP-MAP=')) {
        headerEnd = i + 1;
        continue;
      }
      if (line === '') {
        headerEnd = i + 1;
        foundBlank = true;
        break;
      }
      // Non-empty, non-header line before blank — could be NOTE etc.
      headerLines.push(lines[i]);
    }

    // If no blank line found, strip just the WEBVTT line
    if (!foundBlank) {
      const stripped = segment.replace(/^WEBVTT[^\n]*\n?/, '');
      segment = stripped;
    } else {
      segment = lines.slice(headerEnd).join('\n');
    }

    // Collect NOTE blocks from the body
    const bodyBlocks = segment.split(/\n\n+/);
    const cueBodyParts: string[] = [];

    for (const block of bodyBlocks) {
      const trimmed = block.trim();
      if (!trimmed) continue;
      const firstLine = trimmed.split('\n')[0].trim();
      if (firstLine === 'NOTE') {
        allNoteBlocks.push(trimmed);
      }
    }

    // Parse cue blocks from this segment
    const cues = parseSegment(segment, hasTimestampMap);

    // Determine if we need to offset this segment's cues
    let needsOffset = false;
    if (firstSegmentProcessed && !hasTimestampMap && cues.length > 0) {
      // If the first cue starts at or near 0, it's a restart — needs offset
      if (cues[0].startTime < timeOffset) {
        needsOffset = true;
      }
    }

    for (const cue of cues) {
      if (needsOffset) {
        const newStart = cue.startTime + timeOffset;
        const newEnd = cue.endTime + timeOffset;
        // Reconstruct the timing line with offset times
        const lines = cue.text.split('\n');
        const timingLine = lines[0];
        const textLines = lines.slice(1);
        const restOfTiming = timingLine.replace(TIMING_LINE_RE, '');
        const newTimingLine = `${formatVttTime(newStart)} --> ${formatVttTime(newEnd)}${restOfTiming}`;
        allCues.push({
          text: [newTimingLine, ...textLines].join('\n'),
          startTime: newStart,
          endTime: newEnd,
          hasTimestampMap: cue.hasTimestampMap,
        });
      } else {
        allCues.push(cue);
      }
      // Track the end of the last cue for offset calculation
      if (!needsOffset || !firstSegmentProcessed) {
        timeOffset = Math.max(timeOffset, cue.endTime);
      } else {
        // Already offset — timeOffset was the basis
      }
    }

    // Update timeOffset to the end of the last cue in this segment
    if (cues.length > 0) {
      const lastCue = needsOffset
        ? allCues[allCues.length - 1]
        : allCues[allCues.length - 1];
      timeOffset = lastCue.endTime;
    }

    firstSegmentProcessed = true;
  }

  // Build the output
  const parts: string[] = ['WEBVTT', ''];

  // Re-emit NOTE blocks
  for (const note of allNoteBlocks) {
    parts.push(note, '');
  }

  // Emit all cues in order
  for (const cue of allCues) {
    parts.push(cue.text, '');
  }

  return parts.join('\n').trimEnd() + '\n';
}
