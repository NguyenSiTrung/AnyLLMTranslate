/**
 * Tests for config types and default values.
 */

import { describe, it, expect } from 'vitest';
import {
  DEFAULT_SETTINGS,
  DEFAULT_SUBTITLE_SETTINGS,
  DEFAULT_PDF_SETTINGS,
  PROVIDER_PRESETS,
} from '@/types/config';
import type {
  SiteRule,
  GlossaryEntry,
  SubtitleSettings,
  ExtensionSettings,
} from '@/types/config';

describe('config types', () => {
  describe('SiteRule interface', () => {
    it('accepts a valid site rule', () => {
      const rule: SiteRule = {
        id: 'rule-1',
        hostname: '*.example.com',
        includeSelectors: ['.content', 'article'],
        excludeSelectors: ['.nav', '.sidebar'],
        alwaysTranslate: true,
        neverTranslate: false,
        builtIn: false,
      };
      expect(rule.id).toBe('rule-1');
      expect(rule.hostname).toBe('*.example.com');
      expect(rule.includeSelectors).toHaveLength(2);
    });

    it('accepts a site rule with optional category', () => {
      const rule: SiteRule = {
        id: 'rule-cat',
        hostname: 'github.com',
        includeSelectors: [],
        excludeSelectors: [],
        alwaysTranslate: false,
        neverTranslate: false,
        builtIn: false,
        category: 'Software Development',
      };
      expect(rule.category).toBe('Software Development');
    });

    it('accepts a site rule without category (undefined)', () => {
      const rule: SiteRule = {
        id: 'rule-no-cat',
        hostname: 'example.com',
        includeSelectors: [],
        excludeSelectors: [],
        alwaysTranslate: false,
        neverTranslate: false,
        builtIn: false,
      };
      expect(rule.category).toBeUndefined();
    });
  });

  describe('GlossaryEntry interface', () => {
    it('accepts a valid glossary entry', () => {
      const entry: GlossaryEntry = {
        id: 'entry-1',
        source: 'React',
        target: 'React',
      };
      expect(entry.source).toBe('React');
      expect(entry.target).toBe('React');
    });
  });

  describe('SubtitleSettings interface', () => {
    it('accepts valid subtitle settings', () => {
      const settings: SubtitleSettings = {
        position: 'bottom',
        fontSize: 18,
        fontSizeMode: 'fixed',
        backgroundOpacity: 0.5,
        enabled: true,
        fontFamily: 'system',
        displayMode: 'bilingual',
        translationTimeout: 30,
        preferredSubtitleLanguage: 'en',
        autoActivateSubtitles: false,
        disabledSubtitleSites: [],
      };
      expect(settings.fontSize).toBe(18);
      expect(settings.backgroundOpacity).toBe(0.5);
    });
  });

  describe('DEFAULT_SUBTITLE_SETTINGS', () => {
    it('has sensible defaults', () => {
      expect(DEFAULT_SUBTITLE_SETTINGS.position).toBe('bottom');
      expect(DEFAULT_SUBTITLE_SETTINGS.fontSize).toBe(16);
      expect(DEFAULT_SUBTITLE_SETTINGS.fontSizeMode).toBe('fixed');
      expect(DEFAULT_SUBTITLE_SETTINGS.backgroundOpacity).toBe(0.7);
      expect(DEFAULT_SUBTITLE_SETTINGS.enabled).toBe(true);
    });
  });

  describe('DEFAULT_SETTINGS', () => {
    it('includes original settings', () => {
      expect(DEFAULT_SETTINGS.sourceLanguage).toBe('auto');
      expect(DEFAULT_SETTINGS.targetLanguage).toBe('vi');
      expect(DEFAULT_SETTINGS.displayMode).toBe('bilingual-below');
      expect(DEFAULT_SETTINGS.maxBatchChars).toBe(2000);
      expect(DEFAULT_SETTINGS.cacheTTLDays).toBe(30);
      expect(DEFAULT_SETTINGS.maxCacheSizeMB).toBe(100);
    });

    it('has new Phase 3 defaults', () => {
      expect(DEFAULT_SETTINGS.theme).toBe('blockquote');
      expect(DEFAULT_SETTINGS.translationPosition).toBe('below');
      expect(DEFAULT_SETTINGS.darkMode).toBe('auto');
      expect(DEFAULT_SETTINGS.siteRules).toEqual([]);
      expect(DEFAULT_SETTINGS.glossary).toEqual([]);
      expect(DEFAULT_SETTINGS.customSystemPrompt).toBeNull();
      expect(DEFAULT_SETTINGS.debugMode).toBe(false);
    });

    it('has subtitle settings defaults', () => {
      expect(DEFAULT_SETTINGS.subtitleSettings).toEqual(DEFAULT_SUBTITLE_SETTINGS);
    });

    it('has valid provider defaults', () => {
      expect(DEFAULT_SETTINGS.provider.preset).toBe('custom');
      expect(DEFAULT_SETTINGS.provider.baseUrl).toBe('');
      expect(DEFAULT_SETTINGS.provider.model).toBe('');
    });

    it('has custom theme defaults', () => {
      expect(DEFAULT_SETTINGS.customTheme).toBeDefined();
      expect(DEFAULT_SETTINGS.customTheme?.textColor).toBe('#555555');
      expect(DEFAULT_SETTINGS.customTheme?.backgroundColor).toBe('transparent');
      expect(DEFAULT_SETTINGS.customTheme?.borderStyle).toBe('solid');
      expect(DEFAULT_SETTINGS.customTheme?.borderColor).toBe('#3b82f6');
      expect(DEFAULT_SETTINGS.customTheme?.fontStyle).toBe('normal');
      expect(DEFAULT_SETTINGS.customTheme?.fontSize).toBe('same');
    });

    it('has context-aware translation enabled by default', () => {
      expect(DEFAULT_SETTINGS.enableContextAwareTranslation).toBe(true);
    });

    it('has page category detection disabled by default', () => {
      expect(DEFAULT_SETTINGS.enableLLMPageCategoryDetection).toBe(false);
    });

    it('fulfills ExtensionSettings interface completely', () => {
      const settings: ExtensionSettings = { ...DEFAULT_SETTINGS };
      expect(settings).toBeDefined();
      // Verify all keys exist
      const requiredKeys: (keyof ExtensionSettings)[] = [
        'provider', 'sourceLanguage', 'targetLanguage', 'displayMode',
        'maxBatchChars', 'cacheTTLDays', 'maxCacheSizeMB',
        'theme', 'translationPosition', 'darkMode',
        'siteRules', 'glossary', 'subtitleSettings',
        'customSystemPrompt', 'debugMode',
        'customTheme', 'enableContextAwareTranslation', 'enableLLMPageCategoryDetection', 'llmCategoryDetectionMode',
      ];
      for (const key of requiredKeys) {
        expect(settings).toHaveProperty(key);
      }
    });
  });

  describe('DEFAULT_PDF_SETTINGS', () => {
    it('has autoOpen off by default', () => {
      expect(DEFAULT_PDF_SETTINGS.autoOpen).toBe('off');
      expect(DEFAULT_PDF_SETTINGS.openMode).toBe('new-tab');
      expect(DEFAULT_PDF_SETTINGS.neverAutoOpenSites).toEqual([]);
    });

    it('is embedded in DEFAULT_SETTINGS', () => {
      expect(DEFAULT_SETTINGS.pdfSettings).toBeDefined();
      expect(DEFAULT_SETTINGS.pdfSettings.autoOpen).toBe('off');
      expect(DEFAULT_SETTINGS.pdfSettings.openMode).toBe('new-tab');
    });
  });

  describe('PROVIDER_PRESETS', () => {
    it('has 1 preset definition', () => {
      expect(PROVIDER_PRESETS).toHaveLength(1);
    });

    it('includes custom as first preset', () => {
      expect(PROVIDER_PRESETS[0].preset).toBe('custom');
      expect(PROVIDER_PRESETS[0].requiresApiKey).toBe(false);
    });


    it('all presets have required fields', () => {
      for (const preset of PROVIDER_PRESETS) {
        expect(preset.preset).toBeTruthy();
        expect(preset.displayName).toBeTruthy();
        expect(typeof preset.requiresApiKey).toBe('boolean');
      }
    });
  });
});
