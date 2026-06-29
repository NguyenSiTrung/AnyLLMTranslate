import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  processMaxMpdManifest,
  resetMaxMpdProcessorState,
  selectTracksForFetch,
  setMpdPreferredLanguage,
  resolveMpdTargetLanguage,
  dedupeTracksByUrl,
  filterFetchableMpdTracks,
} from '@/inject/maxMpdProcessor';
import {
  resetPageFetchForTests,
  resetRelayFetchForTests,
  setPageFetchForTests,
  setRelayFetchForTests,
  type SubtitleSegmentFetchResult,
} from '@/inject/maxMpdSubtitleFetch';
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

describe('filterFetchableMpdTracks', () => {
  const mpdUrl =
    'https://gcp.asia.prd.media.max.com/fadb6e8d-4efa-49e9-90b1-f2d88de5eb5b?manifest-params=TOKEN';

  it('drops manifest-echo URLs and keeps real VTT segments', () => {
    const tracks = [
      { url: mpdUrl, language: 'en-US' },
      {
        url: 'https://gcp.asia.prd.media.max.com/fadb6e8d-4efa-49e9-90b1-f2d88de5eb5b/t/caa516/t3/8.vtt?manifest-params=TOKEN',
        language: 'en-US',
      },
      {
        url: 'https://gcp.apac-free.prd.media.max.com/apac/abc/?manifest-params=TOKEN',
        language: 'en-US',
      },
    ];
    const filtered = filterFetchableMpdTracks(tracks, mpdUrl);
    expect(filtered).toHaveLength(1);
    expect(filtered[0].url).toContain('/t/caa516/t3/8.vtt');
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

async function responseToRelayResult(response: Response): Promise<SubtitleSegmentFetchResult> {
  if (!response.ok) {
    return { ok: false, status: response.status, text: '', contentType: '', error: `HTTP ${response.status}` };
  }
  return {
    ok: true,
    status: response.status,
    text: await response.text(),
    contentType: response.headers.get('Content-Type') ?? '',
  };
}

function installRelayFromFetchMock(fetchMock: ReturnType<typeof vi.fn>): void {
  setRelayFetchForTests(async (url: string) => responseToRelayResult(await fetchMock(url)));
}

describe('processMaxMpdManifest', () => {
  beforeEach(() => {
    resetMaxMpdProcessorState();
    resetPageFetchForTests();
    resetRelayFetchForTests();
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
    installRelayFromFetchMock(fetchMock);
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
    expect(fetchMock).toHaveBeenCalledWith('https://cdn.example.com/en.vtt');
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
    installRelayFromFetchMock(fetchMock);
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
    installRelayFromFetchMock(fetchMock);

    await processMaxMpdManifest(MPD_WITH_TTML, 'https://cdn.example.com/manifest.mpd', bridge);

    expect(fetchMock).toHaveBeenCalledWith('https://cdn.example.com/subs_en.ttml');
    expect(logSpy).toHaveBeenCalledWith(
      'AnyLLMTranslate: Max MPD subtitles parsed',
      expect.objectContaining({ cueCount: 1 }),
    );
    expect(bridge.send).toHaveBeenCalled();
  });

  it('follows nested DASH manifests returned by Max CDN VTT segment URLs', async () => {
    setMpdPreferredLanguage('en');
    const nestedMpd = `<?xml version="1.0"?>
<MPD xmlns="urn:mpeg:dash:schema:mpd:2011">
  <Period>
    <AdaptationSet mimeType="text/vtt" lang="en-US">
      <Representation id="t6">
        <SegmentTemplate media="nested/t6/$Number$.vtt" startNumber="1"/>
      </Representation>
    </AdaptationSet>
  </Period>
</MPD>`;
    const vtt = `WEBVTT

00:00:01.000 --> 00:00:02.000
Hello`;

    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/nested/t6/1.vtt')) {
        return Promise.resolve(new Response(vtt, { status: 200, headers: { 'Content-Type': 'text/vtt' } }));
      }
      if (url.includes('/t/caa516/t3/8.vtt')) {
        return Promise.resolve(new Response(nestedMpd, { status: 200, headers: { 'Content-Type': 'application/dash+xml' } }));
      }
      return Promise.resolve(new Response('', { status: 404 }));
    });
    vi.stubGlobal('fetch', fetchMock);
    setPageFetchForTests(fetchMock as typeof fetch);
    installRelayFromFetchMock(fetchMock);
    const bridge = { send: vi.fn(() => 'req-1') };

    const mpdUrl =
      'https://gcp.asia.prd.media.max.com/fadb6e8d-4efa-49e9-90b1-f2d88de5eb5b?manifest-params=TOKEN&rtype=s&market=apac&x-wbd-tenant=beam';
    const mpd = `<?xml version="1.0"?>
<MPD xmlns="urn:mpeg:dash:schema:mpd:2011">
  <Period id="29960" start="PT29.960S">
    <AdaptationSet lang="en-US" contentType="text">
      <Representation id="t3" mimeType="text/vtt">
        <SegmentTemplate startNumber="8" media="t/caa516/t3/$Number$.vtt">
          <SegmentTimeline><S t="6698800" d="734679"/></SegmentTimeline>
        </SegmentTemplate>
      </Representation>
    </AdaptationSet>
  </Period>
</MPD>`;

    await processMaxMpdManifest(mpd, mpdUrl, bridge);

    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('/t/caa516/t3/8.vtt'));
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('/nested/t6/1.vtt'));
    expect(bridge.send).toHaveBeenCalledWith(
      'SUBTITLE_MANIFEST_CUES',
      expect.objectContaining({ cues: expect.arrayContaining([expect.objectContaining({ text: 'Hello' })]) }),
    );
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
    installRelayFromFetchMock(fetchMock);

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