import { describe, it, expect } from 'vitest';
import { parseASS, parseAssTimestamp, stripAssTags } from '@/lib/assParser';

describe('ASS parser helpers', () => {
  it('parses timestamps, strips tags, and extracts Dialogue cues', () => {
    expect(parseAssTimestamp('0:00:01.50')).toBeCloseTo(1.5);
    expect(parseAssTimestamp('1:02:03.00')).toBeCloseTo(3723);
    expect(stripAssTags('{\\an8}Hello\\NWorld')).toBe('Hello\nWorld');

    const ass = `[Script Info]
Title: test

[V4+ Styles]

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
Dialogue: 0,0:00:01.00,0:00:03.00,Default,,0,0,0,,{\\an8}First line
Dialogue: 0,0:00:04.00,0:00:06.00,Default,,0,0,0,,Second`;
    const cues = parseASS(ass);
    expect(cues).toHaveLength(2);
    expect(cues[0]!.text).toBe('First line');
    expect(cues[0]!.startTime).toBeCloseTo(1);
    expect(cues[0]!.endTime).toBeCloseTo(3);
    expect(cues[1]!.text).toBe('Second');
  });
});
