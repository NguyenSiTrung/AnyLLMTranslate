// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { parseASS, parseAssTimestamp, stripAssTags } from '@/lib/assParser';
import { parseTTML, parseTtmlTime } from '@/lib/ttmlParser';
import { concatVttSegments } from '@/lib/vttSegmentConcat';
import { buildSegmentOffsetMap } from '@/lib/dashSegmentOffsets';
import { applySegmentOffset } from '@/lib/applySegmentOffset';
import type { SubtitleCue } from '@/types/subtitle';

describe('Subtitle parsers, segment concatenation and offset helpers', () => {
  it('parses ASS/TTML cues, concatenates VTT segments, maps DASH offsets, and applies time offsets', () => {
    expect(parseAssTimestamp('0:00:01.50')).toBeCloseTo(1.5);
    expect(stripAssTags('{\\an8}Hello\\NWorld')).toBe('Hello\nWorld');

    const ass = `[Script Info]\nTitle: test\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\nDialogue: 0,0:00:01.00,0:00:03.00,Default,,0,0,0,,{\\an8}First line`;
    const assCues = parseASS(ass);
    expect(assCues[0]!.text).toBe('First line');

    expect(parseTtmlTime('00:00:12.340')).toBeCloseTo(12.34, 3);
    const ttml = `<?xml version="1.0"?><tt xmlns="http://www.w3.org/ns/ttml"><body><div><p begin="00:00:12.340" end="00:00:15.670">Hello there</p></div></body></tt>`;
    expect(parseTTML(ttml)[0]!.text).toBe('Hello there');

    // concatenates VTT segments, maps DASH offsets, and applies segment time offsets
    const concatenated = concatVttSegments([
      'WEBVTT\n\n00:00:00.000 --> 00:00:02.000\nFirst',
      'WEBVTT\n\n00:00:02.000 --> 00:00:04.000\nSecond',
    ]);
    expect((concatenated.match(/^WEBVTT/gm) || []).length).toBe(1);
    expect(concatenated).toContain('First');

    const MPD_RELATIVE = `<?xml version="1.0" encoding="UTF-8"?>
<MPD xmlns="urn:mpeg:dash:schema:mpd:2011" mediaPresentationDuration="PT60S">
  <Period>
    <AdaptationSet id="41" lang="en-US" contentType="text">
      <Representation id="t41" bandwidth="35" mimeType="text/vtt">
        <SegmentTemplate timescale="1000" startNumber="3" media="t/ff8956/t41/$Number$.vtt">
          <SegmentTimeline><S t="0" d="1000" r="1"/></SegmentTimeline>
        </SegmentTemplate>
      </Representation>
    </AdaptationSet>
  </Period>
</MPD>`;
    const map = buildSegmentOffsetMap(MPD_RELATIVE, 'https://prd.media.max.com/asset/123/manifest.mpd');
    expect(map.size).toBe(2);

    const cue: SubtitleCue = { startTime: 1, endTime: 2, text: 'hi' };
    const offsetRes = applySegmentOffset([cue], 30000);
    expect(offsetRes[0]!.startTime).toBe(31);
    expect(offsetRes[0]!.endTime).toBe(32);
  });
});
