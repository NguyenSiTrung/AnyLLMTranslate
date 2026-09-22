import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ALL_TAB_IDS,
  TAB_GROUPS,
  resolveRequestedSettingsTab,
} from '@/entrypoints/options/lib/settingsTabs';
import {
  ADVANCED_SECTION_IDS,
  ADVANCED_SECTION_HIGHLIGHT_MS,
  prefersReducedMotion,
  scrollToAdvancedSection,
} from '@/entrypoints/options/lib/scrollToAdvancedSection';
import { renderHook, act } from '@testing-library/react';
import { useDeferredCommit } from '@/entrypoints/options/hooks/useDeferredCommit';

/**
 * Tests: shared settings-tab registry — group ordering and generalized
 * `?section=` deep-link resolution for the options page.
 */

describe('settingsTabs', () => {
  it('orders Media tabs, deep-links ?section=pdf, and resolves every known section', () => {
    // facet: places Speech and PDF in Media after Subtitles
    expect(
      TAB_GROUPS.find((group) => group.label === 'MEDIA')?.tabs.map((tab) => tab.id),
    ).toEqual(['subtitles', 'speech', 'pdf']);

    // facet: deep-links ?section=pdf to the PDF tab
    expect(resolveRequestedSettingsTab('pdf')).toBe('pdf');

    // facet: resolves every known section and rejects invalid values
    for (const id of ALL_TAB_IDS) {
      expect(resolveRequestedSettingsTab(id)).toBe(id);
    }
    expect(resolveRequestedSettingsTab('unknown')).toBeNull();
    expect(resolveRequestedSettingsTab(null)).toBeNull();
  });
});

describe('ADVANCED_SECTION_IDS', () => {
  it('maps every overview chip key to a stable id', () => {
    expect(ADVANCED_SECTION_IDS).toEqual({
      translation: 'advanced-section-translation',
      performance: 'advanced-section-performance',
      compatibility: 'advanced-section-compatibility',
      data: 'advanced-section-data',
      diagnostics: 'advanced-section-diagnostics',
    });
  });
});

describe('prefersReducedMotion', () => {
  it('returns true when matchMedia matches, false otherwise', () => {
    const matchWin = {
      matchMedia: vi.fn().mockReturnValue({ matches: true }),
    } as unknown as Window;
    expect(prefersReducedMotion(matchWin)).toBe(true);
    expect(matchWin.matchMedia).toHaveBeenCalledWith('(prefers-reduced-motion: reduce)');

    const noMatchWin = {
      matchMedia: vi.fn().mockReturnValue({ matches: false }),
    } as unknown as Window;
    expect(prefersReducedMotion(noMatchWin)).toBe(false);

    const missingWin = {} as Window;
    expect(prefersReducedMotion(missingWin)).toBe(false);
  });
});

