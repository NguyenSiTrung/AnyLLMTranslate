/**
 * Subtitles Settings Section — position, font size, opacity, font family,
 * display mode, preferred source language, and auto-activate controls.
 * Includes an animated mini video player preview reactive to all settings.
 */

import { useState } from 'react';
import { Subtitles as SubtitlesIcon, Languages, Globe, RotateCcw, ChevronDown } from 'lucide-react';
import {
  SUPPORTED_SUBTITLE_SITES,
  SUBTITLE_SITES_INITIAL_VISIBLE,
  getSubtitleSitesLoadMoreState,
} from '@/lib/subtitleSites';
import { SectionHeader } from '@/ui/SectionHeader';
import { stagger } from '@/lib/styleUtils';
import { useSettingsStore } from '@/stores/settingsStore';
import { LANGUAGES } from '@/lib/languages';
import { FieldGroup } from '@/ui/FieldGroup';
import { Toggle } from '@/ui/Toggle';
import { Slider } from '@/ui/Slider';
import { Card } from '@/ui/Card';
import { Button } from '@/ui/Button';
import { Select } from '@/ui/Select';
import { SegmentedControl } from '@/ui/SegmentedControl';
import { DisabledDimmer } from '@/ui/DisabledDimmer';
import { SubtitlePreview } from '@/entrypoints/options/components/SubtitlePreview';
import type { SubtitleFontFamily, SubtitleDisplayMode, SubtitleFontSizeMode } from '@/types/config';
import type { ProfileKnobs } from '@/lib/subtitleProfiles';

// Auto = inherit from the resolved profile preset (omit the key from the override).
type KnobKey = keyof ProfileKnobs;

const POSITION_OPTIONS: { value: 'bottom' | 'top'; label: string }[] = [
  { value: 'bottom', label: 'Bottom' },
  { value: 'top', label: 'Top' },
];

const FONT_FAMILY_OPTIONS: { value: SubtitleFontFamily; label: string }[] = [
  { value: 'system', label: 'System' },
  { value: 'serif', label: 'Serif' },
  { value: 'monospace', label: 'Mono' },
];

const DISPLAY_MODE_OPTIONS: { value: SubtitleDisplayMode; label: string }[] = [
  { value: 'bilingual', label: 'Bilingual' },
  { value: 'translation-only', label: 'Translated Only' },
];

const FONT_SIZE_MODE_OPTIONS: { value: SubtitleFontSizeMode; label: string }[] = [
  { value: 'fixed', label: 'Fixed' },
  { value: 'auto', label: 'Auto (Video Size)' },
];

const REGISTER_OPTIONS: { value: string; label: string }[] = [
  { value: 'auto', label: 'Auto' },
  { value: 'formal', label: 'Formal' },
  { value: 'neutral', label: 'Neutral' },
  { value: 'casual', label: 'Casual' },
];

const FAITHFULNESS_OPTIONS: { value: string; label: string }[] = [
  { value: 'auto', label: 'Auto' },
  { value: 'literal', label: 'Literal' },
  { value: 'balanced', label: 'Balanced' },
  { value: 'idiomatic', label: 'Idiomatic' },
];

const BREVITY_OPTIONS: { value: string; label: string }[] = [
  { value: 'auto', label: 'Auto' },
  { value: 'relaxed', label: 'Relaxed' },
  { value: 'moderate', label: 'Moderate' },
  { value: 'terse', label: 'Terse' },
];

const PROFANITY_OPTIONS: { value: string; label: string }[] = [
  { value: 'auto', label: 'Auto' },
  { value: 'preserve', label: 'Preserve' },
  { value: 'soften', label: 'Soften' },
  { value: 'remove', label: 'Remove' },
];

