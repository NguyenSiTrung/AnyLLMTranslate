/**
 * General Settings Section — language, layout, style, advanced display.
 *
 * Four-card IA (2026-07-09):
 * 1. Language — source/target + swap
 * 2. Layout — display mode + translation position
 * 3. Style — theme summary/select/browse + page contrast
 * 4. Advanced display — compact inline toggle
 */

import type { ReactNode } from 'react';
import {
  Globe,
  SlidersHorizontal,
  Columns2,
  Palette,
  Sparkles,
  Languages,
  Type,
  ArrowDown,
  ArrowUp,
  ArrowRight,
  ArrowLeftRight,
  Monitor,
  Sun,
  Moon,
  ExternalLink,
} from 'lucide-react';
import { useSettingsStore } from '@/stores/settingsStore';
import { LANGUAGES } from '@/lib/languages';
import { getThemeOptionMeta, themeOptionsForSelect } from '@/lib/themes';
import { FieldGroup } from '@/ui/FieldGroup';
import { Select } from '@/ui/Select';
import { Card } from '@/ui/Card';
import { SegmentedControl } from '@/ui/SegmentedControl';
import { Toggle } from '@/ui/Toggle';
import { SectionHeader } from '@/ui/SectionHeader';
import { Button } from '@/ui/Button';
import { stagger } from '@/lib/styleUtils';
import type { ThemeName, TranslationPosition, DarkMode, DisplayMode } from '@/types/config';

const DISPLAY_MODE_OPTIONS: { value: DisplayMode; label: string; icon: ReactNode }[] = [
  {
    value: 'bilingual-below',
    label: 'Bilingual',
    icon: <Languages className="w-3.5 h-3.5" />,
  },
  {
    value: 'translation-only',
    label: 'Translation only',
    icon: <Type className="w-3.5 h-3.5" />,
  },
];

const POSITION_OPTIONS: { value: TranslationPosition; label: string; icon: ReactNode }[] = [
  { value: 'below', label: 'Below', icon: <ArrowDown className="w-3.5 h-3.5" /> },
  { value: 'above', label: 'Above', icon: <ArrowUp className="w-3.5 h-3.5" /> },
  { value: 'side', label: 'Side', icon: <ArrowRight className="w-3.5 h-3.5" /> },
];

const PAGE_CONTRAST_OPTIONS: { value: DarkMode; label: string; icon: ReactNode }[] = [
  { value: 'auto', label: 'Auto', icon: <Monitor className="w-3.5 h-3.5" /> },
  { value: 'light', label: 'Light', icon: <Sun className="w-3.5 h-3.5" /> },
  { value: 'dark', label: 'Dark', icon: <Moon className="w-3.5 h-3.5" /> },
];

interface GeneralSectionProps {
  onNavigateToThemes?: () => void;
}

