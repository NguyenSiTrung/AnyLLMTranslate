/**
 * Theme Studio — article canvas, categorized gallery, soft-preview, custom editor.
 */

import { useState } from 'react';
import { Palette } from 'lucide-react';
import { useSettingsStore } from '@/stores/settingsStore';
import type { ThemeName } from '@/types/config';
import type { ThemeCategory } from '@/lib/themes';
import { getThemeDefinition } from '@/lib/themes';
import { SectionHeader } from '@/ui/SectionHeader';
import { ThemeGallery } from '../components/ThemeGallery';
import {
  ThemeStudioCanvas,
  type CanvasPageMode,
} from '../ThemeStudioCanvas';
import { CustomThemeEditor } from '../CustomThemeEditor';

export interface ThemesSectionProps {
  onNavigateToGeneral?: () => void;
}

export function ThemesSection({ onNavigateToGeneral }: ThemesSectionProps = {}) {
  const theme = useSettingsStore((s) => s.theme);
  const customTheme = useSettingsStore((s) => s.customTheme);
  const displayMode = useSettingsStore((s) => s.displayMode);
  const translationPosition = useSettingsStore((s) => s.translationPosition);
  const darkMode = useSettingsStore((s) => s.darkMode);
  const updateSettings = useSettingsStore((s) => s.updateSettings);

  const [category, setCategory] = useState<ThemeCategory | 'all'>('all');
  const [previewTheme, setPreviewTheme] = useState<ThemeName | null>(null);
  const [canvasMode, setCanvasMode] = useState<CanvasPageMode>('match');
  const [showSampleStates, setShowSampleStates] = useState(false);

  const effectiveTheme = previewTheme ?? theme;
  const effectiveDef = getThemeDefinition(effectiveTheme);
  const committedDef = getThemeDefinition(theme);
  const showCustomEditor = theme === 'custom' || previewTheme === 'custom';

  return (
    <div className="animate-fade-in-up">
      <SectionHeader
        title="Theme Studio"
        description="See how translations look on a real page, then pick a style."
        icon={<Palette className="w-4 h-4" />}
        accentColor="cyan"
      />

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4 items-start">
        <div className="lg:col-span-2 order-2 lg:order-1">
          <ThemeGallery
            category={category}
            onCategoryChange={setCategory}
            committedTheme={theme}
            previewTheme={previewTheme}
            customTheme={customTheme}
            onCommit={(id) => updateSettings({ theme: id })}
            onPreviewStart={setPreviewTheme}
            onPreviewEnd={() => setPreviewTheme(null)}
          />
        </div>

        <div className="lg:col-span-3 order-1 lg:order-2 lg:sticky lg:top-14 space-y-4">
          <ThemeStudioCanvas
            theme={effectiveTheme}
            isPreviewing={previewTheme != null && previewTheme !== theme}
            committedThemeLabel={committedDef?.label}
            previewThemeLabel={effectiveDef?.label}
            tip={effectiveDef?.tip}
            displayMode={displayMode}
            translationPosition={translationPosition}
            darkModeSetting={darkMode}
            customTheme={customTheme}
            showSampleStates={showSampleStates}
            onShowSampleStatesChange={setShowSampleStates}
            canvasMode={canvasMode}
            onCanvasModeChange={setCanvasMode}
          />

          {showCustomEditor ? <CustomThemeEditor /> : null}
        </div>
      </div>

      <p className="mt-6 text-xs text-zinc-500">
        Translation position and display mode are set in General.
        {onNavigateToGeneral ? (
          <>
            {' '}
            <button
              type="button"
              className="text-cyan-400 hover:text-cyan-300 underline-offset-2 hover:underline"
              onClick={onNavigateToGeneral}
            >
              Open General
            </button>
          </>
        ) : null}
      </p>
    </div>
  );
}
