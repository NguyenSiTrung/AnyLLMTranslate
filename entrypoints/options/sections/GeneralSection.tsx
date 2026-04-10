/**
 * General Settings Section — target language, display mode, theme, position, dark mode.
 * Refactored to use shared UI components and Card-based content grouping.
 */

import { Settings as SettingsIcon } from 'lucide-react';
import { useSettingsStore } from '@/stores/settingsStore';
import { LANGUAGES } from '@/lib/languages';
import { FieldGroup } from '@/ui/FieldGroup';
import { Select } from '@/ui/Select';
import { Card } from '@/ui/Card';
import { Button } from '@/ui/Button';
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

export function GeneralSection() {
  const settings = useSettingsStore();
  const updateSettings = useSettingsStore((s) => s.updateSettings);
  const targetLanguages = LANGUAGES.filter((l) => l.code !== 'auto');
  const sourceLanguages = LANGUAGES;

  return (
    <div className="animate-fade-in-up">
      {/* Section header */}
      <Card accent="blue" className="mb-8">
        <div className="flex items-center gap-3">
          <SettingsIcon className="w-5 h-5 text-blue-400" />
          <div>
            <h2 className="text-lg font-semibold text-zinc-100">General Settings</h2>
            <p className="text-xs text-zinc-500">Configure language, display, and appearance preferences.</p>
          </div>
        </div>
      </Card>

      <div className="space-y-6">
        {/* Language group */}
        <Card title="Language" variant="bordered">
          <div className="space-y-4">
            <FieldGroup label="Source Language" description="The language of pages you want to translate from." htmlFor="general-source-language">
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

            <FieldGroup label="Target Language" description="The language to translate into." htmlFor="general-target-language">
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

        {/* Display group */}
        <Card title="Display" variant="bordered">
          <div className="space-y-4">
            <FieldGroup label="Display Mode" description="How translations appear on the page.">
              <div className="flex gap-3">
                {([
                  { value: 'bilingual-below' as DisplayMode, label: 'Bilingual' },
                  { value: 'translation-only' as DisplayMode, label: 'Translation Only' },
                ] as const).map((opt) => (
                  <Button
                    key={opt.value}
                    variant={settings.displayMode === opt.value ? 'primary' : 'secondary'}
                    className="flex-1"
                    onClick={() => updateSettings({ displayMode: opt.value })}
                  >
                    {opt.label}
                  </Button>
                ))}
              </div>
            </FieldGroup>

            <FieldGroup label="Translation Theme" description="Visual style for translated text." htmlFor="general-theme">
              <Select
                id="general-theme"
                value={settings.theme}
                onChange={(e) => updateSettings({ theme: e.target.value as ThemeName })}
                options={THEME_OPTIONS}
              />
            </FieldGroup>

            <ThemePreview />
          </div>
        </Card>

        {/* Appearance group */}
        <Card title="Appearance" variant="bordered">
          <div className="space-y-4">
            <FieldGroup label="Translation Position" description="Where the translation appears relative to the original.">
              <div className="flex gap-3">
                {([
                  { value: 'below' as TranslationPosition, label: 'Below' },
                  { value: 'above' as TranslationPosition, label: 'Above' },
                  { value: 'side' as TranslationPosition, label: 'Side' },
                ] as const).map((opt) => (
                  <Button
                    key={opt.value}
                    variant={settings.translationPosition === opt.value ? 'primary' : 'secondary'}
                    className="flex-1"
                    onClick={() => updateSettings({ translationPosition: opt.value })}
                  >
                    {opt.label}
                  </Button>
                ))}
              </div>
            </FieldGroup>

            <FieldGroup label="Dark Mode" description="Control the appearance of translated text on host pages.">
              <div className="flex gap-3">
                {([
                  { value: 'auto' as DarkMode, label: 'Auto' },
                  { value: 'light' as DarkMode, label: 'Light' },
                  { value: 'dark' as DarkMode, label: 'Dark' },
                ] as const).map((opt) => (
                  <Button
                    key={opt.value}
                    variant={settings.darkMode === opt.value ? 'primary' : 'secondary'}
                    className="flex-1"
                    onClick={() => updateSettings({ darkMode: opt.value })}
                  >
                    {opt.label}
                  </Button>
                ))}
              </div>
            </FieldGroup>
          </div>
        </Card>
      </div>
    </div>
  );
}
