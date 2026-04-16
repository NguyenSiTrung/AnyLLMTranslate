/**
 * General Settings Section — target language, display mode, theme, position, dark mode.
 *
 * Refactored UI/UX improvements:
 * - Removed redundant header Card; uses inline SectionHeader pattern
 * - Display Mode / Translation Position / Dark Mode use SegmentedControl (radio group)
 * - ThemePreview sits at same card level (no card-in-card nesting)
 * - Cards have stagger entrance animation
 * - Language FieldGroups include search hint
 */

import { Globe, Monitor, Paintbrush } from 'lucide-react';
import { useSettingsStore } from '@/stores/settingsStore';
import { LANGUAGES } from '@/lib/languages';
import { FieldGroup } from '@/ui/FieldGroup';
import { Select } from '@/ui/Select';
import { Card } from '@/ui/Card';
import { SegmentedControl } from '@/ui/SegmentedControl';
import { ThemePreview } from '../ThemePreview';
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
  { value: 'translation-only', label: 'Translation Only' },
];

const POSITION_OPTIONS: { value: TranslationPosition; label: string }[] = [
  { value: 'below', label: 'Below' },
  { value: 'above', label: 'Above' },
  { value: 'side', label: 'Side' },
];

const DARK_MODE_OPTIONS: { value: DarkMode; label: string }[] = [
  { value: 'auto', label: 'Auto' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
];

export function GeneralSection() {
  const settings = useSettingsStore();
  const updateSettings = useSettingsStore((s) => s.updateSettings);
  const targetLanguages = LANGUAGES.filter((l) => l.code !== 'auto');
  const sourceLanguages = LANGUAGES;

  return (
    <div className="animate-fade-in-up">
      {/* Inline section header — no redundant card */}
      <div className="flex items-center gap-3 mb-7">
        <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-blue-600/15 border border-blue-500/20">
          <Monitor className="w-4 h-4 text-blue-400" />
        </div>
        <div>
          <h2 className="text-base font-semibold text-zinc-100 leading-tight">General</h2>
          <p className="text-xs text-zinc-500 mt-0.5">Language, display, and appearance preferences.</p>
        </div>
      </div>

      <div className="space-y-4">
        {/* Language card */}
        <div className="animate-stagger" style={{ '--stagger-delay': '0' } as React.CSSProperties}>
          <Card title="Language" icon={<Globe className="w-3.5 h-3.5" />} variant="bordered">
            <div className="space-y-5">
              <FieldGroup
                label="Source Language"
                description="The language of pages you want to translate from."
                hint="Type the first few letters to jump to a language."
                htmlFor="general-source-language"
              >
                <Select
                  id="general-source-language"
                  value={settings.sourceLanguage}
                  onChange={(e) => updateSettings({ sourceLanguage: e.target.value })}
                  options={sourceLanguages.map((lang) => ({
                    value: lang.code,
                    label: `${lang.nativeName} (${lang.name})`,
                  }))}
                />
              </FieldGroup>

              <FieldGroup
                label="Target Language"
                description="The language to translate into."
                hint="Type the first few letters to jump to a language."
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

        {/* Display card */}
        <div className="animate-stagger" style={{ '--stagger-delay': '1' } as React.CSSProperties}>
          <Card title="Display" icon={<Monitor className="w-3.5 h-3.5" />} variant="bordered">
            <div className="space-y-5">
              <FieldGroup
                label="Display Mode"
                description="How translations appear on the page."
              >
                <SegmentedControl
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
              </FieldGroup>
            </div>
          </Card>
        </div>

        {/* Theme Preview — at same card level, not nested */}
        <div className="animate-stagger" style={{ '--stagger-delay': '2' } as React.CSSProperties}>
          <ThemePreview />
        </div>

        {/* Appearance card */}
        <div className="animate-stagger" style={{ '--stagger-delay': '3' } as React.CSSProperties}>
          <Card title="Appearance" icon={<Paintbrush className="w-3.5 h-3.5" />} variant="bordered">
            <div className="space-y-5">
              <FieldGroup
                label="Translation Position"
                description="Where the translation appears relative to the original text."
              >
                <SegmentedControl
                  label="Translation Position"
                  options={POSITION_OPTIONS}
                  value={settings.translationPosition}
                  onChange={(val) => updateSettings({ translationPosition: val })}
                />
              </FieldGroup>

              <FieldGroup
                label="Dark Mode"
                description="Control the appearance of translated text on host pages."
              >
                <SegmentedControl
                  label="Dark Mode"
                  options={DARK_MODE_OPTIONS}
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
