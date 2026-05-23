import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  startCoordinator,
  updateTranslatedCues,
  forceOverlayMode,
  isInOverlayMode,
  resetCoordinatorState,
  clearPendingRequest,
} from '@/content/subtitleCoordinator';
import { resetOverlayState } from '@/content/subtitleOverlay';
import { loadSettings } from '@/lib/config';
import type { SubtitleCue } from '@/types/subtitle';
import * as messageBridge from '@/content/messageBridge';
import * as subtitleOverlay from '@/content/subtitleOverlay';
import * as subtitleParser from '@/lib/subtitleParser';

// Mock dependencies
vi.mock('@/content/messageBridge', () => ({
  onSubtitleIntercepted: vi.fn(() => vi.fn()),
  onTracksDiscovered: vi.fn(() => vi.fn()),
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
  getOverlayTextContainer: vi.fn(() => null),
}));

vi.mock('@/content/subtitleControls', () => ({
  initializeControls: vi.fn(() => Promise.resolve()),
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

describe('content/subtitleCoordinator', () => {
  beforeEach(() => {
    resetCoordinatorState();
    resetOverlayState();
    vi.clearAllMocks();
    vi.useFakeTimers();

    // Mock global.fetch to succeed by default
    global.fetch = vi.fn(() =>
      Promise.resolve({
        ok: true,
        text: () => Promise.resolve('WEBVTT\n\n1\n00:00:01.000 --> 00:00:04.000\nLinkedIn subtitle line'),
      } as Response),
    );

    // Simulate a YouTube watch page so isOnWatchPage() returns true in handleIntercepted tests
    Object.defineProperty(window, 'location', {
      value: { hostname: 'www.youtube.com', pathname: '/watch', href: 'https://www.youtube.com/watch?v=test' },
      writable: true,
      configurable: true,
    });

    global.chrome = {
      runtime: {
        sendMessage: vi.fn((message, _sender, sendResponse) => {
          let cb = sendResponse;
          // In some chrome environments, if there's no sender, it's the second argument
          if (typeof _sender === 'function') {
            cb = _sender;
          }
          if (cb) {
            if (message.type === 'FETCH_SUBTITLE') {
               cb({ error: 'Background fetch failed' }); // simulate failure
            } else {
               cb({ success: true, cues: [] });
            }
            return;
          }
          return Promise.resolve({ success: true, cues: [] });
        }),
        onMessage: {
          addListener: vi.fn(),
          removeListener: vi.fn(),
        },
      },
      storage: {
        local: {
          get: vi.fn().mockResolvedValue({
            'anyllm-translate-settings': {
              enableContextAwareTranslation: true,
              subtitleSettings: {
                enabled: true,
                autoActivateSubtitles: true,
                preferredSubtitleLanguage: 'en',
              },
            },
          }),
          set: vi.fn().mockResolvedValue(undefined),
        },
      },
    } as unknown as typeof chrome;
  });


  afterEach(() => {
    vi.useRealTimers();
  });

  describe('startCoordinator', () => {
    it('starts the coordinator and returns cleanup function', () => {
      const cleanup = startCoordinator();
      expect(typeof cleanup).toBe('function');
      cleanup();
    });

    it('listens for subtitle interception events', () => {
      startCoordinator();
      expect(vi.mocked(messageBridge.onSubtitleIntercepted)).toHaveBeenCalled();
    });

    it('clears pending timeouts on cleanup', () => {
      const cleanup = startCoordinator();
      cleanup();
      // Verify no error is thrown
      expect(() => cleanup()).not.toThrow();
    });
  });

  describe('updateTranslatedCues', () => {
    it('updates cues when in overlay mode', async () => {
      vi.mocked(subtitleParser.parseSubtitles).mockReturnValue([{ startTime: 0, endTime: 4, text: 'Test' }]);
      await forceOverlayMode('http://example.com/subs.vtt', 'WEBVTT\n\n1\n00:00:01.000 --> 00:00:04.000\nTest');

      const cues: SubtitleCue[] = [{ startTime: 0, endTime: 4, text: 'Translated' }];
      updateTranslatedCues(cues);

      expect(vi.mocked(subtitleOverlay.updateCues)).toHaveBeenCalledWith(cues);
    });

    it('logs warning when not in overlay mode', () => {
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const cues: SubtitleCue[] = [{ startTime: 0, endTime: 4, text: 'Test' }];
      updateTranslatedCues(cues);
      expect(consoleSpy).toHaveBeenCalledWith('AnyLLMTranslate: Cannot update cues - not in overlay mode');
      consoleSpy.mockRestore();
    });
  });

  describe('forceOverlayMode', () => {
    it('activates overlay mode with provided content', async () => {
      vi.mocked(subtitleParser.parseSubtitles).mockReturnValue([{ startTime: 0, endTime: 4, text: 'Test' }]);

      await forceOverlayMode('http://example.com/subs.vtt', 'WEBVTT\n\n1\n00:00:01.000 --> 00:00:04.000\nTest');

      expect(isInOverlayMode()).toBe(true);
      expect(vi.mocked(subtitleOverlay.initializeOverlay)).toHaveBeenCalled();
    });

    it('fetches content if not provided', async () => {
      vi.mocked(subtitleParser.parseSubtitles).mockReturnValue([{ startTime: 0, endTime: 4, text: 'Test' }]);

      // Mock fetch
      global.fetch = vi.fn(() =>
        Promise.resolve({
          ok: true,
          text: () => Promise.resolve('WEBVTT\n\n1\n00:00:01.000 --> 00:00:04.000\nTest'),
        } as Response),
      );

      await forceOverlayMode('http://example.com/subs.vtt');

      expect(isInOverlayMode()).toBe(true);
    });

    it('handles fetch errors gracefully', async () => {
      // Mock fetch to fail
      global.fetch = vi.fn(() => Promise.reject(new Error('Network error')));

      await expect(forceOverlayMode('http://example.com/subs.vtt')).resolves.not.toThrow();
    });
  });

  describe('isInOverlayMode', () => {
    it('returns false by default', () => {
      expect(isInOverlayMode()).toBe(false);
    });

    it('returns true after activation', async () => {
      vi.mocked(subtitleParser.parseSubtitles).mockReturnValue([{ startTime: 0, endTime: 4, text: 'Test' }]);

      await forceOverlayMode('http://example.com/subs.vtt', 'WEBVTT\n\n1\n00:00:01.000 --> 00:00:04.000\nTest');

      expect(isInOverlayMode()).toBe(true);
    });
  });

  describe('resetCoordinatorState', () => {
    it('resets coordinator to initial state', async () => {
      vi.mocked(subtitleParser.parseSubtitles).mockReturnValue([{ startTime: 0, endTime: 4, text: 'Test' }]);

      await forceOverlayMode('http://example.com/subs.vtt', 'WEBVTT\n\n1\n00:00:01.000 --> 00:00:04.000\nTest');
      expect(isInOverlayMode()).toBe(true);

      resetCoordinatorState();
      expect(isInOverlayMode()).toBe(false);
    });
  });

  describe('immediate overlay activation', () => {
    it('activates overlay mode immediately upon interception', async () => {
      vi.mocked(subtitleParser.parseSubtitles).mockReturnValue([{ startTime: 0, endTime: 4, text: 'Test' }]);
      vi.mocked(subtitleOverlay.isOverlayActive).mockReturnValue(false);

      startCoordinator();

      const handler = vi.mocked(messageBridge.onSubtitleIntercepted).mock.calls[0]?.[0];
      if (!handler) {
        throw new Error('Handler not found');
      }

      await handler(
        {
          url: 'http://example.com/subs.vtt',
          contentType: 'text/vtt',
          body: 'WEBVTT\n\n1\n00:00:01.000 --> 00:00:04.000\nTest',
          platform: 'test',
          originalLanguage: 'en',
        },
        'test-request-id',
      );

      // Verify immediate initialization
      expect(vi.mocked(subtitleOverlay.initializeOverlay)).toHaveBeenCalled();
      expect(isInOverlayMode()).toBe(true);
    });

    it('clearPendingRequest does not throw for unknown requestId', () => {
      expect(() => clearPendingRequest('nonexistent-id')).not.toThrow();
    });
  });

  describe('play-triggered auto-activate', () => {
    it('does NOT auto-activate on track discovery alone — no LLM call without play', async () => {
      startCoordinator();

      const tracksHandler = vi.mocked(messageBridge.onTracksDiscovered).mock.calls[0]?.[0];
      if (!tracksHandler) throw new Error('tracksHandler not registered');

      // Call handler, then flush the 150ms debounce timer
      const handlerPromise = tracksHandler({
        platform: 'youtube',
        tracks: [{ language: 'en', label: 'English', isAutoGenerated: false, platform: 'youtube', url: 'https://example.com/subs.vtt', videoId: 'abc' }],
      });
      vi.advanceTimersByTime(200);
      await handlerPromise;

      // Overlay must NOT be initialized — videoIsPlaying is still false
      expect(vi.mocked(subtitleOverlay.initializeOverlay)).not.toHaveBeenCalled();
    });


    it('resets videoIsPlaying to false on resetCoordinatorState (SPA navigation)', async () => {
      startCoordinator();

      // Simulate video play via a real video element
      const video = document.createElement('video');
      document.body.appendChild(video);
      video.dispatchEvent(new Event('play'));

      // After reset, state should clear
      resetCoordinatorState();

      // A second play event should be a fresh activation attempt
      // (no-op here since no tracks, but should not throw)
      video.dispatchEvent(new Event('play'));
      document.body.removeChild(video);

      expect(() => resetCoordinatorState()).not.toThrow();
    });

    it('auto-activates on linkedin.com/learning watch page when play event occurs', async () => {
      // Mock location to linkedin.com/learning
      Object.defineProperty(window, 'location', {
        value: { hostname: 'www.linkedin.com', pathname: '/learning/some-course-slug' },
        writable: true,
        configurable: true,
      });

      startCoordinator();

      // Trigger track discovery
      const tracksHandler = vi.mocked(messageBridge.onTracksDiscovered).mock.calls[0]?.[0];
      if (!tracksHandler) throw new Error('tracksHandler not registered');
      const handlerPromise = tracksHandler({
        platform: 'linkedin',
        tracks: [{ language: 'en', label: 'English', isAutoGenerated: false, platform: 'linkedin', url: 'https://example.com/subs.vtt', videoId: 'abc' }],
      });
      vi.advanceTimersByTime(200);
      await handlerPromise;

      // Simulate play event
      const video = document.createElement('video');
      document.body.appendChild(video);
      
      // Flush MutationObserver microtasks so play listener attaches
      await Promise.resolve();

      video.dispatchEvent(new Event('play'));
      
      // Wait for async checks / promises to resolve under fake timers
      await vi.runOnlyPendingTimersAsync();

      expect(vi.mocked(subtitleOverlay.initializeOverlay)).toHaveBeenCalled();
      document.body.removeChild(video);
    });

    it('does NOT auto-activate on general linkedin.com non-watch page', async () => {
      // Mock location to linkedin.com feed
      Object.defineProperty(window, 'location', {
        value: { hostname: 'www.linkedin.com', pathname: '/feed/' },
        writable: true,
        configurable: true,
      });

      startCoordinator();

      // Trigger track discovery
      const tracksHandler = vi.mocked(messageBridge.onTracksDiscovered).mock.calls[0]?.[0];
      if (!tracksHandler) throw new Error('tracksHandler not registered');
      const handlerPromise = tracksHandler({
        platform: 'linkedin',
        tracks: [{ language: 'en', label: 'English', isAutoGenerated: false, platform: 'linkedin', url: 'https://example.com/subs.vtt', videoId: 'abc' }],
      });
      vi.advanceTimersByTime(200);
      await handlerPromise;

      // Simulate play event
      const video = document.createElement('video');
      document.body.appendChild(video);

      // Flush MutationObserver microtasks so play listener attaches
      await Promise.resolve();

      video.dispatchEvent(new Event('play'));
      
      // Wait for async checks / promises to resolve under fake timers
      await vi.runOnlyPendingTimersAsync();

      expect(vi.mocked(subtitleOverlay.initializeOverlay)).not.toHaveBeenCalled();
      document.body.removeChild(video);
    });
  });
});
