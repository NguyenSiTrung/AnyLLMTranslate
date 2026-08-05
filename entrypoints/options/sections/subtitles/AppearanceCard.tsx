/**
 * Appearance controls for Subtitle Studio (studio rail).
 */

import {
  ArrowDownToLine,
  ArrowUpToLine,
  Languages,
  Type,
  Paintbrush,
} from 'lucide-react';
import { Card } from '@/ui/Card';
import { Badge } from '@/ui/Badge';
import { DisabledDimmer } from '@/ui/DisabledDimmer';
import { AdvancedDisclosure } from '@/ui/AdvancedDisclosure';
import { SettingsGroup } from '@/ui/SettingsGroup';
import { SegmentedControl } from '@/ui/SegmentedControl';
import { Slider } from '@/ui/Slider';
import { SUBTITLE_STYLE_PRESETS } from '@/lib/subtitleStylePresets';
import type { SubtitleStyleOverrides, SubtitleStylePresetId } from '@/types/config';
import {
  FONT_FAMILY_OPTIONS,
  FONT_SIZE_MODE_OPTIONS,
} from './knobSpec';
import type { SubtitleCardBaseProps } from './types';

const POSITION_OPTIONS = [
  {
    value: 'bottom' as const,
    label: 'Bottom',
    icon: <ArrowDownToLine className="w-3.5 h-3.5" />,
  },
  {
    value: 'top' as const,
    label: 'Top',
    icon: <ArrowUpToLine className="w-3.5 h-3.5" />,
  },
];

const DISPLAY_MODE_OPTIONS = [
  {
    value: 'bilingual' as const,
    label: 'Bilingual',
    icon: <Languages className="w-3.5 h-3.5" />,
  },
  {
    value: 'translation-only' as const,
    label: 'Translated',
    icon: <Type className="w-3.5 h-3.5" />,
  },
];

const BACKGROUND_STYLE_OPTIONS = [
  { value: 'none' as const, label: 'None' },
  { value: 'black-box' as const, label: 'Black box' },
  { value: 'white-box' as const, label: 'White box' },
];

const STYLE_PRESET_IDS = Object.keys(SUBTITLE_STYLE_PRESETS) as SubtitleStylePresetId[];

