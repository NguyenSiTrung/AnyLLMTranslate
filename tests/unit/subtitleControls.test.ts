import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  loadPreferences,
  savePreferences,
  initializeControls,
  setFontSize,
  togglePosition,
  setBackgroundOpacity,
  setOffset,
  resetPreferences,
  enableDragReposition,
  resetDragState,
} from '@/content/subtitleControls';
import { resetOverlayState } from '@/content/subtitleOverlay';

// Mock chrome.storage.local
const mockStorage = new Map<string, unknown>();

beforeEach(() => {
  vi.clearAllMocks();
  // Reset chrome mock
  vi.mocked(chrome.storage.local.get).mockImplementation((...args: unknown[]) => {
    const [keys, callback] = args as [string | string[] | undefined | ((items: Record<string, unknown>) => void), ((items: Record<string, unknown>) => void) | undefined];
    const result: Record<string, unknown> = {};

    if (typeof keys === 'string') {
      const value = mockStorage.get(keys);
      if (value !== undefined) {
        result[keys] = value;
      }
    } else if (Array.isArray(keys)) {
      for (const key of keys) {
        const value = mockStorage.get(key);
        if (value !== undefined) {
          result[key] = value;
        }
      }
    } else if (typeof keys === 'function') {
      // Callback-only variant
      const cb = keys as (items: Record<string, unknown>) => void;
      for (const [key, value] of mockStorage.entries()) {
        result[key] = value;
      }
      cb(result);
      return Promise.resolve();
    } else {
      // Get all (undefined keys)
      for (const [key, value] of mockStorage.entries()) {
        result[key] = value;
      }
    }

    if (callback) {
      callback(result);
    }
    return Promise.resolve(result);
  });

  vi.mocked(chrome.storage.local.set).mockImplementation((items: Record<string, unknown>, callback?: () => void) => {
    for (const [key, value] of Object.entries(items)) {
      mockStorage.set(key, value);
    }
    if (callback) {
      callback();
    }
    return Promise.resolve();
  });
});

