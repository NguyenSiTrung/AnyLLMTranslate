import { describe, it, expect } from 'vitest';
import { concatVttSegments } from '@/lib/vttSegmentConcat';

describe('concatVttSegments', () => {
  it('concatenates two simple VTT segments', () => {
    const seg1 = [
      'WEBVTT',
      '',
      '00:00:00.000 --> 00:00:02.000',
      'Hello world',
      '',
      '00:00:02.000 --> 00:00:04.000',
      'Goodbye world',
    ].join('\n');

    const seg2 = [
      'WEBVTT',
      '',
      '00:00:04.000 --> 00:00:06.000',
      'Third cue',
    ].join('\n');

    const result = concatVttSegments([seg1, seg2]);

    expect(result).toContain('Hello world');
    expect(result).toContain('Goodbye world');
    expect(result).toContain('Third cue');
    // Only one WEBVTT header
    expect((result.match(/WEBVTT/g) || []).length).toBe(1);
  });

  it('deduplicates WEBVTT headers from multiple segments', () => {
    const segs = [
      'WEBVTT\n\n00:00:00.000 --> 00:00:01.000\nA',
      'WEBVTT\n\n00:00:01.000 --> 00:00:02.000\nB',
      'WEBVTT\n\n00:00:02.000 --> 00:00:03.000\nC',
    ];

    const result = concatVttSegments(segs);

    expect((result.match(/^WEBVTT/gm) || []).length).toBe(1);
    expect(result).toContain('A');
    expect(result).toContain('B');
    expect(result).toContain('C');
  });

  it('handles X-TIMESTAMP-MAP and offsets cue times across segments', () => {
    // Segment 1: LOCAL time starts at 0
    const seg1 = [
      'WEBVTT',
      'X-TIMESTAMP-MAP=MPEGTS:900000,LOCAL:00:00:00.000',
      '',
      '00:00:00.000 --> 00:00:02.000',
      'First',
    ].join('\n');

    // Segment 2: LOCAL time starts at 10 (offset from MPEGTS)
    const seg2 = [
      'WEBVTT',
      'X-TIMESTAMP-MAP=MPEGTS:1800000,LOCAL:00:00:10.000',
      '',
      '00:00:10.000 --> 00:00:12.000',
      'Second',
    ].join('\n');

    const result = concatVttSegments([seg1, seg2]);

    expect(result).toContain('First');
    expect(result).toContain('Second');
    expect(result).toContain('00:00:10.000 --> 00:00:12.000');
    expect(result).toContain('00:00:20.000 --> 00:00:22.000');
  });

  it('normalizes cue times from MPEGTS when timestamp-map local time restarts', () => {
    const seg1 = [
      'WEBVTT',
      'X-TIMESTAMP-MAP=LOCAL:00:00:00.000,MPEGTS:900000',
      '',
      '00:00:00.000 --> 00:00:02.000',
      'First',
    ].join('\n');

    const seg2 = [
      'WEBVTT',
      'X-TIMESTAMP-MAP=LOCAL:00:00:00.000,MPEGTS:1080000',
      '',
      '00:00:00.000 --> 00:00:02.000',
      'Second',
    ].join('\n');

    const result = concatVttSegments([seg1, seg2]);

    expect(result).toContain('00:00:10.000 --> 00:00:12.000\nFirst');
    expect(result).toContain('00:00:12.000 --> 00:00:14.000\nSecond');
  });

  it('offsets cue times when segment times restart from zero without X-TIMESTAMP-MAP', () => {
    // When segments don't carry X-TIMESTAMP-MAP, their times may restart
    // from 0. We need to offset subsequent segments by the end time of
    // the previous segment.
    const seg1 = [
      'WEBVTT',
      '',
      '00:00:00.000 --> 00:00:02.000',
      'First',
    ].join('\n');

    const seg2 = [
      'WEBVTT',
      '',
      '00:00:00.000 --> 00:00:02.000',
      'Second',
    ].join('\n');

    const result = concatVttSegments([seg1, seg2]);

    expect(result).toContain('00:00:00.000 --> 00:00:02.000');
    // Second segment should be offset by 2 seconds
    expect(result).toContain('00:00:02.000 --> 00:00:04.000');
  });

  it('handles empty segments array', () => {
    expect(concatVttSegments([])).toBe('');
  });

  it('handles single segment', () => {
    const seg = 'WEBVTT\n\n00:00:00.000 --> 00:00:02.000\nHello';
    const result = concatVttSegments([seg]);
    expect(result).toContain('Hello');
    expect(result.startsWith('WEBVTT')).toBe(true);
  });

  it('handles empty string segments', () => {
    const result = concatVttSegments(['', 'WEBVTT\n\n00:00:01.000 --> 00:00:02.000\nA', '']);
    expect(result).toContain('A');
  });

  it('preserves cue text with HTML tags', () => {
    const seg1 = 'WEBVTT\n\n00:00:00.000 --> 00:00:02.000\n<b>Bold</b> text';
    const seg2 = 'WEBVTT\n\n00:00:02.000 --> 00:00:04.000\n<i>Italic</i> text';

    const result = concatVttSegments([seg1, seg2]);

    expect(result).toContain('<b>Bold</b> text');
    expect(result).toContain('<i>Italic</i> text');
  });

  it('preserves voice tags', () => {
    const seg1 = 'WEBVTT\n\n00:00:00.000 --> 00:00:02.000\n<v Speaker>Hello</v>';
    const seg2 = 'WEBVTT\n\n00:00:02.000 --> 00:00:04.000\n<v Other>World</v>';

    const result = concatVttSegments([seg1, seg2]);

    expect(result).toContain('<v Speaker>Hello</v>');
    expect(result).toContain('<v Other>World</v>');
  });

  it('handles NOTE blocks', () => {
    const seg1 = [
      'WEBVTT',
      '',
      'NOTE',
      'This is a comment',
      '',
      '00:00:00.000 --> 00:00:02.000',
      'First cue',
    ].join('\n');

    const seg2 = [
      'WEBVTT',
      '',
      '00:00:02.000 --> 00:00:04.000',
      'Second cue',
    ].join('\n');

    const result = concatVttSegments([seg1, seg2]);

    expect(result).toContain('First cue');
    expect(result).toContain('Second cue');
    expect(result).toContain('NOTE');
  });

  it('handles BOM markers', () => {
    const seg1 = '\uFEFFWEBVTT\n\n00:00:00.000 --> 00:00:02.000\nHello';
    const seg2 = '\uFEFFWEBVTT\n\n00:00:02.000 --> 00:00:04.000\nWorld';

    const result = concatVttSegments([seg1, seg2]);

    expect(result).not.toContain('\uFEFF');
    expect(result).toContain('Hello');
    expect(result).toContain('World');
  });

  it('handles multiple cues per segment with offset', () => {
    const seg1 = [
      'WEBVTT',
      '',
      '00:00:00.000 --> 00:00:02.000',
      'A1',
      '',
      '00:00:02.000 --> 00:00:04.000',
      'A2',
    ].join('\n');

    const seg2 = [
      'WEBVTT',
      '',
      '00:00:00.000 --> 00:00:02.000',
      'B1',
      '',
      '00:00:02.000 --> 00:00:03.000',
      'B2',
    ].join('\n');

    const result = concatVttSegments([seg1, seg2]);

    // seg1 cues stay as-is
    expect(result).toContain('00:00:00.000 --> 00:00:02.000\nA1');
    expect(result).toContain('00:00:02.000 --> 00:00:04.000\nA2');
    // seg2 cues offset by 4 (end of seg1)
    expect(result).toContain('00:00:04.000 --> 00:00:06.000\nB1');
    expect(result).toContain('00:00:06.000 --> 00:00:07.000\nB2');
  });

  it('does not offset segments that already have continuous timestamps', () => {
    // If segment 2 starts where segment 1 ends, no offset is needed
    const seg1 = 'WEBVTT\n\n00:00:00.000 --> 00:00:05.000\nFirst';
    const seg2 = 'WEBVTT\n\n00:00:05.000 --> 00:00:10.000\nSecond';

    const result = concatVttSegments([seg1, seg2]);

    expect(result).toContain('00:00:00.000 --> 00:00:05.000\nFirst');
    expect(result).toContain('00:00:05.000 --> 00:00:10.000\nSecond');
  });
});
