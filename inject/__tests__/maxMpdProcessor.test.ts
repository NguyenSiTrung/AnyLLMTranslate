import { describe, it, expect, vi, beforeEach } from 'vitest';
import { processMaxMpdManifest, resetMaxMpdProcessorState } from '@/inject/maxMpdProcessor';

const MPD_WITH_TTML = `<?xml version="1.0"?>
<MPD xmlns="urn:mpeg:dash:schema:mpd:2011">
  <Period>
    <AdaptationSet mimeType="application/ttml+xml" lang="en">
      <Representation id="s1">
        <BaseURL>https://cdn.example.com/subs_en.ttml</BaseURL>
      </Representation>
    </AdaptationSet>
  </Period>
</MPD>`;

const TTML_BODY = `<?xml version="1.0"?>
<tt xmlns="http://www.w3.org/ns/ttml">
  <body><div>
    <p begin="00:00:12.340" end="00:00:15.670">Hello there</p>
  </div></body>
</tt>`;

describe('processMaxMpdManifest', () => {
  beforeEach(() => {
    resetMaxMpdProcessorState();
    vi.restoreAllMocks();
  });

  it('fetches subtitle tracks and logs parsed cues', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response(TTML_BODY, {
        status: 200,
        headers: { 'Content-Type': 'application/ttml+xml' },
      }),
    ));

    await processMaxMpdManifest(MPD_WITH_TTML, 'https://cdn.example.com/manifest.mpd');

    expect(fetch).toHaveBeenCalledWith('https://cdn.example.com/subs_en.ttml');
    expect(logSpy).toHaveBeenCalledWith(
      'AnyLLMTranslate: Max MPD subtitles parsed',
      expect.objectContaining({
        cueCount: 1,
        cues: [{ start: expect.closeTo(12.34, 3), end: expect.closeTo(15.67, 3), text: 'Hello there' }],
      }),
    );
  });

  it('skips duplicate MPD processing', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(TTML_BODY, { status: 200, headers: { 'Content-Type': 'application/ttml+xml' } }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await processMaxMpdManifest(MPD_WITH_TTML, 'https://cdn.example.com/manifest.mpd');
    await processMaxMpdManifest(MPD_WITH_TTML, 'https://cdn.example.com/manifest.mpd?token=1');

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});