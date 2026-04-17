/**
 * Tests for subtitleOverlay — font family CSS custom property,
 * display mode data attribute, and updateConfig integration.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// ============================================================================
// DOM setup — jsdom provides document/window but not ResizeObserver
// ============================================================================

const mockResizeObserver = vi.fn().mockImplementation(() => ({
  observe: vi.fn(),
  disconnect: vi.fn(),
}));
vi.stubGlobal('ResizeObserver', mockResizeObserver);

import {
  initializeOverlay,
  updateConfig,
  resetOverlayState,
  getConfig,
} from '@/content/subtitleOverlay';

const MOCK_CUES = [
  { startTime: 0, endTime: 2, text: 'Xin chào', originalText: 'Hello' },
  { startTime: 2, endTime: 4, text: 'Thế giới', originalText: 'World' },
];

beforeEach(() => {
  resetOverlayState();
  document.body.innerHTML = '<video src="test.mp4"></video>';
});

describe('subtitleOverlay — fontFamily wiring', () => {
  it('sets --anyllm-subtitle-font-family CSS custom property on overlay', () => {
    initializeOverlay(MOCK_CUES, { fontFamily: 'Georgia, serif' });

    const overlay = document.querySelector('.anyllm-translate-subtitle-overlay') as HTMLElement;
    expect(overlay).not.toBeNull();
    expect(overlay.style.getPropertyValue('--anyllm-subtitle-font-family')).toBe('Georgia, serif');
  });

  it('defaults to system-ui when fontFamily not specified', () => {
    initializeOverlay(MOCK_CUES);

    const overlay = document.querySelector('.anyllm-translate-subtitle-overlay') as HTMLElement;
    const fontFamily = overlay.style.getPropertyValue('--anyllm-subtitle-font-family');
    expect(fontFamily).toContain('system-ui');
  });

  it('updateConfig changes --anyllm-subtitle-font-family', () => {
    initializeOverlay(MOCK_CUES);
    updateConfig({ fontFamily: 'monospace' });

    const overlay = document.querySelector('.anyllm-translate-subtitle-overlay') as HTMLElement;
    expect(overlay.style.getPropertyValue('--anyllm-subtitle-font-family')).toBe('monospace');
  });

  it('getConfig returns updated fontFamily after updateConfig', () => {
    initializeOverlay(MOCK_CUES);
    updateConfig({ fontFamily: 'Georgia, serif' });
    expect(getConfig().fontFamily).toBe('Georgia, serif');
  });
});

describe('subtitleOverlay — displayMode wiring', () => {
  it('sets data-display-mode="bilingual" by default', () => {
    initializeOverlay(MOCK_CUES);

    const overlay = document.querySelector('.anyllm-translate-subtitle-overlay') as HTMLElement;
    expect(overlay.getAttribute('data-display-mode')).toBe('bilingual');
  });

  it('sets data-display-mode="translation-only" when specified', () => {
    initializeOverlay(MOCK_CUES, { displayMode: 'translation-only' });

    const overlay = document.querySelector('.anyllm-translate-subtitle-overlay') as HTMLElement;
    expect(overlay.getAttribute('data-display-mode')).toBe('translation-only');
  });

  it('updateConfig changes data-display-mode attribute', () => {
    initializeOverlay(MOCK_CUES, { displayMode: 'bilingual' });
    updateConfig({ displayMode: 'translation-only' });

    const overlay = document.querySelector('.anyllm-translate-subtitle-overlay') as HTMLElement;
    expect(overlay.getAttribute('data-display-mode')).toBe('translation-only');
  });

  it('can toggle back from translation-only to bilingual', () => {
    initializeOverlay(MOCK_CUES, { displayMode: 'translation-only' });
    updateConfig({ displayMode: 'bilingual' });

    const overlay = document.querySelector('.anyllm-translate-subtitle-overlay') as HTMLElement;
    expect(overlay.getAttribute('data-display-mode')).toBe('bilingual');
  });

  it('getConfig returns updated displayMode after updateConfig', () => {
    initializeOverlay(MOCK_CUES);
    updateConfig({ displayMode: 'translation-only' });
    expect(getConfig().displayMode).toBe('translation-only');
  });
});
