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
    it('should set and get a category override for a tab', () => {
      setCategoryOverride(42, 'Software Development');
      expect(getCategoryOverride(42)).toBe('Software Development');
    });

    it('should return undefined for tabs without an override', () => {
      expect(getCategoryOverride(99)).toBeUndefined();
    });

    it('should clear override when category is null', () => {
      setCategoryOverride(42, 'News');
      setCategoryOverride(42, null);
      expect(getCategoryOverride(42)).toBeUndefined();
    });

    it('should clear override when category is empty string', () => {
      setCategoryOverride(42, 'News');
      setCategoryOverride(42, '');
      expect(getCategoryOverride(42)).toBeUndefined();
    });

    it('should trim category text', () => {
      setCategoryOverride(42, '  Software Development  ');
      expect(getCategoryOverride(42)).toBe('Software Development');
    });

    it('should truncate category to 50 chars', () => {
      const longCategory = 'A'.repeat(60);
      setCategoryOverride(42, longCategory);
      expect(getCategoryOverride(42)?.length).toBe(50);
    });

    it('should support multiple tabs independently', () => {
      setCategoryOverride(1, 'News');
      setCategoryOverride(2, 'Academic Research');
      expect(getCategoryOverride(1)).toBe('News');
      expect(getCategoryOverride(2)).toBe('Academic Research');
    });

    it('should overwrite existing override', () => {
      setCategoryOverride(42, 'News');
      setCategoryOverride(42, 'E-Commerce');
      expect(getCategoryOverride(42)).toBe('E-Commerce');
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
      tabRemovedCallback!(42);
      expect(getCategoryOverride(42)).toBeUndefined();
    });

    it('should not affect other tabs when one is removed', () => {
      setCategoryOverride(1, 'News');
      setCategoryOverride(2, 'Academic Research');
      initTabCleanup();
      tabRemovedCallback!(1);
      expect(getCategoryOverride(1)).toBeUndefined();
      expect(getCategoryOverride(2)).toBe('Academic Research');
    });
  });
});
