import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  startCoordinator,
  updateTranslatedCues,
  forceOverlayMode,
  isInOverlayMode,
  resetCoordinatorState,
} from '@/content/subtitleCoordinator';
import { resetOverlayState } from '@/content/subtitleOverlay';
import type { SubtitleCue } from '@/types/subtitle';
import * as messageBridge from '@/content/messageBridge';
import * as subtitleOverlay from '@/content/subtitleOverlay';
import * as subtitleParser from '@/lib/subtitleParser';

// Mock dependencies
vi.mock('@/content/messageBridge', () => ({
  onSubtitleIntercepted: vi.fn(() => vi.fn()),
}));

vi.mock('@/content/subtitleOverlay', () => ({
  initializeOverlay: vi.fn(),
  updateCues: vi.fn(),
  isOverlayActive: vi.fn(() => false),
  cleanup: vi.fn(),
  resetOverlayState: vi.fn(),
}));

vi.mock('@/content/subtitleControls', () => ({
  initializeControls: vi.fn(() => Promise.resolve()),
}));

vi.mock('@/lib/subtitleParser', () => ({
  parseSubtitles: vi.fn(() => []),
}));

describe('content/subtitleCoordinator', () => {
  beforeEach(() => {
    resetCoordinatorState();
    resetOverlayState();
    vi.clearAllMocks();
    vi.useFakeTimers();
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
      expect(consoleSpy).toHaveBeenCalledWith('LinguaLens: Cannot update cues - not in overlay mode');
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

  describe('interception timeout', () => {
    it('activates overlay mode on timeout', async () => {
      vi.mocked(subtitleParser.parseSubtitles).mockReturnValue([{ startTime: 0, endTime: 4, text: 'Test' }]);

      startCoordinator();

      // Get the handler that was registered
      const handler = vi.mocked(messageBridge.onSubtitleIntercepted).mock.calls[0]?.[0];

      if (!handler) {
        throw new Error('Handler not found');
      }

      // Trigger interception
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

      // Fast-forward past timeout
      vi.advanceTimersByTime(6000);

      expect(isInOverlayMode()).toBe(true);
    });
  });
});
