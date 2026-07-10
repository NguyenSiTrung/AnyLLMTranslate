/**
 * Compact bilingual sample using real inject.css theme rules.
 */

import { useMemo } from 'react';
import type { CSSProperties } from 'react';
import type { ThemeName, CustomThemeConfig } from '@/types/config';
import { DEFAULT_CUSTOM_THEME } from '@/types/config';

const MINI_ORIGINAL = 'The quick brown fox jumps.';
const MINI_TRANSLATION = 'Con cáo nâu nhanh nhẹn nhảy.';

export interface ThemeMiniPreviewProps {
  theme: ThemeName;
  customTheme?: CustomThemeConfig;
  /** Dark host page simulation */
  isDark?: boolean;
  className?: string;
}

export function ThemeMiniPreview({
  theme,
  customTheme,
  isDark = true,
  className = '',
}: ThemeMiniPreviewProps) {
  const customStyle = useMemo(() => {
    if (theme !== 'custom') return undefined;
    const config = customTheme ?? DEFAULT_CUSTOM_THEME;
    const fontSizeMap = { smaller: '0.9em', same: 'inherit', larger: '1.1em' } as const;
    return {
      '--anyllm-custom-text-color': config.textColor,
      '--anyllm-custom-bg-color': config.backgroundColor,
      '--anyllm-custom-border-style': config.borderStyle,
      '--anyllm-custom-border-color': config.borderColor,
      '--anyllm-custom-font-style': config.fontStyle,
      '--anyllm-custom-font-size': fontSizeMap[config.fontSize],
    } as CSSProperties;
  }, [theme, customTheme]);

  return (
    <div
      className={`theme-preview-container rounded-md p-2 border border-zinc-700/40 text-[11px] leading-snug overflow-hidden ${
        isDark ? 'anyllm-dark bg-zinc-950' : 'bg-white'
      } ${className}`}
      data-anyllm-theme={theme}
      data-anyllm-state="dual"
      data-anyllm-position="below"
      style={customStyle}
      aria-hidden="true"
    >
      <div
        data-anyllm-role="original"
        className={isDark ? 'text-zinc-300' : 'text-zinc-700'}
      >
        {MINI_ORIGINAL}
      </div>
      <div
        data-anyllm-role="translation"
        lang="vi"
        dir="auto"
        className="anyllm-translate-translation"
      >
        {MINI_TRANSLATION}
      </div>
    </div>
  );
}
