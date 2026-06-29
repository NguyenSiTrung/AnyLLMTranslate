import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  processMaxMpdManifest,
  resetMaxMpdProcessorState,
  selectTracksForFetch,
  setMpdPreferredLanguage,
  resolveMpdTargetLanguage,
  dedupeTracksByUrl,
} from '@/inject/maxMpdProcessor';
import { resetPageFetchForTests, setPageFetchForTests } from '@/inject/maxMpdSubtitleFetch';
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

describe('resolveMpdTargetLanguage', () => {
  beforeEach(() => {
    resetMaxMpdProcessorState();
    setMpdPreferredLanguage(undefined);
    document.body.innerHTML = '';
  });

  it('prefers extension setting over Max active track', () => {
    setMpdPreferredLanguage('en');
    document.body.innerHTML = `
      <button data-testid="player-ux-text-track-button" aria-label="Chinese (Simplified)" aria-checked="true"></button>
    `;
    expect(resolveMpdTargetLanguage()).toBe('en');
  });

  it('falls back to Max active track when preferred is auto', () => {
    setMpdPreferredLanguage('auto');
    document.body.innerHTML = `
      <button data-testid="player-ux-text-track-button" aria-label="English" aria-checked="true"></button>
    `;
    expect(resolveMpdTargetLanguage()).toBe('en');
  });
});

describe('dedupeTracksByUrl', () => {
  it('removes tracks that resolve to the same segment URL', () => {
    const tracks = [
      { url: 'https://cdn.example.com/en.vtt?token=a', language: 'en-US' },
      { url: 'https://cdn.example.com/en.vtt?token=b', language: 'en-US' },
      { url: 'https://cdn.example.com/es.vtt', language: 'es' },
    ];
    expect(dedupeTracksByUrl(tracks)).toHaveLength(2);
  });
});

describe('selectTracksForFetch', () => {
  const tracks: MpdSubtitleTrack[] = [
    { url: 'https://cdn.example.com/zh.vtt', language: 'zh-Hans-SG' },
    { url: 'https://cdn.example.com/en.vtt', language: 'en-US' },
  ];

  it('returns only English when target is en', () => {
    const result = selectTracksForFetch(tracks, 'en');
    expect(result).toHaveLength(1);
    expect(result[0].language).toBe('en-US');
  });

  it('returns only Chinese when target is zh-Hans', () => {
    const result = selectTracksForFetch(tracks, 'zh-Hans');
    expect(result).toHaveLength(1);
    expect(result[0].language).toBe('zh-Hans-SG');
  });
});

describe('processMaxMpdManifest', () => {
  beforeEach(() => {
    resetMaxMpdProcessorState();
    resetPageFetchForTests();
    setMpdPreferredLanguage(undefined);
    document.body.innerHTML = '';
    vi.restoreAllMocks();
  });

  it('fetches only preferred English track even when Chinese is active in Max', async () => {
    setMpdPreferredLanguage('en');
    document.body.innerHTML = `
      <button data-testid="player-ux-text-track-button" aria-label="Chinese (Simplified)" aria-checked="true"></button>
    `;
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url.includes('en')) {
        return Promise.resolve(new Response(TTML_BODY, { status: 200, headers: { 'Content-Type': 'application/ttml+xml' } }));
      }
      return Promise.resolve(new Response('', { status: 404 }));
    });
    vi.stubGlobal('fetch', fetchMock);
    setPageFetchForTests(fetchMock as typeof fetch);
    const bridge = { send: vi.fn(() => 'req-1') };

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
    expect(fetchMock).toHaveBeenCalledWith('https://cdn.example.com/en.vtt', expect.objectContaining({ signal: expect.any(AbortSignal) }));
    expect(bridge.send).toHaveBeenCalledWith(
      'SUBTITLE_MANIFEST_CUES',
      expect.objectContaining({ language: 'en-US' }),
    );
  });

  it('tries the next same-language track when the first returns zero cues', async () => {
    setMpdPreferredLanguage('en');
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url.includes('t6')) {
        return Promise.resolve(new Response('WEBVTT\n\n', { status: 200, headers: { 'Content-Type': 'text/vtt' } }));
      }
      if (url.includes('t7')) {
        return Promise.resolve(new Response(`WEBVTT

00:00:01.000 --> 00:00:02.000
Hello`, { status: 200, headers: { 'Content-Type': 'text/vtt' } }));
      }
      return Promise.resolve(new Response('', { status: 404 }));
    });
    vi.stubGlobal('fetch', fetchMock);
    setPageFetchForTests(fetchMock as typeof fetch);
    const bridge = { send: vi.fn(() => 'req-1') };

    const mpd = `<?xml version="1.0"?>
<MPD xmlns="urn:mpeg:dash:schema:mpd:2011">
  <Period>
    <AdaptationSet contentType="text" lang="en-US">
      <Representation id="t6"><BaseURL>https://cdn.example.com/t6.vtt</BaseURL></Representation>
      <Representation id="t7"><BaseURL>https://cdn.example.com/t7.vtt</BaseURL></Representation>
    </AdaptationSet>
  </Period>
</MPD>`;

    await processMaxMpdManifest(mpd, 'https://cdn.example.com/manifest.mpd', bridge);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(bridge.send).toHaveBeenCalledWith(
      'SUBTITLE_MANIFEST_CUES',
      expect.objectContaining({ cues: expect.arrayContaining([expect.objectContaining({ text: 'Hello' })]) }),
    );
  });

  it('fetches subtitle tracks and emits bridge message', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const bridge = { send: vi.fn(() => 'req-1') };
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(TTML_BODY, {
        status: 200,
        headers: { 'Content-Type': 'application/ttml+xml' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);
    setPageFetchForTests(fetchMock as typeof fetch);

    await processMaxMpdManifest(MPD_WITH_TTML, 'https://cdn.example.com/manifest.mpd', bridge);

    expect(fetchMock).toHaveBeenCalledWith('https://cdn.example.com/subs_en.ttml', expect.objectContaining({ signal: expect.any(AbortSignal) }));
    expect(logSpy).toHaveBeenCalledWith(
      'AnyLLMTranslate: Max MPD subtitles parsed',
      expect.objectContaining({ cueCount: 1 }),
    );
    expect(bridge.send).toHaveBeenCalled();
  });

  it('skips processing duplicate manifest bodies', async () => {
    const bridge = { send: vi.fn(() => 'req-1') };
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(TTML_BODY, {
        status: 200,
        headers: { 'Content-Type': 'application/ttml+xml' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);
    setPageFetchForTests(fetchMock as typeof fetch);

    resetMaxMpdProcessorState();

    // First process
    await processMaxMpdManifest(MPD_WITH_TTML, 'https://cdn.example.com/manifest-1.mpd', bridge);
    expect(bridge.send).toHaveBeenCalledWith('SUBTITLE_MPD_PROCESSING', expect.objectContaining({ status: 'started' }));

    // Reset bridge spy
    bridge.send.mockClear();

    // Second process with DIFFERENT URL but SAME body content
    await processMaxMpdManifest(MPD_WITH_TTML, 'https://cdn.example.com/manifest-2.mpd', bridge);
    expect(bridge.send).not.toHaveBeenCalled(); // Skipped by body content deduplication
  });
});