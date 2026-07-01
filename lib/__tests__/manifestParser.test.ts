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

  it('resolves absolute URIs without modification', () => {
    const body = [
      '#EXTM3U',
      '#EXT-X-MEDIA:TYPE=SUBTITLES,GROUP-ID="subs",NAME="French",LANGUAGE="fr",URI="https://other.cdn.com/fr.vtt"',
    ].join('\n');

    const result = parseHlsManifest(body, 'https://cdn.example.com/master.m3u8');

    expect(result).toHaveLength(1);
    expect(result[0].url).toBe('https://other.cdn.com/fr.vtt');
  });

  it('resolves protocol-relative URIs', () => {
    const body = [
      '#EXTM3U',
      '#EXT-X-MEDIA:TYPE=SUBTITLES,GROUP-ID="subs",NAME="German",LANGUAGE="de",URI="//other.cdn.com/de.m3u8"',
    ].join('\n');

    const result = parseHlsManifest(body, 'https://cdn.example.com/master.m3u8');

    expect(result).toHaveLength(1);
    expect(result[0].url).toBe('https://other.cdn.com/de.m3u8');
  });

  it('resolves path-relative URIs against baseUrl directory', () => {
    const body = [
      '#EXTM3U',
      '#EXT-X-MEDIA:TYPE=SUBTITLES,GROUP-ID="subs",NAME="Italian",LANGUAGE="it",URI="it.m3u8"',
    ].join('\n');

    const result = parseHlsManifest(body, 'https://cdn.example.com/playlist/master.m3u8');

    expect(result).toHaveLength(1);
    expect(result[0].url).toBe('https://cdn.example.com/playlist/it.m3u8');
  });

  it('handles missing DEFAULT attribute (defaults to false)', () => {
    const body = [
      '#EXTM3U',
      '#EXT-X-MEDIA:TYPE=SUBTITLES,GROUP-ID="subs",NAME="Japanese",LANGUAGE="ja",URI="ja.m3u8"',
    ].join('\n');

    const result = parseHlsManifest(body, 'https://cdn.example.com/master.m3u8');

    expect(result).toHaveLength(1);
    expect(result[0].isDefault).toBe(false);
  });

  it('handles DEFAULT=NO explicitly', () => {
    const body = [
      '#EXTM3U',
      '#EXT-X-MEDIA:TYPE=SUBTITLES,GROUP-ID="subs",NAME="Korean",DEFAULT=NO,LANGUAGE="ko",URI="ko.m3u8"',
    ].join('\n');

    const result = parseHlsManifest(body, 'https://cdn.example.com/master.m3u8');

    expect(result).toHaveLength(1);
    expect(result[0].isDefault).toBe(false);
  });

  it('returns empty array for manifest with no subtitle tracks', () => {
    const body = [
      '#EXTM3U',
      '#EXT-X-VERSION:6',
      '#EXT-X-STREAM-INF:BANDWIDTH=5000000',
      'video.m3u8',
      '#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="audio",NAME="English",LANGUAGE="en",URI="audio/en.m3u8"',
    ].join('\n');

    const result = parseHlsManifest(body, 'https://cdn.example.com/master.m3u8');

    expect(result).toEqual([]);
  });

  it('returns empty array for empty body', () => {
    expect(parseHlsManifest('', 'https://cdn.example.com/master.m3u8')).toEqual([]);
  });

  it('handles URI without quotes', () => {
    const body = [
      '#EXTM3U',
      '#EXT-X-MEDIA:TYPE=SUBTITLES,GROUP-ID="subs",NAME=English,LANGUAGE=en,URI=subs_en.m3u8',
    ].join('\n');

    const result = parseHlsManifest(body, 'https://cdn.example.com/master.m3u8');

    expect(result).toHaveLength(1);
    expect(result[0].url).toBe('https://cdn.example.com/subs_en.m3u8');
    expect(result[0].language).toBe('en');
    expect(result[0].label).toBe('English');
  });

  it('skips non-SUBTITLES EXT-X-MEDIA entries', () => {
    const body = [
      '#EXTM3U',
      '#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="audio",NAME="English",LANGUAGE="en",URI="audio/en.m3u8"',
      '#EXT-X-MEDIA:TYPE=SUBTITLES,GROUP-ID="subs",NAME="English",LANGUAGE="en",URI="subs/en.m3u8"',
      '#EXT-X-MEDIA:TYPE=CLOSED-CAPTIONS,GROUP-ID="cc",NAME="English",LANGUAGE="en",URI="cc/en.m3u8"',
    ].join('\n');

    const result = parseHlsManifest(body, 'https://cdn.example.com/master.m3u8');

    expect(result).toHaveLength(1);
    expect(result[0].language).toBe('en');
    expect(result[0].url).toBe('https://cdn.example.com/subs/en.m3u8');
  });

  it('handles multiple subtitle groups', () => {
    const body = [
      '#EXTM3U',
      '#EXT-X-MEDIA:TYPE=SUBTITLES,GROUP-ID="subs1",NAME="English",LANGUAGE="en",URI="en.m3u8"',
      '#EXT-X-MEDIA:TYPE=SUBTITLES,GROUP-ID="subs2",NAME="Vietnamese",LANGUAGE="vi",URI="vi.m3u8"',
    ].join('\n');

    const result = parseHlsManifest(body, 'https://cdn.example.com/master.m3u8');

    expect(result).toHaveLength(2);
    expect(result[1].language).toBe('vi');
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
  });

  it('handles EXT-X-MAP initialization segment', () => {
    const body = [
      '#EXTM3U',
      '#EXT-X-VERSION:6',
      '#EXT-X-MAP:URI="init.vtt"',
      '#EXTINF:10.0,',
      'segment1.vtt',
      '#EXTINF:10.0,',
      'segment2.vtt',
    ].join('\n');

    const result = parseHlsSubtitlePlaylist(body, 'https://cdn.example.com/subs/en.m3u8');

    // EXT-X-MAP is not a media segment — only EXTINF segments are returned
    expect(result).toHaveLength(2);
    expect(result[0].url).toBe('https://cdn.example.com/subs/segment1.vtt');
  });

  it('resolves absolute segment URLs', () => {
    const body = [
      '#EXTM3U',
      '#EXTINF:10.0,',
      'https://other.cdn.com/seg1.vtt',
    ].join('\n');

    const result = parseHlsSubtitlePlaylist(body, 'https://cdn.example.com/subs/en.m3u8');

    expect(result).toHaveLength(1);
    expect(result[0].url).toBe('https://other.cdn.com/seg1.vtt');
  });

  it('resolves protocol-relative segment URLs', () => {
    const body = [
      '#EXTM3U',
      '#EXTINF:10.0,',
      '//other.cdn.com/seg1.vtt',
    ].join('\n');

    const result = parseHlsSubtitlePlaylist(body, 'https://cdn.example.com/subs/en.m3u8');

    expect(result).toHaveLength(1);
    expect(result[0].url).toBe('https://other.cdn.com/seg1.vtt');
  });

  it('resolves path-relative segment URLs', () => {
    const body = [
      '#EXTM3U',
      '#EXTINF:10.0,',
      'deep/seg1.vtt',
    ].join('\n');

    const result = parseHlsSubtitlePlaylist(body, 'https://cdn.example.com/subs/en.m3u8');

    expect(result).toHaveLength(1);
    expect(result[0].url).toBe('https://cdn.example.com/subs/deep/seg1.vtt');
  });

  it('handles empty playlist (only header)', () => {
    const body = [
      '#EXTM3U',
      '#EXT-X-VERSION:6',
      '#EXT-X-ENDLIST',
    ].join('\n');

    const result = parseHlsSubtitlePlaylist(body, 'https://cdn.example.com/subs/en.m3u8');

    expect(result).toEqual([]);
  });

  it('handles empty body', () => {
    expect(parseHlsSubtitlePlaylist('', 'https://cdn.example.com/subs/en.m3u8')).toEqual([]);
  });

  it('skips non-EXTINF lines that look like segments', () => {
    const body = [
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

    const result = parseHlsSubtitlePlaylist(body, 'https://cdn.example.com/subs/en.m3u8');

    expect(result).toHaveLength(2);
  });
});

