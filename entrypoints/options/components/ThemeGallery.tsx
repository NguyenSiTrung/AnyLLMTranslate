/**
 * Category chips + theme radiogroup grid for Theme Studio.
 */

import type { CustomThemeConfig, ThemeName } from '@/types/config';
import type { ThemeCategory } from '@/lib/themes';
import { themesByCategory } from '@/lib/themes';
import { ThemeCard } from './ThemeCard';

const CATEGORY_CHIPS: { id: ThemeCategory | 'all'; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'classic', label: 'Classic' },
  { id: 'accent', label: 'Accent' },
  { id: 'layout', label: 'Layout' },
  { id: 'interactive', label: 'Interactive' },
  { id: 'custom', label: 'Custom' },
];

export interface ThemeGalleryProps {
  category: ThemeCategory | 'all';
  onCategoryChange: (category: ThemeCategory | 'all') => void;
  committedTheme: ThemeName;
  previewTheme: ThemeName | null;
  customTheme?: CustomThemeConfig;
  onCommit: (id: ThemeName) => void;
  onPreviewStart: (id: ThemeName) => void;
  onPreviewEnd: () => void;
}

export function ThemeGallery({
  category,
  onCategoryChange,
  committedTheme,
  previewTheme,
  customTheme,
  onCommit,
  onPreviewStart,
  onPreviewEnd,
}: ThemeGalleryProps) {
  const items = themesByCategory(category);

  return (
    <div className="space-y-3">
      <div
        role="tablist"
        aria-label="Theme categories"
        className="flex flex-wrap gap-1.5"
      >
        {CATEGORY_CHIPS.map((chip) => {
          const active = category === chip.id;
          return (
            <button
              key={chip.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => onCategoryChange(chip.id)}
              className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors ${
                active
                  ? 'border-cyan-500/50 bg-cyan-500/10 text-cyan-300'
                  : 'border-zinc-800 bg-zinc-900 text-zinc-400 hover:border-zinc-700'
              }`}
            >
              {chip.label}
            </button>
          );
        })}
      </div>

      <div
        role="radiogroup"
        aria-label="Display themes"
        className="grid grid-cols-1 sm:grid-cols-2 gap-3"
        onMouseLeave={onPreviewEnd}
      >
        {items.map((def) => (
          <ThemeCard
            key={def.id}
            definition={def}
            committed={committedTheme === def.id}
            previewing={previewTheme === def.id && committedTheme !== def.id}
            customTheme={customTheme}
            onSelect={() => onCommit(def.id)}
            onPreviewStart={() => onPreviewStart(def.id)}
            onPreviewEnd={onPreviewEnd}
          />
        ))}
      </div>

      {items.length === 0 ? (
        <p className="text-sm text-zinc-500">No themes in this category.</p>
      ) : null}
    </div>
  );
}
