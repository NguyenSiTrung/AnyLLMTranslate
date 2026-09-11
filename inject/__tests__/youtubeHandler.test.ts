/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { YouTubeHandler } from '@/inject/subtitleHandlers/youtube';

describe('YouTubeHandler native caption hide', () => {
  let handler: YouTubeHandler;

  beforeEach(() => {
    handler = new YouTubeHandler();
  });

  it('exposes getNativeCaptionHide targeting YouTube caption windows', () => {
    expect(typeof handler.getNativeCaptionHide).toBe('function');
    const hide = handler.getNativeCaptionHide!();
    expect(hide.method ?? 'display').toBe('display');
    expect(hide.selector).toMatch(/ytp-caption-window-container/);
    expect(hide.selector).toMatch(/caption-window/);
  });
});

describe('YouTubeHandler watch-page detection', () => {
  it('accepts /watch, /live/ID and /shorts/ID but not listing pages', () => {
    const setPath = (pathname: string) =>
      Object.defineProperty(window, 'location', {
        value: { hostname: 'www.youtube.com', pathname },
        writable: true,
        configurable: true,
      });
    const handler = new YouTubeHandler();

    setPath('/watch');
    expect(handler.isWatchPage()).toBe(true);
    setPath('/live/abc123');
    expect(handler.isWatchPage()).toBe(true);
    setPath('/shorts/abc123');
    expect(handler.isWatchPage()).toBe(true);
    setPath('/results');
    expect(handler.isWatchPage()).toBe(false);
    setPath('/');
    expect(handler.isWatchPage()).toBe(false);
  });
});

describe('YouTubeHandler timedtext parsing', () => {
  it('parses real srv3 <p t d> bodies into cues and word events', () => {
    const handler = new YouTubeHandler();
    const srv3 =
      '<?xml version="1.0"?><timedtext format="3"><body>' +
      '<p t="1230" d="4560"><s t="0">Hello</s><s t="500">world</s></p>' +
      '</body></timedtext>';

    const cues = handler.transformResponse(
      srv3,
      'text/xml',
      'https://www.youtube.com/api/timedtext?v=x&lang=en&kind=asr&fmt=srv3',
    );
    expect(cues).toHaveLength(1);
    expect(cues[0]).toMatchObject({ startTime: 1.23, endTime: 5.79, text: 'Hello world' });

    expect(handler.parseWordEvents(srv3).map((w) => w.text)).toEqual(['Hello', 'world']);
  });

  it('still parses srv1 <text start dur> bodies', () => {
    const handler = new YouTubeHandler();
    const srv1 = '<transcript><text start="1" dur="2">Hi there</text></transcript>';
    const cues = handler.transformResponse(
      srv1,
      'text/xml',
      'https://www.youtube.com/api/timedtext?v=x&lang=en&fmt=srv1',
    );
    expect(cues).toHaveLength(1);
    expect(cues[0]).toMatchObject({ startTime: 1, endTime: 3, text: 'Hi there' });
  });
});
