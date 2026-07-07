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
    it('defaults to undefined, stores a value, and can be cleared', () => {
      expect(getAutoDetectedCategory()).toBeUndefined();
      setAutoDetectedCategory('News');
      expect(getAutoDetectedCategory()).toBe('News');
      setAutoDetectedCategory(undefined);
      expect(getAutoDetectedCategory()).toBeUndefined();
    });
  });

  describe('buildCategoryInfo', () => {
    it('prefers siteRule over autoDetected', () => {
      setAutoDetectedCategory('News');
      const settings = {
        ...baseSettings,
        siteRules: [{ id: '1', hostname: 'localhost', includeSelectors: [], excludeSelectors: [], alwaysTranslate: false, neverTranslate: false, builtIn: false, category: 'Encyclopedia' }],
      };
      const info = buildCategoryInfo(settings, undefined);
      expect(info.autoDetected).toBe('News');
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
    it('is false by default, toggles true/false, and is cleared by _resetCategoryState', () => {
      expect(isCategoryDetectionInFlight()).toBe(false);
      setCategoryDetectionInFlight(true);
      expect(isCategoryDetectionInFlight()).toBe(true);
      setCategoryDetectionInFlight(false);
      expect(isCategoryDetectionInFlight()).toBe(false);
      setCategoryDetectionInFlight(true);
      _resetCategoryState();
      expect(isCategoryDetectionInFlight()).toBe(false);
    });
  });
});
