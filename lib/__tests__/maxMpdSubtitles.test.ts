import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  detectMpdRequests,
  parseMpd,
  extractSubtitleTracks,
  fetchAndParseSubtitle,
  parseSubtitleContent,
} from '@/lib/maxMpdSubtitles';

describe('detectMpdRequests', () => {
  it('detects .mpd URLs', () => {
    expect(detectMpdRequests('https://cdn.example.com/manifest.mpd')).toBe(true);
    expect(detectMpdRequests('https://cdn.example.com/manifest.mpd?token=abc')).toBe(true);
  });

  it('rejects non-MPD URLs', () => {
    expect(detectMpdRequests('https://cdn.example.com/video.m3u8')).toBe(false);
    expect(detectMpdRequests('')).toBe(false);
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

    const doc = parseMpd(xml, 'https://cdn.example.com/manifest.mpd');
    expect(doc).not.toBeNull();

    const tracks = extractSubtitleTracks(doc!, 'https://cdn.example.com/manifest.mpd');
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

    const doc = parseMpd(xml, 'https://cdn.example.com/manifest.mpd')!;
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

    const doc = parseMpd(xml, 'https://cdn.example.com/manifest.mpd')!;
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

    const doc = parseMpd(xml, MPD_URL)!;
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

    const doc = parseMpd(xml, MPD_URL)!;
    const tracks = extractSubtitleTracks(doc, MPD_URL);
    expect(tracks[0].url).toBe('https://cf.asia.prd.media.max.com/fadb6e8d/subs_en.ttml?manifest-params=CAQSATEA&rtype=s&market=apac&x-wbd-tenant=beam');
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

    const doc = parseMpd(xml, MPD_URL)!;
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

    const doc = parseMpd(xml, MPD_URL)!;
    const tracks = extractSubtitleTracks(doc, MPD_URL);
    expect(tracks).toHaveLength(1);
    expect(tracks[0].segmentUrls).toEqual([
      'https://cf.asia.prd.media.max.com/fadb6e8d/t/t6/1.vtt?manifest-params=CAQSATEA&rtype=s&market=apac&x-wbd-tenant=beam',
      'https://cf.asia.prd.media.max.com/fadb6e8d/t/t6/2.vtt?manifest-params=CAQSATEA&rtype=s&market=apac&x-wbd-tenant=beam',
      'https://cf.asia.prd.media.max.com/fadb6e8d/t/t6/3.vtt?manifest-params=CAQSATEA&rtype=s&market=apac&x-wbd-tenant=beam',
    ]);
    expect(tracks[0].url).toBe(tracks[0].segmentUrls![0]);
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

    const doc = parseMpd(xml, MPD_URL)!;
    const tracks = extractSubtitleTracks(doc, MPD_URL);
    expect(tracks[0].segmentUrls).toHaveLength(3);
    expect(tracks[0].segmentUrls![2]).toContain('/t/t6/3.vtt');
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

    const doc = parseMpd(xml, MPD_URL)!;
    const tracks = extractSubtitleTracks(doc, MPD_URL);
    expect(tracks[0].segmentFetch).toBeDefined();
    expect(tracks[0].segmentFetch!.media).toBe('t/t6/$Number$.vtt');
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

    const doc = parseMpd(xml, MPD_URL);
    if (!doc) throw new Error('Failed to parse MPD');
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

    const doc = parseMpd(xml, NO_EXT_MPD_URL);
    if (!doc) throw new Error('Failed to parse MPD');
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

    const doc = parseMpd(xml, NO_EXT_MPD_URL);
    if (!doc) throw new Error('Failed to parse MPD');
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

    const doc = parseMpd(xml, NO_EXT_MPD_URL);
    if (!doc) throw new Error('Failed to parse MPD');
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

    const doc = parseMpd(xml, plainMpdUrl)!;
    const tracks = extractSubtitleTracks(doc, plainMpdUrl);
    // No query to re-attach — plain relative resolution (existing behavior).
    expect(tracks[0].url).toBe('https://cdn.example.com/subs_en.ttml');
  });
});