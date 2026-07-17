import { describe, it, expect } from 'vitest';
import {
  parseWebVTT,
  parseSRT,
  parseSubtitles,
  detectFormat,
  parseTimestamp,
} from '@/lib/subtitleParser';

describe('subtitleParser', () => {
  it('parses WebVTT cues, metadata, BOM/blocks, and empty input', () => {
    const vtt = `WEBVTT

1
00:00:01.000 --> 00:00:04.000 line:80% position:10% align:start
Hello <b>world</b>

2
00:00:05.000 --> 00:00:08.000
<v John>Hello world</v>

3
00:05.000 --> 00:10.000
Short format cue`;

    const cues = parseWebVTT(vtt);
    expect(cues).toHaveLength(3);
    expect(cues[0].text).toContain('<b>world</b>');
    expect(cues[0].metadata).toEqual({ line: '80%', position: '10%', align: 'start' });
    expect(cues[1].voice).toBe('John');
    expect(cues[1].text).toBe('Hello world');
    expect(cues[2].startTime).toBe(5);

    expect(parseWebVTT('')).toEqual([]);
    const bom = parseWebVTT('\uFEFFWEBVTT\n\n1\n00:00:01.000 --> 00:00:04.000\nTest');
    expect(bom[0].text).toBe('Test');

    const withBlocks = `WEBVTT

NOTE
comment

STYLE
::cue { color: white }

REGION
id:bottom lines:3

This has no timing line

1
00:00:01.000 --> 00:00:04.000
Actual cue`;
    expect(parseWebVTT(withBlocks)).toHaveLength(1);
    expect(parseWebVTT(withBlocks)[0].text).toBe('Actual cue');
  });

  it('parses SRT and auto-detects formats/timestamps', () => {
    const srt = `1
00:00:01,500 --> 00:00:04,750
Hello world

2
00:00:05,000 --> 00:00:08,000
Second cue`;
    const cues = parseSRT(srt);
    expect(cues).toHaveLength(2);
    expect(cues[0].startTime).toBe(1.5);
    expect(cues[0].voice).toBeUndefined();

    const crlf = parseSRT(
      '1\r\n00:00:01,000 --> 00:00:04,000\r\nTest\r\n\r\n2\r\n00:00:05,000 --> 00:00:08,000\r\nSecond',
    );
    expect(crlf).toHaveLength(2);

    expect(parseSubtitles('WEBVTT\n\n1\n00:00:01.000 --> 00:00:04.000\nTest')[0].text).toBe('Test');
    expect(parseSubtitles('random content')).toEqual([]);

    expect(detectFormat('WEBVTT\n\n')).toBe('vtt');
    expect(detectFormat('1\n00:00:01,000 --> 00:00:04,000')).toBe('srt');
    expect(detectFormat('00:00:01.000 --> 00:00:04.000')).toBe('vtt');
    expect(detectFormat('hello world')).toBeNull();

    expect(parseTimestamp('00:01:30.000')).toBe(90);
    expect(parseTimestamp('01:30.000')).toBe(90);
    expect(parseTimestamp('invalid')).toBeNaN();
  });
});
