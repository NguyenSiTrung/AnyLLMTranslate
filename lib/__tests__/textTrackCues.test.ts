import { describe, it, expect, vi } from 'vitest';
import { extractTrackCues } from '@/lib/textTrackCues';

// Helper to create a mock VTTCue
function makeVttCue(
  startTime: number,
  endTime: number,
  text: string,
  extra?: Partial<VTTCue>,
): VTTCue {
  return {
    startTime,
    endTime,
    text,
    ...extra,
  } as unknown as VTTCue;
}

// Helper to create a mock TextTrack
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
  it('extracts cues from a populated TextTrack', () => {
    const track = makeTextTrack([
      makeVttCue(0, 2, 'Hello world'),
      makeVttCue(2, 4, 'Goodbye world'),
      makeVttCue(4, 6, 'Third cue'),
    ]);

    const cues = extractTrackCues(track);

    expect(cues).toHaveLength(3);
    expect(cues[0]).toEqual({
      startTime: 0,
      endTime: 2,
      text: 'Hello world',
    });
    expect(cues[1]).toEqual({
      startTime: 2,
      endTime: 4,
      text: 'Goodbye world',
    });
    expect(cues[2]).toEqual({
      startTime: 4,
      endTime: 6,
      text: 'Third cue',
    });
  });

  it('returns empty array for track with no cues', () => {
    const track = makeTextTrack([]);
    expect(extractTrackCues(track)).toEqual([]);
  });

  it('returns empty array for track with null cues (unloaded)', () => {
    const track = {
      kind: 'subtitles',
      language: 'en',
      cues: null,
    } as unknown as TextTrack;

    expect(extractTrackCues(track)).toEqual([]);
  });

  it('parses <v Speaker> voice tag', () => {
    const track = makeTextTrack([
      makeVttCue(0, 2, '<v John>Hello there</v>'),
      makeVttCue(2, 4, '<v Jane>How are you?</v>'),
    ]);

    const cues = extractTrackCues(track);

    expect(cues).toHaveLength(2);
    expect(cues[0].voice).toBe('John');
    expect(cues[0].text).toBe('Hello there');
    expect(cues[1].voice).toBe('Jane');
    expect(cues[1].text).toBe('How are you?');
  });

  it('handles anonymous <v> tag (no speaker name)', () => {
    const track = makeTextTrack([
      makeVttCue(0, 2, '<v>Anonymous speaker</v>'),
    ]);

    const cues = extractTrackCues(track);

    expect(cues).toHaveLength(1);
    expect(cues[0].voice).toBeUndefined();
    expect(cues[0].text).toBe('Anonymous speaker');
  });

  it('handles text without voice tags', () => {
    const track = makeTextTrack([
      makeVttCue(0, 2, 'Just plain text'),
    ]);

    const cues = extractTrackCues(track);

    expect(cues[0].voice).toBeUndefined();
    expect(cues[0].text).toBe('Just plain text');
  });

  it('preserves HTML tags in cue text', () => {
    const track = makeTextTrack([
      makeVttCue(0, 2, '<b>Bold</b> and <i>italic</i>'),
    ]);

    const cues = extractTrackCues(track);

    expect(cues[0].text).toBe('<b>Bold</b> and <i>italic</i>');
  });

  it('handles multiline cue text', () => {
    const track = makeTextTrack([
      makeVttCue(0, 3, 'Line one\nLine two'),
    ]);

    const cues = extractTrackCues(track);

    expect(cues[0].text).toBe('Line one\nLine two');
  });

  it('skips non-subtitle/caption tracks', () => {
    const metadataTrack = makeTextTrack(
      [makeVttCue(0, 2, 'metadata')],
      'metadata',
    );

    const chaptersTrack = makeTextTrack(
      [makeVttCue(0, 2, 'chapter')],
      'chapters',
    );

    expect(extractTrackCues(metadataTrack)).toEqual([]);
    expect(extractTrackCues(chaptersTrack)).toEqual([]);
  });

  it('handles captions kind', () => {
    const track = makeTextTrack(
      [makeVttCue(0, 2, 'Caption text')],
      'captions',
    );

    const cues = extractTrackCues(track);
    expect(cues).toHaveLength(1);
    expect(cues[0].text).toBe('Caption text');
  });

  it('strips leading/trailing whitespace from cue text', () => {
    const track = makeTextTrack([
      makeVttCue(0, 2, '  Trimmed text  '),
    ]);

    const cues = extractTrackCues(track);

    expect(cues[0].text).toBe('Trimmed text');
  });

  it('handles voice tag with extra whitespace', () => {
    const track = makeTextTrack([
      makeVttCue(0, 2, '<v  Speaker  >Hello</v>'),
    ]);

    const cues = extractTrackCues(track);

    expect(cues[0].voice).toBe('Speaker');
    expect(cues[0].text).toBe('Hello');
  });

  it('handles cue with empty text', () => {
    const track = makeTextTrack([
      makeVttCue(0, 2, ''),
    ]);

    const cues = extractTrackCues(track);

    expect(cues).toHaveLength(1);
    expect(cues[0].text).toBe('');
  });
});
