import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  processMaxMpdManifest,
  resetMaxMpdProcessorState,
  prioritizeTracksForFetch,
} from '@/inject/maxMpdProcessor';
import type { MpdSubtitleTrack } from '@/lib/maxMpdSubtitles';

const MPD_WITH_TTML = `<?xml version="1.0"?>
<MPD xmlns="urn:mpeg:dash:schema:mpd:2011">
  <Period>
    <AdaptationSet mimeType="application/ttml+xml" lang="en">
      <Representation id="s1">
        <BaseURL>https://cdn.example.com/subs_en.ttml</BaseURL>
      </Representation>
    </AdaptationSet>
  </Period>
</MPD>`;

const TTML_BODY = `<?xml version="1.0"?>
<tt xmlns="http://www.w3.org/ns/ttml">
  <body><div>
    <p begin="00:00:12.340" end="00:00:15.670">Hello there</p>
  </div></body>
</tt>`;

describe('prioritizeTracksForFetch', () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <button data-testid="player-ux-text-track-button" aria-label="Chinese (Simplified)" aria-checked="true"></button>
      <button data-testid="player-ux-text-track-button" aria-label="English" aria-checked="false"></button>
    `;
  });

  it('puts active Max language tracks first', () => {
    const tracks: MpdSubtitleTrack[] = [
      { url: 'https://cdn.example.com/en.vtt', language: 'en-US' },
      { url: 'https://cdn.example.com/zh.vtt', language: 'zh-Hans-SG' },
    ];
    const ordered = prioritizeTracksForFetch(tracks);
    expect(ordered[0].language).toBe('zh-Hans-SG');
  });
});

describe('processMaxMpdManifest', () => {
  beforeEach(() => {
    resetMaxMpdProcessorState();
    document.body.innerHTML = '';
    vi.restoreAllMocks();
  });

  it('fetches subtitle tracks, logs parsed cues, and emits bridge message', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const bridge = { send: vi.fn(() => 'req-1') };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response(TTML_BODY, {
        status: 200,
        headers: { 'Content-Type': 'application/ttml+xml' },
      }),
    ));

    await processMaxMpdManifest(MPD_WITH_TTML, 'https://cdn.example.com/manifest.mpd', bridge);

    expect(fetch).toHaveBeenCalledWith('https://cdn.example.com/subs_en.ttml');
    expect(logSpy).toHaveBeenCalledWith(
      'AnyLLMTranslate: Max MPD subtitles parsed',
      expect.objectContaining({ cueCount: 1 }),
    );
    expect(bridge.send).toHaveBeenCalledWith(
      'SUBTITLE_MANIFEST_CUES',
      expect.objectContaining({
        platform: 'hbomax',
        language: 'en',
      }),
    );
  });

  it('skips duplicate MPD processing', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(TTML_BODY, { status: 200, headers: { 'Content-Type': 'application/ttml+xml' } }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await processMaxMpdManifest(MPD_WITH_TTML, 'https://cdn.example.com/manifest.mpd');
    await processMaxMpdManifest(MPD_WITH_TTML, 'https://cdn.example.com/manifest.mpd?token=1');

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('does not fetch non-active language when active language fetch fails', async () => {
    document.body.innerHTML = `
      <button data-testid="player-ux-text-track-button" aria-label="Chinese (Simplified)" aria-checked="true"></button>
    `;
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url.includes('zh')) {
        return Promise.resolve(new Response('', { status: 404, statusText: 'Not Found' }));
      }
      return Promise.resolve(new Response(TTML_BODY, { status: 200, headers: { 'Content-Type': 'application/ttml+xml' } }));
    });
    vi.stubGlobal('fetch', fetchMock);
    const bridge = { send: vi.fn() };

    const mpd = `<?xml version="1.0"?>
<MPD xmlns="urn:mpeg:dash:schema:mpd:2011">
  <Period>
    <AdaptationSet mimeType="text/vtt" lang="zh-Hans-SG">
      <Representation id="s1"><BaseURL>https://cdn.example.com/zh.vtt</BaseURL></Representation>
    </AdaptationSet>
    <AdaptationSet mimeType="text/vtt" lang="en-US">
      <Representation id="s2"><BaseURL>https://cdn.example.com/en.vtt</BaseURL></Representation>
    </AdaptationSet>
  </Period>
</MPD>`;

    await processMaxMpdManifest(mpd, 'https://cdn.example.com/manifest.mpd', bridge);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith('https://cdn.example.com/zh.vtt');
    expect(bridge.send).not.toHaveBeenCalled();
  });
});