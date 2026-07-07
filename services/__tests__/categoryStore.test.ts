import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  setCategoryOverride,
  getCategoryOverride,
  initTabCleanup,
  _resetCategoryStore,
} from '../categoryStore';

// Mock chrome.tabs.onRemoved
let tabRemovedCallback: ((tabId: number) => void) | null = null;

vi.stubGlobal('chrome', {
  tabs: {
    onRemoved: {
      addListener: vi.fn((cb: (tabId: number) => void) => {
        tabRemovedCallback = cb;
      }),
    },
  },
});

describe('categoryStore', () => {
  beforeEach(() => {
    _resetCategoryStore();
    tabRemovedCallback = null;
  });

  describe('setCategoryOverride / getCategoryOverride', () => {
    it('sets, overwrites, trims, truncates, and isolates per-tab overrides', () => {
      setCategoryOverride(42, 'Software Development');
      expect(getCategoryOverride(42)).toBe('Software Development');

      // overwrite
      setCategoryOverride(42, 'News');
      setCategoryOverride(42, 'E-Commerce');
      expect(getCategoryOverride(42)).toBe('E-Commerce');

      // trim whitespace
      setCategoryOverride(42, '  Software Development  ');
      expect(getCategoryOverride(42)).toBe('Software Development');

      // truncate to 50 chars
      setCategoryOverride(42, 'A'.repeat(60));
      expect(getCategoryOverride(42)?.length).toBe(50);

      // multiple tabs independent
      setCategoryOverride(1, 'News');
      setCategoryOverride(2, 'Academic Research');
      expect(getCategoryOverride(1)).toBe('News');
      expect(getCategoryOverride(2)).toBe('Academic Research');
    });

    it('returns undefined for tabs without an override', () => {
      expect(getCategoryOverride(99)).toBeUndefined();
    });

    it('clears override when category is null or empty string', () => {
      setCategoryOverride(42, 'News');
      setCategoryOverride(42, null);
      expect(getCategoryOverride(42)).toBeUndefined();
      setCategoryOverride(42, 'News');
      setCategoryOverride(42, '');
      expect(getCategoryOverride(42)).toBeUndefined();
    });
  });

  describe('initTabCleanup', () => {
    it('should register a chrome.tabs.onRemoved listener', () => {
      initTabCleanup();
      expect(chrome.tabs.onRemoved.addListener).toHaveBeenCalled();
    });

    it('should clear override when tab is removed', () => {
      setCategoryOverride(42, 'News');
      initTabCleanup();
      expect(tabRemovedCallback).toBeTruthy();
      if (tabRemovedCallback) tabRemovedCallback(42);
      expect(getCategoryOverride(42)).toBeUndefined();
    });

    it('should not affect other tabs when one is removed', () => {
      setCategoryOverride(1, 'News');
      setCategoryOverride(2, 'Academic Research');
      initTabCleanup();
      if (tabRemovedCallback) tabRemovedCallback(1);
      expect(getCategoryOverride(1)).toBeUndefined();
      expect(getCategoryOverride(2)).toBe('Academic Research');
    });
  });
});
