import { describe, it, expect } from 'vitest';
import { applySegmentOffset } from '@/lib/applySegmentOffset';
import type { SubtitleCue } from '@/types/subtitle';

const cue = (start: number, end: number, text: string): SubtitleCue => ({
  startTime: start,
  endTime: end,
  text,
});

describe('applySegmentOffset', () => {
  it('offsets times (ms→s), preserves fields, no-ops zero/empty, and does not mutate', () => {
    const result = applySegmentOffset([cue(1, 2, 'hi')], 30000);
    expect(result[0]!.startTime).toBe(31);
    expect(result[0]!.endTime).toBe(32);

    const c: SubtitleCue = {
      startTime: 1,
      endTime: 2,
      text: 'hi',
      voice: 'Bob',
      position: { line: 1 },
    };
    const preserved = applySegmentOffset([c], 1000);
    expect(preserved[0]).toMatchObject({ text: 'hi', voice: 'Bob', position: { line: 1 } });

    expect(applySegmentOffset([cue(5, 7, 'x')], 0)).toEqual([cue(5, 7, 'x')]);
    expect(applySegmentOffset([], 1000)).toEqual([]);

    const input = [cue(1, 2, 'hi')];
    applySegmentOffset(input, 5000);
    expect(input[0]!.startTime).toBe(1);
  });
});
