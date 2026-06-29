import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createBridgeSubtitleFetcher,
  resetPageFetchForTests,
  resetRelayFetchForTests,
  setPageFetchForTests,
  setRelayFetchForTests,
  type SubtitleSegmentFetchResult,
} from '@/inject/maxMpdSubtitleFetch';
import type { MessageBridgeSender } from '@/inject/messageBridge';

const MAX_VTT_URL =
  'https://gcp.asia.prd.media.max.com/fadb6e8d-4efa-49e9-90b1-f2d88de5eb5b/t/caa516/t3/8.vtt?manifest-params=TOKEN&rtype=s&market=apac&x-wbd-tenant=beam';

const VTT_BODY = `WEBVTT

00:00:01.000 --> 00:00:02.000
Hello`;

const MPD_BODY = `<?xml version="1.0"?>
<MPD xmlns="urn:mpeg:dash:schema:mpd:2011">
  <Period>
    <AdaptationSet mimeType="text/vtt" lang="en-US">
      <Representation id="t3">
        <SegmentTemplate media="nested/t3/$Number$.vtt" startNumber="1"/>
      </Representation>
    </AdaptationSet>
  </Period>
</MPD>`;

describe('createBridgeSubtitleFetcher', () => {
  beforeEach(() => {
    resetPageFetchForTests();
    resetRelayFetchForTests();
  });

  function makeBridge(): MessageBridgeSender {
    return { send: vi.fn() } as unknown as MessageBridgeSender;
  }

  function relayResult(result: SubtitleSegmentFetchResult): (url: string) => Promise<SubtitleSegmentFetchResult> {
    return async () => result;
  }

  function pageResponse(response: Response): typeof fetch {
    return async () => response;
  }

  it('returns relay result when it returns a real subtitle response', async () => {
    setRelayFetchForTests(relayResult({ ok: true, status: 200, text: VTT_BODY, contentType: 'text/vtt' }));
    setPageFetchForTests(pageResponse(new Response('ignored', { status: 200 })));

    const fetcher = createBridgeSubtitleFetcher(makeBridge());
    const result = await fetcher(MAX_VTT_URL);

    expect(result.ok).toBe(true);
    expect(result.text).toBe(VTT_BODY);
    expect(result.contentType).toBe('text/vtt');
  });

  it('prefers page-context fetch when the relay returns a DASH manifest for a Max VTT URL', async () => {
    setRelayFetchForTests(
      relayResult({ ok: true, status: 200, text: MPD_BODY, contentType: 'application/dash+xml' }),
    );
    setPageFetchForTests(
      pageResponse(new Response(VTT_BODY, { status: 200, headers: { 'Content-Type': 'text/vtt' } })),
    );

    const fetcher = createBridgeSubtitleFetcher(makeBridge());
    const result = await fetcher(MAX_VTT_URL);

    expect(result.ok).toBe(true);
    expect(result.text).toBe(VTT_BODY);
    expect(result.contentType).toBe('text/vtt');
  });

  it('falls back to relay manifest when page fetch also returns a manifest', async () => {
    setRelayFetchForTests(
      relayResult({ ok: true, status: 200, text: MPD_BODY, contentType: 'application/dash+xml' }),
    );
    setPageFetchForTests(
      pageResponse(
        new Response(MPD_BODY, { status: 200, headers: { 'Content-Type': 'application/dash+xml' } }),
      ),
    );

    const fetcher = createBridgeSubtitleFetcher(makeBridge());
    const result = await fetcher(MAX_VTT_URL);

    expect(result.ok).toBe(true);
    expect(result.text).toBe(MPD_BODY);
    expect(result.contentType).toBe('application/dash+xml');
  });

  it('falls back to page fetch when the relay fails', async () => {
    setRelayFetchForTests(relayResult({ ok: false, status: 0, text: '', contentType: '', error: 'blocked' }));
    setPageFetchForTests(
      pageResponse(new Response(VTT_BODY, { status: 200, headers: { 'Content-Type': 'text/vtt' } })),
    );

    const fetcher = createBridgeSubtitleFetcher(makeBridge());
    const result = await fetcher(MAX_VTT_URL);

    expect(result.ok).toBe(true);
    expect(result.text).toBe(VTT_BODY);
  });

  it('does not prefer page fetch for non-Max URLs even when relay returns a manifest', async () => {
    const nonMaxUrl = 'https://cdn.example.com/subtitles/en.vtt';
    setRelayFetchForTests(
      relayResult({ ok: true, status: 200, text: MPD_BODY, contentType: 'application/dash+xml' }),
    );
    setPageFetchForTests(
      pageResponse(new Response(VTT_BODY, { status: 200, headers: { 'Content-Type': 'text/vtt' } })),
    );

    const fetcher = createBridgeSubtitleFetcher(makeBridge());
    const result = await fetcher(nonMaxUrl);

    expect(result.ok).toBe(true);
    expect(result.text).toBe(MPD_BODY);
  });
});
