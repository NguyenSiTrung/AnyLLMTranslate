/**
 * General Settings Section — target language, display mode, theme, position, dark mode.
 */

import { useSettingsStore } from '@/stores/settingsStore';
import { LANGUAGES } from '@/lib/languages';
import type { ThemeName, TranslationPosition, DarkMode, DisplayMode } from '@/types/config';

const THEME_OPTIONS: { value: ThemeName; label: string }[] = [
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
    <div>
      <h2 className="text-xl font-semibold text-zinc-100 mb-1">General Settings</h2>
      <p className="text-sm text-zinc-500 mb-8">Configure language, display, and appearance preferences.</p>

      <div className="space-y-6">
        {/* Source Language */}
        <FieldGroup label="Source Language" description="The language of pages you want to translate from.">
          <select
            id="general-source-language"
            value={settings.sourceLanguage}
            onChange={(e) => updateSettings({ sourceLanguage: e.target.value })}
            className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500"
          >
            {sourceLanguages.map((lang) => (
              <option key={lang.code} value={lang.code}>{lang.nativeName} ({lang.name})</option>
            ))}
          </select>
        </FieldGroup>

        {/* Target Language */}
        <FieldGroup label="Target Language" description="The language to translate into.">
          <select
            id="general-target-language"
            value={settings.targetLanguage}
            onChange={(e) => updateSettings({ targetLanguage: e.target.value })}
            className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500"
          >
            {targetLanguages.map((lang) => (
              <option key={lang.code} value={lang.code}>{lang.nativeName} ({lang.name})</option>
            ))}
          </select>
        </FieldGroup>

        {/* Display Mode */}
        <FieldGroup label="Display Mode" description="How translations appear on the page.">
          <div className="flex gap-3">
            {([
              { value: 'bilingual-below' as DisplayMode, label: 'Bilingual' },
              { value: 'translation-only' as DisplayMode, label: 'Translation Only' },
            ]).map((opt) => (
              <button
                key={opt.value}
                onClick={() => updateSettings({ displayMode: opt.value })}
                className={`flex-1 py-2 px-4 rounded-lg text-sm font-medium transition-all ${
                  settings.displayMode === opt.value
                    ? 'bg-blue-600 text-white'
                    : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </FieldGroup>

        {/* Theme */}
        <FieldGroup label="Translation Theme" description="Visual style for translated text.">
          <select
            id="general-theme"
            value={settings.theme}
            onChange={(e) => updateSettings({ theme: e.target.value as ThemeName })}
            className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500"
          >
            {THEME_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </FieldGroup>

        {/* Translation Position */}
        <FieldGroup label="Translation Position" description="Where the translation appears relative to the original.">
          <div className="flex gap-3">
            {([
              { value: 'below' as TranslationPosition, label: 'Below' },
              { value: 'above' as TranslationPosition, label: 'Above' },
              { value: 'side' as TranslationPosition, label: 'Side' },
            ]).map((opt) => (
              <button
                key={opt.value}
                onClick={() => updateSettings({ translationPosition: opt.value })}
                className={`flex-1 py-2 px-4 rounded-lg text-sm font-medium transition-all ${
                  settings.translationPosition === opt.value
                    ? 'bg-blue-600 text-white'
                    : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </FieldGroup>

        {/* Dark Mode */}
        <FieldGroup label="Dark Mode" description="Control the appearance of translated text on host pages.">
          <div className="flex gap-3">
            {([
              { value: 'auto' as DarkMode, label: 'Auto' },
              { value: 'light' as DarkMode, label: 'Light' },
              { value: 'dark' as DarkMode, label: 'Dark' },
            ]).map((opt) => (
              <button
                key={opt.value}
                onClick={() => updateSettings({ darkMode: opt.value })}
                className={`flex-1 py-2 px-4 rounded-lg text-sm font-medium transition-all ${
                  settings.darkMode === opt.value
                    ? 'bg-blue-600 text-white'
                    : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </FieldGroup>
      </div>
    </div>
  );
}

function FieldGroup({ label, description, children }: {
  label: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-zinc-200 mb-1">{label}</label>
      {description && <p className="text-xs text-zinc-500 mb-2">{description}</p>}
      {children}
    </div>
  );
}
