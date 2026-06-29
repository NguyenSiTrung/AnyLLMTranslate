import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  captureMaxVttSegment,
  isMaxVttSegmentUrl,
  registerMpdRepresentationLanguages,
  resetMaxVttSegmentCapture,
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
});