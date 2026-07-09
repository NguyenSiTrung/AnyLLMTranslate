import { describe, it, expect, vi } from 'vitest';
import { extractTrackCues } from '@/lib/textTrackCues';

function makeVttCue(startTime: number, endTime: number, text: string): VTTCue {
  return { startTime, endTime, text } as unknown as VTTCue;
}

function makeTextTrack(cues: VTTCue[], kind = 'subtitles', language = 'en'): TextTrack {
  return {
    kind,
    language,
    label: language,
    mode: 'showing',
    cues: cues as unknown as TextTrackCueList,
    activeCues: [] as unknown as TextTrackCueList,
    addCue: vi.fn(),
    removeCue: vi.fn(),
    addtrack: null,
    oncuechange: null,
  } as unknown as TextTrack;
}

describe('extractTrackCues', () => {
  it('extracts cues with voice tags, HTML, and whitespace trim', () => {
    const track = makeTextTrack([
      makeVttCue(0, 2, '<v John>Hello there</v>'),
      makeVttCue(2, 4, '<v>Anonymous</v>'),
      makeVttCue(4, 6, '  Trimmed  '),
      makeVttCue(6, 8, '<b>Bold</b>\nLine two'),
    ]);
    const cues = extractTrackCues(track);
    expect(cues).toHaveLength(4);
    expect(cues[0]).toMatchObject({ voice: 'John', text: 'Hello there' });
    expect(cues[1].voice).toBeUndefined();
    expect(cues[2].text).toBe('Trimmed');
    expect(cues[3].text).toContain('<b>Bold</b>');
  });

  it('returns empty for missing cues and non-subtitle kinds; accepts captions', () => {
    expect(extractTrackCues(makeTextTrack([]))).toEqual([]);
    expect(
      extractTrackCues({ kind: 'subtitles', language: 'en', cues: null } as unknown as TextTrack),
    ).toEqual([]);
    expect(extractTrackCues(makeTextTrack([makeVttCue(0, 2, 'm')], 'metadata'))).toEqual([]);
    expect(extractTrackCues(makeTextTrack([makeVttCue(0, 2, 'c')], 'captions'))).toHaveLength(1);
  });
});
