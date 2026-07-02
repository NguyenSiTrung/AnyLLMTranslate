import { describe, it, expect } from 'vitest';
import { buildSegmentOffsetMap } from '@/lib/dashSegmentOffsets';

// A Max-style text AdaptationSet: SegmentTemplate + SegmentTimeline + $Number$ template.
const MPD_RELATIVE = `<?xml version="1.0" encoding="UTF-8"?>
<MPD xmlns="urn:mpeg:dash:schema:mpd:2011" mediaPresentationDuration="PT60S">
  <Period>
    <AdaptationSet id="41" lang="en-US" contentType="text">
      <Label>English</Label>
      <Role schemeIdUri="urn:mpeg:dash:role:2011" value="subtitle"/>
      <Representation id="t41" bandwidth="35" mimeType="text/vtt">
        <SegmentTemplate timescale="1000" startNumber="3" media="t/ff8956/t41/$Number$.vtt">
          <SegmentTimeline>
            <S t="0" d="1000" r="1"/>
            <S d="1000"/>
          </SegmentTimeline>
        </SegmentTemplate>
      </Representation>
    </AdaptationSet>
  </Period>
</MPD>`;

const BASE_URL = 'https://prd.media.max.com/asset/123/manifest-params=x';

describe('buildSegmentOffsetMap', () => {
  it('maps each segment URL to its cumulative presentation-time offset in ms', () => {
    const map = buildSegmentOffsetMap(MPD_RELATIVE, BASE_URL);
    // First <S t=0 d=1000 r=1>: 2 segments at t=0, t=1000 (timescale 1000 → 0ms, 1000ms)
    // Second <S d=1000> (no t): 1 segment at t=2000 → 2000ms
    const entries = [...map.entries()];
    expect(entries).toHaveLength(3);
    expect(entries[0][1]).toBe(0); // t=0 → 0ms
    expect(entries[1][1]).toBe(1000); // t=1000 → 1000ms
    expect(entries[2][1]).toBe(2000); // t=2000 → 2000ms
  });

  it('returns absolute offsets that scale with timescale', () => {
    const mpdTimescale90k = MPD_RELATIVE.replace('timescale="1000"', 'timescale="90000"')
      .replace('d="1000"', 'd="90000"');
    const map = buildSegmentOffsetMap(mpdTimescale90k, BASE_URL);
    const entries = [...map.entries()];
    expect(entries[0][1]).toBe(0);
    expect(entries[1][1]).toBe(1000); // 90000/90000 * 1000 = 1000ms
    expect(entries[2][1]).toBe(2000);
  });

  it('uses the S.t attribute when present mid-timeline', () => {
    const mpd = `<?xml version="1.0"?>
<MPD xmlns="urn:mpeg:dash:schema:mpd:2011"><Period>
  <AdaptationSet contentType="text"><Representation id="t1" mimeType="text/vtt">
    <SegmentTemplate timescale="1000" media="$Number$.vtt"><SegmentTimeline>
      <S t="0" d="5000"/>
      <S t="50000" d="5000"/>
    </SegmentTimeline></SegmentTemplate>
  </Representation></AdaptationSet>
</Period></MPD>`;
    const map = buildSegmentOffsetMap(mpd, 'https://x.com/m.mpd');
    const offsets = [...map.values()];
    expect(offsets).toEqual([0, 50000]);
  });

  it('returns an empty map when no subtitle AdaptationSets exist', () => {
    const mpd = `<?xml version="1.0"?>
<MPD xmlns="urn:mpeg:dash:schema:mpd:2011"><Period>
  <AdaptationSet mimeType="video/mp4"><Representation id="v1"/></AdaptationSet>
</Period></MPD>`;
    expect(buildSegmentOffsetMap(mpd, 'https://x.com/m.mpd').size).toBe(0);
  });

  it('returns an empty map for unparseable input', () => {
    expect(buildSegmentOffsetMap('not xml', 'https://x.com/m.mpd').size).toBe(0);
    expect(buildSegmentOffsetMap('', 'https://x.com/m.mpd').size).toBe(0);
  });
});
