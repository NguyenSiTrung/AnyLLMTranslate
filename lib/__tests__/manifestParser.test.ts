import { describe, it, expect } from 'vitest';
import {
  parseHlsManifest,
  parseHlsSubtitlePlaylist,
  parseDashManifest,
} from '@/lib/manifestParser';

// ─── HLS Multivariant Manifest ──────────────────────────────────────────────

describe('parseHlsManifest', () => {
  it('parses EXT-X-MEDIA SUBTITLES entries with all attributes', () => {
    const body = [
      '#EXTM3U',
      '#EXT-X-VERSION:6',
      '#EXT-X-STREAM-INF:BANDWIDTH=5000000',
      'video.m3u8',
      '#EXT-X-MEDIA:TYPE=SUBTITLES,GROUP-ID="subs",NAME="English",DEFAULT=YES,AUTOSELECT=YES,FORCED=NO,LANGUAGE="en",URI="subs/en.m3u8"',
      '#EXT-X-MEDIA:TYPE=SUBTITLES,GROUP-ID="subs",NAME="Spanish",DEFAULT=NO,AUTOSELECT=YES,FORCED=NO,LANGUAGE="es",URI="subs/es.m3u8"',
    ].join('\n');

    const result = parseHlsManifest(body, 'https://cdn.example.com/master.m3u8');

    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({
      url: 'https://cdn.example.com/subs/en.m3u8',
      language: 'en',
      label: 'English',
      isDefault: true,
    });
    expect(result[1]).toEqual({
      url: 'https://cdn.example.com/subs/es.m3u8',
      language: 'es',
      label: 'Spanish',
      isDefault: false,
    });
  });

  it('resolves absolute/path-relative URIs; handles defaults, empty/no-track inputs, non-subtitle media, and multi groups', () => {
    const absBody = [
      '#EXTM3U',
      '#EXT-X-MEDIA:TYPE=SUBTITLES,GROUP-ID="subs",NAME="French",LANGUAGE="fr",URI="https://other.cdn.com/fr.vtt"',
    ].join('\n');
    expect(parseHlsManifest(absBody, 'https://cdn.example.com/master.m3u8')[0].url).toBe('https://other.cdn.com/fr.vtt');

    const relBody = [
      '#EXTM3U',
      '#EXT-X-MEDIA:TYPE=SUBTITLES,GROUP-ID="subs",NAME="Italian",LANGUAGE="it",URI="it.m3u8"',
    ].join('\n');
    expect(parseHlsManifest(relBody, 'https://cdn.example.com/playlist/master.m3u8')[0].url).toBe('https://cdn.example.com/playlist/it.m3u8');
    const noDefault = [
      '#EXTM3U',
      '#EXT-X-MEDIA:TYPE=SUBTITLES,GROUP-ID="subs",NAME="Korean",DEFAULT=NO,LANGUAGE="ko",URI="ko.m3u8"',
    ].join('\n');
    expect(parseHlsManifest(noDefault, 'https://cdn.example.com/master.m3u8')[0]!.isDefault).toBe(
      false,
    );

    const audioOnly = [
      '#EXTM3U',
      '#EXT-X-VERSION:6',
      '#EXT-X-STREAM-INF:BANDWIDTH=5000000',
      'video.m3u8',
      '#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="audio",NAME="English",LANGUAGE="en",URI="audio/en.m3u8"',
    ].join('\n');
    expect(parseHlsManifest(audioOnly, 'https://cdn.example.com/master.m3u8')).toEqual([]);
    expect(parseHlsManifest('', 'https://cdn.example.com/master.m3u8')).toEqual([]);

    const mixed = [
      '#EXTM3U',
      '#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="audio",NAME="English",LANGUAGE="en",URI="audio/en.m3u8"',
      '#EXT-X-MEDIA:TYPE=SUBTITLES,GROUP-ID="subs",NAME="English",LANGUAGE="en",URI="subs/en.m3u8"',
      '#EXT-X-MEDIA:TYPE=CLOSED-CAPTIONS,GROUP-ID="cc",NAME="English",LANGUAGE="en",URI="cc/en.m3u8"',
      '#EXT-X-MEDIA:TYPE=SUBTITLES,GROUP-ID="subs2",NAME="Vietnamese",LANGUAGE="vi",URI="vi.m3u8"',
    ].join('\n');
    const result = parseHlsManifest(mixed, 'https://cdn.example.com/master.m3u8');
    expect(result).toHaveLength(2);
    expect(result[0]!.language).toBe('en');
    expect(result[0]!.url).toBe('https://cdn.example.com/subs/en.m3u8');
    expect(result[1]!.language).toBe('vi');
  });
});

