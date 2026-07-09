/**
 * Subtitles Settings Section — position, font size, opacity, font family,
 * display mode, preferred source language, and auto-activate controls.
 * Includes an animated mini video player preview reactive to all settings.
 */

import { useState } from 'react';
import { Subtitles as SubtitlesIcon, Languages, Globe, RotateCcw, ChevronDown, Info } from 'lucide-react';
import {
  SUPPORTED_SUBTITLE_SITES,
  SUBTITLE_SITES_INITIAL_VISIBLE,
  getSubtitleSitesLoadMoreState,
  monogramAccentClasses,
  type SubtitleSiteInfo,
} from '@/lib/subtitleSites';
import { SectionHeader } from '@/ui/SectionHeader';
import { stagger } from '@/lib/styleUtils';
import { useSettingsStore } from '@/stores/settingsStore';
import { LANGUAGES } from '@/lib/languages';
import { FieldGroup } from '@/ui/FieldGroup';
import { Toggle } from '@/ui/Toggle';
import { Slider } from '@/ui/Slider';
import { Card } from '@/ui/Card';
import { Badge } from '@/ui/Badge';
import { Button } from '@/ui/Button';
import { Select } from '@/ui/Select';
import { SegmentedControl } from '@/ui/SegmentedControl';
import { AdvancedDisclosure } from '@/ui/AdvancedDisclosure';
import { DisabledDimmer } from '@/ui/DisabledDimmer';
import { SubtitlePreview } from '@/entrypoints/options/components/SubtitlePreview';
import { getPreviewCuesForLanguage, resolveStyleChipLabel } from '@/lib/subtitlePreviewCues';
import {
  DEFAULT_YOUTUBE_ASR_RESEGMENT_SETTINGS,
  type SubtitleFontFamily,
  type SubtitleDisplayMode,
  type SubtitleFontSizeMode,
} from '@/types/config';
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

/**
 * FR-3 — Data-driven translation-style knobs. The four copy-pasted knob blocks
 * (Register / Faithfulness / Brevity / Profanity) collapse into a single
 * mapped render below. 'auto' means "inherit the resolved profile preset"
 * (the override key is omitted). Identical output to the previous blocks.
 */
interface KnobSpec {
  key: KnobKey;
  label: string;
  description: string;
  options: { value: string; label: string }[];
}

const KNOB_SPEC: KnobSpec[] = [
  {
    key: 'register',
    label: 'Register',
    description: 'Tone of the translation.',
    options: [
      { value: 'auto', label: 'Auto' },
      { value: 'formal', label: 'Formal' },
      { value: 'neutral', label: 'Neutral' },
      { value: 'casual', label: 'Casual' },
    ],
  },
  {
    key: 'faithfulness',
    label: 'Faithfulness',
    description: 'How closely the translation tracks the source wording.',
    options: [
      { value: 'auto', label: 'Auto' },
      { value: 'literal', label: 'Literal' },
      { value: 'balanced', label: 'Balanced' },
      { value: 'idiomatic', label: 'Idiomatic' },
    ],
  },
  {
    key: 'brevity',
    label: 'Brevity',
    description: 'How aggressively filler is trimmed for on-screen brevity.',
    options: [
      { value: 'auto', label: 'Auto' },
      { value: 'relaxed', label: 'Relaxed' },
      { value: 'moderate', label: 'Moderate' },
      { value: 'terse', label: 'Terse' },
    ],
  },
  {
    key: 'profanity',
    label: 'Profanity',
    description: 'How to handle strong profanity.',
    options: [
      { value: 'auto', label: 'Auto' },
      { value: 'preserve', label: 'Preserve' },
      { value: 'soften', label: 'Soften' },
      { value: 'remove', label: 'Remove' },
    ],
  },
];

/** FR-6 — leading monogram dot for a supported site (scannability). */
function MonogramDot({ site }: { site: SubtitleSiteInfo }) {
  const monogram = site.monogram ?? site.name.slice(0, 1);
  return (
    <span
      className={`shrink-0 inline-flex items-center justify-center w-7 h-7 rounded-md border text-[11px] font-semibold ${monogramAccentClasses(site.accent)}`}
      aria-hidden="true"
    >
      {monogram}
    </span>
  );
}