export function SubtitlesSection() {
  const subtitleSettings = useSettingsStore((s) => s.subtitleSettings);
  const updateSettings = useSettingsStore((s) => s.updateSettings);
  const [visibleSiteCount, setVisibleSiteCount] = useState(SUBTITLE_SITES_INITIAL_VISIBLE);
  const {
    visibleSites,
    showLoadMore,
    remainingCount,
    nextVisibleCount,
  } = getSubtitleSitesLoadMoreState(SUPPORTED_SUBTITLE_SITES, visibleSiteCount);

  const handleUpdate = (partial: Partial<typeof subtitleSettings>) => {
    updateSettings({
      subtitleSettings: { ...subtitleSettings, ...partial },
    });
  };

  const preferredLanguages = LANGUAGES.filter((l) => l.code !== 'auto');
  const isDisabled = !subtitleSettings.enabled;

  const overrides = subtitleSettings.knobOverrides ?? {};

  const handleKnobChange = (knob: KnobKey, value: string) => {
    const next = { ...overrides };
    if (value === 'auto') {
      const { [knob]: _removed, ...rest } = next;
      handleUpdate({ knobOverrides: rest });
      return;
    } else {
      (next as Record<string, string>)[knob] = value;
    }
    handleUpdate({ knobOverrides: next });
  };

  const handleResetKnobs = () => {
    handleUpdate({ knobOverrides: {} });
  };

  return (
    <div className="animate-fade-in-up">
      <SectionHeader
        title="Subtitle Settings"
        description="Configure how translated subtitles appear on video players."
        icon={<SubtitlesIcon className="w-4 h-4" />}
        accentColor="cyan"
      />

      {/* FR-1 — Master Enable hero strip: the most important control sits above
          all configuration cards. Downstream cards dim when this is off. */}
      <div className="mb-4 rounded-xl border border-cyan-500/30 bg-cyan-500/[0.04] p-4">
        <Toggle
          id="subtitle-enabled-toggle"
          checked={subtitleSettings.enabled}
          onChange={(checked) => handleUpdate({ enabled: checked })}
          label="Enable Subtitles"
          description={subtitleSettings.enabled
            ? 'Translated subtitles are active on supported video players.'
            : 'Subtitles are off — enable to show translated subtitles on video players.'}
        />
      </div>

      <div className="space-y-4">
        {/* Preview card — placed first so users see live changes while adjusting controls */}
        <div className="animate-stagger" style={stagger(0)}>
          <Card title="Preview" variant="bordered">
            <SubtitlePreview
              disabled={isDisabled}
              fontSize={subtitleSettings.fontSize}
              fontSizeMode={subtitleSettings.fontSizeMode}
              backgroundOpacity={subtitleSettings.backgroundOpacity}
              fontFamily={subtitleSettings.fontFamily}
              displayMode={subtitleSettings.displayMode}
              position={subtitleSettings.position}
            />
          </Card>
        </div>

        {/* Translation Style card — editable translation knobs (global override) */}
        <div className="animate-stagger" style={stagger(1)}>
          <Card variant="bordered" title="Translation Style">
            <p className="text-xs text-zinc-500 mb-4 leading-relaxed">
              Auto uses the recommended value for each site's profile (Educational / Media / Cinematic).
              Override any knob to apply it everywhere subtitles are translated.
            </p>
            <DisabledDimmer disabled={isDisabled}>
              <div className="space-y-5">
                <FieldGroup label="Register" description="Tone of the translation.">
                  <SegmentedControl
                    label="Register"
                    options={REGISTER_OPTIONS}
                    value={overrides.register ?? 'auto'}
                    onChange={(v) => handleKnobChange('register', v)}
                    disabled={isDisabled}
                  />
                </FieldGroup>
                <FieldGroup label="Faithfulness" description="How closely the translation tracks the source wording.">
                  <SegmentedControl
                    label="Faithfulness"
                    options={FAITHFULNESS_OPTIONS}
                    value={overrides.faithfulness ?? 'auto'}
                    onChange={(v) => handleKnobChange('faithfulness', v)}
                    disabled={isDisabled}
                  />
                </FieldGroup>
                <FieldGroup label="Brevity" description="How aggressively filler is trimmed for on-screen brevity.">
                  <SegmentedControl
                    label="Brevity"
                    options={BREVITY_OPTIONS}
                    value={overrides.brevity ?? 'auto'}
                    onChange={(v) => handleKnobChange('brevity', v)}
                    disabled={isDisabled}
                  />
                </FieldGroup>
                <FieldGroup label="Profanity" description="How to handle strong profanity.">
                  <SegmentedControl
                    label="Profanity"
                    options={PROFANITY_OPTIONS}
                    value={overrides.profanity ?? 'auto'}
                    onChange={(v) => handleKnobChange('profanity', v)}
                    disabled={isDisabled}
                  />
                </FieldGroup>
                <button
                  type="button"
                  onClick={handleResetKnobs}
                  disabled={isDisabled || Object.keys(overrides).length === 0}
                  className="inline-flex items-center gap-1.5 text-xs text-zinc-400 hover:text-zinc-200 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  <RotateCcw className="w-3 h-3" />
                  Reset to profile defaults
                </button>
              </div>
            </DisabledDimmer>
          </Card>
        </div>

        {/* Appearance card — FR-2: Display Mode (was 'Behavior') joins
            Position / Font Family / Font Size / Opacity under one group.
            Enable toggle moved up to the hero strip (FR-1). */}
        <div className="animate-stagger" style={stagger(2)}>
          <Card variant="bordered" title="Appearance">
            {/* M4: Disable appearance controls when subtitles are off */}
            <DisabledDimmer disabled={isDisabled}>
              <div className="space-y-5">
                <FieldGroup
                  label="Subtitle Position"
                  description="Where subtitles appear relative to the video player."
                >
                  <SegmentedControl
                    label="Subtitle Position"
                    options={POSITION_OPTIONS}
                    value={subtitleSettings.position}
                    onChange={(val) => handleUpdate({ position: val })}
                    disabled={isDisabled}
                  />
                </FieldGroup>

                <FieldGroup
                  label="Font Family"
                  description="Typeface used for subtitle text in the overlay."
                >
                  <SegmentedControl
                    label="Font Family"
                    options={FONT_FAMILY_OPTIONS}
                    value={subtitleSettings.fontFamily}
                    onChange={(val) => handleUpdate({ fontFamily: val })}
                    disabled={isDisabled}
                  />
                </FieldGroup>

                <FieldGroup
                  label="Font Size Mode"
                  description="Fixed uses a set pixel value. Auto scales font size based on video player dimensions."
                >
                  <SegmentedControl
                    label="Font Size Mode"
                    options={FONT_SIZE_MODE_OPTIONS}
                    value={subtitleSettings.fontSizeMode}
                    onChange={(val) => handleUpdate({ fontSizeMode: val })}
                    disabled={isDisabled}
                  />
                </FieldGroup>

                {subtitleSettings.fontSizeMode === 'fixed' && (
                <Slider
                  id="subtitle-font-size"
                  label="Font Size"
                  value={subtitleSettings.fontSize}
                  min={10}
                  max={32}
                  step={1}
                  onChange={(v) => handleUpdate({ fontSize: v })}
                  formatValue={(v) => `${v}px`}
                  minLabel="10px"
                  maxLabel="32px"
                  disabled={isDisabled}
                />
                )}

                <Slider
                  id="subtitle-opacity"
                  label="Background Opacity"
                  value={subtitleSettings.backgroundOpacity}
                  min={0}
                  max={1}
                  step={0.05}
                  onChange={(v) => handleUpdate({ backgroundOpacity: v })}
                  formatValue={(v) => `${Math.round(v * 100)}%`}
                  minLabel="0%"
                  maxLabel="100%"
                  disabled={isDisabled}
                />

                <div className="border-t border-zinc-800 pt-5">
                  <FieldGroup
                    label="Display Mode"
                    description="Show both original and translated text, or translated text only."
                  >
                    <SegmentedControl
                      label="Display Mode"
                      options={DISPLAY_MODE_OPTIONS}
                      value={subtitleSettings.displayMode}
                      onChange={(val) => handleUpdate({ displayMode: val })}
                      disabled={isDisabled}
                    />
                  </FieldGroup>
                </div>
              </div>
            </DisabledDimmer>
          </Card>
        </div>

        {/* Language Discovery card */}
        <div className="animate-stagger" style={stagger(3)}>
          <Card title="Language Discovery" icon={<Languages className="w-3.5 h-3.5" />} variant="bordered">
            <div className="space-y-5">
              <FieldGroup
                label="Preferred source subtitle language"
                description="Choose the subtitle track language to auto-select before translating to your target language."
                hint="Used when platforms like YouTube, Udemy, or Coursera expose multiple subtitle tracks."
                htmlFor="subtitle-preferred-language"
              >
                <Select
                  id="subtitle-preferred-language"
                  value={subtitleSettings.preferredSubtitleLanguage}
                  onChange={(e) => handleUpdate({ preferredSubtitleLanguage: e.target.value })}
                  disabled={isDisabled}
                  options={preferredLanguages.map((lang) => ({
                    value: lang.code,
                    label: `${lang.nativeName} (${lang.name})`,
                  }))}
                />
              </FieldGroup>

              <Toggle
                id="subtitle-auto-activate-toggle"
                checked={subtitleSettings.autoActivateSubtitles}
                onChange={(checked) => handleUpdate({ autoActivateSubtitles: checked })}
                label="Auto-Activate Subtitles"
                description="Automatically fetch and translate subtitles when the preferred language is detected on a video page, without needing to manually enable captions."
                disabled={isDisabled}
              />
            </div>
          </Card>
        </div>

        {/* Supported Sites card */}
        <div className="animate-stagger" style={stagger(4)}>
          <Card title="Supported Sites" icon={<Globe className="w-3.5 h-3.5" />} variant="bordered">
            <DisabledDimmer disabled={isDisabled}>
              <div className="divide-y divide-zinc-800/50">
                {visibleSites.map((site) => {
                  const disabled = (subtitleSettings.disabledSubtitleSites ?? []).includes(site.platform);
                  return (
                    <div key={site.platform} className="flex items-start justify-between gap-4 py-2.5 first:pt-0 last:pb-0">
                      <div className="min-w-0 flex-1">
                        <div className="text-sm text-zinc-200">{site.name}</div>
                        <div className="text-xs text-zinc-500 mt-0.5">{site.methodHint}</div>
                      </div>
                      <div className="shrink-0 pt-0.5">
                        <Toggle
                          id={`subtitle-site-${site.platform}`}
                          ariaLabel={`${site.name} subtitles`}
                          checked={!disabled}
                          onChange={(checked) => {
                            const current = subtitleSettings.disabledSubtitleSites ?? [];
                            const updated = checked
                              ? current.filter((p) => p !== site.platform)
                              : [...current, site.platform];
                            handleUpdate({ disabledSubtitleSites: updated });
                          }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>

              {showLoadMore && (
                <div className="pt-3">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    icon={<ChevronDown className="w-3.5 h-3.5" />}
                    onClick={() => setVisibleSiteCount(nextVisibleCount)}
                    className="w-full justify-center text-zinc-400"
                  >
                    Load more ({remainingCount} remaining)
                  </Button>
                </div>
              )}

              {/* Generic handler — same row layout as platform sites; separate
                  boolean setting, not the per-site disable array. */}
              <div className="flex items-start justify-between gap-4 py-2.5 border-t border-zinc-800/50">
                <div className="min-w-0 flex-1">
                  <div className="text-sm text-zinc-200">Generic Subtitle Detection</div>
                  <div className="text-xs text-zinc-500 mt-0.5 leading-relaxed">
                    Auto-detect and translate subtitles on unsupported sites with a video element
                    (broad .vtt/.srt/.ttml interception + DOM fallback). Platform-specific handlers
                    always take precedence.
                  </div>
                </div>
                <div className="shrink-0 pt-0.5">
                  <Toggle
                    id="subtitle-generic-handler-toggle"
                    ariaLabel="Generic Subtitle Detection"
                    checked={subtitleSettings.enableGenericSubtitleHandler}
                    onChange={(checked) => handleUpdate({ enableGenericSubtitleHandler: checked })}
                    disabled={isDisabled}
                  />
                </div>
              </div>
            </DisabledDimmer>
          </Card>
        </div>
      </div>
    </div>
  );
}
