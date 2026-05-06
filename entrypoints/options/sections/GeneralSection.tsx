/**
 * General Settings Section — target language, display mode, theme, position, host page mode.
 *
 * Refactored layout:
 * - 2 cards only: Language + Display & Appearance (merged)
 * - ThemePreview removed (lives in Themes tab)
 * - "Dark Mode" renamed to "Host Page Mode"
 * - Translation Position disabled in translation-only mode
 * - Uses SectionHeader component
 */

import { Globe, SlidersHorizontal, Monitor } from 'lucide-react';
import { useSettingsStore } from '@/stores/settingsStore';
import { LANGUAGES } from '@/lib/languages';
import { FieldGroup } from '@/ui/FieldGroup';
import { Select } from '@/ui/Select';
import { Card } from '@/ui/Card';
import { SegmentedControl } from '@/ui/SegmentedControl';
import { SectionHeader } from '@/ui/SectionHeader';
import { stagger } from '@/lib/styleUtils';
import type { ThemeName, TranslationPosition, DarkMode, DisplayMode } from '@/types/config';

const THEME_OPTIONS = [
  { value: 'dividing-line', label: 'Dividing Line' },
  { value: 'blockquote', label: 'Blockquote' },
  { value: 'paper', label: 'Paper Note' },
  { value: 'underline', label: 'Underline' },
  { value: 'dashed-underline', label: 'Dashed Underline' },
  { value: 'highlight', label: 'Highlight' },
  { value: 'wavy-underline', label: 'Wavy Underline' },
  { value: 'bubble', label: 'Speech Bubble' },
  { value: 'side-by-side', label: 'Side by Side' },
  { value: 'mask', label: 'Blur Mask' },
  { value: 'fade-in', label: 'Fade In' },
  { value: 'italic', label: 'Italic' },
  { value: 'dotted-border', label: 'Dotted Border' },
  { value: 'shadow-card', label: 'Shadow Card' },
  { value: 'minimal', label: 'Minimal' },
  { value: 'gradient-accent', label: 'Gradient Accent' },
];

const DISPLAY_MODE_OPTIONS: { value: DisplayMode; label: string }[] = [
  { value: 'bilingual-below', label: 'Bilingual' },
  { value: 'translation-only', label: 'Translation only' },
];

const POSITION_OPTIONS: { value: TranslationPosition; label: string }[] = [
  { value: 'below', label: 'Below' },
  { value: 'above', label: 'Above' },
  { value: 'side', label: 'Side' },
];

const HOST_PAGE_MODE_OPTIONS: { value: DarkMode; label: string }[] = [
  { value: 'auto', label: 'Auto' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
];

interface GeneralSectionProps {
  onNavigateToThemes?: () => void;
}

export function GeneralSection({ onNavigateToThemes }: GeneralSectionProps) {
  const settings = useSettingsStore();
  const updateSettings = useSettingsStore((s) => s.updateSettings);
  const targetLanguages = LANGUAGES.filter((l) => l.code !== 'auto');
  const sourceLanguages = LANGUAGES;

  const isTranslationOnly = settings.displayMode === 'translation-only';

  return (
    <div className="animate-fade-in-up">
      <SectionHeader
        title="General"
        description="Language, display, and appearance preferences."
        icon={<SlidersHorizontal className="w-4 h-4" />}
        accentColor="blue"
      />

      <div className="space-y-4">
        {/* Language card */}
        <div className="animate-stagger" style={stagger(0)}>
          <Card title="Language" icon={<Globe className="w-3.5 h-3.5" />} variant="bordered">
            <div className="space-y-5">
              <FieldGroup
                label="Source Language"
                description="The language of pages you want to translate from."
                htmlFor="general-source-language"
              >
                <Select
                  id="general-source-language"
                  value={settings.sourceLanguage}
                  onChange={(e) => updateSettings({ sourceLanguage: e.target.value })}
                  options={sourceLanguages.map((lang) => ({
                    value: lang.code,
                    label: lang.code === 'auto'
                      ? `🌐 ${lang.nativeName} (${lang.name})`
                      : `${lang.nativeName} (${lang.name})`,
                  }))}
                />
              </FieldGroup>

              <FieldGroup
                label="Target Language"
                description="The language to translate into."
                htmlFor="general-target-language"
              >
                <Select
                  id="general-target-language"
                  value={settings.targetLanguage}
                  onChange={(e) => updateSettings({ targetLanguage: e.target.value })}
                  options={targetLanguages.map((lang) => ({
                    value: lang.code,
                    label: `${lang.nativeName} (${lang.name})`,
                  }))}
                />
              </FieldGroup>
            </div>
          </Card>
        </div>

        {/* Display & Appearance card (merged) */}
        <div className="animate-stagger" style={stagger(1)}>
          <Card title="Display & Appearance" icon={<Monitor className="w-3.5 h-3.5" />} variant="bordered">
            <div className="space-y-5">
              <FieldGroup
                label="Display Mode"
                description="How translations appear on the page."
              >
                <SegmentedControl
                  id="general-display-mode"
                  label="Display Mode"
                  options={DISPLAY_MODE_OPTIONS}
                  value={settings.displayMode}
                  onChange={(val) => updateSettings({ displayMode: val })}
                />
              </FieldGroup>

              <FieldGroup
                label="Translation Theme"
                description="Visual style for translated text."
                htmlFor="general-theme"
              >
                <Select
                  id="general-theme"
                  value={settings.theme}
                  onChange={(e) => updateSettings({ theme: e.target.value as ThemeName })}
                  options={THEME_OPTIONS}
                />
                {onNavigateToThemes && (
                  <button
                    onClick={onNavigateToThemes}
                    className="mt-2 text-xs text-blue-400 hover:text-blue-300 transition-colors"
                  >
                    Preview all themes →
                  </button>
                )}
              </FieldGroup>

              {/* Separator between display and appearance groups */}
              <div className="border-t border-zinc-800" />

              {/* Translation Position — disabled in translation-only mode */}
              <div
                className={`transition-opacity duration-200 ${isTranslationOnly ? 'opacity-40 pointer-events-none' : ''}`}
              >
                <FieldGroup
                  label="Translation Position"
                  description="Where the translation appears relative to the original text."
                  hint={isTranslationOnly ? 'Position only applies in Bilingual mode.' : undefined}
                >
                  <SegmentedControl
                    id="general-translation-position"
                    label="Translation Position"
                    options={POSITION_OPTIONS}
                    value={settings.translationPosition}
                    onChange={(val) => updateSettings({ translationPosition: val })}
                  />
                </FieldGroup>
              </div>

              <FieldGroup
                label="Host Page Mode"
                description="Match how translations render on the page. Auto detects the site's theme."
              >
                <SegmentedControl
                  id="general-host-page-mode"
                  label="Host Page Mode"
                  options={HOST_PAGE_MODE_OPTIONS}
                  value={settings.darkMode}
                  onChange={(val) => updateSettings({ darkMode: val })}
                />
              </FieldGroup>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
