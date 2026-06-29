import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  detectMpdRequests,
  parseMpd,
  extractSubtitleTracks,
  fetchAndParseSubtitle,
  parseSubtitleContent,
  fetchRealSubtitleContent,
  processMpdSubtitleTracks,
  resetMaxMpdSubtitleFetchDiagnostics,
  prioritizeMpdTracksForFetch,
  scoreMpdTrackForFetch,
  isResolvableSubtitleSegmentUrl,
  mergeManifestQueryParams,
} from '@/lib/maxMpdSubtitles';

function parseTestMpd(xml: string, url: string): Document {
  const doc = parseMpd(xml, url);
  if (!doc) throw new Error('Failed to parse MPD');
  return doc;
}

describe('detectMpdRequests', () => {
  it('detects .mpd URLs', () => {
    expect(detectMpdRequests('https://cdn.example.com/manifest.mpd')).toBe(true);
    expect(detectMpdRequests('https://cdn.example.com/manifest.mpd?token=abc')).toBe(true);
  });

  it('detects extensionless Max CDN manifest URLs with manifest-params', () => {
    expect(detectMpdRequests(
      'https://akm.asia.prd.media.max.com/fadb6e8d-4efa-49a7?manifest-params=TOKEN&rtype=s&market=apac&x-wbd-tenant=beam',
    )).toBe(true);
  });

  it('rejects non-MPD URLs', () => {
    expect(detectMpdRequests('https://cdn.example.com/video.m3u8')).toBe(false);
    expect(detectMpdRequests('https://cf.asia.prd.media.max.com/fadb6e8d/t/t6/1.vtt')).toBe(false);
    expect(detectMpdRequests('https://cf.asia.prd.media.max.com/fadb6e8d?rtype=s')).toBe(false);
    expect(detectMpdRequests('')).toBe(false);
  });

  it('rejects Max CDN WebVTT segment URLs even when manifest-params is present', () => {
    expect(detectMpdRequests(
      'https://akm.asia.prd.media.max.com/fadb6e8d-4efa-49a7/t/2_ada795/t0/1.vtt?manifest-params=TOKEN&rtype=s&market=apac&x-wbd-tenant=beam',
    )).toBe(false);
  });
});

describe('extractSubtitleTracks', () => {
  it('extracts TTML AdaptationSet tracks', () => {
    const xml = `<?xml version="1.0"?>
<MPD xmlns="urn:mpeg:dash:schema:mpd:2011">
  <Period>
    <AdaptationSet mimeType="application/ttml+xml" lang="en">
      <Representation id="s1">
        <BaseURL>subs_en.ttml</BaseURL>
      </Representation>
    </AdaptationSet>
  </Period>
</MPD>`;

    const doc = parseTestMpd(xml, 'https://cdn.example.com/manifest.mpd');
    const tracks = extractSubtitleTracks(doc, 'https://cdn.example.com/manifest.mpd');
    expect(tracks).toHaveLength(1);
    expect(tracks[0]).toEqual({
      url: 'https://cdn.example.com/subs_en.ttml',
      language: 'en',
      mimeType: 'application/ttml+xml',
    });
  });

  it('extracts contentType=text AdaptationSets', () => {
    const xml = `<?xml version="1.0"?>
<MPD xmlns="urn:mpeg:dash:schema:mpd:2011">
  <Period>
    <AdaptationSet mimeType="application/mp4" contentType="text" lang="es">
      <Representation id="s1">
        <BaseURL>subs_es.mp4</BaseURL>
      </Representation>
    </AdaptationSet>
  </Period>
</MPD>`;

    const doc = parseTestMpd(xml, 'https://cdn.example.com/manifest.mpd');
    const tracks = extractSubtitleTracks(doc, 'https://cdn.example.com/manifest.mpd');
    expect(tracks[0].language).toBe('es');
  });

  it('skips video AdaptationSets', () => {
    const xml = `<?xml version="1.0"?>
<MPD xmlns="urn:mpeg:dash:schema:mpd:2011">
  <Period>
    <AdaptationSet mimeType="video/mp4" lang="en">
      <Representation id="v1"><BaseURL>video.mp4</BaseURL></Representation>
    </AdaptationSet>
  </Period>
</MPD>`;

    const doc = parseTestMpd(xml, 'https://cdn.example.com/manifest.mpd');
    expect(extractSubtitleTracks(doc, 'https://cdn.example.com/manifest.mpd')).toEqual([]);
  });
});

describe('parseSubtitleContent', () => {
  it('parses TTML content', () => {
    const ttml = `<?xml version="1.0"?>
<tt xmlns="http://www.w3.org/ns/ttml">
  <body><div>
    <p begin="00:00:01.000" end="00:00:02.000">Hi</p>
  </div></body>
</tt>`;

    const cues = parseSubtitleContent(ttml, 'application/ttml+xml', 'https://cdn.example.com/subs.ttml');
    expect(cues).toHaveLength(1);
    expect(cues[0].text).toBe('Hi');
  });
});

