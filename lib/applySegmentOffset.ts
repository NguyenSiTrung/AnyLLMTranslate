import type { SubtitleCue } from '@/types/subtitle';

/**
 * Add a DASH presentation-time offset (given in milliseconds) to every cue's
 * start/end times (returned in seconds). Returns new cue objects; does not
 * mutate the input.
 *
 * This converts segment-relative cue timestamps (cues that restart near 0 in
 * each DASH WebVTT segment) into absolute timeline times, so the renderer's
 * active-cue lookup at `video.currentTime` finds the right cue.
 */
export function applySegmentOffset(cues: SubtitleCue[], offsetMs: number): SubtitleCue[] {
  if (cues.length === 0) return [];
  const offsetSec = offsetMs / 1000;
  return cues.map((cue) => ({
    ...cue,
    startTime: cue.startTime + offsetSec,
    endTime: cue.endTime + offsetSec,
  }));
}
