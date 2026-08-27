/**
 * Tests for subtitleControls — drag offset persistence.
 *
 * Drag offsets must be scoped per hostname: an offset tuned on one site's
 * large player must not be applied on another site's smaller player (it can
 * park the overlay off the video with nothing left to grab — reported on
 * Udemy). Style preferences (font size, position, opacity) stay global.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// ============================================================================
// chrome.storage.local mock — a simple in-memory Map honoring array-form get
// ============================================================================

const storageData = new Map<string, unknown>();
const storageGet = vi.fn(async (keys: string | string[]) => {
  const keyList = Array.isArray(keys) ? keys : [keys];
  const out: Record<string, unknown> = {};
  for (const key of keyList) {
    if (storageData.has(key)) out[key] = storageData.get(key);
  }
  return out;
});
const storageSet = vi.fn(async (items: Record<string, unknown>) => {
  for (const [key, value] of Object.entries(items)) storageData.set(key, value);
});
vi.stubGlobal('chrome', {
  storage: { local: { get: storageGet, set: storageSet } },
});

import {
  loadPreferences,
  savePreferences,
  setOffset,
  setFontSize,
} from '@/content/subtitleControls';

function setHostname(hostname: string): void {
  Object.defineProperty(window, 'location', {
    value: { hostname, href: `https://${hostname}/learn/lecture/1` },
    writable: true,
    configurable: true,
  });
}

beforeEach(() => {
  storageData.clear();
  storageGet.mockClear();
  storageSet.mockClear();
  setHostname('www.udemy.com');
});

afterEach(() => {
  setHostname('localhost');
});

describe('subtitleControls — per-host drag offsets', () => {
  it('stores drag offsets per hostname and does not leak them across sites', async () => {
    setOffset(120, -60);
    await vi.waitFor(() => {
      const map = storageData.get('anyllm-translate-subtitle-offsets') as
        | Record<string, { offsetX: number }>
        | undefined;
      expect(map?.['www.udemy.com']?.offsetX).toBe(120);
    });

    // Same host reload: offset restored.
    const onUdemy = await loadPreferences();
    expect(onUdemy.offsetX).toBe(120);
    expect(onUdemy.offsetY).toBe(-60);

    // Different host: no offset applied.
    setHostname('www.youtube.com');
    const onYoutube = await loadPreferences();
    expect(onYoutube.offsetX).toBe(0);
    expect(onYoutube.offsetY).toBe(0);

    // Each host evolves independently.
    setOffset(-40, 30);
    await vi.waitFor(() => {
      const map = storageData.get('anyllm-translate-subtitle-offsets') as
        | Record<string, { offsetX: number }>
        | undefined;
      expect(map?.['www.youtube.com']?.offsetX).toBe(-40);
    });
    setHostname('www.udemy.com');
    const udemyAgain = await loadPreferences();
    expect(udemyAgain.offsetX).toBe(120);
    expect(udemyAgain.offsetY).toBe(-60);
  });

  it('ignores legacy cross-site offsets stored in the shared prefs blob', async () => {
    // Simulate an old-version write: offsets inside the global blob.
    await savePreferences({
      fontSize: 16,
      fontSizeMode: 'fixed',
      position: 'bottom',
      backgroundOpacity: 0.7,
      offsetX: 999,
      offsetY: -999,
      fontFamily: 'system',
      textColor: 'rgba(255,255,255,1)',
      originalTextColor: 'rgba(255,255,255,0.6)',
      backgroundColor: '0,0,0',
      borderRadius: 8,
      textShadow: '0 1px 3px rgba(0,0,0,0.5)',
      displayMode: 'bilingual',
    });

    const prefs = await loadPreferences();
    expect(prefs.offsetX).toBe(0);
    expect(prefs.offsetY).toBe(0);
    // Style fields from the blob still load globally.
    expect(prefs.fontSize).toBe(16);
  });

  it('keeps style preferences global across hosts', async () => {
    setHostname('www.youtube.com');
    setFontSize(24);
    await vi.waitFor(() => expect(storageSet).toHaveBeenCalled());

    setHostname('www.udemy.com');
    const prefs = await loadPreferences();
    expect(prefs.fontSize).toBe(24);
  });
});
