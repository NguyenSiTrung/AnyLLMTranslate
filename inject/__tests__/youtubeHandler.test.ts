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