export function AppearanceCard({ settings, disabled, onUpdate }: SubtitleCardBaseProps) {
  const overrides = settings.styleOverrides ?? {};
  const hasCustom = Object.keys(overrides).length > 0;
  const preset = SUBTITLE_STYLE_PRESETS[settings.stylePreset] ?? SUBTITLE_STYLE_PRESETS.classic;
  const effectiveBackgroundStyle = overrides.backgroundStyle ?? preset.backgroundStyle;
  const setOverride = (partial: Partial<SubtitleStyleOverrides>) => {
    onUpdate({ styleOverrides: { ...overrides, ...partial } });
  };

  return (
    <Card
      title="Appearance"
      description="Layout and type for the on-player overlay."
      icon={<Paintbrush className="w-3.5 h-3.5" />}
      variant="bordered"
    >
      <DisabledDimmer disabled={disabled}>
        <div className="space-y-5">
          <SettingsGroup title="Style" description="Preset caption looks. Classic is the original look.">
            <div className="flex flex-wrap items-center gap-1.5">
              {STYLE_PRESET_IDS.map((id) => {
                const active = !hasCustom && settings.stylePreset === id;
                return (
                  <button
                    key={id}
                    type="button"
                    aria-pressed={active}
                    onClick={() => onUpdate({ stylePreset: id, styleOverrides: {} })}
                    className={`text-xs font-medium px-2.5 py-1 rounded-full border transition-colors ${
                      active
                        ? 'bg-cyan-500/15 text-cyan-300 border-cyan-500/30'
                        : 'bg-zinc-800/60 text-zinc-400 border-zinc-700/70 hover:text-zinc-200 hover:border-zinc-600'
                    }`}
                  >
                    {SUBTITLE_STYLE_PRESETS[id].label}
                  </button>
                );
              })}
              {hasCustom && <Badge>Custom</Badge>}
            </div>
            <AdvancedDisclosure label="Customize colors" idPrefix="subtitle-style-custom">
              <div className="space-y-4 pt-1">
                <div>
                  <label
                    htmlFor="subtitle-style-text-color"
                    className="text-xs text-zinc-400"
                  >
                    Text color
                  </label>
                  <input
                    id="subtitle-style-text-color"
                    type="color"
                    value={overrides.textColor ?? preset.textColor}
                    onChange={(e) => setOverride({ textColor: e.target.value })}
                    className="mt-1 h-8 w-14 rounded border border-zinc-700 bg-zinc-900 p-1"
                  />
                </div>
                <SegmentedControl
                  label="Background"
                  options={BACKGROUND_STYLE_OPTIONS}
                  value={overrides.backgroundStyle ?? preset.backgroundStyle}
                  onChange={(val) => setOverride({ backgroundStyle: val })}
                  disabled={disabled}
                  accent="cyan"
                />
                <Slider
                  id="subtitle-style-shadow"
                  label="Shadow Strength"
                  value={overrides.shadowStrength ?? preset.shadowStrength}
                  min={0}
                  max={1}
                  step={0.05}
                  onChange={(v) => setOverride({ shadowStrength: v })}
                  formatValue={(v) => `${Math.round(v * 100)}%`}
                  minLabel="None"
                  maxLabel="Strong"
                  disabled={disabled}
                />
              </div>
            </AdvancedDisclosure>
          </SettingsGroup>

          <SettingsGroup title="Layout" description="Where captions sit relative to the video.">
            <SegmentedControl
              label="Subtitle Position"
              options={POSITION_OPTIONS}
              value={settings.position}
              onChange={(val) => onUpdate({ position: val })}
              disabled={disabled}
              accent="cyan"
            />
          </SettingsGroup>

          <SettingsGroup title="Type" description="Typeface and size for overlay text.">
            <div className="space-y-4">
              <SegmentedControl
                label="Font Family"
                options={FONT_FAMILY_OPTIONS}
                value={settings.fontFamily}
                onChange={(val) => onUpdate({ fontFamily: val })}
                disabled={disabled}
                accent="cyan"
              />
              <div>
                <SegmentedControl
                  label="Font Size Mode"
                  options={FONT_SIZE_MODE_OPTIONS}
                  value={settings.fontSizeMode}
                  onChange={(val) => onUpdate({ fontSizeMode: val })}
                  disabled={disabled}
                  accent="cyan"
                />
                <p className="text-[10px] text-zinc-500 mt-1.5">
                  Auto scales with player height.
                </p>
              </div>
              {settings.fontSizeMode === 'fixed' && (
                <Slider
                  id="subtitle-font-size"
                  label="Font Size"
                  value={settings.fontSize}
                  min={10}
                  max={32}
                  step={1}
                  onChange={(v) => onUpdate({ fontSize: v })}
                  formatValue={(v) => `${v}px`}
                  minLabel="10px"
                  maxLabel="32px"
                  disabled={disabled}
                />
              )}
            </div>
          </SettingsGroup>

          <SettingsGroup title="Backdrop">
            <DisabledDimmer disabled={effectiveBackgroundStyle === 'none'}>
              <Slider
                id="subtitle-opacity"
                label="Background Opacity"
                value={settings.backgroundOpacity}
                min={0}
                max={1}
                step={0.05}
                onChange={(v) => onUpdate({ backgroundOpacity: v })}
                formatValue={(v) => `${Math.round(v * 100)}%`}
                minLabel="0%"
                maxLabel="100%"
                disabled={disabled}
              />
            </DisabledDimmer>
          </SettingsGroup>

          <SettingsGroup
            title="Mode"
            description="Bilingual shows original + translation. Translated shows translation only."
          >
            <SegmentedControl
              label="Display Mode"
              options={DISPLAY_MODE_OPTIONS}
              value={settings.displayMode}
              onChange={(val) => onUpdate({ displayMode: val })}
              disabled={disabled}
              accent="cyan"
            />
          </SettingsGroup>
        </div>
      </DisabledDimmer>
    </Card>
  );
}
