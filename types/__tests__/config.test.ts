/**
 * Tests for config types and default values.
 */

import { describe, it, expect } from 'vitest';
import {
  DEFAULT_SETTINGS,
  DEFAULT_SUBTITLE_SETTINGS,
  PROVIDER_PRESETS,
} from '@/types/config';
import type {
  ThemeName,
  TranslationPosition,
  DarkMode,
  SiteRule,
  GlossaryEntry,
  SubtitleSettings,
  ExtensionSettings,
  ProviderPreset,
  DisplayMode,
} from '@/types/config';

describe('config types', () => {
  describe('ThemeName', () => {
    it('allows all 16 theme values', () => {
      const themes: ThemeName[] = [
        'dividing-line', 'blockquote', 'paper', 'underline',
        'dashed-underline', 'highlight', 'wavy-underline', 'bubble',
        'side-by-side', 'mask', 'fade-in', 'italic',
        'dotted-border', 'shadow-card', 'minimal', 'gradient-accent',
      ];
      expect(themes).toHaveLength(16);
    });
  });

  describe('TranslationPosition', () => {
    it('supports below, above, side', () => {
      const positions: TranslationPosition[] = ['below', 'above', 'side'];
      expect(positions).toHaveLength(3);
    });
  });

  describe('DarkMode', () => {
    it('supports auto, light, dark', () => {
      const modes: DarkMode[] = ['auto', 'light', 'dark'];
      expect(modes).toHaveLength(3);
    });
  });

  describe('DisplayMode', () => {
    it('supports bilingual and translation-only', () => {
      const modes: DisplayMode[] = ['bilingual-below', 'translation-only'];
      expect(modes).toHaveLength(2);
    });
  });

  describe('ProviderPreset', () => {
    it('supports 2 preset options', () => {
      const presets: ProviderPreset[] = ['ollama', 'custom'];
      expect(presets).toHaveLength(2);
    });
  });

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
        backgroundOpacity: 0.5,
        enabled: true,
        fontFamily: 'system',
        displayMode: 'bilingual',
        translationTimeout: 30,
        preferredSubtitleLanguage: 'en',
        autoActivateSubtitles: false,
      };
      expect(settings.fontSize).toBe(18);
      expect(settings.backgroundOpacity).toBe(0.5);
    });
  });

  describe('DEFAULT_SUBTITLE_SETTINGS', () => {
    it('has sensible defaults', () => {
      expect(DEFAULT_SUBTITLE_SETTINGS.position).toBe('bottom');
      expect(DEFAULT_SUBTITLE_SETTINGS.fontSize).toBe(16);
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
      expect(DEFAULT_SETTINGS.provider.preset).toBe('ollama');
      expect(DEFAULT_SETTINGS.provider.baseUrl).toContain('localhost');
      expect(DEFAULT_SETTINGS.provider.model).toBe('gemma3:4b');
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
      ];
      for (const key of requiredKeys) {
        expect(settings).toHaveProperty(key);
      }
    });
  });

  describe('PROVIDER_PRESETS', () => {
    it('has 2 preset definitions', () => {
      expect(PROVIDER_PRESETS).toHaveLength(2);
    });

    it('includes ollama as first preset', () => {
      expect(PROVIDER_PRESETS[0].preset).toBe('ollama');
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
