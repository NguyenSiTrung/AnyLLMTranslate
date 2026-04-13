/**
 * ThemePreview component - Shows live preview of translation themes.
 * Displays bilingual sample text with the selected theme applied.
 */

import { useState } from 'react';
import { Eye } from 'lucide-react';
import { useSettingsStore } from '@/stores/settingsStore';
import { Card } from '@/ui/Card';
import { Toggle } from '@/ui/Toggle';

const SAMPLE_TEXT = {
  original: 'The quick brown fox jumps over the lazy dog.',
  translation: 'El rápido zorro marrón salta sobre el perro perezoso.',
};

export function ThemePreview() {
  const settings = useSettingsStore();
  const [isDarkMode, setIsDarkMode] = useState(false);

  // Default to dividing-line if theme is undefined or empty
  const theme = settings.theme || 'dividing-line';

  return (
    <Card title="Theme Preview" icon={<Eye className="w-4 h-4" />} variant="bordered" className="mt-4">
      {/* Light/Dark mode toggle */}
      <div className="mb-4">
        <Toggle
          checked={isDarkMode}
          onChange={setIsDarkMode}
          label="Dark Mode"
          description="Preview theme in dark mode"
        />
      </div>

      <div
        className={`theme-preview-container ${isDarkMode ? 'anyllm-dark' : ''}`}
        data-anyllm-theme={theme}
        data-anyllm-state="dual"
      >
        <div className="space-y-2">
          {/* Original text */}
          <div data-anyllm-role="original" className="text-sm text-zinc-700">
            {SAMPLE_TEXT.original}
          </div>
          {/* Translated text with theme applied */}
          <div data-anyllm-role="translation" className="anyllm-translate-translation text-sm">
            {SAMPLE_TEXT.translation}
          </div>
        </div>
      </div>
    </Card>
  );
}
