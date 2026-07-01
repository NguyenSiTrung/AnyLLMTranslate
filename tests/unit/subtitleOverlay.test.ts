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

      const overlay = document.querySelector('.anyllm-translate-subtitle-overlay');
      expect(overlay).toBeTruthy();
      expect(overlay?.querySelector('.anyllm-translate-subtitle-original')).toBeTruthy();
      expect(overlay?.querySelector('.anyllm-translate-subtitle-translated')).toBeTruthy();
    });

    it('does not create overlay when no video element exists', () => {
      const cues: SubtitleCue[] = [{ startTime: 0, endTime: 2, text: 'Hello' }];
      initializeOverlay(cues);

      const overlay = document.querySelector('.anyllm-translate-subtitle-overlay');
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

      const overlay = document.querySelector('.anyllm-translate-subtitle-overlay') as HTMLElement;
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

      const overlay = document.querySelector('.anyllm-translate-subtitle-overlay');
      expect(overlay?.classList.contains('anyllm-translate-position-top')).toBe(true);
      expect(overlay?.classList.contains('anyllm-translate-position-bottom')).toBe(false);
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

      const overlay = document.querySelector('.anyllm-translate-subtitle-overlay');
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

  describe('updateCues', () => {
    it('refreshes displayed text when the same cue array is mutated in place', () => {
      const video = document.createElement('video');
      video.src = 'test.mp4';
      document.body.appendChild(video);

      const cues: SubtitleCue[] = [
        { startTime: 0, endTime: 4, text: 'Hello', originalText: 'Hello' },
      ];
      initializeOverlay(cues, {}, video);

      Object.defineProperty(video, 'currentTime', { configurable: true, get: () => 1 });
      video.dispatchEvent(new Event('timeupdate'));

      const translatedEl = () =>
        document.querySelector('.anyllm-translate-subtitle-translated') as HTMLElement;
      expect(translatedEl()?.textContent).toBe('Hello');

      cues[0].text = 'Xin chào';
      updateCues(cues);

      expect(translatedEl()?.textContent).toBe('Xin chào');
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
      const overlay = document.querySelector('.anyllm-translate-subtitle-overlay');
      const translatedText = overlay?.querySelector('.anyllm-translate-subtitle-translated');
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

      const overlay = document.querySelector('.anyllm-translate-subtitle-overlay');
      expect(overlay?.classList.contains('anyllm-translate-subtitle-visible')).toBe(false);
    });
  });

  describe('video targeting', () => {
    it('uses provided videoNode instead of querying DOM', () => {
      // Add two videos to DOM
      const video1 = document.createElement('video');
      video1.src = 'video1.mp4';
      video1.id = 'first';
      document.body.appendChild(video1);

      const video2 = document.createElement('video');
      video2.src = 'video2.mp4';
      video2.id = 'second';
      document.body.appendChild(video2);

      const cues: SubtitleCue[] = [{ startTime: 0, endTime: 2, text: 'Hello' }];

      // Pass video2 explicitly — overlay should attach to it, not video1
      initializeOverlay(cues, undefined, video2);

      expect(isOverlayActive()).toBe(true);

      // Verify by triggering timeupdate on video2 (not video1)
      Object.defineProperty(video2, 'currentTime', { value: 1, writable: true });
      video2.dispatchEvent(new Event('timeupdate'));

      const overlay = document.querySelector('.anyllm-translate-subtitle-overlay');
      const translatedText = overlay?.querySelector('.anyllm-translate-subtitle-translated');
      expect(translatedText?.textContent).toBe('Hello');
    });

    it('falls back to first video when no videoNode provided', () => {
      const video = document.createElement('video');
      video.src = 'test.mp4';
      document.body.appendChild(video);

      const cues: SubtitleCue[] = [{ startTime: 0, endTime: 2, text: 'Hello' }];
      initializeOverlay(cues);

      expect(isOverlayActive()).toBe(true);
    });
  });
});
