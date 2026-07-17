import { describe, it, expect } from 'vitest';
import {
  detectMpdRequests,
  parseMpd,
  extractSubtitleTracks,
  parseSubtitleContent,
  mergeManifestQueryParams,
  isMaxCdnVttSegmentUrl,
  isManifestResponse,
} from '@/lib/maxMpdSubtitles';

function parseTestMpd(xml: string, url: string): Document {
  const doc = parseMpd(xml, url);
  if (!doc) throw new Error('Failed to parse MPD');
  return doc;
}

// Max's CDN carries an auth token (`manifest-params=...`) in the MPD's query
// string and requires it on every segment request. Per RFC 3986 a relative
// reference with its own path REPLACES the base query string, so a naive
// resolve drops the token → HTTP 404. These tests pin the fix.
const MPD_URL =
  'https://cf.asia.prd.media.max.com/fadb6e8d/dash.mpd?manifest-params=CAQSATEA&rtype=s&market=apac&x-wbd-tenant=beam';

describe('URL classification', () => {
  it('classifies Max VTT segments and MPD manifests (incl. extensionless Max CDN)', () => {
    expect(
      isMaxCdnVttSegmentUrl(
        'https://gcp.asia.prd.media.max.com/fadb6e8d/t/caa516/t3/8.vtt?manifest-params=TOKEN',
      ),
    ).toBe(true);
    expect(
      isMaxCdnVttSegmentUrl(
        'https://gcp.apac-free.prd.media.max.com/apac/uuid/t/3_f384f7/t1/1.vtt',
      ),
    ).toBe(true);
    expect(
      isMaxCdnVttSegmentUrl(
        'https://gcp.asia.prd.media.max.com/fadb6e8d?manifest-params=TOKEN',
      ),
    ).toBe(false);
    expect(isMaxCdnVttSegmentUrl('https://cdn.cloudfront.net/en.vtt')).toBe(false);

    expect(detectMpdRequests('https://cdn.example.com/manifest.mpd')).toBe(true);
    expect(detectMpdRequests('https://cdn.example.com/manifest.mpd?token=abc')).toBe(true);
    expect(
      detectMpdRequests(
        'https://akm.asia.prd.media.max.com/fadb6e8d-4efa-49a7?manifest-params=TOKEN&rtype=s&market=apac&x-wbd-tenant=beam',
      ),
    ).toBe(true);
    expect(detectMpdRequests('https://cdn.example.com/video.m3u8')).toBe(false);
    expect(detectMpdRequests('https://cf.asia.prd.media.max.com/fadb6e8d/t/t6/1.vtt')).toBe(
      false,
    );
    expect(detectMpdRequests('')).toBe(false);
    expect(
      detectMpdRequests(
        'https://akm.asia.prd.media.max.com/fadb6e8d-4efa-49a7/t/2_ada795/t0/1.vtt?manifest-params=TOKEN&rtype=s&market=apac&x-wbd-tenant=beam',
      ),
    ).toBe(false);
  });
});

