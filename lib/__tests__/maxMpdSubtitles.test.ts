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