/**
 * Theme gallery card with real-CSS mini preview and radio semantics.
 */

import { Check } from 'lucide-react';
import type { CustomThemeConfig } from '@/types/config';
import type { ThemeDefinition } from '@/lib/themes';
import { ThemeMiniPreview } from './ThemeMiniPreview';

export interface ThemeCardProps {
  definition: ThemeDefinition;
  committed: boolean;
  previewing: boolean;
  customTheme?: CustomThemeConfig;
  onSelect: () => void;
  onPreviewStart: () => void;
  onPreviewEnd: () => void;
}

export function ThemeCard({
  definition,
  committed,
  previewing,
  customTheme,
  onSelect,
  onPreviewStart,
  onPreviewEnd,
}: ThemeCardProps) {
  let ringClass =
    'border-zinc-800 bg-zinc-900 hover:border-zinc-700 hover:bg-zinc-800/50';
  if (committed) {
    ringClass = 'border-cyan-500 bg-cyan-500/5 ring-1 ring-cyan-500/30';
  } else if (previewing) {
    ringClass = 'border-cyan-500/40 bg-zinc-900 ring-1 ring-cyan-500/15';
  }

  return (
    <button
      type="button"
      role="radio"
      aria-checked={committed}
      aria-label={`${definition.label}. ${definition.description}`}
      id={`theme-${definition.id}`}
      onClick={onSelect}
      onMouseEnter={onPreviewStart}
      onMouseLeave={onPreviewEnd}
      onFocus={onPreviewStart}
      className={`relative w-full text-left p-3 rounded-xl border transition-all duration-200 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500/60 ${ringClass}`}
    >
      {committed && (
        <span className="absolute top-2 right-2 z-10 w-5 h-5 bg-cyan-500 rounded-full flex items-center justify-center">
          <Check className="w-3 h-3 text-white" aria-hidden />
        </span>
      )}

      <ThemeMiniPreview
        theme={definition.id}
        customTheme={customTheme}
        isDark
      />

      <div className="mt-2 pr-6">
        <div className="text-sm font-medium text-zinc-200">{definition.label}</div>
        <div className="text-xs text-zinc-500 mt-0.5">{definition.description}</div>
        {definition.id === 'custom' && customTheme ? (
          <div className="flex gap-1 mt-2" aria-hidden>
            <span
              className="w-3 h-3 rounded-full border border-zinc-600"
              style={{ background: customTheme.textColor }}
            />
            <span
              className="w-3 h-3 rounded-full border border-zinc-600"
              style={{
                background:
                  customTheme.backgroundColor === 'transparent'
                    ? 'repeating-conic-gradient(#52525b 0% 25%, #27272a 0% 50%) 50% / 8px 8px'
                    : customTheme.backgroundColor,
              }}
            />
            <span
              className="w-3 h-3 rounded-full border border-zinc-600"
              style={{ background: customTheme.borderColor }}
            />
          </div>
        ) : null}
      </div>
    </button>
  );
}