describe('extractSubtitleTracks', () => {
  it('extracts TTML and contentType=text tracks, skips video AdaptationSets', () => {
    const ttmlXml = `<?xml version="1.0"?>
<MPD xmlns="urn:mpeg:dash:schema:mpd:2011">
  <Period>
    <AdaptationSet mimeType="application/ttml+xml" lang="en">
      <Representation id="s1">
        <BaseURL>subs_en.ttml</BaseURL>
      </Representation>
    </AdaptationSet>
  </Period>
</MPD>`;
    const ttmlTracks = extractSubtitleTracks(
      parseTestMpd(ttmlXml, 'https://cdn.example.com/manifest.mpd'),
      'https://cdn.example.com/manifest.mpd',
    );
    expect(ttmlTracks).toHaveLength(1);
    expect(ttmlTracks[0]).toMatchObject({
      url: 'https://cdn.example.com/subs_en.ttml',
      language: 'en',
      mimeType: 'application/ttml+xml',
    });
    expect(ttmlTracks[0].segmentOffsetsMs).toEqual([0]);

    const textXml = `<?xml version="1.0"?>
<MPD xmlns="urn:mpeg:dash:schema:mpd:2011">
  <Period>
    <AdaptationSet mimeType="application/mp4" contentType="text" lang="es">
      <Representation id="s1">
        <BaseURL>subs_es.mp4</BaseURL>
      </Representation>
    </AdaptationSet>
  </Period>
</MPD>`;
    expect(
      extractSubtitleTracks(
        parseTestMpd(textXml, 'https://cdn.example.com/manifest.mpd'),
        'https://cdn.example.com/manifest.mpd',
      )[0].language,
    ).toBe('es');

    const videoXml = `<?xml version="1.0"?>
<MPD xmlns="urn:mpeg:dash:schema:mpd:2011">
  <Period>
    <AdaptationSet mimeType="video/mp4" lang="en">
      <Representation id="v1"><BaseURL>video.mp4</BaseURL></Representation>
    </AdaptationSet>
  </Period>
</MPD>`;
    expect(
      extractSubtitleTracks(
        parseTestMpd(videoXml, 'https://cdn.example.com/manifest.mpd'),
        'https://cdn.example.com/manifest.mpd',
      ),
    ).toEqual([]);
  });
});

describe('parseSubtitleContent — TTML parsing', () => {
  it('parses TTML content', () => {
    const ttml = `<?xml version="1.0"?>
<tt xmlns="http://www.w3.org/ns/ttml">
  <body><div>
    <p begin="00:00:01.000" end="00:00:02.000">Hi</p>
  </div></body>
</tt>`;

    const cues = parseSubtitleContent(
      ttml,
      'application/ttml+xml',
      'https://cdn.example.com/subs.ttml',
    );
    expect(cues).toHaveLength(1);
    expect(cues[0].text).toBe('Hi');
  });
});