export function GeneralSection({ onNavigateToThemes }: GeneralSectionProps) {
  const settings = useSettingsStore();
  const updateSettings = useSettingsStore((s) => s.updateSettings);
  const targetLanguages = LANGUAGES.filter((l) => l.code !== 'auto');
  const sourceLanguages = LANGUAGES;

  const isTranslationOnly = settings.displayMode === 'translation-only';
  const canSwap = settings.sourceLanguage !== 'auto';
  const themeMeta =
    getThemeOptionMeta(settings.theme) ??
    ({ id: settings.theme, label: settings.theme, description: undefined } as const);

  const handleSwap = () => {
    if (!canSwap) return;
    updateSettings({
      sourceLanguage: settings.targetLanguage,
      targetLanguage: settings.sourceLanguage,
    });
  };

  return (
    <div className="animate-fade-in-up">
      <SectionHeader
        title="General"
        description="Language, layout, and how translations look."
        icon={<SlidersHorizontal className="w-4 h-4" />}
        accentColor="blue"
      />

      <div className="space-y-4">
        {/* 1. Language */}
        <div className="animate-stagger" style={stagger(0)}>
          <Card
            title="Language"
            description="Languages for page translation."
            icon={<Globe className="w-3.5 h-3.5" />}
            variant="bordered"
          >
            <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
              <div className="min-w-0 flex-1">
                <FieldGroup label="Source language" htmlFor="general-source-language">
                  <Select
                    id="general-source-language"
                    value={settings.sourceLanguage}
                    onChange={(e) => updateSettings({ sourceLanguage: e.target.value })}
                    options={sourceLanguages.map((lang) => ({
                      value: lang.code,
                      label:
                        lang.code === 'auto'
                          ? `🌐 ${lang.nativeName} (${lang.name})`
                          : `${lang.nativeName} (${lang.name})`,
                    }))}
                  />
                </FieldGroup>
              </div>

              <div className="flex shrink-0 justify-center pb-0.5 sm:px-1">
                <button
                  type="button"
                  aria-label="Swap languages"
                  title={
                    canSwap
                      ? 'Swap source and target'
                      : 'Cannot swap while source is Auto-detect'
                  }
                  disabled={!canSwap}
                  onClick={handleSwap}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-zinc-700 bg-zinc-800/80 text-zinc-300 transition-colors hover:bg-zinc-700 hover:text-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-zinc-800/80 disabled:hover:text-zinc-300"
                >
                  <ArrowLeftRight className="h-4 w-4" />
                </button>
              </div>

              <div className="min-w-0 flex-1">
                <FieldGroup label="Target language" htmlFor="general-target-language">
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
            </div>
          </Card>
        </div>

        {/* 2. Layout */}
        <div className="animate-stagger" style={stagger(1)}>
          <Card
            title="Layout"
            description="How original and translated text are arranged on the page."
            icon={<Columns2 className="w-3.5 h-3.5" />}
            variant="bordered"
          >
            <div className="space-y-5">
              <FieldGroup
                label="Display mode"
                description="Bilingual keeps the original visible. Translation only replaces it."
              >
                <SegmentedControl
                  id="general-display-mode"
                  label="Display mode"
                  options={DISPLAY_MODE_OPTIONS}
                  value={settings.displayMode}
                  onChange={(val) => updateSettings({ displayMode: val })}
                />
              </FieldGroup>

              <div
                className={`transition-opacity duration-200 ${
                  isTranslationOnly ? 'opacity-40' : ''
                }`}
              >
                <FieldGroup
                  label="Translation position"
                  description="Where the translation appears relative to the original text."
                  hint={
                    isTranslationOnly
                      ? 'Position only applies in Bilingual mode.'
                      : undefined
                  }
                >
                  <SegmentedControl
                    id="general-translation-position"
                    label="Translation position"
                    options={POSITION_OPTIONS}
                    value={settings.translationPosition}
                    onChange={(val) => updateSettings({ translationPosition: val })}
                    disabled={isTranslationOnly}
                  />
                </FieldGroup>
              </div>
            </div>
          </Card>
        </div>

        {/* 3. Style */}
        <div className="animate-stagger" style={stagger(2)}>
          <Card
            title="Style"
            description="Visual style and contrast for injected translations."
            icon={<Palette className="w-3.5 h-3.5" />}
            variant="bordered"
          >
            <div className="space-y-5">
              <div>
                <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
                      Current theme
                    </p>
                    <p className="mt-1 text-sm font-medium text-zinc-100">{themeMeta.label}</p>
                    {themeMeta.description ? (
                      <p className="mt-0.5 text-xs text-zinc-500">{themeMeta.description}</p>
                    ) : null}
                  </div>
                  {onNavigateToThemes ? (
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      icon={<ExternalLink className="h-3.5 w-3.5" />}
                      onClick={onNavigateToThemes}
                    >
                      Browse themes
                    </Button>
                  ) : null}
                </div>

                <FieldGroup label="Theme" htmlFor="general-theme">
                  <Select
                    id="general-theme"
                    value={settings.theme}
                    onChange={(e) =>
                      updateSettings({ theme: e.target.value as ThemeName })
                    }
                    options={themeOptionsForSelect()}
                  />
                </FieldGroup>
              </div>

              <FieldGroup
                label="Page contrast"
                description="Match translation contrast to the host page. Auto detects the site theme."
              >
                <SegmentedControl
                  id="general-host-page-mode"
                  label="Page contrast"
                  options={PAGE_CONTRAST_OPTIONS}
                  value={settings.darkMode}
                  onChange={(val) => updateSettings({ darkMode: val })}
                />
              </FieldGroup>
            </div>
          </Card>
        </div>

        {/* 4. Advanced display */}
        <div className="animate-stagger" style={stagger(3)}>
          <Card
            title="Advanced display"
            description="Optional behavior for short phrases."
            icon={<Sparkles className="w-3.5 h-3.5" />}
            variant="bordered"
          >
            <Toggle
              id="general-compact-inline-toggle"
              checked={settings.enableCompactInlineForShortText}
              onChange={(checked) =>
                updateSettings({ enableCompactInlineForShortText: checked })
              }
              label="Compact inline for short text"
              description="Show short translations inline in parentheses. Turn off for uniform block display that always matches your theme."
            />
          </Card>
        </div>
      </div>
    </div>
  );
}
