import { describe, expect, it, vi } from 'vitest';
import {
  salvageTranslationPairs,
  missingTranslationIds,
  isUsefulSalvage,
} from '@/lib/jsonParseRepair';
import { parseSSEBuffer, extractDeltaContent, extractCompletedPieces } from '../sseStreamParser';
import {
  parseHlsManifest,
  parseHlsSubtitlePlaylist,
  parseDashManifest,
} from '@/lib/manifestParser';
import { splitPiecesIntoBatches, dedupPiecesByText } from '../textBatching';
import { extractTrackCues } from '@/lib/textTrackCues';

describe('jsonParseRepair', () => {
  it('salvages pairs from truncated/escaped JSON and reports missing/usefulness', () => {
    const raw = `{"translations": {"a": "Xin chào", "b": "thế giới", "c": "incomple`;
    const map = salvageTranslationPairs(raw, ['a', 'b', 'c']);
    expect(map.get('a')).toBe('Xin chào');
    expect(map.get('b')).toBe('thế giới');
    expect(map.has('c')).toBe(false);

    const escaped = salvageTranslationPairs(`{"translations":{"x":"He said \\"hi\\""}}`, ['x']);
    expect(escaped.get('x')).toBe('He said "hi"');

    const partial = new Map([['a', '1']]);
    expect(missingTranslationIds(partial, ['a', 'b'])).toEqual(['b']);
    expect(isUsefulSalvage(partial)).toBe(true);
    expect(isUsefulSalvage(new Map())).toBe(false);
  });
});

/**
 * Pure SSE stream parsing helpers.
 */


describe('sseStreamParser', () => {
  it('parseSSEBuffer, extractDeltaContent, and extractCompletedPieces cover all scenarios', () => {
    const multi =
      'data: {"choices":[{"delta":{"content":"Hello"}}]}\n\n' +
      'data: {"choices":[{"delta":{"content":" world"}}]}\n\n';
    const { events } = parseSSEBuffer(multi);
    expect(events).toHaveLength(2);
    expect(extractDeltaContent(events[0].type === 'data' ? events[0].json : '')).toBe('Hello');

    expect(parseSSEBuffer('data: [DONE]\n\n').events[0]).toEqual({ type: 'done' });

    const partial = parseSSEBuffer(
      'data: {"choices":[{"delta":{"content":"A"}}]}\n\ndata: {"choi',
    );
    expect(partial.events).toHaveLength(1);
    expect(partial.remainder).toBe('data: {"choi');

    const withNoise = parseSSEBuffer(': comment\nevent: test\ndata: {"x":1}\n\n');
    expect(withNoise.events[0]).toEqual({ type: 'data', json: '{"x":1}' });
    expect(parseSSEBuffer('').events).toHaveLength(0);

    expect(extractDeltaContent('{"choices":[{"delta":{"content":"Hello"}}]}')).toBe('Hello');
    expect(extractDeltaContent('{"choices":[{"delta":{"role":"assistant"}}]}')).toBe('');
    expect(extractDeltaContent('{"choices":[],"usage":{"prompt_tokens":10}}')).toBe('');
    expect(extractDeltaContent('not json')).toBe('');
    expect(
      extractDeltaContent('{"choices":[{"delta":{"content":"héllo \\"wörld\\" 日本語"}}]}'),
    ).toBe('héllo "wörld" 日本語');

    // extractCompletedPieces handles full/partial buffers, escaping, knownIds, and empty
    const full = extractCompletedPieces('{"p1":"Hello","p2":"World"}', ['p1', 'p2']);
    expect(full.get('p1')).toBe('Hello');
    expect(full.get('p2')).toBe('World');

        const partialPieces = extractCompletedPieces('{"p1":"Hello","p2":"Wor', ['p1', 'p2']);
    expect(partialPieces.get('p1')).toBe('Hello');
    expect(partialPieces.has('p2')).toBe(false);

    expect(extractCompletedPieces('{\n  "p1": "Value"\n}', ['p1']).get('p1')).toBe('Value');
    expect(extractCompletedPieces('{"p1":"He said \\"hi\\""}', ['p1']).get('p1')).toBe(
      'He said "hi"',
    );
    expect(
      extractCompletedPieces('{"p1":"val}ue,with{symbols","p2":"ok"}', ['p1', 'p2']).get('p1'),
    ).toBe('val}ue,with{symbols');

    const pieces = extractCompletedPieces('{"p1":"A","unknown":"B","p2":"C"}', ['p1', 'p2']);
    expect(pieces.size).toBe(2);
    expect(pieces.has('unknown')).toBe(false);
    expect(extractCompletedPieces('', ['p1']).size).toBe(0);
    expect(extractCompletedPieces('{"a.b[c]":"Val"}', ['a.b[c]']).get('a.b[c]')).toBe('Val');
  });
});

// ─── HLS Multivariant Manifest ──────────────────────────────────────────────

