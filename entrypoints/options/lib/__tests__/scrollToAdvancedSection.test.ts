import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ADVANCED_SECTION_IDS,
  ADVANCED_SECTION_HIGHLIGHT_MS,
  prefersReducedMotion,
  scrollToAdvancedSection,
} from '../scrollToAdvancedSection';

describe('ADVANCED_SECTION_IDS', () => {
  it('maps every overview chip key to a stable id', () => {
    expect(ADVANCED_SECTION_IDS).toEqual({
      prompt: 'advanced-section-prompt',
      performance: 'advanced-section-performance',
      quality: 'advanced-section-quality',
      context: 'advanced-section-context',
      pdf: 'advanced-section-pdf',
      developer: 'advanced-section-developer',
    });
  });
});

describe('prefersReducedMotion', () => {
  it('returns true when matchMedia matches', () => {
    const win = {
      matchMedia: vi.fn().mockReturnValue({ matches: true }),
    } as unknown as Window;
    expect(prefersReducedMotion(win)).toBe(true);
    expect(win.matchMedia).toHaveBeenCalledWith('(prefers-reduced-motion: reduce)');
  });

  it('returns false when matchMedia does not match', () => {
    const win = {
      matchMedia: vi.fn().mockReturnValue({ matches: false }),
    } as unknown as Window;
    expect(prefersReducedMotion(win)).toBe(false);
  });

  it('returns false when matchMedia is missing', () => {
    const win = {} as Window;
    expect(prefersReducedMotion(win)).toBe(false);
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

  it('smooth-scrolls, focuses, and highlights the target', () => {
    const el = document.createElement('div');
    el.id = ADVANCED_SECTION_IDS.context;
    el.tabIndex = -1;
    const scrollIntoView = vi.fn();
    const focus = vi.fn();
    el.scrollIntoView = scrollIntoView;
    el.focus = focus;
    document.body.appendChild(el);

    const win = {
      matchMedia: vi.fn().mockReturnValue({ matches: false }),
    } as unknown as Window;

    expect(scrollToAdvancedSection(ADVANCED_SECTION_IDS.context, { window: win })).toBe(
      true,
    );
    expect(scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth', block: 'start' });
    expect(focus).toHaveBeenCalledWith({ preventScroll: true });
    expect(el.getAttribute('data-advanced-section-highlight')).toBe('true');

    vi.advanceTimersByTime(ADVANCED_SECTION_HIGHLIGHT_MS);
    expect(el.hasAttribute('data-advanced-section-highlight')).toBe(false);
  });

  it('uses auto scroll behavior when reduced motion is preferred', () => {
    const el = document.createElement('div');
    el.id = ADVANCED_SECTION_IDS.prompt;
    el.tabIndex = -1;
    const scrollIntoView = vi.fn();
    el.scrollIntoView = scrollIntoView;
    el.focus = vi.fn();
    document.body.appendChild(el);

    const win = {
      matchMedia: vi.fn().mockReturnValue({ matches: true }),
    } as unknown as Window;

    scrollToAdvancedSection(ADVANCED_SECTION_IDS.prompt, { window: win });
    expect(scrollIntoView).toHaveBeenCalledWith({ behavior: 'auto', block: 'start' });
  });

  it('replaces highlight on a second jump (single active highlight)', () => {
    const a = document.createElement('div');
    a.id = ADVANCED_SECTION_IDS.prompt;
    a.tabIndex = -1;
    a.scrollIntoView = vi.fn();
    a.focus = vi.fn();
    const b = document.createElement('div');
    b.id = ADVANCED_SECTION_IDS.developer;
    b.tabIndex = -1;
    b.scrollIntoView = vi.fn();
    b.focus = vi.fn();
    document.body.appendChild(a);
    document.body.appendChild(b);

    const win = {
      matchMedia: vi.fn().mockReturnValue({ matches: false }),
    } as unknown as Window;

    scrollToAdvancedSection(ADVANCED_SECTION_IDS.prompt, { window: win });
    expect(a.getAttribute('data-advanced-section-highlight')).toBe('true');

    scrollToAdvancedSection(ADVANCED_SECTION_IDS.developer, { window: win });
    expect(a.hasAttribute('data-advanced-section-highlight')).toBe(false);
    expect(b.getAttribute('data-advanced-section-highlight')).toBe('true');
  });
});
