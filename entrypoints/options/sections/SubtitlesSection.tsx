/**
 * Subtitles Settings Section — position, font size, opacity, font family,
 * display mode, preferred source language, and auto-activate controls.
 * Includes an animated mini video player preview reactive to all settings.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { Subtitles as SubtitlesIcon, Play, Languages, Globe, RotateCcw } from 'lucide-react';
import { SUPPORTED_SUBTITLE_SITES } from '@/lib/subtitleSites';
import { SectionHeader } from '@/ui/SectionHeader';
import { stagger } from '@/lib/styleUtils';
import { useSettingsStore } from '@/stores/settingsStore';
import { LANGUAGES } from '@/lib/languages';
import { FieldGroup } from '@/ui/FieldGroup';
import { Toggle } from '@/ui/Toggle';
import { Slider } from '@/ui/Slider';
import { Card } from '@/ui/Card';
import { Select } from '@/ui/Select';
import { SegmentedControl } from '@/ui/SegmentedControl';
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

/** Sample subtitle cues that cycle through the preview */
const PREVIEW_CUES: { original: string; translated: string }[] = [
  { original: 'Hello world', translated: 'Xin chào thế giới' },
  { original: 'How are you today?', translated: 'Hôm nay bạn thế nào?' },
  { original: 'Welcome back', translated: 'Chào mừng trở lại' },
];

/** Map font family setting to a CSS font-family string */
function resolveFontFamily(family: SubtitleFontFamily): string {
  switch (family) {
    case 'serif':
      return 'Georgia, serif';
    case 'monospace':
      return 'monospace';
    default:
      return 'system-ui, sans-serif';
  }
}

/** Scale font size proportionally for the compact preview viewport */
function scalePreviewFontSize(fontSize: number, fontSizeMode: SubtitleFontSizeMode): number {
  if (fontSizeMode === 'auto') {
    // Preview container is ~170px tall; simulate auto calc at that height
    const PREVIEW_HEIGHT = 170;
    const autoSize = Math.round(PREVIEW_HEIGHT * 0.035);
    return Math.max(10, Math.min(autoSize, 18));
  }
  return Math.max(10, Math.min(Math.round(fontSize * 0.65), 18));
}

function usePrefersReducedMotion(): boolean {
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  });

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const handleChange = () => setPrefersReducedMotion(media.matches);
    handleChange();
    media.addEventListener?.('change', handleChange);
    return () => media.removeEventListener?.('change', handleChange);
  }, []);

  return prefersReducedMotion;
}

/** Animated cue that smoothly cycles through sample phrases */
function AnimatedCue({
  fontSize,
  fontSizeMode,
  backgroundOpacity,
  fontFamily,
  displayMode,
  position,
  disabled,
}: {
  fontSize: number;
  fontSizeMode: SubtitleFontSizeMode;
  backgroundOpacity: number;
  fontFamily: SubtitleFontFamily;
  displayMode: SubtitleDisplayMode;
  position: 'bottom' | 'top';
  disabled: boolean;
}) {
  const [cueIndex, setCueIndex] = useState(0);
  const [phase, setPhase] = useState<'visible' | 'fading'>('visible');
  const prefersReducedMotion = usePrefersReducedMotion();
  const fadeTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const advanceCue = useCallback(() => {
    setPhase('fading');
    // Clear any previous fade timer before starting a new one
    if (fadeTimerRef.current) {
      clearTimeout(fadeTimerRef.current);
    }
    fadeTimerRef.current = setTimeout(() => {
      setCueIndex((i) => (i + 1) % PREVIEW_CUES.length);
      setPhase('visible');
    }, 500); // match CSS transition duration
  }, []);

  useEffect(() => {
    if (disabled || prefersReducedMotion) return;
    const interval = setInterval(() => {
      advanceCue();
    }, 3500);
    return () => {
      clearInterval(interval);
      if (fadeTimerRef.current) {
        clearTimeout(fadeTimerRef.current);
        fadeTimerRef.current = undefined;
      }
    };
  }, [disabled, prefersReducedMotion, advanceCue]);

  const previewFontSize = scalePreviewFontSize(fontSize, fontSizeMode);
  const resolvedFont = resolveFontFamily(fontFamily);
  const isTop = position === 'top';
  const cue = PREVIEW_CUES[cueIndex];

  if (disabled) {
    return (
      <div
        className={`absolute z-10 px-3 py-1.5 rounded text-center ${
          isTop ? 'top-4' : 'bottom-6'
        } left-1/2 -translate-x-1/2`}
        style={{
          backgroundColor: 'rgba(0, 0, 0, 0.5)',
          fontSize: '11px',
          maxWidth: '90%',
        }}
      >
        <div className="text-zinc-500 leading-tight italic text-[11px]">Subtitles disabled</div>
      </div>
    );
  }

  return (
    <div
      className={`absolute z-10 px-3 py-1.5 rounded text-center ${
        isTop ? 'top-4' : 'bottom-6'
      } left-1/2 -translate-x-1/2`}
      style={{
        backgroundColor: `rgba(0, 0, 0, ${backgroundOpacity})`,
        opacity: phase === 'visible' ? 1 : 0,
        transition: 'opacity 0.5s ease-in-out',
        fontFamily: resolvedFont,
        fontSize: `${previewFontSize}px`,
        maxWidth: '90%',
      }}
    >
      {displayMode === 'bilingual' && (
        <div className="text-zinc-300 leading-tight">{cue.original}</div>
      )}
      <div className="text-white leading-tight font-medium">{cue.translated}</div>
    </div>
  );
}

