/**
 * Page-scope presets for web translation walk + streaming defaults (FR-4).
 * Pure mapping: preset → partial settings. Classic restores pre-v3 defaults.
 */

import type { ExtensionSettings } from '@/types/config';

/** Named combinations of walk/streaming knobs for Options (and optional popup). */
export type PageScopePreset = 'classic' | 'balanced' | 'main-content' | 'full-page';

export const PAGE_SCOPE_PRESET_OPTIONS: Array<{
  value: PageScopePreset;
  label: string;
  description: string;
}> = [
  {
    value: 'classic',
    label: 'Classic',
    description: 'Pre-v3 defaults: streaming off, full-page walk, no aside caps.',
  },
  {
    value: 'balanced',
    label: 'Balanced',
    description: 'Recommended: streaming on, aside caps on, full article walk.',
  },
  {
    value: 'main-content',
    label: 'Main content only',
    description: 'Body-tag whitelist + aside caps — focus on main/article regions.',
  },
  {
    value: 'full-page',
    label: 'Full page',
    description: 'Translate as much as possible — no whitelist, no aside caps, smart excludes off.',
  },
];

/** Fields controlled by page-scope presets. */
export type PageScopePresetFields = Pick<
  ExtensionSettings,
  | 'enableStreamingTranslation'
  | 'enableAsideCaps'
  | 'enableBodyTagWhitelist'
  | 'enableSmartExcludes'
>;

/**
 * Map a named preset to the settings fields it owns.
 * Does not touch unrelated settings (theme, providers, etc.).
 */
export function applyPageScopePreset(preset: PageScopePreset): PageScopePresetFields {
  switch (preset) {
    case 'classic':
      return {
        enableStreamingTranslation: false,
        enableAsideCaps: false,
        enableBodyTagWhitelist: false,
        enableSmartExcludes: true,
      };
    case 'balanced':
      return {
        enableStreamingTranslation: true,
        enableAsideCaps: true,
        enableBodyTagWhitelist: false,
        enableSmartExcludes: true,
      };
    case 'main-content':
      return {
        enableStreamingTranslation: true,
        enableAsideCaps: true,
        enableBodyTagWhitelist: true,
        enableSmartExcludes: true,
      };
    case 'full-page':
      return {
        enableStreamingTranslation: true,
        enableAsideCaps: false,
        enableBodyTagWhitelist: false,
        enableSmartExcludes: false,
      };
    default: {
      const _exhaustive: never = preset;
      return _exhaustive;
    }
  }
}

/**
 * Detect which named preset matches current settings, or `'custom'` if mixed.
 */
export function detectPageScopePreset(
  settings: PageScopePresetFields,
): PageScopePreset | 'custom' {
  const presets: PageScopePreset[] = ['classic', 'balanced', 'main-content', 'full-page'];
  for (const preset of presets) {
    const expected = applyPageScopePreset(preset);
    if (
      settings.enableStreamingTranslation === expected.enableStreamingTranslation &&
      settings.enableAsideCaps === expected.enableAsideCaps &&
      settings.enableBodyTagWhitelist === expected.enableBodyTagWhitelist &&
      settings.enableSmartExcludes === expected.enableSmartExcludes
    ) {
      return preset;
    }
  }
  return 'custom';
}