// ─── HLS Subtitle Media Playlist ────────────────────────────────────────────

describe('parseHlsSubtitlePlaylist', () => {
  it('extracts VTT segment URLs from EXTINF entries', () => {
    const body = [
      '#EXTM3U',
      '#EXT-X-VERSION:6',
      '#EXT-X-TARGETDURATION:10',
      '#EXTINF:10.0,',
      'segment1.vtt',
      '#EXTINF:10.0,',
      'segment2.vtt',
      '#EXTINF:5.0,',
      'segment3.vtt',
      '#EXT-X-ENDLIST',
    ].join('\n');

    const result = parseHlsSubtitlePlaylist(body, 'https://cdn.example.com/subs/en.m3u8');

    expect(result).toHaveLength(3);
    expect(result[0]).toEqual({ url: 'https://cdn.example.com/subs/segment1.vtt', duration: 10.0 });
    expect(result[1]).toEqual({ url: 'https://cdn.example.com/subs/segment2.vtt', duration: 10.0 });
    expect(result[2]).toEqual({ url: 'https://cdn.example.com/subs/segment3.vtt', duration: 5.0 });

    // Resolves relative segment URLs against the baseUrl directory
    const deepBody = [
      '#EXTM3U',
      '#EXTINF:10.0,',
      'deep/seg1.vtt',
    ].join('\n');
    const deepResult = parseHlsSubtitlePlaylist(deepBody, 'https://cdn.example.com/subs/en.m3u8');
    expect(deepResult).toHaveLength(1);
    expect(deepResult[0].url).toBe('https://cdn.example.com/subs/deep/seg1.vtt');

    // Handles empty playlist (header only) and empty body
    const headerOnly = [
      '#EXTM3U',
      '#EXT-X-VERSION:6',
      '#EXT-X-ENDLIST',
    ].join('\n');
    expect(parseHlsSubtitlePlaylist(headerOnly, 'https://cdn.example.com/subs/en.m3u8')).toEqual([]);
    expect(parseHlsSubtitlePlaylist('', 'https://cdn.example.com/subs/en.m3u8')).toEqual([]);

    // Skips non-EXTINF lines that look like segments
    const discontinuityBody = [
      '#EXTM3U',
      '#EXT-X-VERSION:6',
      '#EXT-X-TARGETDURATION:10',
      '#EXTINF:10.0,',
      'segment1.vtt',
      '#EXT-X-DISCONTINUITY',
      '#EXTINF:10.0,',
      'segment2.vtt',
      '#EXT-X-ENDLIST',
    ].join('\n');
    expect(parseHlsSubtitlePlaylist(discontinuityBody, 'https://cdn.example.com/subs/en.m3u8')).toHaveLength(2);

    // EXT-X-MAP initialization segments are not media segments — only EXTINF
    // segments are returned.
    const mapBody = [
      '#EXTM3U',
      '#EXT-X-VERSION:6',
      '#EXT-X-MAP:URI="init.vtt"',
      '#EXTINF:10.0,',
      'segment1.vtt',
      '#EXTINF:10.0,',
      'segment2.vtt',
    ].join('\n');
    const mapResult = parseHlsSubtitlePlaylist(mapBody, 'https://cdn.example.com/subs/en.m3u8');
    expect(mapResult).toHaveLength(2);
    expect(mapResult[0].url).toBe('https://cdn.example.com/subs/segment1.vtt');
  });

});

// ─── DASH Manifest Parser ───────────────────────────────────────────────────

