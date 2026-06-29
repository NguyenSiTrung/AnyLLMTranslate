import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  captureMaxVttSegment,
  isMaxVttSegmentUrl,
  registerMpdRepresentationLanguages,
  resetMaxVttSegmentCapture,
  resetMaxVttSegmentCaptureLock,
  setVttCapturePreferredLanguage,
} from '@/inject/maxVttSegmentCapture';

describe('maxVttSegmentCapture', () => {
  beforeEach(() => {
    resetMaxVttSegmentCapture();
    setVttCapturePreferredLanguage(undefined);
  });

  it('detects Max CDN WebVTT segment URLs', () => {
    expect(isMaxVttSegmentUrl(
      'https://gcp.asia.prd.media.max.com/fadb6e8d/t/caa516/t3/8.vtt?manifest-params=TOKEN',
    )).toBe(true);
    expect(isMaxVttSegmentUrl('https://cdn.example.com/subs.vtt')).toBe(false);
  });

  it('emits SUBTITLE_MANIFEST_CUES when player VTT segment is captured', () => {
    registerMpdRepresentationLanguages([
      {
        language: 'en-US',
        url: 'https://gcp.asia.prd.media.max.com/fadb6e8d/t/caa516/t3/8.vtt?manifest-params=TOKEN',
      },
    ]);
    setVttCapturePreferredLanguage('en');

    const bridge = { send: vi.fn(() => 'req-1') };
    const vtt = `WEBVTT

00:00:01.000 --> 00:00:02.000
Hello from player`;

    captureMaxVttSegment(
      'https://gcp.asia.prd.media.max.com/fadb6e8d/t/caa516/t3/8.vtt?manifest-params=TOKEN',
      vtt,
      bridge,
    );

    expect(bridge.send).toHaveBeenCalledWith(
      'SUBTITLE_MANIFEST_CUES',
      expect.objectContaining({
        platform: 'hbomax',
        language: 'en-US',
        cues: expect.arrayContaining([
          expect.objectContaining({ text: 'Hello from player' }),
        ]),
      }),
    );
  });

  it('registers representation id from MPD metadata when URL is not a segment path', () => {
    registerMpdRepresentationLanguages([
      {
        language: 'en-US',
        url: 'https://gcp.asia.prd.media.max.com/fadb6e8d?manifest-params=TOKEN',
        representationId: 't3',
      },
    ]);
    setVttCapturePreferredLanguage('en');

    const bridge = { send: vi.fn(() => 'req-1') };
    captureMaxVttSegment(
      'https://gcp.asia.prd.media.max.com/fadb6e8d/t/caa516/t3/8.vtt?manifest-params=TOKEN',
      'WEBVTT\n\n00:00:01.000 --> 00:00:02.000\nHello',
      bridge,
    );

    expect(bridge.send).toHaveBeenCalled();
  });

  it('filters captured segments by preferred language', () => {
    registerMpdRepresentationLanguages([
      { language: 'th', url: 'https://gcp.asia.prd.media.max.com/fadb6e8d/t/caa516/t1/8.vtt' },
    ]);
    setVttCapturePreferredLanguage('en');

    const bridge = { send: vi.fn(() => 'req-1') };
    captureMaxVttSegment(
      'https://gcp.asia.prd.media.max.com/fadb6e8d/t/caa516/t1/8.vtt?manifest-params=TOKEN',
      'WEBVTT\n\n00:00:01.000 --> 00:00:02.000\nThai',
      bridge,
    );

    expect(bridge.send).not.toHaveBeenCalled();
  });

  it('does NOT match zh-Hans preferred with zh-Hant representation (shared matcher)', () => {
    registerMpdRepresentationLanguages([
      { language: 'zh-Hant', url: 'https://gcp.asia.prd.media.max.com/fadb6e8d/t/caa516/t1/8.vtt' },
    ]);
    setVttCapturePreferredLanguage('zh-Hans');

    const bridge = { send: vi.fn(() => 'req-1') };
    captureMaxVttSegment(
      'https://gcp.asia.prd.media.max.com/fadb6e8d/t/caa516/t1/8.vtt?manifest-params=TOKEN',
      'WEBVTT\n\n00:00:01.000 --> 00:00:02.000\n繁體字幕',
      bridge,
    );

    expect(bridge.send).not.toHaveBeenCalled();
  });

  it('emits segments from a new representation after resetMaxVttSegmentCaptureLock', () => {
    registerMpdRepresentationLanguages([
      { language: 'en-US', url: 'https://gcp.asia.prd.media.max.com/fadb6e8d/t/caa516/t3/8.vtt' },
      { language: 'en-US', url: 'https://gcp.asia.prd.media.max.com/fadb6e8d/t/caa516/t5/1.vtt' },
    ]);
    setVttCapturePreferredLanguage('en');

    const bridge = { send: vi.fn(() => 'req-1') };
    const vtt1 = 'WEBVTT\n\n00:00:01.000 --> 00:00:02.000\nFirst';
    const vtt2 = 'WEBVTT\n\n00:00:03.000 --> 00:00:04.000\nSecond';

    // First capture from t3 — emits
    captureMaxVttSegment(
      'https://gcp.asia.prd.media.max.com/fadb6e8d/t/caa516/t3/8.vtt?manifest-params=TOKEN',
      vtt1,
      bridge,
    );
    expect(bridge.send).toHaveBeenCalledTimes(1);

    // Track switch resets the lock
    resetMaxVttSegmentCaptureLock();

    // Second capture from t5 — should now emit (not blocked by old lock)
    bridge.send.mockClear();
    captureMaxVttSegment(
      'https://gcp.asia.prd.media.max.com/fadb6e8d/t/caa516/t5/1.vtt?manifest-params=TOKEN',
      vtt2,
      bridge,
    );
    expect(bridge.send).toHaveBeenCalledWith(
      'SUBTITLE_MANIFEST_CUES',
      expect.objectContaining({
        cues: expect.arrayContaining([expect.objectContaining({ text: 'Second' })]),
      }),
    );
  });

  it('emits append:true for subsequent segments of the same representation', () => {
    registerMpdRepresentationLanguages([
      { language: 'en-US', url: 'https://gcp.asia.prd.media.max.com/fadb6e8d/t/caa516/t3/8.vtt' },
    ]);
    setVttCapturePreferredLanguage('en');

    const bridge = { send: vi.fn(() => 'req-1') };
    const vtt1 = 'WEBVTT\n\n00:00:01.000 --> 00:00:02.000\nFirst';
    const vtt2 = 'WEBVTT\n\n00:00:03.000 --> 00:00:04.000\nSecond';

    captureMaxVttSegment(
      'https://gcp.asia.prd.media.max.com/fadb6e8d/t/caa516/t3/8.vtt?manifest-params=TOKEN',
      vtt1,
      bridge,
    );
    expect(bridge.send).toHaveBeenLastCalledWith(
      'SUBTITLE_MANIFEST_CUES',
      expect.not.objectContaining({ append: true }),
    );

    bridge.send.mockClear();
    captureMaxVttSegment(
      'https://gcp.asia.prd.media.max.com/fadb6e8d/t/caa516/t3/9.vtt?manifest-params=TOKEN',
      vtt2,
      bridge,
    );
    expect(bridge.send).toHaveBeenCalledWith(
      'SUBTITLE_MANIFEST_CUES',
      expect.objectContaining({ append: true }),
    );
  });

  it('mergeCues deduplicates by startTime', () => {
    registerMpdRepresentationLanguages([
      { language: 'en-US', url: 'https://gcp.asia.prd.media.max.com/fadb6e8d/t/caa516/t3/8.vtt' },
    ]);
    setVttCapturePreferredLanguage('en');

    const bridge = { send: vi.fn(() => 'req-1') };
    const vtt1 = 'WEBVTT\n\n00:00:01.000 --> 00:00:02.000\nOriginal';
    const vtt2 = 'WEBVTT\n\n00:00:01.000 --> 00:00:02.000\nDuplicate';

    captureMaxVttSegment(
      'https://gcp.asia.prd.media.max.com/fadb6e8d/t/caa516/t3/8.vtt?manifest-params=TOKEN',
      vtt1,
      bridge,
    );

    bridge.send.mockClear();
    captureMaxVttSegment(
      'https://gcp.asia.prd.media.max.com/fadb6e8d/t/caa516/t3/9.vtt?manifest-params=TOKEN',
      vtt2,
      bridge,
    );

    const sendPayload = (bridge.send.mock.calls[0] as unknown as
      | [string, { cues: Array<{ startTime: number }> }]
      | undefined)?.[1];
    const cues = sendPayload?.cues;
    // Same startTime → deduped, not doubled
    expect(cues?.filter((c) => c.startTime === 1)).toHaveLength(1);
  });
});