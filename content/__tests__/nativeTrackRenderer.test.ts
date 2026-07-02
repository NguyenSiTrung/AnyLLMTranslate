import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NativeTrackRenderer } from '@/content/nativeTrackRenderer';
import type { SubtitleCue } from '@/types/subtitle';

function makeTrack(cues: unknown[] = []): unknown {
  return {
    kind: 'subtitles',
    mode: 'disabled',
    label: '',
    language: '',
    cues,
    addCue: vi.fn((c: unknown) => cues.push(c)),
    removeCue: vi.fn((c: unknown) => {
      const i = cues.indexOf(c);
      if (i >= 0) cues.splice(i, 1);
    }),
    oncuechange: null,
  };
}

function makeVideo(tracks: unknown[]): unknown {
  const textTracks = tracks as unknown as {
    addEventListener: ReturnType<typeof vi.fn>;
    removeEventListener: ReturnType<typeof vi.fn>;
  };
  textTracks.addEventListener = vi.fn();
  textTracks.removeEventListener = vi.fn();
  return {
    addTextTrack: vi.fn(() => {
      const t = makeTrack();
      tracks.push(t);
      return t;
    }),
    textTracks: tracks,
  };
}

// Provide a VTTCue stub so canRenderNatively / `new VTTCue(...)` succeed.
class FakeVTTCue {
  startTime: number;
  endTime: number;
  text: string;
  constructor(s: number, e: number, t: string) {
    this.startTime = s;
    this.endTime = e;
    this.text = t;
  }
}
(globalThis as unknown as { VTTCue: typeof FakeVTTCue }).VTTCue = FakeVTTCue;

describe('NativeTrackRenderer', () => {
  let video: { addTextTrack: ReturnType<typeof vi.fn>; textTracks: unknown[] };
  beforeEach(() => {
    video = makeVideo([]) as {
      addTextTrack: ReturnType<typeof vi.fn>;
      textTracks: unknown[];
    };
  });

  it('creates two showing tracks and adds cues to each', async () => {
    const r = new NativeTrackRenderer();
    const cues: SubtitleCue[] = [
      { startTime: 1, endTime: 2, text: 'hello', originalText: 'hello' },
    ];
    await r.initialize(cues, { displayMode: 'bilingual' }, video as never);
    expect(video.addTextTrack).toHaveBeenCalledTimes(2);
    const [orig, trans] = video.textTracks as {
      mode: string;
      cues: unknown[];
    }[];
    expect(orig.mode).toBe('showing');
    expect(trans.mode).toBe('showing');
    expect(orig.cues.length).toBe(1); // original text
    expect(trans.cues.length).toBe(1); // translation text
  });

  it('uses originalText for the original track and text for translation', async () => {
    const r = new NativeTrackRenderer();
    const cues: SubtitleCue[] = [
      { startTime: 1, endTime: 2, text: 'hola', originalText: 'hello' },
    ];
    await r.initialize(cues, { displayMode: 'bilingual' }, video as never);
    const [orig] = video.textTracks as { cues: { text: string }[] }[];
    expect(orig.cues[0].text).toBe('hello');
    expect(
      (video.textTracks[1] as { cues: { text: string }[] }).cues[0].text,
    ).toBe('hola');
  });

  it('translation-only mode creates only one track', async () => {
    const r = new NativeTrackRenderer();
    await r.initialize(
      [{ startTime: 1, endTime: 2, text: 'hi' }],
      { displayMode: 'translation-only' },
      video as never,
    );
    expect(video.addTextTrack).toHaveBeenCalledTimes(1);
  });

  it('updateCues adds new cues without duplicating stable ones (delta only)', async () => {
    const r = new NativeTrackRenderer();
    await r.initialize(
      [{ startTime: 1, endTime: 2, text: 'a' }],
      { displayMode: 'translation-only' },
      video as never,
    );
    const track = video.textTracks[0] as { cues: unknown[] };
    expect(track.cues.length).toBe(1);
    r.updateCues([
      { startTime: 1, endTime: 2, text: 'a' }, // stable
      { startTime: 5, endTime: 6, text: 'b' }, // new
    ]);
    expect(track.cues.length).toBe(2);
  });

  it('destroy removes all cues and disables tracks', async () => {
    const r = new NativeTrackRenderer();
    await r.initialize(
      [{ startTime: 1, endTime: 2, text: 'a' }],
      { displayMode: 'bilingual' },
      video as never,
    );
    r.destroy();
    for (const t of video.textTracks as { mode: string; cues: unknown[] }[]) {
      expect(t.mode).toBe('disabled');
      expect(t.cues.length).toBe(0);
    }
  });
});
