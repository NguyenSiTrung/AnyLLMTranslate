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

const mockStorage = new Map<string, unknown>();

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(chrome.storage.local.get).mockImplementation((...args: unknown[]) => {
    const [keys, callback] = args as [
      string | string[] | undefined | ((items: Record<string, unknown>) => void),
      ((items: Record<string, unknown>) => void) | undefined,
    ];
    const result: Record<string, unknown> = {};

    if (typeof keys === 'string') {
      const value = mockStorage.get(keys);
      if (value !== undefined) result[keys] = value;
    } else if (Array.isArray(keys)) {
      for (const key of keys) {
        const value = mockStorage.get(key);
        if (value !== undefined) result[key] = value;
      }
    } else if (typeof keys === 'function') {
      const cb = keys as (items: Record<string, unknown>) => void;
      for (const [key, value] of mockStorage.entries()) result[key] = value;
      cb(result);
      return Promise.resolve();
    } else {
      for (const [key, value] of mockStorage.entries()) result[key] = value;
    }

    if (callback) callback(result);
    return Promise.resolve(result);
  });

  vi.mocked(chrome.storage.local.set).mockImplementation(
    (items: Record<string, unknown>, callback?: () => void) => {
      for (const [key, value] of Object.entries(items)) mockStorage.set(key, value);
      if (callback) callback();
      return Promise.resolve();
    },
  );
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

  it('loads defaults, saved prefs, partial merge, and storage errors', async () => {
    let prefs = await loadPreferences();
    expect(prefs).toMatchObject({
      fontSize: 16,
      position: 'bottom',
      backgroundOpacity: 0.7,
      offsetX: 0,
      offsetY: 0,
    });

    mockStorage.set('anyllm-translate-subtitle-prefs', {
      fontSize: 24,
      position: 'top',
      backgroundOpacity: 0.5,
      offsetX: 10,
      offsetY: 20,
    });
    prefs = await loadPreferences();
    expect(prefs.fontSize).toBe(24);
    expect(prefs.position).toBe('top');

    mockStorage.set('anyllm-translate-subtitle-prefs', { fontSize: 28 });
    prefs = await loadPreferences();
    expect(prefs.fontSize).toBe(28);
    expect(prefs.position).toBe('bottom');

    vi.mocked(chrome.storage.local.get).mockRejectedValue(new Error('Storage error'));
    prefs = await loadPreferences();
    expect(prefs.fontSize).toBe(16);
  });

  it('saves preferences and swallows storage errors', async () => {
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

    vi.mocked(chrome.storage.local.set).mockRejectedValue(new Error('Storage error'));
    await expect(savePreferences(config)).resolves.not.toThrow();
  });

  it('mutators and reset do not throw; reset restores defaults', async () => {
    expect(() => setFontSize(24)).not.toThrow();
    expect(() => setFontSize(5)).not.toThrow();
    expect(() => togglePosition()).not.toThrow();
    expect(() => setBackgroundOpacity(0.5)).not.toThrow();
    expect(() => setBackgroundOpacity(-0.5)).not.toThrow();
    expect(() => setOffset(10, 20)).not.toThrow();
    expect(() => resetDragState()).not.toThrow();

    mockStorage.set('anyllm-translate-subtitle-prefs', { fontSize: 28, position: 'top' });
    await resetPreferences();
    const prefs = await loadPreferences();
    expect(prefs.fontSize).toBe(16);
    expect(prefs.position).toBe('bottom');
  });

  it('enableDragReposition sets cursor and cleans up; initializeControls loads prefs', async () => {
    const element = document.createElement('div');
    document.body.appendChild(element);
    const cleanup = enableDragReposition(element);
    expect(element.style.cursor).toBe('grab');
    element.dispatchEvent(new MouseEvent('mousedown', { clientX: 0, clientY: 0 }));
    document.dispatchEvent(new MouseEvent('mousemove', { clientX: 10, clientY: 20 }));
    document.dispatchEvent(new MouseEvent('mouseup', {}));
    cleanup();
    expect(element.style.cursor).toBe('');

    mockStorage.set('anyllm-translate-subtitle-prefs', { fontSize: 24, position: 'top' });
    await expect(initializeControls()).resolves.not.toThrow();
  });
});