/** FR-6 — a single Supported Sites row: monogram + friendly label/summary +
 *  method hint tooltip + toggle. */
function SiteRow({
  site,
  checked,
  disabled,
  onToggle,
}: {
  site: SubtitleSiteInfo;
  checked: boolean;
  disabled: boolean;
  onToggle: (checked: boolean) => void;
}) {
  const label = site.name;
  return (
    <div className="flex items-start justify-between gap-3 py-2.5">
      <div className="flex items-start gap-2.5 min-w-0 flex-1">
        <MonogramDot site={site} />
        <div className="min-w-0 flex-1">
          <div className="text-sm text-zinc-200">{label}</div>
          {site.summary ? (
            <div className="text-xs text-zinc-500 mt-0.5 leading-relaxed">{site.summary}</div>
          ) : null}
          {/* Technical method hint preserved for power users / debugging. */}
          <div className="text-[10px] text-zinc-600 mt-0.5 inline-flex items-center gap-1">
            <Info className="w-3 h-3" aria-hidden="true" />
            <span>{site.methodHint}</span>
          </div>
        </div>
      </div>
      <div className="shrink-0 pt-0.5">
        <Toggle
          id={site.platform === 'generic'
            ? 'subtitle-generic-handler-toggle'
            : `subtitle-site-${site.platform}`}
          ariaLabel={`${site.name} subtitles`}
          checked={checked}
          onChange={onToggle}
          disabled={disabled}
        />
      </div>
    </div>
  );
}

