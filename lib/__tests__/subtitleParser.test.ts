import { describe, it, expect } from 'vitest';
import { parseWebVTT, parseSRT } from '@/lib/subtitleParser';

describe('parseWebVTT — voice tags', () => {
  it('extracts speaker name from <v Speaker> tag', () => {
    const vtt = `WEBVTT

00:00:01.000 --> 00:00:03.000
<v John> Hello world`;

    const cues = parseWebVTT(vtt);
    expect(cues).toHaveLength(1);
    expect(cues[0].voice).toBe('John');
    expect(cues[0].text).toBe('Hello world');
  });

  it('strips anonymous <v> tag without setting voice', () => {
    const vtt = `WEBVTT

00:00:01.000 --> 00:00:03.000
<v> Anonymous speaker`;

    const cues = parseWebVTT(vtt);
    expect(cues).toHaveLength(1);
    expect(cues[0].voice).toBeUndefined();
    expect(cues[0].text).toBe('Anonymous speaker');
  });

  it('leaves voice undefined when no <v> tag is present', () => {
    const vtt = `WEBVTT

00:00:01.000 --> 00:00:03.000
Just a normal line`;

    const cues = parseWebVTT(vtt);
    expect(cues).toHaveLength(1);
    expect(cues[0].voice).toBeUndefined();
    expect(cues[0].text).toBe('Just a normal line');
  });

  it('handles multi-word speaker names', () => {
    const vtt = `WEBVTT

00:00:01.000 --> 00:00:03.000
<v Dr. Smith> Good morning`;

    const cues = parseWebVTT(vtt);
    expect(cues[0].voice).toBe('Dr. Smith');
    expect(cues[0].text).toBe('Good morning');
  });

  it('handles <v> tag on multi-line cue text', () => {
    const vtt = `WEBVTT

00:00:01.000 --> 00:00:03.000
<v John> Hello
world`;

    const cues = parseWebVTT(vtt);
    expect(cues[0].voice).toBe('John');
    expect(cues[0].text).toBe('Hello\nworld');
  });
});

describe('parseSRT — no voice tags', () => {
  it('produces voice undefined for SRT (no voice tag support)', () => {
    const srt = `1
00:00:01,000 --> 00:00:03,000
Hello world`;

    const cues = parseSRT(srt);
    expect(cues).toHaveLength(1);
    expect(cues[0].voice).toBeUndefined();
    expect(cues[0].text).toBe('Hello world');
  });
});
