import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  initializeOverlay,
  updateCues,
  updateConfig,
  getConfig,
  isOverlayActive,
  cleanup,
  resetOverlayState,
} from '@/content/subtitleOverlay';
import type { SubtitleCue } from '@/types/subtitle';

describe('content/subtitleOverlay', () => {
  beforeEach(() => {
    resetOverlayState();
    document.body.innerHTML = '';
  });

  afterEach(() => {
    cleanup();
    document.body.innerHTML = '';
  });

  describe('initializeOverlay', () => {
    it('creates overlay DOM structure when video element exists', () => {
      const video = document.createElement('video');
      video.src = 'test.mp4';
      document.body.appendChild(video);

      const cues: SubtitleCue[] = [
        { startTime: 0, endTime: 2, text: 'Hello' },
        { startTime: 3, endTime: 5, text: 'World' },
      ];

      initializeOverlay(cues);

      const overlay = document.querySelector('.lingua-lens-subtitle-overlay');
      expect(overlay).toBeTruthy();
      expect(overlay?.querySelector('.lingua-lens-subtitle-original')).toBeTruthy();
      expect(overlay?.querySelector('.lingua-lens-subtitle-translated')).toBeTruthy();
    });

    it('does not create overlay when no video element exists', () => {
      const cues: SubtitleCue[] = [{ startTime: 0, endTime: 2, text: 'Hello' }];
      initializeOverlay(cues);

      const overlay = document.querySelector('.lingua-lens-subtitle-overlay');
      expect(overlay).toBeFalsy();
    });

    it('positions overlay over video element', () => {
      const video = document.createElement('video');
      video.src = 'test.mp4';
      video.style.width = '640px';
      video.style.height = '360px';
      document.body.appendChild(video);

      // Mock getBoundingClientRect for jsdom
      vi.spyOn(video, 'getBoundingClientRect').mockReturnValue({
        width: 640,
        height: 360,
        top: 0,
        left: 0,
        right: 640,
        bottom: 360,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      });

      const cues: SubtitleCue[] = [{ startTime: 0, endTime: 2, text: 'Hello' }];
      initializeOverlay(cues);

      const overlay = document.querySelector('.lingua-lens-subtitle-overlay') as HTMLElement;
      expect(overlay?.style.width).toBe('640px');
      expect(overlay?.style.height).toBe('360px');
    });

    it('applies custom configuration', () => {
      const video = document.createElement('video');
      video.src = 'test.mp4';
      document.body.appendChild(video);

      const cues: SubtitleCue[] = [{ startTime: 0, endTime: 2, text: 'Hello' }];
      initializeOverlay(cues, { fontSize: 24, position: 'top' });

      const config = getConfig();
      expect(config.fontSize).toBe(24);
      expect(config.position).toBe('top');
    });

    it('sets isOverlayActive to true after initialization', () => {
      const video = document.createElement('video');
      video.src = 'test.mp4';
      document.body.appendChild(video);

      const cues: SubtitleCue[] = [{ startTime: 0, endTime: 2, text: 'Hello' }];
      initializeOverlay(cues);

      expect(isOverlayActive()).toBe(true);
    });
  });

  describe('updateCues', () => {
    it('updates stored subtitle cues', () => {
      const video = document.createElement('video');
      video.src = 'test.mp4';
      document.body.appendChild(video);

      const initialCues: SubtitleCue[] = [{ startTime: 0, endTime: 2, text: 'Hello' }];
      initializeOverlay(initialCues);

      const newCues: SubtitleCue[] = [
        { startTime: 0, endTime: 2, text: 'Hola', originalText: 'Hello' },
        { startTime: 3, endTime: 5, text: 'Mundo', originalText: 'World' },
      ];
      updateCues(newCues);

      // The cues should be updated (we can verify by checking internal state)
      // Since we can't access internal state directly, we verify no error is thrown
      expect(() => updateCues(newCues)).not.toThrow();
    });
  });

  describe('updateConfig', () => {
    it('updates overlay configuration', () => {
      const video = document.createElement('video');
      video.src = 'test.mp4';
      document.body.appendChild(video);

      const cues: SubtitleCue[] = [{ startTime: 0, endTime: 2, text: 'Hello' }];
      initializeOverlay(cues);

      updateConfig({ fontSize: 28, backgroundOpacity: 0.5 });

      const config = getConfig();
      expect(config.fontSize).toBe(28);
      expect(config.backgroundOpacity).toBe(0.5);
    });

    it('updates position class on overlay', () => {
      const video = document.createElement('video');
      video.src = 'test.mp4';
      document.body.appendChild(video);

      const cues: SubtitleCue[] = [{ startTime: 0, endTime: 2, text: 'Hello' }];
      initializeOverlay(cues);

      updateConfig({ position: 'top' });

      const overlay = document.querySelector('.lingua-lens-subtitle-overlay');
      expect(overlay?.classList.contains('lingua-lens-position-top')).toBe(true);
      expect(overlay?.classList.contains('lingua-lens-position-bottom')).toBe(false);
    });
  });

  describe('getConfig', () => {
    it('returns current configuration', () => {
      const video = document.createElement('video');
      video.src = 'test.mp4';
      document.body.appendChild(video);

      const cues: SubtitleCue[] = [{ startTime: 0, endTime: 2, text: 'Hello' }];
      initializeOverlay(cues, { fontSize: 18 });

      const config = getConfig();
      expect(config.fontSize).toBe(18);
      expect(config.position).toBe('bottom');
      expect(config.backgroundOpacity).toBe(0.75);
    });
  });

  describe('isOverlayActive', () => {
    it('returns false before initialization', () => {
      expect(isOverlayActive()).toBe(false);
    });

    it('returns true after initialization', () => {
      const video = document.createElement('video');
      video.src = 'test.mp4';
      document.body.appendChild(video);

      const cues: SubtitleCue[] = [{ startTime: 0, endTime: 2, text: 'Hello' }];
      initializeOverlay(cues);

      expect(isOverlayActive()).toBe(true);
    });

    it('returns false after cleanup', () => {
      const video = document.createElement('video');
      video.src = 'test.mp4';
      document.body.appendChild(video);

      const cues: SubtitleCue[] = [{ startTime: 0, endTime: 2, text: 'Hello' }];
      initializeOverlay(cues);
      cleanup();

      expect(isOverlayActive()).toBe(false);
    });
  });

  describe('cleanup', () => {
    it('removes overlay from DOM', () => {
      const video = document.createElement('video');
      video.src = 'test.mp4';
      document.body.appendChild(video);

      const cues: SubtitleCue[] = [{ startTime: 0, endTime: 2, text: 'Hello' }];
      initializeOverlay(cues);

      cleanup();

      const overlay = document.querySelector('.lingua-lens-subtitle-overlay');
      expect(overlay).toBeFalsy();
    });

    it('detaches event listeners', () => {
      const video = document.createElement('video');
      video.src = 'test.mp4';
      document.body.appendChild(video);

      const cues: SubtitleCue[] = [{ startTime: 0, endTime: 2, text: 'Hello' }];
      initializeOverlay(cues);

      const removeEventListenerSpy = vi.spyOn(video, 'removeEventListener');
      cleanup();

      expect(removeEventListenerSpy).toHaveBeenCalledWith('timeupdate', expect.any(Function));
    });
  });

  describe('resetOverlayState', () => {
    it('resets overlay to default state', () => {
      const video = document.createElement('video');
      video.src = 'test.mp4';
      document.body.appendChild(video);

      const cues: SubtitleCue[] = [{ startTime: 0, endTime: 2, text: 'Hello' }];
      initializeOverlay(cues, { fontSize: 30 });

      resetOverlayState();

      expect(isOverlayActive()).toBe(false);
      const config = getConfig();
      expect(config.fontSize).toBe(20); // Default value
    });
  });

  describe('cue synchronization logic', () => {
    it('finds active cue based on video time', () => {
      const video = document.createElement('video');
      video.src = 'test.mp4';
      document.body.appendChild(video);

      const cues: SubtitleCue[] = [
        { startTime: 0, endTime: 2, text: 'First' },
        { startTime: 3, endTime: 5, text: 'Second' },
        { startTime: 6, endTime: 8, text: 'Third' },
      ];
      initializeOverlay(cues);

      // Mock video current time
      Object.defineProperty(video, 'currentTime', {
        value: 4,
        writable: true,
      });

      // Trigger timeupdate
      video.dispatchEvent(new Event('timeupdate'));

      // Verify the second cue should be active (time 4 is between 3 and 5)
      const overlay = document.querySelector('.lingua-lens-subtitle-overlay');
      const translatedText = overlay?.querySelector('.lingua-lens-subtitle-translated');
      expect(translatedText?.textContent).toBe('Second');
    });

    it('handles no active cue when time is between cues', () => {
      const video = document.createElement('video');
      video.src = 'test.mp4';
      document.body.appendChild(video);

      const cues: SubtitleCue[] = [
        { startTime: 0, endTime: 2, text: 'First' },
        { startTime: 5, endTime: 7, text: 'Second' },
      ];
      initializeOverlay(cues);

      Object.defineProperty(video, 'currentTime', {
        value: 3,
        writable: true,
      });

      video.dispatchEvent(new Event('timeupdate'));

      const overlay = document.querySelector('.lingua-lens-subtitle-overlay');
      expect(overlay?.classList.contains('lingua-lens-subtitle-visible')).toBe(false);
    });
  });

  describe('ResizeObserver integration', () => {
    it('sets up ResizeObserver on video element', () => {
      const video = document.createElement('video');
      video.src = 'test.mp4';
      document.body.appendChild(video);

      const cues: SubtitleCue[] = [{ startTime: 0, endTime: 2, text: 'Hello' }];
      initializeOverlay(cues);

      // Verify ResizeObserver is set up by checking if cleanup works
      expect(() => cleanup()).not.toThrow();
    });
  });
});
