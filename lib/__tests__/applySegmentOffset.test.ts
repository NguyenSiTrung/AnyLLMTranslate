import { describe, it, expect } from 'vitest';
import { applySegmentOffset } from '@/lib/applySegmentOffset';
import type { SubtitleCue } from '@/types/subtitle';

const cue = (start: number, end: number, text: string): SubtitleCue => ({
  startTime: start,
  endTime: end,
  text,
});

describe('applySegmentOffset', () => {
  it('adds offset to start and end times (ms input, seconds output)', () => {
    const result = applySegmentOffset([cue(1, 2, 'hi')], 30000); // 30s offset
    expect(result[0].startTime).toBe(31);
    expect(result[0].endTime).toBe(32);
  });

  it('preserves cue text and optional fields', () => {
    const c: SubtitleCue = {
      startTime: 1,
      endTime: 2,
      text: 'hi',
      voice: 'Bob',
      position: { line: 1 },
    };
    const result = applySegmentOffset([c], 1000);
    expect(result[0].text).toBe('hi');
    expect(result[0].voice).toBe('Bob');
    expect(result[0].position).toEqual({ line: 1 });
  });

  it('offset 0 is a no-op', () => {
    const result = applySegmentOffset([cue(5, 7, 'x')], 0);
    expect(result).toEqual([cue(5, 7, 'x')]);
  });

  it('does not mutate the input array or its cues', () => {
    const input = [cue(1, 2, 'hi')];
    applySegmentOffset(input, 5000);
    expect(input[0].startTime).toBe(1); // unchanged
  });

  it('handles empty input', () => {
    expect(applySegmentOffset([], 1000)).toEqual([]);
  });
});