describe('parseDashManifest', () => {
  it('extracts TTML mimeType and contentType=text AdaptationSets', () => {
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

    const ttmlResult = parseDashManifest(ttmlXml, 'https://cdn.example.com/manifest.mpd');
    expect(ttmlResult).toHaveLength(1);
    expect(ttmlResult[0]).toEqual({
      url: 'https://cdn.example.com/subs_en.ttml',
      language: 'en',
    });

    const textXml = `<?xml version="1.0"?>
<MPD xmlns="urn:mpeg:dash:schema:mpd:2011">
  <Period>
    <AdaptationSet mimeType="application/mp4" lang="es" contentType="text">
      <Representation id="s1">
        <BaseURL>subs_es.mp4</BaseURL>
      </Representation>
    </AdaptationSet>
  </Period>
</MPD>`;

    const textResult = parseDashManifest(textXml, 'https://cdn.example.com/manifest.mpd');
    expect(textResult).toHaveLength(1);
    expect(textResult[0].language).toBe('es');
    expect(textResult[0].url).toBe('https://cdn.example.com/subs_es.mp4');

    // Role caption/subtitle AdaptationSets are also accepted.
    const roleXml = `<?xml version="1.0"?>
<MPD xmlns="urn:mpeg:dash:schema:mpd:2011">
  <Period>
    <AdaptationSet mimeType="text/vtt" lang="fr">
      <Role schemeIdUri="urn:mpeg:dash:role:2011" value="caption"/>
      <Representation id="s1">
        <BaseURL>subs_fr.vtt</BaseURL>
      </Representation>
    </AdaptationSet>
  </Period>
</MPD>`;

    const roleResult = parseDashManifest(roleXml, 'https://cdn.example.com/manifest.mpd');
    expect(roleResult).toHaveLength(1);
    expect(roleResult[0].language).toBe('fr');

    // Multiple subtitle AdaptationSets are all extracted.
    const multiXml = `<?xml version="1.0"?>
<MPD xmlns="urn:mpeg:dash:schema:mpd:2011">
  <Period>
    <AdaptationSet mimeType="text/vtt" lang="en">
      <Representation id="s1"><BaseURL>en.vtt</BaseURL></Representation>
    </AdaptationSet>
    <AdaptationSet mimeType="text/vtt" lang="es">
      <Representation id="s2"><BaseURL>es.vtt</BaseURL></Representation>
    </AdaptationSet>
  </Period>
</MPD>`;

    const multiResult = parseDashManifest(multiXml, 'https://cdn.example.com/manifest.mpd');
    expect(multiResult).toHaveLength(2);
    expect(multiResult[0].language).toBe('en');
    expect(multiResult[1].language).toBe('es');
  });

  it('handles SegmentTemplate', () => {
    const xml = `<?xml version="1.0"?>
<MPD xmlns="urn:mpeg:dash:schema:mpd:2011">
  <Period>
    <AdaptationSet mimeType="text/vtt" lang="de">
      <Representation id="s1">
        <SegmentTemplate media="subs_de_$Number$.vtt" startNumber="1">
          <SegmentTimeline>
            <S t="0" d="10" r="5"/>
          </SegmentTimeline>
        </SegmentTemplate>
      </Representation>
    </AdaptationSet>
  </Period>
</MPD>`;

    const result = parseDashManifest(xml, 'https://cdn.example.com/manifest.mpd');

    // With SegmentTemplate, preserve every concrete segment URL so the
    // background can assemble the full subtitle track instead of fetching only
    // the first segment.
    expect(result).toHaveLength(1);
    expect(result[0].language).toBe('de');
    expect(result[0].url).toBe('https://cdn.example.com/subs_de_1.vtt');
    expect((result[0] as { segmentUrls?: string[] }).segmentUrls).toEqual([
      'https://cdn.example.com/subs_de_1.vtt',
      'https://cdn.example.com/subs_de_2.vtt',
      'https://cdn.example.com/subs_de_3.vtt',
      'https://cdn.example.com/subs_de_4.vtt',
      'https://cdn.example.com/subs_de_5.vtt',
      'https://cdn.example.com/subs_de_6.vtt',
    ]);

    // Without a SegmentTimeline, segment count is unknown → progressive fetch
    // metadata is preserved (media template + startNumber).
    const unknownXml = `<?xml version="1.0"?>
<MPD xmlns="urn:mpeg:dash:schema:mpd:2011">
  <Period>
    <AdaptationSet mimeType="text/vtt" lang="en-US">
      <Representation id="t6">
        <SegmentTemplate media="t/t6/$Number$.vtt" startNumber="8"/>
      </Representation>
    </AdaptationSet>
  </Period>
</MPD>`;

    const unknownResult = parseDashManifest(
      unknownXml,
      'https://cdn.example.com/dash.mpd?manifest-params=token',
    );
    expect(unknownResult).toHaveLength(1);
    expect(unknownResult[0].url).toBe('https://cdn.example.com/t/t6/8.vtt?manifest-params=token');
    expect(
      (unknownResult[0] as { segmentFetch?: { media: string; startNumber: number } }).segmentFetch,
    ).toEqual(
      expect.objectContaining({
        media: 't/t6/$Number$.vtt',
        startNumber: 8,
      }),
    );
  });

  it('resolves relative/absolute BaseURLs; defaults missing lang to empty string', () => {
    const relXml = `<?xml version="1.0"?>
<MPD xmlns="urn:mpeg:dash:schema:mpd:2011">
  <Period>
    <AdaptationSet mimeType="text/vtt" lang="ja">
      <Representation id="s1">
        <BaseURL>subtitles/ja.vtt</BaseURL>
      </Representation>
    </AdaptationSet>
  </Period>
</MPD>`;

    const relResult = parseDashManifest(relXml, 'https://cdn.example.com/path/manifest.mpd');
    expect(relResult[0].url).toBe('https://cdn.example.com/path/subtitles/ja.vtt');

    const absXml = `<?xml version="1.0"?>
<MPD xmlns="urn:mpeg:dash:schema:mpd:2011">
  <Period>
    <AdaptationSet mimeType="text/vtt" lang="ko">
      <Representation id="s1">
        <BaseURL>https://other.cdn.com/ko.vtt</BaseURL>
      </Representation>
    </AdaptationSet>
  </Period>
</MPD>`;

    const absResult = parseDashManifest(absXml, 'https://cdn.example.com/manifest.mpd');
    expect(absResult[0].url).toBe('https://other.cdn.com/ko.vtt');

    // Missing lang attribute defaults to empty string
    const noLangXml = `<?xml version="1.0"?>
<MPD xmlns="urn:mpeg:dash:schema:mpd:2011">
  <Period>
    <AdaptationSet mimeType="text/vtt">
      <Representation id="s1"><BaseURL>subs.vtt</BaseURL></Representation>
    </AdaptationSet>
  </Period>
</MPD>`;

    const noLangResult = parseDashManifest(noLangXml, 'https://cdn.example.com/manifest.mpd');
    expect(noLangResult).toHaveLength(1);
    expect(noLangResult[0].language).toBe('');
  });

  it('skips video/audio AdaptationSets; returns empty for invalid XML or no subtitle tracks', () => {
    const xml = `<?xml version="1.0"?>
<MPD xmlns="urn:mpeg:dash:schema:mpd:2011">
  <Period>
    <AdaptationSet mimeType="video/mp4" lang="en">
      <Representation id="v1">
        <BaseURL>video.mp4</BaseURL>
      </Representation>
    </AdaptationSet>
    <AdaptationSet mimeType="audio/mp4" lang="en">
      <Representation id="a1">
        <BaseURL>audio.mp4</BaseURL>
      </Representation>
    </AdaptationSet>
    <AdaptationSet mimeType="text/vtt" lang="vi">
      <Representation id="s1">
        <BaseURL>subs_vi.vtt</BaseURL>
      </Representation>
    </AdaptationSet>
  </Period>
</MPD>`;

    const result = parseDashManifest(xml, 'https://cdn.example.com/manifest.mpd');

    expect(result).toHaveLength(1);
    expect(result[0].language).toBe('vi');

    // Invalid XML, empty body, or XML with no subtitle tracks
    expect(parseDashManifest('not xml', 'https://cdn.example.com/manifest.mpd')).toEqual([]);
    expect(parseDashManifest('', 'https://cdn.example.com/manifest.mpd')).toEqual([]);
    const videoOnly = `<?xml version="1.0"?>
<MPD xmlns="urn:mpeg:dash:schema:mpd:2011">
  <Period>
    <AdaptationSet mimeType="video/mp4" lang="en">
      <Representation id="v1"><BaseURL>video.mp4</BaseURL></Representation>
    </AdaptationSet>
  </Period>
</MPD>`;
    expect(parseDashManifest(videoOnly, 'https://cdn.example.com/manifest.mpd')).toEqual([]);
  });
});
