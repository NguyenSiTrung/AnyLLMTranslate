import { describe, it, expect } from 'vitest';
import { buildBilingualVTT, buildTranslationOnlyVTT, formatTimestamp } from '@/lib/subtitleBuilder';
import type { SubtitleCue } from '@/types/subtitle';

describe('buildBilingualVTT', () => {
  it('builds a valid VTT header', () => {
    const cues: SubtitleCue[] = [];
    const vtt = buildBilingualVTT(cues);
    expect(vtt.startsWith('WEBVTT\n\n')).toBe(true);
  });

  it('builds bilingual cues with original + translation', () => {
    const cues: SubtitleCue[] = [
      { startTime: 1, endTime: 4, text: 'Translation', originalText: 'Original' },
    ];
    const vtt = buildBilingualVTT(cues, { mode: 'bilingual' });
    expect(vtt).toContain('Original');
    expect(vtt).toContain('Translation');
    expect(vtt).toContain('00:00:01.000 --> 00:00:04.000');
  });

  it('builds translation-only VTT', () => {
    const cues: SubtitleCue[] = [
      { startTime: 1, endTime: 4, text: 'Translation', originalText: 'Original' },
    ];
    const vtt = buildBilingualVTT(cues, { mode: 'translation-only', includeOriginal: false });
    expect(vtt).toContain('Translation');
    expect(vtt).not.toContain('Original');
  });

  it('preserves positioning metadata', () => {
    const cues: SubtitleCue[] = [
      {
        startTime: 1,
        endTime: 4,
        text: 'Test',
        metadata: { line: '80%', position: '10%' },
      },
    ];
    const vtt = buildBilingualVTT(cues);
    expect(vtt).toContain('line:80%');
    expect(vtt).toContain('position:10%');
  });

  it('preserves cue position object', () => {
    const cues: SubtitleCue[] = [
      {
        startTime: 0,
        endTime: 2,
        text: 'Test',
        position: { line: 50, position: 25, align: 'center' },
      },
    ];
    const vtt = buildBilingualVTT(cues);
    expect(vtt).toContain('line:50');
    expect(vtt).toContain('position:25');
    expect(vtt).toContain('align:center');
  });

  it('formats multiple cues with sequential numbering', () => {
    const cues: SubtitleCue[] = [
      { startTime: 1, endTime: 3, text: 'First' },
      { startTime: 4, endTime: 6, text: 'Second' },
    ];
    const vtt = buildBilingualVTT(cues);
    expect(vtt).toContain('\n1\n');
    expect(vtt).toContain('\n2\n');
  });

  it('handles empty cues array', () => {
    const vtt = buildBilingualVTT([]);
    expect(vtt).toBe('WEBVTT\n\n');
  });
});

describe('buildTranslationOnlyVTT', () => {
  it('builds VTT with only translated text', () => {
    const cues: SubtitleCue[] = [
      { startTime: 0, endTime: 2, text: 'Translated', originalText: 'Original' },
    ];
    const vtt = buildTranslationOnlyVTT(cues);
    expect(vtt).toContain('Translated');
    expect(vtt).not.toContain('Original');
  });
});

describe('formatTimestamp', () => {
  it('formats seconds to VTT timestamp', () => {
    expect(formatTimestamp(1)).toBe('00:00:01.000');
    expect(formatTimestamp(90)).toBe('00:01:30.000');
    expect(formatTimestamp(3600)).toBe('01:00:00.000');
  });

  it('handles milliseconds', () => {
    expect(formatTimestamp(1.5)).toBe('00:00:01.500');
    expect(formatTimestamp(0.001)).toBe('00:00:00.001');
  });

  it('handles large timestamps', () => {
    expect(formatTimestamp(3661.5)).toBe('01:01:01.500');
  });
});