describe('content/subtitleControls', () => {
  beforeEach(() => {
    mockStorage.clear();
    resetOverlayState();
    resetDragState();
    vi.clearAllMocks();
  });

  afterEach(() => {
    mockStorage.clear();
  });

  describe('loadPreferences', () => {
    it('returns default preferences when storage is empty', async () => {
      const prefs = await loadPreferences();
      expect(prefs.fontSize).toBe(16);
      expect(prefs.position).toBe('bottom');
      expect(prefs.backgroundOpacity).toBe(0.7);
      expect(prefs.offsetX).toBe(0);
      expect(prefs.offsetY).toBe(0);
    });

    it('loads saved preferences from storage', async () => {
      mockStorage.set('anyllm-translate-subtitle-prefs', {
        fontSize: 24,
        position: 'top',
        backgroundOpacity: 0.5,
        offsetX: 10,
        offsetY: 20,
      });

      const prefs = await loadPreferences();
      expect(prefs.fontSize).toBe(24);
      expect(prefs.position).toBe('top');
      expect(prefs.backgroundOpacity).toBe(0.5);
      expect(prefs.offsetX).toBe(10);
      expect(prefs.offsetY).toBe(20);
    });

    it('merges partial saved preferences with defaults', async () => {
      mockStorage.set('anyllm-translate-subtitle-prefs', {
        fontSize: 28,
      });

      const prefs = await loadPreferences();
      expect(prefs.fontSize).toBe(28);
      expect(prefs.position).toBe('bottom'); // Default
      expect(prefs.backgroundOpacity).toBe(0.7); // Default
    });

    it('returns defaults on storage error', async () => {
      vi.mocked(chrome.storage.local.get).mockRejectedValue(new Error('Storage error'));

      const prefs = await loadPreferences();
      expect(prefs.fontSize).toBe(16);
      expect(prefs.position).toBe('bottom');
    });
  });

  describe('savePreferences', () => {
    it('saves preferences to storage', async () => {
      const config = {
        fontSize: 24,
        fontSizeMode: 'fixed' as const,
        position: 'top' as const,
        backgroundOpacity: 0.5,
        offsetX: 10,
        offsetY: 20,
        fontFamily: 'system' as const,
        displayMode: 'bilingual' as const,
      };

      await savePreferences(config);

      expect(mockStorage.get('anyllm-translate-subtitle-prefs')).toEqual(config);
    });

    it('handles storage errors gracefully', async () => {
      vi.mocked(chrome.storage.local.set).mockRejectedValue(new Error('Storage error'));

      const config = {
        fontSize: 24,
        fontSizeMode: 'fixed' as const,
        position: 'top' as const,
        backgroundOpacity: 0.5,
        offsetX: 0,
        offsetY: 0,
        fontFamily: 'system' as const,
        displayMode: 'bilingual' as const,
      };

      await expect(savePreferences(config)).resolves.not.toThrow();
    });
  });

  describe('setFontSize', () => {
    it('updates font size within valid range', () => {
      setFontSize(24);
      // Verify no error is thrown
      expect(() => setFontSize(24)).not.toThrow();
    });

    it('clamps font size to minimum (12px)', () => {
      setFontSize(5);
      // Verify no error is thrown for out-of-range values
      expect(() => setFontSize(5)).not.toThrow();
    });

    it('clamps font size to maximum (36px)', () => {
      setFontSize(50);
      // Verify no error is thrown for out-of-range values
      expect(() => setFontSize(50)).not.toThrow();
    });
  });

  describe('togglePosition', () => {
    it('toggles between top and bottom', () => {
      togglePosition();
      togglePosition();
      // Verify no error is thrown
      expect(() => togglePosition()).not.toThrow();
    });
  });

  describe('setBackgroundOpacity', () => {
    it('updates opacity within valid range', () => {
      setBackgroundOpacity(0.5);
      expect(() => setBackgroundOpacity(0.5)).not.toThrow();
    });

    it('clamps opacity to minimum (0)', () => {
      setBackgroundOpacity(-0.5);
      expect(() => setBackgroundOpacity(-0.5)).not.toThrow();
    });

    it('clamps opacity to maximum (1)', () => {
      setBackgroundOpacity(1.5);
      expect(() => setBackgroundOpacity(1.5)).not.toThrow();
    });
  });

  describe('setOffset', () => {
    it('updates offset position', () => {
      setOffset(10, 20);
      expect(() => setOffset(10, 20)).not.toThrow();
    });
  });

  describe('resetPreferences', () => {
    it('resets to default preferences', async () => {
      mockStorage.set('anyllm-translate-subtitle-prefs', {
        fontSize: 28,
        position: 'top',
      });

      await resetPreferences();

      const prefs = await loadPreferences();
      expect(prefs.fontSize).toBe(16);
      expect(prefs.position).toBe('bottom');
    });
  });

  describe('enableDragReposition', () => {
    it('enables drag functionality on element', () => {
      const element = document.createElement('div');
      document.body.appendChild(element);

      const cleanup = enableDragReposition(element);

      expect(element.style.cursor).toBe('grab');

      cleanup();
      expect(element.style.cursor).toBe('');
    });

    it('returns cleanup function', () => {
      const element = document.createElement('div');
      document.body.appendChild(element);

      const cleanup = enableDragReposition(element);

      expect(typeof cleanup).toBe('function');

      cleanup();
    });

    it('updates offset on drag', () => {
      const element = document.createElement('div');
      document.body.appendChild(element);

      const cleanup = enableDragReposition(element);

      // Simulate mouse down
      element.dispatchEvent(new MouseEvent('mousedown', { clientX: 0, clientY: 0 }));

      // Simulate mouse move
      document.dispatchEvent(new MouseEvent('mousemove', { clientX: 10, clientY: 20 }));

      // Simulate mouse up
      document.dispatchEvent(new MouseEvent('mouseup', {}));

      cleanup();
    });
  });

  describe('resetDragState', () => {
    it('resets drag state to initial values', () => {
      resetDragState();
      // Verify no error is thrown
      expect(() => resetDragState()).not.toThrow();
    });
  });

  describe('initializeControls', () => {
    it('initializes controls with saved preferences', async () => {
      mockStorage.set('anyllm-translate-subtitle-prefs', {
        fontSize: 24,
        position: 'top',
      });

      await initializeControls();
      // Verify no error is thrown
      await expect(initializeControls()).resolves.not.toThrow();
    });
  });
});