describe('fetchAndParseSubtitle', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    resetMaxMpdSubtitleFetchDiagnostics();
  });

  it('progressively fetches WebVTT segments until HTTP 404', async () => {
    const seg1 = 'WEBVTT\n\n';
    const seg2 = `WEBVTT

00:00:01.000 --> 00:00:02.000
Hello`;

    vi.stubGlobal('fetch', vi.fn().mockImplementation((url: string) => {
      if (url.includes('/1.vtt')) {
        return Promise.resolve(new Response(seg1, { status: 200, headers: { 'Content-Type': 'text/vtt' } }));
      }
      if (url.includes('/2.vtt')) {
        return Promise.resolve(new Response(seg2, { status: 200, headers: { 'Content-Type': 'text/vtt' } }));
      }
      return Promise.resolve(new Response('', { status: 404 }));
    }));

    const cues = await fetchAndParseSubtitle('https://cdn.example.com/t/t6/1.vtt', {
      segmentFetch: {
        media: 't/t6/$Number$.vtt',
        startNumber: 1,
        representationId: 't6',
        bandwidth: '',
        mpdUrl: 'https://cdn.example.com/manifest.mpd',
      },
    });

    expect(fetch).toHaveBeenCalledTimes(3);
    expect(cues).toEqual([
      { start: expect.closeTo(1, 3), end: expect.closeTo(2, 3), text: 'Hello' },
    ]);
  });

  it('caps progressive WebVTT fetching when segment count is unknown', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation((url: string) => Promise.resolve(
      new Response(`WEBVTT

00:00:01.000 --> 00:00:02.000
Segment ${url.match(/\/(\d+)\.vtt/)?.[1] ?? ''}`, {
        status: 200,
        headers: { 'Content-Type': 'text/vtt' },
      }),
    )));

    const cues = await fetchAndParseSubtitle('https://cdn.example.com/t/t6/1.vtt', {
      segmentFetch: {
        media: 't/t6/$Number$.vtt',
        startNumber: 1,
        representationId: 't6',
        bandwidth: '',
        mpdUrl: 'https://cdn.example.com/manifest.mpd',
      },
    });

    expect(fetch).toHaveBeenCalledTimes(120);
    expect(cues[0].text).toBe('Segment 1');
    expect(cues[cues.length - 1].text).toBe('Segment 120');
  });

  it('fetches and concatenates segmented WebVTT tracks', async () => {
    const seg1 = 'WEBVTT\n\n';
    const seg2 = `WEBVTT

00:00:01.000 --> 00:00:02.000
Hello`;

    vi.stubGlobal('fetch', vi.fn().mockImplementation((url: string) => {
      if (url.includes('/1.vtt')) {
        return Promise.resolve(new Response(seg1, { status: 200, headers: { 'Content-Type': 'text/vtt' } }));
      }
      if (url.includes('/2.vtt')) {
        return Promise.resolve(new Response(seg2, { status: 200, headers: { 'Content-Type': 'text/vtt' } }));
      }
      return Promise.resolve(new Response('', { status: 404 }));
    }));

    const cues = await fetchAndParseSubtitle('https://cdn.example.com/t/t6/1.vtt', {
      segmentUrls: [
        'https://cdn.example.com/t/t6/1.vtt',
        'https://cdn.example.com/t/t6/2.vtt',
      ],
    });

    expect(fetch).toHaveBeenCalledTimes(2);
    expect(cues).toEqual([
      { start: expect.closeTo(1, 3), end: expect.closeTo(2, 3), text: 'Hello' },
    ]);
  });

  it('fetches and parses subtitle file', async () => {
    const ttml = `<?xml version="1.0"?>
<tt xmlns="http://www.w3.org/ns/ttml">
  <body><div>
    <p begin="00:00:12.340" end="00:00:15.670">Hello there</p>
  </div></body>
</tt>`;

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response(ttml, {
        status: 200,
        headers: { 'Content-Type': 'application/ttml+xml' },
      }),
    ));

    const cues = await fetchAndParseSubtitle('https://cdn.example.com/subs.ttml');
    expect(cues).toEqual([
      { start: expect.closeTo(12.34, 3), end: expect.closeTo(15.67, 3), text: 'Hello there' },
    ]);
  });

  it('parses a nested MPD response and fetches its subtitle segment', async () => {
    const nestedMpd = `<?xml version="1.0"?>
<MPD xmlns="urn:mpeg:dash:schema:mpd:2011">
  <Period>
    <AdaptationSet contentType="text" lang="en-US">
      <Representation id="t6" mimeType="text/vtt">
        <SegmentTemplate media="nested/t6/$Number$.vtt" startNumber="1"/>
      </Representation>
    </AdaptationSet>
  </Period>
</MPD>`;
    const vtt = `WEBVTT

00:00:01.000 --> 00:00:02.000
Nested subtitle`;

    vi.stubGlobal('fetch', vi.fn().mockImplementation((url: string) => {
      if (url.includes('/nested/t6/1.vtt')) {
        return Promise.resolve(new Response(vtt, { status: 200, headers: { 'Content-Type': 'text/vtt' } }));
      }
      if (url.includes('subtitle-layer') && !url.includes('/nested/')) {
        return Promise.resolve(new Response(nestedMpd, { status: 200, headers: { 'Content-Type': 'application/dash+xml' } }));
      }
      return Promise.resolve(new Response('', { status: 404 }));
    }));

    const cues = await fetchAndParseSubtitle('https://cdn.example.com/subtitle-layer?token=abc');

    expect(fetch).toHaveBeenCalledWith('https://cdn.example.com/subtitle-layer?token=abc');
    expect(fetch).toHaveBeenCalledWith('https://cdn.example.com/subtitle-layer/nested/t6/1.vtt?token=abc');
    expect(cues).toEqual([
      { start: expect.closeTo(1, 3), end: expect.closeTo(2, 3), text: 'Nested subtitle' },
    ]);
  });

  it('fails fast when segment echoes the root MPD body via seenManifests seed', async () => {
    const rootMpd = `<?xml version="1.0"?>
<MPD xmlns="urn:mpeg:dash:schema:mpd:2011">
  <Period>
    <AdaptationSet contentType="text" lang="en-US">
      <Representation id="t6" mimeType="text/vtt">
        <SegmentTemplate media="t/t6/$Number$.vtt" startNumber="1"/>
      </Representation>
    </AdaptationSet>
  </Period>
</MPD>`;

    const fetchMock = vi.fn().mockResolvedValue(
      new Response(rootMpd, { status: 200, headers: { 'Content-Type': 'application/dash+xml' } }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const cues = await fetchAndParseSubtitle('https://cdn.example.com/fadb6e8d/t/t6/1.vtt?token=abc', {
      seenManifests: new Set([rootMpd.trim()]),
    });

    expect(cues).toEqual([]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('handles circular nested MPD manifests gracefully without infinite looping', async () => {
    const circularMpd = `<?xml version="1.0"?>
<MPD xmlns="urn:mpeg:dash:schema:mpd:2011">
  <Period>
    <AdaptationSet mimeType="application/ttml+xml" lang="en">
      <Representation id="t6" mimeType="text/vtt">
        <SegmentTemplate media="nested/t6/$Number$.vtt" startNumber="1"/>
      </Representation>
    </AdaptationSet>
  </Period>
</MPD>`;

    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => {
      return Promise.resolve(new Response(circularMpd, { status: 200, headers: { 'Content-Type': 'application/dash+xml' } }));
    }));

    await expect(fetchAndParseSubtitle('https://cdn.example.com/circular?token=abc'))
      .rejects.toThrow('Subtitle fetch returned MPD manifest instead of subtitle content');
  });
});

// ============================================================================
// CDN auth-token preservation on resolved subtitle URLs
// ----------------------------------------------------------------------------
// Max's CDN carries an auth token (`manifest-params=...`) in the MPD's query
// string and requires it on every segment request. Per RFC 3986 a relative
// reference with its own path REPLACES the base query string, so a naive
// resolve drops the token → HTTP 404. These tests pin the fix.
// ============================================================================
describe('extractSubtitleTracks — CDN auth-token preservation', () => {
  // A realistic Max-like MPD URL: directory + auth query.
  const MPD_URL = 'https://cf.asia.prd.media.max.com/fadb6e8d/dash.mpd?manifest-params=CAQSATEA&rtype=s&market=apac&x-wbd-tenant=beam';

  it('re-attaches the MPD query token onto a SegmentTemplate-resolved segment URL', () => {
    const xml = `<?xml version="1.0"?>
<MPD xmlns="urn:mpeg:dash:schema:mpd:2011">
  <Period>
    <AdaptationSet mimeType="application/ttml+xml" lang="en">
      <SegmentTemplate media="t/2_7e39a5/t3/$Number$.vtt" startNumber="1"/>
      <Representation id="sub_en"/>
    </AdaptationSet>
  </Period>
</MPD>`;

    const doc = parseTestMpd(xml, MPD_URL);
    const tracks = extractSubtitleTracks(doc, MPD_URL);
    expect(tracks).toHaveLength(1);
    // The resolved URL MUST carry the MPD's auth query string.
    expect(tracks[0].url).toBe('https://cf.asia.prd.media.max.com/fadb6e8d/t/2_7e39a5/t3/1.vtt?manifest-params=CAQSATEA&rtype=s&market=apac&x-wbd-tenant=beam');
  });

  it('re-attaches the MPD query token onto a relative BaseURL', () => {
    const xml = `<?xml version="1.0"?>
<MPD xmlns="urn:mpeg:dash:schema:mpd:2011">
  <Period>
    <AdaptationSet mimeType="application/ttml+xml" lang="en">
      <Representation id="s1">
        <BaseURL>subs_en.ttml</BaseURL>
      </Representation>
    </AdaptationSet>
  </Period>
</MPD>`;

    const doc = parseTestMpd(xml, MPD_URL);
    const tracks = extractSubtitleTracks(doc, MPD_URL);
    expect(tracks[0].url).toBe('https://cf.asia.prd.media.max.com/fadb6e8d/subs_en.ttml?manifest-params=CAQSATEA&rtype=s&market=apac&x-wbd-tenant=beam');
  });

  it('merges missing manifest-params onto Max CDN URLs that already have other query keys', () => {
    const mpdUrl = MPD_URL;
    const segment = new URL(
      'https://gcp.asia.prd.media.max.com/fadb6e8d/t/caa516/t3/2.vtt?rtype=s',
    );
    mergeManifestQueryParams(segment, mpdUrl);
    expect(segment.searchParams.get('rtype')).toBe('s');
    expect(segment.searchParams.get('manifest-params')).toBe('CAQSATEA');
    expect(segment.searchParams.get('market')).toBe('apac');
    expect(segment.searchParams.get('x-wbd-tenant')).toBe('beam');
  });

  it('does NOT override a query string already present on an absolute BaseURL', () => {
    // An absolute subtitle URL carrying its OWN query must be preserved as-is —
    // the token re-attach only applies when the resolved URL has no query.
    const xml = `<?xml version="1.0"?>
<MPD xmlns="urn:mpeg:dash:schema:mpd:2011">
  <Period>
    <AdaptationSet mimeType="application/ttml+xml" lang="en">
      <Representation id="s1">
        <BaseURL>https://other.cdn.com/subs_en.ttml?token=xyz</BaseURL>
      </Representation>
    </AdaptationSet>
  </Period>
</MPD>`;

    const doc = parseTestMpd(xml, MPD_URL);
    const tracks = extractSubtitleTracks(doc, MPD_URL);
    expect(tracks[0].url).toBe('https://other.cdn.com/subs_en.ttml?token=xyz');
  });

  it('builds all SegmentTimeline segment URLs for HBO Max-style WebVTT', () => {
    const xml = `<?xml version="1.0"?>
<MPD xmlns="urn:mpeg:dash:schema:mpd:2011">
  <Period>
    <AdaptationSet contentType="text" lang="en-US">
      <Role value="caption" schemeIdUri="urn:mpeg:dash:role:2011"/>
      <Representation id="t6" mimeType="text/vtt">
        <SegmentTemplate media="t/t6/$Number$.vtt" startNumber="1">
          <SegmentTimeline>
            <S t="0" d="4000" r="2"/>
          </SegmentTimeline>
        </SegmentTemplate>
      </Representation>
    </AdaptationSet>
  </Period>
</MPD>`;

    const doc = parseTestMpd(xml, MPD_URL);
    const tracks = extractSubtitleTracks(doc, MPD_URL);
    expect(tracks).toHaveLength(1);
    const segmentUrls = tracks[0].segmentUrls;
    if (!segmentUrls) throw new Error('Expected segment URLs');
    expect(segmentUrls).toEqual([
      'https://cf.asia.prd.media.max.com/fadb6e8d/t/t6/1.vtt?manifest-params=CAQSATEA&rtype=s&market=apac&x-wbd-tenant=beam',
      'https://cf.asia.prd.media.max.com/fadb6e8d/t/t6/2.vtt?manifest-params=CAQSATEA&rtype=s&market=apac&x-wbd-tenant=beam',
      'https://cf.asia.prd.media.max.com/fadb6e8d/t/t6/3.vtt?manifest-params=CAQSATEA&rtype=s&market=apac&x-wbd-tenant=beam',
    ]);
    expect(tracks[0].url).toBe(segmentUrls[0]);
  });

  it('computes segment URLs from SegmentTemplate duration when SegmentTimeline is absent', () => {
    const xml = `<?xml version="1.0"?>
<MPD xmlns="urn:mpeg:dash:schema:mpd:2011" mediaPresentationDuration="PT12S">
  <Period>
    <AdaptationSet contentType="text" lang="en-US">
      <Representation id="t6" mimeType="text/vtt">
        <SegmentTemplate media="t/t6/$Number$.vtt" startNumber="1" duration="4000" timescale="1000"/>
      </Representation>
    </AdaptationSet>
  </Period>
</MPD>`;

    const doc = parseTestMpd(xml, MPD_URL);
    const tracks = extractSubtitleTracks(doc, MPD_URL);
    const segmentUrls = tracks[0].segmentUrls;
    if (!segmentUrls) throw new Error('Expected segment URLs');
    expect(segmentUrls).toHaveLength(3);
    expect(segmentUrls[2]).toContain('/t/t6/3.vtt');
  });

  it('marks tracks for progressive fetch when segment count is unknown', () => {
    const xml = `<?xml version="1.0"?>
<MPD xmlns="urn:mpeg:dash:schema:mpd:2011">
  <Period>
    <AdaptationSet contentType="text" lang="en-US">
      <Representation id="t6" mimeType="text/vtt">
        <SegmentTemplate media="t/t6/$Number$.vtt" startNumber="1"/>
      </Representation>
    </AdaptationSet>
  </Period>
</MPD>`;

    const doc = parseTestMpd(xml, MPD_URL);
    const tracks = extractSubtitleTracks(doc, MPD_URL);
    const segmentFetch = tracks[0].segmentFetch;
    if (!segmentFetch) throw new Error('Expected segment fetch');
    expect(segmentFetch.media).toBe('t/t6/$Number$.vtt');
  });

  it('resolves multi-Period manifest: Period BaseURL for lead-in, MPD host for main content', () => {
    const mpdUrl = 'https://gcp.asia.prd.media.max.com/fadb6e8d-4efa-49e9-90b1-f2d88de5eb5b?manifest-params=TOKEN&rtype=s&market=apac&x-wbd-tenant=beam';
    const xml = `<?xml version="1.0"?>
<MPD xmlns="urn:mpeg:dash:schema:mpd:2011">
  <Period id="0" duration="PT29.96S">
    <BaseURL>https://gcp.apac-free.prd.media.max.com/apac/34babf11-3f73-426c-ae18-34b6bd57adbe/</BaseURL>
    <AdaptationSet lang="en-US" contentType="text">
      <Representation id="t1" mimeType="text/vtt">
        <SegmentTemplate startNumber="1" media="t/3_f384f7/t1/$Number$.vtt">
          <SegmentTimeline><S t="0" d="29960"/></SegmentTimeline>
        </SegmentTemplate>
      </Representation>
    </AdaptationSet>
  </Period>
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

    const doc = parseTestMpd(xml, mpdUrl);
    const tracks = extractSubtitleTracks(doc, mpdUrl);
    expect(tracks).toHaveLength(2);

    const leadIn = tracks.find((t) => t.url.includes('3_f384f7'));
    const main = tracks.find((t) => t.url.includes('caa516'));
    expect(leadIn?.url).toBe(
      'https://gcp.apac-free.prd.media.max.com/apac/34babf11-3f73-426c-ae18-34b6bd57adbe/t/3_f384f7/t1/1.vtt?manifest-params=TOKEN&rtype=s&market=apac&x-wbd-tenant=beam',
    );
    expect(main?.url).toBe(
      'https://gcp.asia.prd.media.max.com/fadb6e8d-4efa-49e9-90b1-f2d88de5eb5b/t/caa516/t3/8.vtt?manifest-params=TOKEN&rtype=s&market=apac&x-wbd-tenant=beam',
    );

    const sorted = prioritizeMpdTracksForFetch(tracks);
    expect(sorted[0].url).toBe(main?.url);
  });

  it('resolves SegmentTemplate with startNumber > 1 under dash.mpd paths', () => {
    const dashMpdUrl = 'https://gcp.asia.prd.media.max.com/fadb6e8d-4efa-49e9/dash.mpd?manifest-params=TOKEN&rtype=s&market=apac&x-wbd-tenant=beam';
    const xml = `<?xml version="1.0"?>
<MPD xmlns="urn:mpeg:dash:schema:mpd:2011">
  <Period>
    <AdaptationSet id="11" lang="en-US" contentType="text">
      <Representation mimeType="text/vtt" id="t3">
        <SegmentTemplate startNumber="8" media="t/caa516/t3/$Number$.vtt">
          <SegmentTimeline><S t="6698800" d="734679"/></SegmentTimeline>
        </SegmentTemplate>
      </Representation>
    </AdaptationSet>
  </Period>
</MPD>`;

    const doc = parseTestMpd(xml, dashMpdUrl);
    const tracks = extractSubtitleTracks(doc, dashMpdUrl);
    expect(tracks).toHaveLength(1);
    expect(tracks[0].url).toBe(
      'https://gcp.asia.prd.media.max.com/fadb6e8d-4efa-49e9/t/caa516/t3/8.vtt?manifest-params=TOKEN&rtype=s&market=apac&x-wbd-tenant=beam',
    );
  });

  it('resolves Period BaseURL on a different CDN host (HBO Max APAC Period 0)', () => {
    const mpdUrl = 'https://gcp.asia.prd.media.max.com/fadb6e8d-4efa-49e9-90b1-f2d88de5eb5b?manifest-params=TOKEN&rtype=s&market=apac&x-wbd-tenant=beam';
    const periodBase = 'https://gcp.apac-free.prd.media.max.com/apac/34babf11-3f73-426c-ae18-34b6bd57adbe/';
    const xml = `<?xml version="1.0"?>
<MPD xmlns="urn:mpeg:dash:schema:mpd:2011">
  <Period id="0" duration="PT29.96S">
    <BaseURL>${periodBase}</BaseURL>
    <AdaptationSet id="8" lang="en-US" contentType="text">
      <Representation mimeType="text/vtt" id="t1" bandwidth="22">
        <SegmentTemplate timescale="1000" startNumber="1" media="t/3_f384f7/t1/$Number$.vtt">
          <SegmentTimeline><S t="0" d="29960"/></SegmentTimeline>
        </SegmentTemplate>
      </Representation>
    </AdaptationSet>
  </Period>
</MPD>`;

    const doc = parseTestMpd(xml, mpdUrl);
    const tracks = extractSubtitleTracks(doc, mpdUrl);
    expect(tracks).toHaveLength(1);
    expect(tracks[0].url).toBe(
      'https://gcp.apac-free.prd.media.max.com/apac/34babf11-3f73-426c-ae18-34b6bd57adbe/t/3_f384f7/t1/1.vtt?manifest-params=TOKEN&rtype=s&market=apac&x-wbd-tenant=beam',
    );
    expect(tracks[0].url).not.toContain('gcp.asia.prd.media.max.com/fadb6e8d');
  });

  it('prefers main-content tracks with startNumber > 1 over Period-0 lead-in', () => {
    const leadIn = {
      url: 'https://gcp.apac-free.prd.media.max.com/apac/abc/t/3_f384f7/t1/1.vtt?token=a',
      language: 'en-US',
      segmentFetch: { media: 't/3_f384f7/t1/$Number$.vtt', startNumber: 1, representationId: 't1', bandwidth: '', mpdUrl: 'https://cdn.example.com/manifest.mpd' },
    };
    const main = {
      url: 'https://gcp.asia.prd.media.max.com/fadb6e8d/t/caa516/t3/8.vtt?token=a',
      language: 'en-US',
      segmentFetch: { media: 't/caa516/t3/$Number$.vtt', startNumber: 8, representationId: 't3', bandwidth: '', mpdUrl: 'https://cdn.example.com/manifest.mpd' },
    };
    const sorted = prioritizeMpdTracksForFetch([leadIn, main]);
    expect(sorted[0].url).toBe(main.url);
    expect(scoreMpdTrackForFetch(main)).toBeGreaterThan(scoreMpdTrackForFetch(leadIn));
  });

  it('resolves HBO Max APAC real MPD subtitle segments under extensionless manifest URL', () => {
    const mpdUrl = 'https://akm.asia.prd.media.max.com/fadb6e8d-4efa-49a7?manifest-params=TOKEN&rtype=s&market=apac&x-wbd-tenant=beam';
    const xml = `<?xml version="1.0"?>
<MPD xmlns="urn:mpeg:dash:schema:mpd:2011">
  <Period>
    <AdaptationSet id="7" lang="en-US" contentType="text">
      <Representation mimeType="text/vtt" id="t0" bandwidth="24">
        <SegmentTemplate timescale="1000" startNumber="1" media="t/2_ada795/t0/$Number$.vtt">
          <SegmentTimeline><S t="0" d="29960"/></SegmentTimeline>
        </SegmentTemplate>
      </Representation>
    </AdaptationSet>
  </Period>
</MPD>`;

    const doc = parseTestMpd(xml, mpdUrl);
    const tracks = extractSubtitleTracks(doc, mpdUrl);
    expect(tracks).toHaveLength(1);
    expect(tracks[0].url).toBe(
      'https://akm.asia.prd.media.max.com/fadb6e8d-4efa-49a7/t/2_ada795/t0/1.vtt?manifest-params=TOKEN&rtype=s&market=apac&x-wbd-tenant=beam',
    );
    expect(tracks[0].url).not.toBe(mpdUrl);
  });

  it('resolves SegmentTemplate URLs under extensionless Max MPD URL paths', () => {
    const noExtensionMpdUrl = 'https://gcp.asia.prd.media.max.com/fadb6e8d-4efa-49a7?manifest-params=TOKEN&rtype=s&market=apac&x-wbd-tenant=beam';
    const xml = `<?xml version="1.0"?>
<MPD xmlns="urn:mpeg:dash:schema:mpd:2011">
  <Period>
    <AdaptationSet contentType="text" lang="en-US">
      <Representation id="t6" mimeType="text/vtt">
        <SegmentTemplate media="t/t6/$Number$.vtt" startNumber="1"/>
      </Representation>
    </AdaptationSet>
  </Period>
</MPD>`;

    const doc = parseTestMpd(xml, noExtensionMpdUrl);
    const tracks = extractSubtitleTracks(doc, noExtensionMpdUrl);
    expect(tracks).toHaveLength(1);
    expect(tracks[0].url).toBe('https://gcp.asia.prd.media.max.com/fadb6e8d-4efa-49a7/t/t6/1.vtt?manifest-params=TOKEN&rtype=s&market=apac&x-wbd-tenant=beam');
  });

  it('falls back to SegmentTemplate when Representation BaseURL points back to the MPD manifest', () => {
    const xml = `<?xml version="1.0"?>
<MPD xmlns="urn:mpeg:dash:schema:mpd:2011">
  <Period>
    <AdaptationSet contentType="text" lang="en-US">
      <Role value="caption" schemeIdUri="urn:mpeg:dash:role:2011"/>
      <Representation id="t6" mimeType="text/vtt">
        <BaseURL>dash.mpd</BaseURL>
        <SegmentTemplate media="t/t6/$Number$.vtt" startNumber="1"/>
      </Representation>
    </AdaptationSet>
  </Period>
</MPD>`;

    const doc = parseTestMpd(xml, MPD_URL);
    const tracks = extractSubtitleTracks(doc, MPD_URL);
    expect(tracks).toHaveLength(1);
    expect(tracks[0].url).toBe('https://cf.asia.prd.media.max.com/fadb6e8d/t/t6/1.vtt?manifest-params=CAQSATEA&rtype=s&market=apac&x-wbd-tenant=beam');
    expect(tracks[0].segmentFetch).toEqual(expect.objectContaining({ media: 't/t6/$Number$.vtt' }));
  });

  it('skips self-referential subtitle URLs that point back to the MPD manifest', () => {
    const xml = `<?xml version="1.0"?>
<MPD xmlns="urn:mpeg:dash:schema:mpd:2011">
  <Period>
    <AdaptationSet mimeType="text/vtt" lang="en-US">
      <Representation id="s1">
        <BaseURL>dash.mpd</BaseURL>
      </Representation>
    </AdaptationSet>
  </Period>
</MPD>`;

    const doc = parseTestMpd(xml, MPD_URL);
    expect(extractSubtitleTracks(doc, MPD_URL)).toEqual([]);
  });

  it('skips subtitle URLs resolving to root path "/" (e.g., from BaseURL "./" or "." when MPD has no filename extension)', () => {
    const NO_EXT_MPD_URL = 'https://cf.asia.prd.media.max.com/fadb6e8d-4efa-49-fh3HlKAQ==?rtype=s&market=apac&x-wbd-tenant=beam';
    const xml = `<?xml version="1.0"?>
<MPD xmlns="urn:mpeg:dash:schema:mpd:2011">
  <Period>
    <AdaptationSet mimeType="text/vtt" lang="en-US">
      <Representation id="s1">
        <BaseURL>./</BaseURL>
      </Representation>
    </AdaptationSet>
  </Period>
</MPD>`;

    const doc = parseTestMpd(xml, NO_EXT_MPD_URL);
    expect(extractSubtitleTracks(doc, NO_EXT_MPD_URL)).toEqual([]);
  });

  it('skips subtitle URLs ending in .mpd or .m3u8 even if pathname differs from MPD URL', () => {
    const NO_EXT_MPD_URL = 'https://cf.asia.prd.media.max.com/fadb6e8d-4efa-49-fh3HlKAQ==?rtype=s&market=apac&x-wbd-tenant=beam';
    const xml = `<?xml version="1.0"?>
<MPD xmlns="urn:mpeg:dash:schema:mpd:2011">
  <Period>
    <AdaptationSet mimeType="text/vtt" lang="en-US">
      <Representation id="s1">
        <BaseURL>descriptor.mpd</BaseURL>
      </Representation>
    </AdaptationSet>
  </Period>
</MPD>`;

    const doc = parseTestMpd(xml, NO_EXT_MPD_URL);
    expect(extractSubtitleTracks(doc, NO_EXT_MPD_URL)).toEqual([]);
  });

  it('skips self-referential subtitle URLs resolving to the manifest path ignoring trailing slashes', () => {
    const NO_EXT_MPD_URL = 'https://cf.asia.prd.media.max.com/fadb6e8d-4efa-49-fh3HlKAQ==?rtype=s&market=apac&x-wbd-tenant=beam';
    const xml = `<?xml version="1.0"?>
<MPD xmlns="urn:mpeg:dash:schema:mpd:2011">
  <Period>
    <AdaptationSet mimeType="text/vtt" lang="en-US">
      <Representation id="s1">
        <BaseURL>fadb6e8d-4efa-49-fh3HlKAQ==/</BaseURL>
      </Representation>
    </AdaptationSet>
  </Period>
</MPD>`;

    const doc = parseTestMpd(xml, NO_EXT_MPD_URL);
    expect(extractSubtitleTracks(doc, NO_EXT_MPD_URL)).toEqual([]);
  });

  it('still resolves correctly when the MPD URL has no query string', () => {
    const plainMpdUrl = 'https://cdn.example.com/manifest.mpd';
    const xml = `<?xml version="1.0"?>
<MPD xmlns="urn:mpeg:dash:schema:mpd:2011">
  <Period>
    <AdaptationSet mimeType="application/ttml+xml" lang="en">
      <Representation id="s1">
        <BaseURL>subs_en.ttml</BaseURL>
      </Representation>
    </AdaptationSet>
  </Period>
</MPD>`;

    const doc = parseTestMpd(xml, plainMpdUrl);
    const tracks = extractSubtitleTracks(doc, plainMpdUrl);
    // No query to re-attach — plain relative resolution (existing behavior).
    expect(tracks[0].url).toBe('https://cdn.example.com/subs_en.ttml');
  });
});

// ============================================================================
// fetchRealSubtitleContent — validates fetched track is real subtitle content
// ============================================================================
describe('fetchRealSubtitleContent', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('returns content for a valid TTML subtitle response', async () => {
    const ttml = `<?xml version="1.0"?>
<tt xmlns="http://www.w3.org/ns/ttml">
  <body><div><p begin="00:00:01.000" end="00:00:02.000">Hi</p></div></body>
</tt>`;

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response(ttml, { status: 200, headers: { 'Content-Type': 'application/ttml+xml' } }),
    ));

    const result = await fetchRealSubtitleContent('https://cdn.example.com/subs.ttml');
    expect(result).not.toBeNull();
    expect(result?.content).toContain('<tt ');
    expect(result?.contentType).toBe('application/ttml+xml');
  });

  it('returns null when response is a DASH MPD manifest', async () => {
    const mpd = `<?xml version="1.0"?>
<MPD xmlns="urn:mpeg:dash:schema:mpd:2011">
  <Period><AdaptationSet mimeType="application/ttml+xml" lang="en">
    <Representation id="s1"><BaseURL>subs_en.ttml</BaseURL></Representation>
  </AdaptationSet></Period>
</MPD>`;

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response(mpd, { status: 200, headers: { 'Content-Type': 'application/dash+xml' } }),
    ));

    const result = await fetchRealSubtitleContent('https://cdn.example.com/track');
    expect(result).toBeNull();
  });

  it('returns null when response is a manifest with Period+AdaptationSet but no DASH namespace', async () => {
    const manifest = `<?xml version="1.0"?>
<MPD>
  <Period><AdaptationSet lang="en"><Representation id="s1"/></AdaptationSet></Period>
</MPD>`;

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response(manifest, { status: 200, headers: { 'Content-Type': 'text/xml' } }),
    ));

    const result = await fetchRealSubtitleContent('https://cdn.example.com/track');
    expect(result).toBeNull();
  });

  it('returns null on HTTP error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response('', { status: 404 }),
    ));

    const result = await fetchRealSubtitleContent('https://cdn.example.com/missing.ttml');
    expect(result).toBeNull();
  });

  it('returns null on fetch exception', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network error')));

    const result = await fetchRealSubtitleContent('https://cdn.example.com/subs.ttml');
    expect(result).toBeNull();
  });

  it('does not send credentials (Max CDN auth is URL-token-based, not cookie-based)', async () => {
    const ttml = '<tt xmlns="http://www.w3.org/ns/ttml"><body><div><p begin="0s" end="1s">Hi</p></div></body></tt>';
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response(ttml, { status: 200, headers: { 'Content-Type': 'application/ttml+xml' } }),
    ));

    await fetchRealSubtitleContent('https://cdn.example.com/subs.ttml');
    // credentials: 'include' would force a credentialed CORS request, which Max's
    // CDN rejects (it returns ACAO: *), breaking every subtitle segment fetch.
    expect(fetch).toHaveBeenCalledWith('https://cdn.example.com/subs.ttml');
  });
});

// ============================================================================
// processMpdSubtitleTracks — batch validation of MPD subtitle tracks
// ============================================================================
describe('processMpdSubtitleTracks', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('returns validated content for tracks with real subtitle data', async () => {
    const vtt = `WEBVTT

00:00:01.000 --> 00:00:02.000
Hello`;

    vi.stubGlobal('fetch', vi.fn().mockImplementation(() =>
      Promise.resolve(new Response(vtt, { status: 200, headers: { 'Content-Type': 'text/vtt' } })),
    ));

    const tracks = [
      { url: 'https://cdn.example.com/1.vtt', language: 'en' },
      { url: 'https://cdn.example.com/2.vtt', language: 'es' },
    ];

    const result = await processMpdSubtitleTracks(tracks);
    expect(result).not.toBeNull();
    expect(result).toHaveLength(2);
  });

  it('returns null when all tracks return manifests', async () => {
    const mpd = `<?xml version="1.0"?>
<MPD xmlns="urn:mpeg:dash:schema:mpd:2011"><Period></Period></MPD>`;

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response(mpd, { status: 200, headers: { 'Content-Type': 'application/dash+xml' } }),
    ));

    const tracks = [
      { url: 'https://cdn.example.com/track1', language: 'en' },
    ];

    const result = await processMpdSubtitleTracks(tracks);
    expect(result).toBeNull();
  });

  it('returns null for empty track list', async () => {
    const result = await processMpdSubtitleTracks([]);
    expect(result).toBeNull();
  });

  it('mixes valid and invalid tracks, returns only valid ones', async () => {
    const vtt = `WEBVTT

00:00:01.000 --> 00:00:02.000
Hello`;
    const mpd = `<?xml version="1.0"?>
<MPD xmlns="urn:mpeg:dash:schema:mpd:2011"><Period></Period></MPD>`;

    vi.stubGlobal('fetch', vi.fn().mockImplementation((url: string) => {
      if (url.includes('/good')) {
        return Promise.resolve(new Response(vtt, { status: 200, headers: { 'Content-Type': 'text/vtt' } }));
      }
      return Promise.resolve(new Response(mpd, { status: 200, headers: { 'Content-Type': 'application/dash+xml' } }));
    }));

    const tracks = [
      { url: 'https://cdn.example.com/bad', language: 'en' },
      { url: 'https://cdn.example.com/good', language: 'es' },
    ];

    const result = await processMpdSubtitleTracks(tracks);
    expect(result).not.toBeNull();
    expect(result).toHaveLength(1);
    expect(result?.[0]?.url).toBe('https://cdn.example.com/good');
  });
});

describe('mergeManifestQueryParams', () => {
  const mpdUrl =
    'https://akm.asia.prd.media.max.com/fadb6e8d?manifest-params=TOKEN&rtype=s&market=apac&x-wbd-tenant=beam';

  it('adds all manifest query keys when segment URL has no query', () => {
    const segment = new URL('https://gcp.apac-free.prd.media.max.com/apac/uuid/t/3_f384f7/t1/1.vtt');
    mergeManifestQueryParams(segment, mpdUrl);
    expect(segment.searchParams.get('manifest-params')).toBe('TOKEN');
    expect(segment.searchParams.get('rtype')).toBe('s');
  });

  it('leaves external CDN URLs unchanged when they carry their own query', () => {
    const segment = new URL('https://other.cdn.com/subs_en.ttml?token=xyz');
    mergeManifestQueryParams(segment, mpdUrl);
    expect(segment.search).toBe('?token=xyz');
  });
});

describe('isResolvableSubtitleSegmentUrl', () => {
  const mpdUrl =
    'https://gcp.asia.prd.media.max.com/fadb6e8d-4efa-49e9-90b1-f2d88de5eb5b?manifest-params=TOKEN&rtype=s&market=apac&x-wbd-tenant=beam';

  it('accepts real WebVTT segment URLs', () => {
    expect(isResolvableSubtitleSegmentUrl(
      'https://gcp.asia.prd.media.max.com/fadb6e8d-4efa-49e9-90b1-f2d88de5eb5b/t/caa516/t3/8.vtt?manifest-params=TOKEN',
      mpdUrl,
    )).toBe(true);
    expect(isResolvableSubtitleSegmentUrl(
      'https://gcp.apac-free.prd.media.max.com/apac/34babf11/t/3_f384f7/t1/1.vtt?manifest-params=TOKEN',
      mpdUrl,
    )).toBe(true);
  });

  it('rejects manifest-echo and Period BaseURL-only URLs', () => {
    expect(isResolvableSubtitleSegmentUrl(mpdUrl, mpdUrl)).toBe(false);
    expect(isResolvableSubtitleSegmentUrl(
      'https://gcp.asia.prd.media.max.com/fadb6e8d-4efa-49e9-90b1-f2d88de5eb5b/?manifest-params=TOKEN',
      mpdUrl,
    )).toBe(false);
    expect(isResolvableSubtitleSegmentUrl(
      'https://gcp.apac-free.prd.media.max.com/apac/34babf11-3f73-426c-ae18-34b6bd57adbe/?manifest-params=TOKEN',
      mpdUrl,
    )).toBe(false);
  });
});