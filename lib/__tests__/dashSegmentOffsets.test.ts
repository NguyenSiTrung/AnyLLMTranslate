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
  it('maps offsets, timescale, S.t jumps, and empty edge cases', () => {
    const map = buildSegmentOffsetMap(MPD_RELATIVE, BASE_URL);
    const entries = [...map.entries()];
    expect(entries).toHaveLength(3);
    expect(entries[0][1]).toBe(0);
    expect(entries[1][1]).toBe(1000);
    expect(entries[2][1]).toBe(2000);

    const mpdTimescale90k = MPD_RELATIVE.replace('timescale="1000"', 'timescale="90000"').replace(
      'd="1000"',
      'd="90000"',
    );
    const scaled = [...buildSegmentOffsetMap(mpdTimescale90k, BASE_URL).entries()];
    expect(scaled[0][1]).toBe(0);
    expect(scaled[1][1]).toBe(1000);
    expect(scaled[2][1]).toBe(2000);

    const midT = `<?xml version="1.0"?>
<MPD xmlns="urn:mpeg:dash:schema:mpd:2011"><Period>
  <AdaptationSet contentType="text"><Representation id="t1" mimeType="text/vtt">
    <SegmentTemplate timescale="1000" media="$Number$.vtt"><SegmentTimeline>
      <S t="0" d="5000"/>
      <S t="50000" d="5000"/>
    </SegmentTimeline></SegmentTemplate>
  </Representation></AdaptationSet>
</Period></MPD>`;
    expect([...buildSegmentOffsetMap(midT, 'https://x.com/m.mpd').values()]).toEqual([0, 50000]);

    const videoOnly = `<?xml version="1.0"?>
<MPD xmlns="urn:mpeg:dash:schema:mpd:2011"><Period>
  <AdaptationSet mimeType="video/mp4"><Representation id="v1"/></AdaptationSet>
</Period></MPD>`;
    expect(buildSegmentOffsetMap(videoOnly, 'https://x.com/m.mpd').size).toBe(0);
    expect(buildSegmentOffsetMap('not xml', 'https://x.com/m.mpd').size).toBe(0);
    expect(buildSegmentOffsetMap('', 'https://x.com/m.mpd').size).toBe(0);
  });
});