describe('parseHlsManifest / parseHlsSubtitlePlaylist', () => {
  it('parses HLS multivariant media entries and EXTINF subtitle-playlist segments', () => {
    // facet: parses subtitle media entries, URI variants, defaults, and media filtering
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
    const mixedResult = parseHlsManifest(mixed, 'https://cdn.example.com/master.m3u8');
    expect(mixedResult).toHaveLength(2);
    expect(mixedResult[0]!.language).toBe('en');
    expect(mixedResult[0]!.url).toBe('https://cdn.example.com/subs/en.m3u8');
    expect(mixedResult[1]!.language).toBe('vi');

    // facet: extracts VTT segment URLs from EXTINF entries
    const subBody = [
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

    const subResult = parseHlsSubtitlePlaylist(subBody, 'https://cdn.example.com/subs/en.m3u8');

    expect(subResult).toHaveLength(3);
    expect(subResult[0]).toEqual({ url: 'https://cdn.example.com/subs/segment1.vtt', duration: 10.0 });
    expect(subResult[1]).toEqual({ url: 'https://cdn.example.com/subs/segment2.vtt', duration: 10.0 });
    expect(subResult[2]).toEqual({ url: 'https://cdn.example.com/subs/segment3.vtt', duration: 5.0 });

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
  it('extracts subtitle adaptation sets with segment templates, resolves BaseURLs, and filters non-subtitle/invalid manifests', () => {
    // facet: extracts subtitle adaptation sets and segment-template metadata
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

    // facet: resolves BaseURLs and filters non-subtitle or invalid manifests
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

    const mixedXml = `<?xml version="1.0"?>
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

    const mixedResult = parseDashManifest(mixedXml, 'https://cdn.example.com/manifest.mpd');

    expect(mixedResult).toHaveLength(1);
    expect(mixedResult[0].language).toBe('vi');

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

describe('textBatching', () => {
  it('splits by count/char budgets (incl. oversized singles, empty) and dedups case-sensitively', () => {
      const byCount = splitPiecesIntoBatches(
        [
          { id: '1', text: 'a' },
          { id: '2', text: 'b' },
          { id: '3', text: 'c' },
          { id: '4', text: 'd' },
          { id: '5', text: 'e' },
        ],
        { maxTextGroupLengthPerRequest: 2, maxTextLengthPerRequest: 10000 },
      );
      expect(byCount).toHaveLength(3);

      const byChars = splitPiecesIntoBatches(
        [
          { id: '1', text: 'aaaaa' },
          { id: '2', text: 'bbbbb' },
          { id: '3', text: 'ccccc' },
        ],
        { maxTextGroupLengthPerRequest: 10, maxTextLengthPerRequest: 8 },
      );
      expect(byChars).toHaveLength(3);

      const oversized = splitPiecesIntoBatches([{ id: 'big', text: 'x'.repeat(5000) }], {
        maxTextGroupLengthPerRequest: 4,
        maxTextLengthPerRequest: 2000,
      });
      expect(oversized).toHaveLength(1);

      const unlimited = splitPiecesIntoBatches(
        [
          { id: '1', text: 'a' },
          { id: '2', text: 'b'.repeat(10000) },
        ],
        { maxTextGroupLengthPerRequest: 0, maxTextLengthPerRequest: 0 },
      );
      expect(unlimited).toHaveLength(1);

      expect(
        splitPiecesIntoBatches([], {
          maxTextGroupLengthPerRequest: 4,
          maxTextLengthPerRequest: 2000,
        }),
      ).toEqual([]);

      // dedupPiecesByText: dedups case-sensitively and maps dupes to the first id
      const { deduped, dupes } = dedupPiecesByText([
        { id: '1', text: 'hello' },
        { id: '2', text: 'hello' },
        { id: '3', text: 'world' },
        { id: '4', text: 'Hello' },
      ]);
      expect(deduped.map((p) => p.id)).toEqual(['1', '3', '4']);
      expect(dupes.get('2')).toBe('1');
      expect(dedupPiecesByText([]).deduped).toEqual([]);
    });
});

function makeVttCue(startTime: number, endTime: number, text: string): VTTCue {
  return { startTime, endTime, text } as unknown as VTTCue;
}

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
  it('extracts cues with voice tags/HTML/trim; empty for missing cues or non-subtitle kinds; accepts captions', () => {
    const track = makeTextTrack([
      makeVttCue(0, 2, '<v John>Hello there</v>'),
      makeVttCue(2, 4, '<v>Anonymous</v>'),
      makeVttCue(4, 6, '  Trimmed  '),
      makeVttCue(6, 8, '<b>Bold</b>\nLine two'),
    ]);
    const cues = extractTrackCues(track);
    expect(cues).toHaveLength(4);
    expect(cues[0]).toMatchObject({ voice: 'John', text: 'Hello there' });
    expect(cues[1].voice).toBeUndefined();
    expect(cues[2].text).toBe('Trimmed');
    expect(cues[3].text).toContain('<b>Bold</b>');

    // Empty for missing cues and non-subtitle kinds; accepts captions
    expect(extractTrackCues(makeTextTrack([]))).toEqual([]);
    expect(
      extractTrackCues({ kind: 'subtitles', language: 'en', cues: null } as unknown as TextTrack),
    ).toEqual([]);
    expect(extractTrackCues(makeTextTrack([makeVttCue(0, 2, 'm')], 'metadata'))).toEqual([]);
    expect(extractTrackCues(makeTextTrack([makeVttCue(0, 2, 'c')], 'captions'))).toHaveLength(1);
  });
});