export function SubtitlesSection() {
  const subtitleSettings = useSettingsStore((s) => s.subtitleSettings);
  const targetLanguage = useSettingsStore((s) => s.targetLanguage);
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

  /** FR-6 — the Generic fallback site, rendered in its own labeled subsection. */
  const genericSite = SUPPORTED_SUBTITLE_SITES.find((s) => s.platform === 'generic');

  const overrides = subtitleSettings.knobOverrides ?? {};
  /** FR-4 — number of knobs with a non-'auto' override set. */
  const overrideCount = KNOB_SPEC.filter((k) => overrides[k.key] !== undefined).length;

  /** FR-9 — target-language-driven preview cues + a Style chip tying the
   *  preview to the active translation-style overrides. */
  const previewCues = getPreviewCuesForLanguage(targetLanguage);
  const styleChip = resolveStyleChipLabel(overrides);

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
              cues={previewCues}
              styleChip={styleChip}
            />
          </Card>
        </div>

        {/* Translation Style card — data-driven knobs (FR-3), override
            visibility (FR-4), translation timeout (FR-5). */}
        <div className="animate-stagger" style={stagger(1)}>
          <Card variant="bordered">
            {/* Custom title row so the override count badge (FR-4) sits inline. */}
            <div className="flex items-center gap-2 mb-4">
              <h3 className="text-sm font-semibold text-zinc-200">Translation Style</h3>
              {overrideCount > 0 && (
                <Badge variant="info">{overrideCount} custom</Badge>
              )}
            </div>
            <p className="text-xs text-zinc-500 mb-4 leading-relaxed">
              Auto uses the recommended value for each site's profile (Educational / Media / Cinematic).
              Override any knob to apply it everywhere subtitles are translated.
            </p>
            <DisabledDimmer disabled={isDisabled}>
              <div className="space-y-5">
                {KNOB_SPEC.map((knob) => {
                  const overridden = overrides[knob.key] !== undefined;
                  return (
                    <FieldGroup
                      key={knob.key}
                      label={knob.label}
                      description={knob.description}
                    >
                      <SegmentedControl
                        label={knob.label}
                        options={knob.options}
                        value={overrides[knob.key] ?? 'auto'}
                        onChange={(v) => handleKnobChange(knob.key, v)}
                        disabled={isDisabled}
                      />
                      {/* FR-4 — per-knob override indicator */}
                      <div className="mt-1.5 text-[10px] text-zinc-500">
                        {overridden ? (
                          <span className="inline-flex items-center gap-1 text-cyan-400">
                            <span className="inline-block w-1.5 h-1.5 rounded-full bg-cyan-400" />
                            Custom
                          </span>
                        ) : (
                          <span>Profile default</span>
                        )}
                      </div>
                    </FieldGroup>
                  );
                })}
                <button
                  type="button"
                  onClick={handleResetKnobs}
                  disabled={isDisabled || overrideCount === 0}
                  className="inline-flex items-center gap-1.5 text-xs text-zinc-400 hover:text-zinc-200 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  <RotateCcw className="w-3 h-3" />
                  Reset to profile defaults
                </button>

                {/* FR-5 — Translation Timeout exposed in an Advanced disclosure.
                    Actively used at runtime (subtitleCoordinator.ts → interceptors). */}
                <AdvancedDisclosure label="Advanced">
                  <Slider
                    id="subtitle-translation-timeout"
                    label="Translation Timeout"
                    value={subtitleSettings.translationTimeout}
                    min={10}
                    max={120}
                    step={1}
                    onChange={(v) => handleUpdate({ translationTimeout: v })}
                    formatValue={(v) => `${v}s`}
                    minLabel="10s"
                    maxLabel="120s"
                    accentClassName="accent-cyan-500"
                    disabled={isDisabled}
                  />
                  <p className="text-[10px] text-zinc-500 mt-2 leading-relaxed">
                    Max seconds to wait for each subtitle chunk to translate before
                    falling back to the original text. Lower values keep subtitles
                    in sync on fast connections; raise it for slow local LLMs.
                  </p>
                </AdvancedDisclosure>
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

        {/* Supported Sites card — FR-6: friendly labels + per-platform icons,
            method hint moved into a tooltip/affordance, Generic fallback in a
            separate labeled subsection. */}
        <div className="animate-stagger" style={stagger(4)}>
          <Card title="Supported Sites" icon={<Globe className="w-3.5 h-3.5" />} variant="bordered">
            <DisabledDimmer disabled={isDisabled}>
              <div className="divide-y divide-zinc-800/50">
                {visibleSites.map((site) => {
                  const disabled = (subtitleSettings.disabledSubtitleSites ?? []).includes(site.platform);
                  return (
                    <SiteRow
                      key={site.platform}
                      site={site}
                      checked={!disabled}
                      disabled={isDisabled}
                      onToggle={(checked) => {
                        const current = subtitleSettings.disabledSubtitleSites ?? [];
                        const updated = checked
                          ? current.filter((p) => p !== site.platform)
                          : [...current, site.platform];
                        handleUpdate({ disabledSubtitleSites: updated });
                      }}
                    />
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

              {/* FR-6 — Generic fallback in a distinct labeled subsection.
                  Separate boolean setting, not the per-site disable array. */}
              {genericSite && (
                <div className="mt-2 pt-3 border-t border-zinc-800/50">
                  <p className="text-[10px] uppercase tracking-widest text-zinc-600 mb-1">Fallback</p>
                  <SiteRow
                    site={genericSite}
                    checked={subtitleSettings.enableGenericSubtitleHandler}
                    disabled={isDisabled}
                    onToggle={(checked) => handleUpdate({ enableGenericSubtitleHandler: checked })}
                  />
                </div>
              )}

              {/* YouTube ASR re-alignment — local rule engine before translate.
                  Independent of per-site disable; only applies to kind=asr tracks. */}
              <div className="mt-2 pt-3 border-t border-zinc-800/50">
                <p className="text-[10px] uppercase tracking-widest text-zinc-600 mb-2">YouTube</p>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-zinc-200">Improve auto-generated captions</p>
                    <p className="text-xs text-zinc-500 mt-0.5 leading-relaxed">
                      Re-chunk fragmented ASR captions into clearer sentences before
                      translation. Human-uploaded tracks are unchanged.
                    </p>
                    <p className="text-[10px] text-zinc-600 mt-1.5 italic">
                      AI re-align — coming soon
                    </p>
                  </div>
                  <Toggle
                    checked={
                      subtitleSettings.youtubeAsrResegment?.enable ??
                      DEFAULT_YOUTUBE_ASR_RESEGMENT_SETTINGS.enable
                    }
                    disabled={isDisabled}
                    onToggle={(checked) => {
                      const current =
                        subtitleSettings.youtubeAsrResegment ??
                        DEFAULT_YOUTUBE_ASR_RESEGMENT_SETTINGS;
                      handleUpdate({
                        youtubeAsrResegment: { ...current, enable: checked },
                      });
                    }}
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
