/**
 * Subtitles Settings Section — position, font size, opacity, font family,
 * display mode, translation timeout, preferred language, and auto-activate controls.
 * Includes an animated mini video player preview reactive to all settings.
 */

import { useState, useEffect, useCallback } from 'react';
import { Subtitles as SubtitlesIcon, Play, Languages } from 'lucide-react';
import { useSettingsStore } from '@/stores/settingsStore';
import { LANGUAGES } from '@/lib/languages';
import { FieldGroup } from '@/ui/FieldGroup';
import { Toggle } from '@/ui/Toggle';
import { Slider } from '@/ui/Slider';
import { Card } from '@/ui/Card';
import { Select } from '@/ui/Select';
import { SegmentedControl } from '@/ui/SegmentedControl';
import type { SubtitleFontFamily, SubtitleDisplayMode } from '@/types/config';

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
function scalePreviewFontSize(fontSize: number): number {
  return Math.max(10, Math.min(Math.round(fontSize * 0.65), 18));
}

/** Animated cue that smoothly cycles through sample phrases */
function AnimatedCue({
  fontSize,
  backgroundOpacity,
  fontFamily,
  displayMode,
  position,
  disabled,
}: {
  fontSize: number;
  backgroundOpacity: number;
  fontFamily: SubtitleFontFamily;
  displayMode: SubtitleDisplayMode;
  position: 'bottom' | 'top';
  disabled: boolean;
}) {
  const [cueIndex, setCueIndex] = useState(0);
  const [phase, setPhase] = useState<'visible' | 'fading'>('visible');

  const advanceCue = useCallback(() => {
    setPhase('fading');
    const fadeTimer = setTimeout(() => {
      setCueIndex((i) => (i + 1) % PREVIEW_CUES.length);
      setPhase('visible');
    }, 500); // match CSS transition duration
    return fadeTimer;
  }, []);

  useEffect(() => {
    if (disabled) return;
    const interval = setInterval(() => {
      const fadeTimer = advanceCue();
      return () => clearTimeout(fadeTimer);
    }, 3500);
    return () => clearInterval(interval);
  }, [disabled, advanceCue]);

  const previewFontSize = scalePreviewFontSize(fontSize);
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

  useEffect(() => {
    const id = setInterval(() => {
      setProgress((p) => (p >= 85 ? 35 : p + 0.3));
    }, 100);
    return () => clearInterval(id);
  }, []);

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

  return (
    <div className="animate-fade-in-up">
      {/* Inline section header */}
      <div className="sticky top-0 z-10 backdrop-blur-md bg-[#09090b]/80 pt-4 pb-4 mb-3 -mt-4 flex items-center gap-3">
        <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-cyan-600/15 border border-cyan-500/20">
          <SubtitlesIcon className="w-4 h-4 text-cyan-400" />
        </div>
        <div>
          <h2 className="text-base font-semibold text-zinc-100 leading-tight">Subtitle Settings</h2>
          <p className="text-xs text-zinc-500 mt-0.5">Configure how translated subtitles appear on video players.</p>
        </div>
      </div>

      <div className="space-y-4">
        {/* Preview card — placed first so users see live changes while adjusting controls */}
        <div className="animate-stagger" style={{ '--stagger-delay': '0' } as React.CSSProperties}>
          <Card title="Preview" variant="bordered">
            <div
              className={`relative rounded-lg overflow-hidden transition-opacity duration-300 ${
                isDisabled ? 'opacity-50' : ''
              }`}
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

        {/* Controls card */}
        <div className="animate-stagger" style={{ '--stagger-delay': '1' } as React.CSSProperties}>
          <Card variant="bordered">
            <div className="space-y-5">
              {/* Enabled Toggle */}
              <Toggle
                id="subtitle-enabled-toggle"
                checked={subtitleSettings.enabled}
                onChange={(checked) => handleUpdate({ enabled: checked })}
                label="Enable Subtitles"
                description="Show translated subtitles on video players."
              />

              {/* Position */}
              <FieldGroup
                label="Subtitle Position"
                description="Where subtitles appear relative to the video player."
              >
                <SegmentedControl
                  label="Subtitle Position"
                  options={POSITION_OPTIONS}
                  value={subtitleSettings.position}
                  onChange={(val) => handleUpdate({ position: val })}
                />
              </FieldGroup>

              {/* Font Family */}
              <FieldGroup
                label="Font Family"
                description="Typeface used for subtitle text in the overlay."
              >
                <SegmentedControl
                  label="Font Family"
                  options={FONT_FAMILY_OPTIONS}
                  value={subtitleSettings.fontFamily}
                  onChange={(val) => handleUpdate({ fontFamily: val })}
                />
              </FieldGroup>

              {/* Display Mode */}
              <FieldGroup
                label="Display Mode"
                description="Show both original and translated text, or translated text only."
              >
                <SegmentedControl
                  label="Display Mode"
                  options={DISPLAY_MODE_OPTIONS}
                  value={subtitleSettings.displayMode}
                  onChange={(val) => handleUpdate({ displayMode: val })}
                />
              </FieldGroup>

              {/* Font Size */}
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
              />

              {/* Background Opacity */}
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
              />

              {/* Translation Timeout */}
              <Slider
                id="subtitle-timeout"
                label="Translation Timeout"
                value={subtitleSettings.translationTimeout}
                min={10}
                max={120}
                step={5}
                onChange={(v) => handleUpdate({ translationTimeout: v })}
                formatValue={(v) => `${v}s`}
                minLabel="10s"
                maxLabel="120s"
              />
            </div>
          </Card>
        </div>

        {/* Language Discovery card */}
        <div className="animate-stagger" style={{ '--stagger-delay': '2' } as React.CSSProperties}>
          <Card title="Language Discovery" icon={<Languages className="w-3.5 h-3.5" />} variant="bordered">
            <div className="space-y-5">
              <FieldGroup
                label="Preferred Subtitle Language"
                description="The extension will auto-detect this language when available on video platforms like YouTube and Udemy."
                hint="Select the language you most commonly want subtitles translated from."
                htmlFor="subtitle-preferred-language"
              >
                <Select
                  id="subtitle-preferred-language"
                  value={subtitleSettings.preferredSubtitleLanguage}
                  onChange={(e) => handleUpdate({ preferredSubtitleLanguage: e.target.value })}
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
              />
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
