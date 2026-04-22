/**
 * ThemePreview component - Shows live preview of translation themes.
 * Displays bilingual sample text with the selected theme applied.
 *
 * Improvements:
 * - More meaningful sample text (not "quick brown fox")
 * - Card title uses category-label style (inherits Card update)
 * - Eye icon kept for recognition
 */

import { useState, useMemo } from 'react';
import { Eye } from 'lucide-react';
import { useSettingsStore } from '@/stores/settingsStore';
import { DEFAULT_CUSTOM_THEME } from '@/types/config';
import { Card } from '@/ui/Card';
import { Toggle } from '@/ui/Toggle';

const SAMPLE_TEXT = {
  original:
    'Artificial intelligence is reshaping how we communicate across languages and cultures.',
  translation:
    'Trí tuệ nhân tạo đang định hình lại cách chúng ta giao tiếp giữa các ngôn ngữ và nền văn hóa.',
};

export function ThemePreview() {
  const settings = useSettingsStore();
  const [isDarkMode, setIsDarkMode] = useState(false);

  // Default to blockquote if theme is undefined or empty
  const theme = settings.theme || 'blockquote';

  // Compute custom theme inline styles for the preview container
  const customPreviewStyle = useMemo<React.CSSProperties>(() => {
    if (theme !== 'custom') return {};
    const config = settings.customTheme ?? DEFAULT_CUSTOM_THEME;
    const fontSizeMap = { smaller: '0.9em', same: 'inherit', larger: '1.1em' } as const;
    return {
      '--anyllm-custom-text-color': config.textColor,
      '--anyllm-custom-bg-color': config.backgroundColor,
      '--anyllm-custom-border-style': config.borderStyle,
      '--anyllm-custom-border-color': config.borderColor,
      '--anyllm-custom-font-style': config.fontStyle,
      '--anyllm-custom-font-size': fontSizeMap[config.fontSize],
    } as React.CSSProperties;
  }, [theme, settings.customTheme]);

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
        style={customPreviewStyle}
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