// ─── DASH Manifest Parser ───────────────────────────────────────────────────

describe('parseDashManifest', () => {
  it('extracts subtitle AdaptationSet with application/ttml+xml mimeType', () => {
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

    const result = parseDashManifest(xml, 'https://cdn.example.com/manifest.mpd');

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      url: 'https://cdn.example.com/subs_en.ttml',
      language: 'en',
    });
  });

  it('extracts subtitle AdaptationSet with text/vtt mimeType', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<MPD xmlns="urn:mpeg:dash:schema:mpd:2011" type="static" mediaPresentationDuration="PT120S">
  <Period>
    <AdaptationSet mimeType="video/mp4" lang="en">
      <Representation id="v1" bandwidth="5000000">
        <BaseURL>video.mp4</BaseURL>
      </Representation>
    </AdaptationSet>
    <AdaptationSet mimeType="text/vtt" lang="en">
      <Representation id="s1">
        <BaseURL>subs_en.vtt</BaseURL>
      </Representation>
    </AdaptationSet>
  </Period>
</MPD>`;

    const result = parseDashManifest(xml, 'https://cdn.example.com/manifest.mpd');

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      url: 'https://cdn.example.com/subs_en.vtt',
      language: 'en',
    });
  });

  it('extracts subtitle AdaptationSet with application/mp4 mimeType', () => {
    const xml = `<?xml version="1.0"?>
<MPD xmlns="urn:mpeg:dash:schema:mpd:2011">
  <Period>
    <AdaptationSet mimeType="application/mp4" lang="es" contentType="text">
      <Representation id="s1">
        <BaseURL>subs_es.mp4</BaseURL>
      </Representation>
    </AdaptationSet>
  </Period>
</MPD>`;

    const result = parseDashManifest(xml, 'https://cdn.example.com/manifest.mpd');

    expect(result).toHaveLength(1);
    expect(result[0].language).toBe('es');
    expect(result[0].url).toBe('https://cdn.example.com/subs_es.mp4');
  });

  it('extracts tracks with Role caption/subtitle', () => {
    const xml = `<?xml version="1.0"?>
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

    const result = parseDashManifest(xml, 'https://cdn.example.com/manifest.mpd');

    expect(result).toHaveLength(1);
    expect(result[0].language).toBe('fr');
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
  });

  it('preserves SegmentTemplate progressive fetch metadata when segment count is unknown', () => {
    const xml = `<?xml version="1.0"?>
<MPD xmlns="urn:mpeg:dash:schema:mpd:2011">
  <Period>
    <AdaptationSet mimeType="text/vtt" lang="en-US">
      <Representation id="t6">
        <SegmentTemplate media="t/t6/$Number$.vtt" startNumber="8"/>
      </Representation>
    </AdaptationSet>
  </Period>
</MPD>`;

    const result = parseDashManifest(xml, 'https://cdn.example.com/dash.mpd?manifest-params=token');

    expect(result).toHaveLength(1);
    expect(result[0].url).toBe('https://cdn.example.com/t/t6/8.vtt?manifest-params=token');
    expect((result[0] as { segmentFetch?: { media: string; startNumber: number } }).segmentFetch).toEqual(
      expect.objectContaining({
        media: 't/t6/$Number$.vtt',
        startNumber: 8,
      }),
    );
  });

  it('resolves relative BaseURLs', () => {
    const xml = `<?xml version="1.0"?>
<MPD xmlns="urn:mpeg:dash:schema:mpd:2011">
  <Period>
    <AdaptationSet mimeType="text/vtt" lang="ja">
      <Representation id="s1">
        <BaseURL>subtitles/ja.vtt</BaseURL>
      </Representation>
    </AdaptationSet>
  </Period>
</MPD>`;

    const result = parseDashManifest(xml, 'https://cdn.example.com/path/manifest.mpd');

    expect(result).toHaveLength(1);
    expect(result[0].url).toBe('https://cdn.example.com/path/subtitles/ja.vtt');
  });

  it('resolves absolute BaseURLs', () => {
    const xml = `<?xml version="1.0"?>
<MPD xmlns="urn:mpeg:dash:schema:mpd:2011">
  <Period>
    <AdaptationSet mimeType="text/vtt" lang="ko">
      <Representation id="s1">
        <BaseURL>https://other.cdn.com/ko.vtt</BaseURL>
      </Representation>
    </AdaptationSet>
  </Period>
</MPD>`;

    const result = parseDashManifest(xml, 'https://cdn.example.com/manifest.mpd');

    expect(result).toHaveLength(1);
    expect(result[0].url).toBe('https://other.cdn.com/ko.vtt');
  });

  it('skips video/audio AdaptationSets', () => {
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
  });

  it('handles multiple subtitle AdaptationSets', () => {
    const xml = `<?xml version="1.0"?>
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

    const result = parseDashManifest(xml, 'https://cdn.example.com/manifest.mpd');

    expect(result).toHaveLength(2);
    expect(result[0].language).toBe('en');
    expect(result[1].language).toBe('es');
  });

  it('returns empty array for invalid XML', () => {
    expect(parseDashManifest('not xml', 'https://cdn.example.com/manifest.mpd')).toEqual([]);
    expect(parseDashManifest('<broken', 'https://cdn.example.com/manifest.mpd')).toEqual([]);
  });

  it('returns empty array for empty body', () => {
    expect(parseDashManifest('', 'https://cdn.example.com/manifest.mpd')).toEqual([]);
  });

  it('returns empty array for XML with no subtitle tracks', () => {
    const xml = `<?xml version="1.0"?>
<MPD xmlns="urn:mpeg:dash:schema:mpd:2011">
  <Period>
    <AdaptationSet mimeType="video/mp4" lang="en">
      <Representation id="v1"><BaseURL>video.mp4</BaseURL></Representation>
    </AdaptationSet>
  </Period>
</MPD>`;

    expect(parseDashManifest(xml, 'https://cdn.example.com/manifest.mpd')).toEqual([]);
  });

  it('handles missing lang attribute (defaults to empty string)', () => {
    const xml = `<?xml version="1.0"?>
<MPD xmlns="urn:mpeg:dash:schema:mpd:2011">
  <Period>
    <AdaptationSet mimeType="text/vtt">
      <Representation id="s1"><BaseURL>subs.vtt</BaseURL></Representation>
    </AdaptationSet>
  </Period>
</MPD>`;

    const result = parseDashManifest(xml, 'https://cdn.example.com/manifest.mpd');

    expect(result).toHaveLength(1);
    expect(result[0].language).toBe('');
  });
});