describe('scrollToAdvancedSection', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    document.body.innerHTML = '';
  });

  afterEach(() => {
    vi.useRealTimers();
    document.body.innerHTML = '';
  });

  it('returns false when target is missing', () => {
    expect(scrollToAdvancedSection('advanced-section-missing')).toBe(false);
  });

  it('smooth-scrolls, focuses, and highlights the target; uses auto behavior for reduced motion', () => {
    const el = document.createElement('div');
    el.id = ADVANCED_SECTION_IDS.compatibility;
    el.tabIndex = -1;
    const scrollIntoView = vi.fn();
    const focus = vi.fn();
    el.scrollIntoView = scrollIntoView;
    el.focus = focus;
    document.body.appendChild(el);

    const win = {
      matchMedia: vi.fn().mockReturnValue({ matches: false }),
    } as unknown as Window;

    expect(scrollToAdvancedSection(ADVANCED_SECTION_IDS.compatibility, { window: win })).toBe(
      true,
    );
    expect(scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth', block: 'start' });
    expect(focus).toHaveBeenCalledWith({ preventScroll: true });
    expect(el.getAttribute('data-advanced-section-highlight')).toBe('true');

    vi.advanceTimersByTime(ADVANCED_SECTION_HIGHLIGHT_MS);
    expect(el.hasAttribute('data-advanced-section-highlight')).toBe(false);

    // uses auto scroll behavior when reduced motion is preferred
    const reducedEl = document.createElement('div');
    reducedEl.id = ADVANCED_SECTION_IDS.translation;
    reducedEl.tabIndex = -1;
    const reducedScrollIntoView = vi.fn();
    reducedEl.scrollIntoView = reducedScrollIntoView;
    reducedEl.focus = vi.fn();
    document.body.appendChild(reducedEl);

    const reducedWin = {
      matchMedia: vi.fn().mockReturnValue({ matches: true }),
    } as unknown as Window;

    scrollToAdvancedSection(ADVANCED_SECTION_IDS.translation, { window: reducedWin });
    expect(reducedScrollIntoView).toHaveBeenCalledWith({ behavior: 'auto', block: 'start' });
  });

  it('replaces highlight on a second jump (single active highlight)', () => {
    const a = document.createElement('div');
    a.id = ADVANCED_SECTION_IDS.translation;
    a.tabIndex = -1;
    a.scrollIntoView = vi.fn();
    a.focus = vi.fn();
    const b = document.createElement('div');
    b.id = ADVANCED_SECTION_IDS.diagnostics;
    b.tabIndex = -1;
    b.scrollIntoView = vi.fn();
    b.focus = vi.fn();
    document.body.appendChild(a);
    document.body.appendChild(b);

    const win = {
      matchMedia: vi.fn().mockReturnValue({ matches: false }),
    } as unknown as Window;

    scrollToAdvancedSection(ADVANCED_SECTION_IDS.translation, { window: win });
    expect(a.getAttribute('data-advanced-section-highlight')).toBe('true');

    scrollToAdvancedSection(ADVANCED_SECTION_IDS.diagnostics, { window: win });
    expect(a.hasAttribute('data-advanced-section-highlight')).toBe(false);
    expect(b.getAttribute('data-advanced-section-highlight')).toBe('true');
  });
});

/**
 * useDeferredCommit — local draft + commit-on-blur; dirty protects mid-edit.
 */


describe('useDeferredCommit', () => {
  it('keeps a local draft until commit/blur, syncs clean upstream changes, preserves dirty drafts, and adopt resets without committing', () => {
    const onCommit = vi.fn();
    const { result, rerender } = renderHook(
      ({ initial }) => useDeferredCommit(initial, onCommit),
      { initialProps: { initial: 'a' } },
    );

    // Local edit without commit.
    act(() => {
      result.current.setValue('ab');
    });
    expect(result.current.value).toBe('ab');
    expect(onCommit).not.toHaveBeenCalled();

    act(() => {
      result.current.commit();
    });
    expect(onCommit).toHaveBeenCalledWith('ab');

    // Clean (not dirty) draft syncs from upstream without committing.
    onCommit.mockClear();
    rerender({ initial: 'two' });
    expect(result.current.value).toBe('two');
    expect(onCommit).not.toHaveBeenCalled();

    // Dirty draft survives an upstream change.
    act(() => {
      // User is mid-type: trailing comma + space must stick
      result.current.setValue('host.com, ');
    });
    expect(result.current.value).toBe('host.com, ');

    rerender({ initial: 'host.com' });
    expect(result.current.value).toBe('host.com, ');

    act(() => {
      result.current.commit();
    });
    expect(onCommit).toHaveBeenCalledWith('host.com, ');
    onCommit.mockClear();

    // adopt resets dirty + baseline without committing.
    act(() => {
      result.current.setValue('typing');
    });
    act(() => {
      result.current.adopt('reset-value');
    });
    expect(result.current.value).toBe('reset-value');
    expect(onCommit).not.toHaveBeenCalled();

    rerender({ initial: 'from-store' });
    expect(result.current.value).toBe('from-store');
  });
});
