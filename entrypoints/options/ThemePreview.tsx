/**
 * ThemePreview component - Shows live preview of translation themes.
 * Displays bilingual sample text with the selected theme applied.
 *
 * Reflects the user's current displayMode (Bilingual vs Translation only)
 * and translation position (above/below/side). Includes representative
 * block paragraph, short inline phrase, loading, and error states so the
 * preview matches how content actually renders on a page.
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
  inlineOriginal: 'Settings',
  inlineTranslation: 'Cài đặt',
};

export function ThemePreview() {
  const settings = useSettingsStore();
  const [isDarkMode, setIsDarkMode] = useState(false);

  // Default to blockquote if theme is undefined or empty
  const theme = settings.theme || 'blockquote';
  const position = settings.translationPosition ?? 'below';
  const pageState = settings.displayMode === 'translation-only' ? 'translation-only' : 'dual';

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

  // Render block translation either above or below the original.
  const block = (
    <div className="space-y-2">
      {position === 'above' ? (
        <>
          <div
            data-anyllm-role="translation"
            lang="vi"
            dir="auto"
            className="anyllm-translate-translation text-sm leading-relaxed"
          >
            {SAMPLE_TEXT.translation}
          </div>
          <div
            data-anyllm-role="original"
            className={`text-sm leading-relaxed ${isDarkMode ? 'text-zinc-300' : 'text-zinc-700'}`}
          >
            {SAMPLE_TEXT.original}
          </div>
        </>
      ) : (
        <>
          <div
            data-anyllm-role="original"
            className={`text-sm leading-relaxed ${isDarkMode ? 'text-zinc-300' : 'text-zinc-700'}`}
          >
            {SAMPLE_TEXT.original}
          </div>
          <div
            data-anyllm-role="translation"
            lang="vi"
            dir="auto"
            className="anyllm-translate-translation text-sm leading-relaxed"
          >
            {SAMPLE_TEXT.translation}
          </div>
        </>
      )}
    </div>
  );

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
        data-anyllm-state={pageState}
        data-anyllm-position={position}
        style={customPreviewStyle}
      >
        {block}

        {/* Short inline sample — UI labels, button text, etc. */}
        <div
          className={`mt-3 text-sm leading-relaxed ${isDarkMode ? 'text-zinc-300' : 'text-zinc-700'}`}
          data-anyllm-preview-section="inline"
        >
          <span data-anyllm-role="original">{SAMPLE_TEXT.inlineOriginal}</span>
          <span
            className="anyllm-inline-bilingual"
            lang="vi"
            dir="auto"
            data-anyllm-role="translation"
          >
            {pageState === 'translation-only' ? SAMPLE_TEXT.inlineTranslation : ` (${SAMPLE_TEXT.inlineTranslation})`}
          </span>
        </div>

        {/* Loading + error sample states */}
        <div className="mt-3 flex flex-col gap-1" data-anyllm-preview-section="states">
          <span
            className="anyllm-translate-translation anyllm-translate-loading text-sm"
            role="status"
            aria-label="Translating"
          />
          <span
            className="anyllm-translate-translation text-sm"
            data-anyllm-error=""
            role="alert"
          >
            ⚠ Translation failed: example error
          </span>
        </div>
      </div>
    </Card>
  );
}
