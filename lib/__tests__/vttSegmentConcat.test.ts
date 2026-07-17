import { describe, it, expect } from 'vitest';
import { concatVttSegments } from '@/lib/vttSegmentConcat';

describe('concatVttSegments', () => {
  it('concatenates with single WEBVTT header, offsets restarts, handles empty/NOTE/BOM', () => {
    const result = concatVttSegments([
      'WEBVTT\n\n00:00:00.000 --> 00:00:02.000\n<b>Bold</b>\n\n00:00:02.000 --> 00:00:04.000\nGoodbye',
      'WEBVTT\n\n00:00:04.000 --> 00:00:06.000\n<v Speaker>Hello</v>',
      'WEBVTT\n\n00:00:06.000 --> 00:00:07.000\nC',
    ]);
    expect((result.match(/^WEBVTT/gm) || []).length).toBe(1);
    expect(result).toContain('<b>Bold</b>');
    expect(result).toContain('<v Speaker>Hello</v>');
    expect(result).toContain('C');

    const withMap = concatVttSegments([
      [
        'WEBVTT',
        'X-TIMESTAMP-MAP=MPEGTS:900000,LOCAL:00:00:00.000',
        '',
        '00:00:00.000 --> 00:00:02.000',
        'First',
      ].join('\n'),
      [
        'WEBVTT',
        'X-TIMESTAMP-MAP=MPEGTS:1800000,LOCAL:00:00:10.000',
        '',
        '00:00:10.000 --> 00:00:12.000',
        'Second',
      ].join('\n'),
    ]);
    expect(withMap).toContain('00:00:10.000 --> 00:00:12.000');
    expect(withMap).toContain('00:00:20.000 --> 00:00:22.000');

    const restart = concatVttSegments([
      'WEBVTT\n\n00:00:00.000 --> 00:00:02.000\nFirst',
      'WEBVTT\n\n00:00:00.000 --> 00:00:02.000\nSecond',
    ]);
    expect(restart).toContain('00:00:02.000 --> 00:00:04.000');

    const continuous = concatVttSegments([
      'WEBVTT\n\n00:00:00.000 --> 00:00:05.000\nFirst',
      'WEBVTT\n\n00:00:05.000 --> 00:00:10.000\nSecond',
    ]);
    expect(continuous).toContain('00:00:05.000 --> 00:00:10.000\nSecond');

    expect(concatVttSegments([])).toBe('');
    expect(concatVttSegments(['WEBVTT\n\n00:00:00.000 --> 00:00:02.000\nHello'])).toContain(
      'Hello',
    );
    expect(
      concatVttSegments(['', 'WEBVTT\n\n00:00:01.000 --> 00:00:02.000\nA', '']),
    ).toContain('A');

    const withNote = concatVttSegments([
      'WEBVTT\n\nNOTE\ncomment\n\n00:00:00.000 --> 00:00:02.000\nFirst cue',
      '\uFEFFWEBVTT\n\n00:00:02.000 --> 00:00:04.000\nWorld',
    ]);
    expect(withNote).toContain('First cue');
    expect(withNote).toContain('World');
    expect(withNote).not.toContain('\uFEFF');
  });
});