/** Fake progress bar that slowly animates to simulate video playback */
function ProgressBar() {
  const [progress, setProgress] = useState(35);
  const prefersReducedMotion = usePrefersReducedMotion();

  useEffect(() => {
    if (prefersReducedMotion) return;
    const id = setInterval(() => {
      setProgress((p) => (p >= 85 ? 35 : p + 0.3));
    }, 100);
    return () => clearInterval(id);
  }, [prefersReducedMotion]);

  return (
    <div className="absolute bottom-0 left-0 right-0 h-[3px] bg-white/5">
      <div
        className="h-full bg-gradient-to-r from-blue-500 to-blue-400 rounded-r-full"
        style={{
          width: `${progress}%`,
          transition: 'width 0.1s linear',
        }}
      />
    </div>
  );
}

export function SubtitlesSection() {
  const subtitleSettings = useSettingsStore((s) => s.subtitleSettings);
  const updateSettings = useSettingsStore((s) => s.updateSettings);

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
      delete next[knob];
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

      <div className="space-y-4">
        {/* Preview card — placed first so users see live changes while adjusting controls */}
        <div className="animate-stagger" style={stagger(0)}>
          <Card title="Preview" variant="bordered">
            <div
              className={`relative rounded-lg overflow-hidden transition-all duration-300 ${
                isDisabled ? 'opacity-50 grayscale pointer-events-none' : ''
              }`}
              aria-hidden="true"
              style={{
                height: '170px',
                background: 'linear-gradient(135deg, #0f1117 0%, #1a1d26 50%, #111318 100%)',
              }}
            >
              {/* Film grain overlay */}
              <div
                className="absolute inset-0 opacity-30"
                style={{
                  backgroundImage:
                    'radial-gradient(ellipse at 20% 50%, rgba(30,40,80,0.4) 0%, transparent 60%), radial-gradient(ellipse at 80% 20%, rgba(20,30,60,0.3) 0%, transparent 50%)',
                }}
              />

              {/* Scan-line accent */}
              <div className="absolute inset-0 opacity-5"
                style={{
                  backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(255,255,255,0.03) 2px, rgba(255,255,255,0.03) 4px)',
                }}
              />

              {/* Decorative play button */}
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className={`flex items-center justify-center w-9 h-9 rounded-full bg-white/10 border border-white/20 backdrop-blur-sm transition-opacity duration-300 ${
                  isDisabled ? 'opacity-40' : ''
                }`}>
                  <Play className="w-4 h-4 text-white/60 fill-white/60 ml-0.5" />
                </div>
              </div>

              {/* Animated subtitle cue */}
              <AnimatedCue
                fontSize={subtitleSettings.fontSize}
                fontSizeMode={subtitleSettings.fontSizeMode}
                backgroundOpacity={subtitleSettings.backgroundOpacity}
                fontFamily={subtitleSettings.fontFamily}
                displayMode={subtitleSettings.displayMode}
                position={subtitleSettings.position}
                disabled={isDisabled}
              />

              {/* Progress bar — simulates video playback timeline */}
              {!isDisabled && <ProgressBar />}
            </div>
          </Card>
        </div>

        {/* Translation Style card — editable translation knobs (global override) */}
        <div className="animate-stagger" style={stagger(1)}>
          <Card variant="bordered" title="Translation Style">
            <p className="text-xs text-zinc-500 mb-4 leading-relaxed">
              Auto uses the recommended value for each site's profile (Educational / Media / Cinematic).
              Override any knob to apply it everywhere subtitles are translated.
            </p>
            <div className={`${isDisabled ? 'opacity-50 pointer-events-none' : ''} transition-opacity duration-200`}>
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
            </div>
          </Card>
        </div>

        {/* Controls card */}
        <div className="animate-stagger" style={stagger(2)}>
          <Card variant="bordered">
            <div className="space-y-5">
              <Toggle
                id="subtitle-enabled-toggle"
                checked={subtitleSettings.enabled}
                onChange={(checked) => handleUpdate({ enabled: checked })}
                label="Enable Subtitles"
                description="Show translated subtitles on video players."
              />

              {/* M4: Disable appearance/behavior controls when subtitles are off */}
              <div className={`${isDisabled ? 'opacity-50 pointer-events-none' : ''} transition-opacity duration-200`}>
              <div className="border-t border-zinc-800 pt-4">
                <p className="text-[10px] uppercase tracking-widest text-zinc-600 mb-4">Appearance</p>
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
                </div>
              </div>

              <div className="border-t border-zinc-800 pt-4">
                <p className="text-[10px] uppercase tracking-widest text-zinc-600 mb-4">Behavior</p>
                <div className="space-y-5">
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
              </div>
            </div>
          </Card>
        </div>

        {/* Language Discovery card */}
        <div className="animate-stagger" style={stagger(2)}>
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
        <div className="animate-stagger" style={stagger(3)}>
          <Card title="Supported Sites" icon={<Globe className="w-3.5 h-3.5" />} variant="bordered">
            <div className={`${isDisabled ? 'opacity-50 pointer-events-none' : ''} transition-opacity duration-200`}>
              <div className="divide-y divide-zinc-800/50">
                {SUPPORTED_SUBTITLE_SITES.map((site) => {
                  const disabled = (subtitleSettings.disabledSubtitleSites ?? []).includes(site.platform);
                  return (
                    <div key={site.platform} className="flex items-center justify-between py-2.5 first:pt-0 last:pb-0">
                      <div>
                        <div className="text-sm text-zinc-200">{site.name}</div>
                        <div className="text-xs text-zinc-500">{site.methodHint}</div>
                      </div>
                      <Toggle
                        id={`subtitle-site-${site.platform}`}
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
                  );
                })}
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