describe('extractSubtitleTracks — CDN auth-token preservation', () => {
  it('re-attaches MPD query token on SegmentTemplate/relative BaseURL; preserves absolute query; merges missing params', () => {
    const segmentTemplateXml = `<?xml version="1.0"?>
<MPD xmlns="urn:mpeg:dash:schema:mpd:2011">
  <Period>
    <AdaptationSet mimeType="application/ttml+xml" lang="en">
      <SegmentTemplate media="t/2_7e39a5/t3/$Number$.vtt" startNumber="1"/>
      <Representation id="sub_en"/>
    </AdaptationSet>
  </Period>
</MPD>`;
    const stTracks = extractSubtitleTracks(parseTestMpd(segmentTemplateXml, MPD_URL), MPD_URL);
    expect(stTracks).toHaveLength(1);
    expect(stTracks[0].url).toBe(
      'https://cf.asia.prd.media.max.com/fadb6e8d/t/2_7e39a5/t3/1.vtt?manifest-params=CAQSATEA&rtype=s&market=apac&x-wbd-tenant=beam',
    );

    const relativeXml = `<?xml version="1.0"?>
<MPD xmlns="urn:mpeg:dash:schema:mpd:2011">
  <Period>
    <AdaptationSet mimeType="application/ttml+xml" lang="en">
      <Representation id="s1">
        <BaseURL>subs_en.ttml</BaseURL>
      </Representation>
    </AdaptationSet>
  </Period>
</MPD>`;
    expect(extractSubtitleTracks(parseTestMpd(relativeXml, MPD_URL), MPD_URL)[0].url).toBe(
      'https://cf.asia.prd.media.max.com/fadb6e8d/subs_en.ttml?manifest-params=CAQSATEA&rtype=s&market=apac&x-wbd-tenant=beam',
    );

    const segment = new URL(
      'https://gcp.asia.prd.media.max.com/fadb6e8d/t/caa516/t3/2.vtt?rtype=s',
    );
    mergeManifestQueryParams(segment, MPD_URL);
    expect(segment.searchParams.get('rtype')).toBe('s');
    expect(segment.searchParams.get('manifest-params')).toBe('CAQSATEA');
    expect(segment.searchParams.get('market')).toBe('apac');
    expect(segment.searchParams.get('x-wbd-tenant')).toBe('beam');

    // Absolute subtitle URL with its own query must be preserved as-is.
    const absoluteXml = `<?xml version="1.0"?>
<MPD xmlns="urn:mpeg:dash:schema:mpd:2011">
  <Period>
    <AdaptationSet mimeType="application/ttml+xml" lang="en">
      <Representation id="s1">
        <BaseURL>https://other.cdn.com/subs_en.ttml?token=xyz</BaseURL>
      </Representation>
    </AdaptationSet>
  </Period>
</MPD>`;
    expect(extractSubtitleTracks(parseTestMpd(absoluteXml, MPD_URL), MPD_URL)[0].url).toBe(
      'https://other.cdn.com/subs_en.ttml?token=xyz',
    );
  });

  it('builds SegmentTimeline URLs, duration-based segments, progressive fetch, and BaseURL→SegmentTemplate fallback', () => {
    const timelineXml = `<?xml version="1.0"?>
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
    const timelineTracks = extractSubtitleTracks(parseTestMpd(timelineXml, MPD_URL), MPD_URL);
    expect(timelineTracks).toHaveLength(1);
    const segmentUrls = timelineTracks[0].segmentUrls;
    if (!segmentUrls) throw new Error('Expected segment URLs');
    expect(segmentUrls).toEqual([
      'https://cf.asia.prd.media.max.com/fadb6e8d/t/t6/1.vtt?manifest-params=CAQSATEA&rtype=s&market=apac&x-wbd-tenant=beam',
      'https://cf.asia.prd.media.max.com/fadb6e8d/t/t6/2.vtt?manifest-params=CAQSATEA&rtype=s&market=apac&x-wbd-tenant=beam',
      'https://cf.asia.prd.media.max.com/fadb6e8d/t/t6/3.vtt?manifest-params=CAQSATEA&rtype=s&market=apac&x-wbd-tenant=beam',
    ]);
    expect(timelineTracks[0].url).toBe(segmentUrls[0]);

    const durationXml = `<?xml version="1.0"?>
<MPD xmlns="urn:mpeg:dash:schema:mpd:2011" mediaPresentationDuration="PT12S">
  <Period>
    <AdaptationSet contentType="text" lang="en-US">
      <Representation id="t6" mimeType="text/vtt">
        <SegmentTemplate media="t/t6/$Number$.vtt" startNumber="1" duration="4000" timescale="1000"/>
      </Representation>
    </AdaptationSet>
  </Period>
</MPD>`;
    const durationUrls = extractSubtitleTracks(parseTestMpd(durationXml, MPD_URL), MPD_URL)[0]
      .segmentUrls;
    if (!durationUrls) throw new Error('Expected segment URLs');
    expect(durationUrls).toHaveLength(3);
    expect(durationUrls[2]).toContain('/t/t6/3.vtt');

    const progressiveXml = `<?xml version="1.0"?>
<MPD xmlns="urn:mpeg:dash:schema:mpd:2011">
  <Period>
    <AdaptationSet contentType="text" lang="en-US">
      <Representation id="t6" mimeType="text/vtt">
        <SegmentTemplate media="t/t6/$Number$.vtt" startNumber="1"/>
      </Representation>
    </AdaptationSet>
  </Period>
</MPD>`;
    const segmentFetch = extractSubtitleTracks(parseTestMpd(progressiveXml, MPD_URL), MPD_URL)[0]
      .segmentFetch;
    if (!segmentFetch) throw new Error('Expected segment fetch');
    expect(segmentFetch.media).toBe('t/t6/$Number$.vtt');

    const fallbackXml = `<?xml version="1.0"?>
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
    const fallbackTracks = extractSubtitleTracks(parseTestMpd(fallbackXml, MPD_URL), MPD_URL);
    expect(fallbackTracks).toHaveLength(1);
    expect(fallbackTracks[0].url).toBe(
      'https://cf.asia.prd.media.max.com/fadb6e8d/t/t6/1.vtt?manifest-params=CAQSATEA&rtype=s&market=apac&x-wbd-tenant=beam',
    );
    expect(fallbackTracks[0].segmentFetch).toEqual(
      expect.objectContaining({ media: 't/t6/$Number$.vtt' }),
    );
  });

  it('resolves multi-Period, startNumber>1 under dash.mpd, Period BaseURL on other CDN, and extensionless MPD', () => {
    const multiPeriodUrl =
      'https://gcp.asia.prd.media.max.com/fadb6e8d-4efa-49e9-90b1-f2d88de5eb5b?manifest-params=TOKEN&rtype=s&market=apac&x-wbd-tenant=beam';
    const multiPeriodXml = `<?xml version="1.0"?>
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
    const multiTracks = extractSubtitleTracks(
      parseTestMpd(multiPeriodXml, multiPeriodUrl),
      multiPeriodUrl,
    );
    expect(multiTracks).toHaveLength(2);
    const leadIn = multiTracks.find((t) => t.url.includes('3_f384f7'));
    const main = multiTracks.find((t) => t.url.includes('caa516'));
    expect(leadIn?.url).toBe(
      'https://gcp.apac-free.prd.media.max.com/apac/34babf11-3f73-426c-ae18-34b6bd57adbe/t/3_f384f7/t1/1.vtt?manifest-params=TOKEN&rtype=s&market=apac&x-wbd-tenant=beam',
    );
    expect(main?.url).toBe(
      'https://gcp.asia.prd.media.max.com/fadb6e8d-4efa-49e9-90b1-f2d88de5eb5b/t/caa516/t3/8.vtt?manifest-params=TOKEN&rtype=s&market=apac&x-wbd-tenant=beam',
    );

    const dashMpdUrl =
      'https://gcp.asia.prd.media.max.com/fadb6e8d-4efa-49e9/dash.mpd?manifest-params=TOKEN&rtype=s&market=apac&x-wbd-tenant=beam';
    const startNumberXml = `<?xml version="1.0"?>
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
    const startTracks = extractSubtitleTracks(parseTestMpd(startNumberXml, dashMpdUrl), dashMpdUrl);
    expect(startTracks).toHaveLength(1);
    expect(startTracks[0].url).toBe(
      'https://gcp.asia.prd.media.max.com/fadb6e8d-4efa-49e9/t/caa516/t3/8.vtt?manifest-params=TOKEN&rtype=s&market=apac&x-wbd-tenant=beam',
    );

    const periodBase =
      'https://gcp.apac-free.prd.media.max.com/apac/34babf11-3f73-426c-ae18-34b6bd57adbe/';
    const periodBaseXml = `<?xml version="1.0"?>
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
    const periodTracks = extractSubtitleTracks(
      parseTestMpd(periodBaseXml, multiPeriodUrl),
      multiPeriodUrl,
    );
    expect(periodTracks).toHaveLength(1);
    expect(periodTracks[0].url).toBe(
      'https://gcp.apac-free.prd.media.max.com/apac/34babf11-3f73-426c-ae18-34b6bd57adbe/t/3_f384f7/t1/1.vtt?manifest-params=TOKEN&rtype=s&market=apac&x-wbd-tenant=beam',
    );
    expect(periodTracks[0].url).not.toContain('gcp.asia.prd.media.max.com/fadb6e8d');

    const extlessUrl =
      'https://akm.asia.prd.media.max.com/fadb6e8d-4efa-49a7?manifest-params=TOKEN&rtype=s&market=apac&x-wbd-tenant=beam';
    const extlessXml = `<?xml version="1.0"?>
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
    const extlessTracks = extractSubtitleTracks(parseTestMpd(extlessXml, extlessUrl), extlessUrl);
    expect(extlessTracks).toHaveLength(1);
    expect(extlessTracks[0].url).toBe(
      'https://akm.asia.prd.media.max.com/fadb6e8d-4efa-49a7/t/2_ada795/t0/1.vtt?manifest-params=TOKEN&rtype=s&market=apac&x-wbd-tenant=beam',
    );
    expect(extlessTracks[0].url).not.toBe(extlessUrl);
  });

  it('skips self-referential and root-path subtitle URLs; resolves plain MPD without query', () => {
    const selfRefXml = `<?xml version="1.0"?>
<MPD xmlns="urn:mpeg:dash:schema:mpd:2011">
  <Period>
    <AdaptationSet mimeType="text/vtt" lang="en-US">
      <Representation id="s1">
        <BaseURL>dash.mpd</BaseURL>
      </Representation>
    </AdaptationSet>
  </Period>
</MPD>`;
    expect(extractSubtitleTracks(parseTestMpd(selfRefXml, MPD_URL), MPD_URL)).toEqual([]);

    const noExtMpdUrl =
      'https://cf.asia.prd.media.max.com/fadb6e8d-4efa-49-fh3HlKAQ==?rtype=s&market=apac&x-wbd-tenant=beam';
    const rootPathXml = `<?xml version="1.0"?>
<MPD xmlns="urn:mpeg:dash:schema:mpd:2011">
  <Period>
    <AdaptationSet mimeType="text/vtt" lang="en-US">
      <Representation id="s1">
        <BaseURL>./</BaseURL>
      </Representation>
    </AdaptationSet>
  </Period>
</MPD>`;
    expect(extractSubtitleTracks(parseTestMpd(rootPathXml, noExtMpdUrl), noExtMpdUrl)).toEqual(
      [],
    );

    const plainMpdUrl = 'https://cdn.example.com/manifest.mpd';
    const plainXml = `<?xml version="1.0"?>
<MPD xmlns="urn:mpeg:dash:schema:mpd:2011">
  <Period>
    <AdaptationSet mimeType="application/ttml+xml" lang="en">
      <Representation id="s1">
        <BaseURL>subs_en.ttml</BaseURL>
      </Representation>
    </AdaptationSet>
  </Period>
</MPD>`;
    expect(extractSubtitleTracks(parseTestMpd(plainXml, plainMpdUrl), plainMpdUrl)[0].url).toBe(
      'https://cdn.example.com/subs_en.ttml',
    );
  });
});

