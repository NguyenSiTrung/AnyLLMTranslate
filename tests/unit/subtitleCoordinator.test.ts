// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  startCoordinator,
  updateTranslatedCues,
  forceOverlayMode,
  isInOverlayMode,
  resetCoordinatorState,
  clearPendingRequest,
  isOnWatchPage,
  tryAutoActivateForDom,
} from '@/content/subtitleCoordinator';
import * as handlerRegistry from '@/inject/subtitleHandlers/registry';
import { resetOverlayState } from '@/content/subtitleOverlay';
import type { SubtitleCue } from '@/types/subtitle';
import * as subtitleOverlay from '@/content/subtitleOverlay';
import * as subtitleParser from '@/lib/subtitleParser';

vi.mock('@/content/messageBridge', () => ({
  onSubtitleIntercepted: vi.fn(() => vi.fn()),
  onTracksDiscovered: vi.fn(() => vi.fn()),
  onDomCues: vi.fn(() => vi.fn()),
  onDomTrackChanged: vi.fn(() => vi.fn()),
  onTextTrackCues: vi.fn(() => vi.fn()),
  onMseCues: vi.fn(() => vi.fn()),
  onManifestCues: vi.fn(() => vi.fn()),
  onMpdProcessing: () => () => {},
  sendTranslatedSubtitle: vi.fn(),
}));

vi.mock('@/inject/messageBridge', () => ({
  onMessage: vi.fn(() => vi.fn()),
}));

vi.mock('@/content/subtitleOverlay', () => ({
  initializeOverlay: vi.fn(),
  updateCues: vi.fn(),
  isOverlayActive: vi.fn(() => false),
  cleanup: vi.fn(),
  resetOverlayState: vi.fn(),
  getOverlayTextContainer: vi.fn(() => document.createElement('div')),
}));

vi.mock('@/content/subtitleControls', () => ({
  initializeControls: vi.fn(() => Promise.resolve({})),
  enableDragReposition: vi.fn(() => vi.fn()),
}));

vi.mock('@/lib/subtitleParser', () => ({
  parseSubtitles: vi.fn(() => []),
}));

vi.mock('@/inject/subtitleHandlers/registry', () => ({
  getHandlerByPlatform: vi.fn(() => ({
    transformResponse: vi.fn(() => [{ startTime: 0, endTime: 4, text: 'Test' }]),
  })),
  detectCurrentHandler: vi.fn(() => null),
}));

describe('subtitleCoordinator unit tests (Watch page, DOM, Manifest, Overlay)', () => {
  beforeEach(() => {
    resetCoordinatorState();
    resetOverlayState();
    vi.clearAllMocks();
    vi.useFakeTimers();

    global.fetch = vi.fn(() =>
      Promise.resolve({
        ok: true,
        text: () => Promise.resolve('WEBVTT\n\n1\n00:00:01.000 --> 00:00:04.000\nSubtitle line'),
      } as Response),
    );

    global.chrome = {
      runtime: {
        sendMessage: vi.fn().mockResolvedValue({ success: true }),
        onMessage: { addListener: vi.fn(), removeListener: vi.fn() },
      },
      storage: {
        local: { get: vi.fn().mockResolvedValue({}), set: vi.fn() },
      },
    } as unknown as typeof chrome;

    Object.defineProperty(window, 'location', {
      value: { hostname: 'www.youtube.com', pathname: '/watch', href: 'https://www.youtube.com/watch?v=test' },
      writable: true,
      configurable: true,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it.each([
    ['www.youtube.com', '/watch', true],
    ['www.max.com', '/video/watch/123', true],
    ['www.max.com', '/browse', false],
    ['www.linkedin.com', '/learning/course', true],
    ['www.linkedin.com', '/feed/', false],
  ])('evaluates watch page for %s %s correctly', (hostname, pathname, expected) => {
    Object.defineProperty(window, 'location', {
      value: { hostname, pathname, href: `https://${hostname}${pathname}` },
      writable: true,
      configurable: true,
    });
    const isWatch = isOnWatchPage();
    expect(isWatch).toBe(expected);
  });

  it('handles overlay updates, force overlay mode, and clearPendingRequest', async () => {
    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const cues: SubtitleCue[] = [{ startTime: 0, endTime: 4, text: 'Test' }];
    updateTranslatedCues(cues);
    expect(consoleSpy).toHaveBeenCalledWith('AnyLLMTranslate: Cannot update cues - not in overlay mode');
    consoleSpy.mockRestore();

    vi.mocked(subtitleParser.parseSubtitles).mockReturnValue([{ startTime: 0, endTime: 4, text: 'Test' }]);
    await forceOverlayMode('http://example.com/subs.vtt');
    expect(isInOverlayMode()).toBe(true);

    expect(() => clearPendingRequest('nonexistent-id')).not.toThrow();
  });

  it('evaluates DOM auto-activation and play-triggered activation rules', async () => {
    const result = await tryAutoActivateForDom();
    expect(result).toBeDefined();

    startCoordinator();
    const video = document.createElement('video');
    document.body.appendChild(video);
    video.dispatchEvent(new Event('play'));
    resetCoordinatorState();
    document.body.removeChild(video);
  });
});
