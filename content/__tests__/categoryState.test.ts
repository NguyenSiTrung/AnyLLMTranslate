import { describe, it, expect, beforeEach } from 'vitest';
import {
  getAutoDetectedCategory,
  setAutoDetectedCategory,
  buildCategoryInfo,
  broadcastCategoryInfo,
  isCategoryDetectionInFlight,
  setCategoryDetectionInFlight,
  _resetCategoryState,
} from '../categoryState';
import type { ExtensionSettings } from '@/types/config';
import { DEFAULT_SETTINGS } from '@/types/config';

const baseSettings: ExtensionSettings = { ...DEFAULT_SETTINGS };

describe('categoryState', () => {
  beforeEach(() => {
    _resetCategoryState();
  });

  describe('get/setAutoDetectedCategory', () => {
    it('returns undefined by default', () => {
      expect(getAutoDetectedCategory()).toBeUndefined();
    });

    it('stores and returns the category', () => {
      setAutoDetectedCategory('News');
      expect(getAutoDetectedCategory()).toBe('News');
    });

    it('can be cleared with undefined', () => {
      setAutoDetectedCategory('News');
      setAutoDetectedCategory(undefined);
      expect(getAutoDetectedCategory()).toBeUndefined();
    });
  });

  describe('buildCategoryInfo', () => {
    it('returns effective = autoDetected when no siteRule or override', () => {
      setAutoDetectedCategory('News');
      const info = buildCategoryInfo(baseSettings, undefined);
      expect(info.autoDetected).toBe('News');
      expect(info.override).toBeUndefined();
      expect(info.effective).toBe('News');
    });

    it('prefers siteRule over autoDetected', () => {
      setAutoDetectedCategory('News');
      const settings = {
        ...baseSettings,
        siteRules: [{ id: '1', hostname: 'localhost', includeSelectors: [], excludeSelectors: [], alwaysTranslate: false, neverTranslate: false, builtIn: false, category: 'Encyclopedia' }],
      };
      const info = buildCategoryInfo(settings, undefined);
      expect(info.effective).toBe('Encyclopedia');
    });

    it('prefers override over siteRule and autoDetected', () => {
      setAutoDetectedCategory('News');
      const settings = {
        ...baseSettings,
        siteRules: [{ id: '1', hostname: 'localhost', includeSelectors: [], excludeSelectors: [], alwaysTranslate: false, neverTranslate: false, builtIn: false, category: 'Encyclopedia' }],
      };
      const info = buildCategoryInfo(settings, 'Gaming');
      expect(info.effective).toBe('Gaming');
    });
  });

  describe('broadcastCategoryInfo', () => {
    it('sends a pageCategoryUpdate message with the built CategoryInfo', () => {
      setAutoDetectedCategory('News');
      broadcastCategoryInfo(baseSettings, undefined);
      expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'pageCategoryUpdate',
          categoryInfo: expect.objectContaining({ autoDetected: 'News', effective: 'News' }),
        }),
      );
    });
  });

  describe('categoryDetectionInFlight guard', () => {
    it('is false by default', () => {
      expect(isCategoryDetectionInFlight()).toBe(false);
    });

    it('setCategoryDetectionInFlight(true) makes isCategoryDetectionInFlight return true', () => {
      setCategoryDetectionInFlight(true);
      expect(isCategoryDetectionInFlight()).toBe(true);
    });

    it('can be cleared by setting false', () => {
      setCategoryDetectionInFlight(true);
      setCategoryDetectionInFlight(false);
      expect(isCategoryDetectionInFlight()).toBe(false);
    });

    it('_resetCategoryState clears the in-flight flag', () => {
      setCategoryDetectionInFlight(true);
      _resetCategoryState();
      expect(isCategoryDetectionInFlight()).toBe(false);
    });
  });
});
