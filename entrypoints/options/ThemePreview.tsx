/**
 * ThemePreview component - Shows live preview of translation themes.
 * Displays bilingual sample text with the selected theme applied.
 *
 * Improvements:
 * - More meaningful sample text (not "quick brown fox")
 * - Card title uses category-label style (inherits Card update)
 * - Eye icon kept for recognition
 */

import { useState } from 'react';
import { Eye } from 'lucide-react';
import { useSettingsStore } from '@/stores/settingsStore';
import { Card } from '@/ui/Card';
import { Toggle } from '@/ui/Toggle';

const SAMPLE_TEXT = {
  original:
    'Artificial intelligence is reshaping how we communicate across languages and cultures.',
  translation:
    "L'intelligence artificielle redéfinit notre façon de communiquer entre les langues et les cultures.",
};

export function ThemePreview() {
  const settings = useSettingsStore();
  const [isDarkMode, setIsDarkMode] = useState(false);

  // Default to dividing-line if theme is undefined or empty
  const theme = settings.theme || 'dividing-line';

  return (
    <Card title="Theme Preview" icon={<Eye className="w-3.5 h-3.5" />} variant="bordered">
      {/* Light/Dark mode toggle */}
      <div className="mb-4">
        <Toggle
          checked={isDarkMode}
          onChange={setIsDarkMode}
          label="Dark Mode Preview"
          description="Preview how the theme looks on dark-background pages"
        />
      </div>

      <div
        className={`theme-preview-container rounded-lg p-4 border border-zinc-700/40 transition-colors duration-200 ${isDarkMode ? 'anyllm-dark bg-zinc-950' : 'bg-white'}`}
        data-anyllm-theme={theme}
        data-anyllm-state="dual"
      >
        <div className="space-y-2">
          {/* Original text */}
          <div
            data-anyllm-role="original"
            className={`text-sm leading-relaxed ${isDarkMode ? 'text-zinc-300' : 'text-zinc-700'}`}
          >
            {SAMPLE_TEXT.original}
          </div>
          {/* Translated text with theme applied */}
          <div
            data-anyllm-role="translation"
            className="anyllm-translate-translation text-sm leading-relaxed"
          >
            {SAMPLE_TEXT.translation}
          </div>
        </div>
      </div>
    </Card>
  );
}