describe('isManifestResponse / mergeManifestQueryParams', () => {
  it('detects MPD by body/content-type; merges params onto bare Max segments not external CDNs', () => {
    expect(
      isManifestResponse(
        '<?xml version="1.0"?><MPD xmlns="urn:mpeg:dash:schema:mpd:2011"><Period></Period></MPD>',
        '',
      ),
    ).toBe(true);
    expect(isManifestResponse('<MPD><Period><AdaptationSet/></Period></MPD>', '')).toBe(true);
    expect(isManifestResponse('not a manifest body', 'application/dash+xml')).toBe(true);
    expect(
      isManifestResponse(
        'WEBVTT\n\n00:00:01.000 --> 00:00:02.000\nHi',
        'application/dash+xml',
      ),
    ).toBe(false);
    expect(
      isManifestResponse('<tt xmlns="http://www.w3.org/ns/ttml"></tt>', 'application/ttml+xml'),
    ).toBe(false);

    const mpdUrl =
      'https://akm.asia.prd.media.max.com/fadb6e8d?manifest-params=TOKEN&rtype=s&market=apac&x-wbd-tenant=beam';
    const segment = new URL(
      'https://gcp.apac-free.prd.media.max.com/apac/uuid/t/3_f384f7/t1/1.vtt',
    );
    mergeManifestQueryParams(segment, mpdUrl);
    expect(segment.searchParams.get('manifest-params')).toBe('TOKEN');
    expect(segment.searchParams.get('rtype')).toBe('s');

    const external = new URL('https://other.cdn.com/subs_en.ttml?token=xyz');
    mergeManifestQueryParams(external, mpdUrl);
    expect(external.search).toBe('?token=xyz');
  });
});
