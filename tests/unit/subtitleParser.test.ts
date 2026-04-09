import { describe, it, expect } from 'vitest';
import {
  parseWebVTT,
  parseSRT,
  parseSubtitles,
  detectFormat,
  parseTimestamp,
} from '@/lib/subtitleParser';

describe('parseWebVTT', () => {
  it('parses a basic VTT file', () => {
    const vtt = `WEBVTT

1
00:00:01.000 --> 00:00:04.000
Hello world

2
00:00:05.000 --> 00:00:08.000
Second cue`;

    const cues = parseWebVTT(vtt);
    expect(cues).toHaveLength(2);
    expect(cues[0].startTime).toBe(1);
    expect(cues[0].endTime).toBe(4);
    expect(cues[0].text).toBe('Hello world');
    expect(cues[1].text).toBe('Second cue');
  });

  it('handles multi-line cues', () => {
    const vtt = `WEBVTT

1
00:00:01.000 --> 00:00:04.000
Line one
Line two
Line three`;

    const cues = parseWebVTT(vtt);
    expect(cues).toHaveLength(1);
    expect(cues[0].text).toBe('Line one\nLine two\nLine three');
  });

  it('preserves HTML tags in cue text', () => {
    const vtt = `WEBVTT

1
00:00:01.000 --> 00:00:04.000
Hello <b>world</b> and <i>italic</i>`;

    const cues = parseWebVTT(vtt);
    expect(cues[0].text).toContain('<b>world</b>');
    expect(cues[0].text).toContain('<i>italic</i>');
  });

  it('strips BOM markers', () => {
    const vtt = '\uFEFFWEBVTT\n\n1\n00:00:01.000 --> 00:00:04.000\nTest';
    const cues = parseWebVTT(vtt);
    expect(cues).toHaveLength(1);
    expect(cues[0].text).toBe('Test');
  });

  it('parses positioning metadata', () => {
    const vtt = `WEBVTT

1
00:00:01.000 --> 00:00:04.000 line:80% position:10% align:start
Hello world`;

    const cues = parseWebVTT(vtt);
    expect(cues[0].metadata).toEqual({ line: '80%', position: '10%', align: 'start' });
  });

  it('handles VTT header with metadata', () => {
    const vtt = `WEBVTT
Kind: captions
Language: en

1
00:00:01.000 --> 00:00:04.000
Hello`;

    const cues = parseWebVTT(vtt);
    expect(cues).toHaveLength(1);
    expect(cues[0].text).toBe('Hello');
  });

  it('returns empty array for empty input', () => {
    expect(parseWebVTT('')).toEqual([]);
  });

  it('skips malformed cue blocks', () => {
    const vtt = `WEBVTT

This has no timing line

1
00:00:01.000 --> 00:00:04.000
Valid cue`;

    const cues = parseWebVTT(vtt);
    expect(cues).toHaveLength(1);
    expect(cues[0].text).toBe('Valid cue');
  });
});

describe('parseSRT', () => {
  it('parses a basic SRT file', () => {
    const srt = `1
00:00:01,000 --> 00:00:04,000
Hello world

2
00:00:05,000 --> 00:00:08,000
Second cue`;

    const cues = parseSRT(srt);
    expect(cues).toHaveLength(2);
    expect(cues[0].startTime).toBe(1);
    expect(cues[0].endTime).toBe(4);
    expect(cues[0].text).toBe('Hello world');
  });

  it('handles comma-to-period conversion for milliseconds', () => {
    const srt = `1
00:00:01,500 --> 00:00:04,750
Test`;

    const cues = parseSRT(srt);
    expect(cues[0].startTime).toBe(1.5);
    expect(cues[0].endTime).toBe(4.75);
  });

  it('handles multi-line SRT cues', () => {
    const srt = `1
00:00:01,000 --> 00:00:04,000
Line one
Line two`;

    const cues = parseSRT(srt);
    expect(cues[0].text).toBe('Line one\nLine two');
  });

  it('strips BOM markers from SRT', () => {
    const srt = '\uFEFF1\n00:00:01,000 --> 00:00:04,000\nTest';
    const cues = parseSRT(srt);
    expect(cues).toHaveLength(1);
  });

  it('normalizes CRLF line endings', () => {
    const srt = '1\r\n00:00:01,000 --> 00:00:04,000\r\nTest\r\n\r\n2\r\n00:00:05,000 --> 00:00:08,000\r\nSecond';
    const cues = parseSRT(srt);
    expect(cues).toHaveLength(2);
  });
});

describe('parseSubtitles', () => {
  it('auto-detects and parses VTT format', () => {
    const content = 'WEBVTT\n\n1\n00:00:01.000 --> 00:00:04.000\nTest';
    const cues = parseSubtitles(content);
    expect(cues).toHaveLength(1);
    expect(cues[0].text).toBe('Test');
  });

  it('auto-detects and parses SRT format', () => {
    const content = '1\n00:00:01,000 --> 00:00:04,000\nTest';
    const cues = parseSubtitles(content);
    expect(cues).toHaveLength(1);
  });

  it('returns empty array for unrecognized format', () => {
    expect(parseSubtitles('random content')).toEqual([]);
  });
});

describe('detectFormat', () => {
  it('detects VTT by WEBVTT header', () => {
    expect(detectFormat('WEBVTT\n\n')).toBe('vtt');
  });

  it('detects VTT with BOM', () => {
    expect(detectFormat('\uFEFFWEBVTT\n\n')).toBe('vtt');
  });

  it('detects SRT by sequence number start', () => {
    expect(detectFormat('1\n00:00:01,000 --> 00:00:04,000')).toBe('srt');
  });

  it('detects SRT by comma timing', () => {
    expect(detectFormat('00:00:01,000 --> 00:00:04,000')).toBe('srt');
  });

  it('detects VTT by period timing', () => {
    expect(detectFormat('00:00:01.000 --> 00:00:04.000')).toBe('vtt');
  });

  it('returns null for unrecognized content', () => {
    expect(detectFormat('hello world')).toBeNull();
  });
});

describe('parseTimestamp', () => {
  it('parses standard timestamps', () => {
    expect(parseTimestamp('00:00:01.000')).toBe(1);
    expect(parseTimestamp('00:01:30.000')).toBe(90);
    expect(parseTimestamp('01:00:00.000')).toBe(3600);
  });

  it('handles milliseconds', () => {
    expect(parseTimestamp('00:00:01.500')).toBe(1.5);
    expect(parseTimestamp('00:00:00.001')).toBe(0.001);
  });

  it('returns 0 for invalid format', () => {
    expect(parseTimestamp('invalid')).toBe(0);
  });
});
