/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const loadSettings = vi.fn();
const updateSettings = vi.fn();
const updateConfig = vi.fn();
const isInOverlayMode = vi.fn();
const applySubtitleKnobOverride = vi.fn();
const getSubtitleKnobOverride = vi.fn(() => ({}));
const detectCurrentHandler = vi.fn();

vi.mock('@/lib/config', () => ({
  loadSettings: (...a: unknown[]) => loadSettings(...a),
  updateSettings: (...a: unknown[]) => updateSettings(...a),
}));

vi.mock('@/content/subtitleOverlay', () => ({
  updateConfig: (...a: unknown[]) => updateConfig(...a),
  getConfig: () => ({
    fontSize: 20,
    position: 'bottom',
    backgroundOpacity: 0.75,
    displayMode: 'bilingual',
  }),
}));

vi.mock('@/content/subtitleCoordinator', () => ({
  isInOverlayMode: () => isInOverlayMode(),
  applySubtitleKnobOverride: (knobs: unknown) => applySubtitleKnobOverride(knobs),
  getSubtitleKnobOverride: () => getSubtitleKnobOverride(),
}));

vi.mock('@/inject/subtitleHandlers/registry', () => ({
  detectCurrentHandler: (...a: unknown[]) => detectCurrentHandler(...a),
}));

import {
  loadMiniStudioSnapshot,
  setSubtitlesEnabled,
  setAppearance,
  setTabKnob,
  hydrateLocalKnobs,
  setActiveGlossaryList,
  getChromeStatus,
} from '@/content/playerChrome/prefs';

describe('playerChrome prefs', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    loadSettings.mockResolvedValue({
      subtitleSettings: {
        enabled: false,
        fontSize: 18,
        position: 'bottom',
        backgroundOpacity: 0.5,
        displayMode: 'bilingual',
        disabledSubtitleSites: ['youtube'],
        knobOverrides: {},
      },
      namedGlossaryLists: [{ id: 'l1', name: 'Show', entries: [], updatedAt: 1 }],
      subtitleListBySite: {},
    });
    updateSettings.mockImplementation(async (p: unknown) => p);
    detectCurrentHandler.mockReturnValue({ platform: 'youtube' });
    isInOverlayMode.mockReturnValue(false);
    getSubtitleKnobOverride.mockReturnValue({});
  });

  it('loadMiniStudioSnapshot maps settings', async () => {
    const snap = await loadMiniStudioSnapshot();
    expect(snap.enabled).toBe(false);
    expect(snap.fontSize).toBe(18);
    expect(snap.lists).toHaveLength(1);
    expect(snap.status).toBe('disabled');
  });

  it('setSubtitlesEnabled clears site disable and sets enabled; setAppearance updates settings and live overlay config; setTabKnob applies or clears the override; setActiveGlossaryList writes subtitleListBySite', async () => {
    await setSubtitlesEnabled(true);
    expect(updateSettings).toHaveBeenCalled();
    const arg = updateSettings.mock.calls[0][0] as {
      subtitleSettings: { enabled: boolean; disabledSubtitleSites: string[] };
    };
    expect(arg.subtitleSettings.enabled).toBe(true);
    expect(arg.subtitleSettings.disabledSubtitleSites).not.toContain('youtube');

    await setAppearance({ fontSize: 22, displayMode: 'translation-only' });
    expect(updateSettings).toHaveBeenCalled();
    expect(updateConfig).toHaveBeenCalledWith(
      expect.objectContaining({ fontSize: 22, displayMode: 'translation-only' }),
    );

    hydrateLocalKnobs({});
    setTabKnob('faithfulness', 'literal');
    expect(applySubtitleKnobOverride).toHaveBeenCalledWith({ faithfulness: 'literal' });
    setTabKnob('faithfulness', 'auto');
    expect(applySubtitleKnobOverride).toHaveBeenCalledWith(null);

    await setActiveGlossaryList('l1');
    expect(updateSettings).toHaveBeenCalledWith(
      expect.objectContaining({
        subtitleListBySite: expect.any(Object),
      }),
    );
  });

  it('getChromeStatus reflects enabled and overlay', () => {
    expect(getChromeStatus({ enabled: false, overlayActive: false })).toBe('disabled');
    expect(getChromeStatus({ enabled: true, overlayActive: false })).toBe('idle');
    expect(getChromeStatus({ enabled: true, overlayActive: true })).toBe('translating');
  });
});
