/**
 * SubtitlePreview — extracted mini video-player preview (FR-8).
 *
 * Encapsulates the animated cue cycler, fake progress bar, and the cinematic
 * shell used by the Subtitles settings tab. Reactive to every appearance /
 * display knob so users see live changes while adjusting the controls.
 *
 * @example
 *   <SubtitlePreview
 *     disabled={!enabled}
 *     fontSize={subtitleSettings.fontSize}
 *     ...
 *     targetLanguage="vi"
 *     styleChip="Neutral"
 *   />
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { Play } from 'lucide-react';
import {
  SUBTITLE_STYLE_PRESETS,
  resolveSubtitleFontFamily,
  resolveSubtitleStyle,
} from '@/lib/subtitleStylePresets';
import type {
  SubtitleDisplayMode,
  SubtitleFontFamily,
  SubtitleFontSizeMode,
  SubtitleStyleOverrides,
  SubtitleStylePresetId,
} from '@/types/config';
import { buildAppearanceSummaryChips } from '@/lib/subtitlePreviewSummary';

/** A sample subtitle cue shown in the preview. */
export interface PreviewCue {
  original: string;
  translated: string;
}

/** Scale font size proportionally for the compact preview viewport. */
function scalePreviewFontSize(fontSize: number, fontSizeMode: SubtitleFontSizeMode): number {
  if (fontSizeMode === 'auto') {
    // Preview container is ~170px tall; simulate auto calc at that height
    const PREVIEW_HEIGHT = 170;
    const autoSize = Math.round(PREVIEW_HEIGHT * 0.035);
    return Math.max(10, Math.min(autoSize, 18));
  }
  return Math.max(10, Math.min(Math.round(fontSize * 0.65), 18));
}

/** Reduced-motion media-query hook (kept local to the preview module). */
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

/** Animated cue that smoothly cycles through sample phrases. */
function AnimatedCue({
  cues,
  fontSize,
  fontSizeMode,
  backgroundOpacity,
  fontFamily,
  stylePreset,
  styleOverrides,
  displayMode,
  position,
  disabled,
}: {
  cues: PreviewCue[];
  fontSize: number;
  fontSizeMode: SubtitleFontSizeMode;
  backgroundOpacity: number;
  fontFamily: SubtitleFontFamily;
  stylePreset: SubtitleStylePresetId;
  styleOverrides: Partial<SubtitleStyleOverrides>;
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
      setCueIndex((i) => (i + 1) % cues.length);
      setPhase('visible');
    }, 500); // match CSS transition duration
  }, [cues.length]);

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
  const resolvedFont = resolveSubtitleFontFamily(fontFamily);
  const style = resolveSubtitleStyle(stylePreset, styleOverrides, backgroundOpacity);
  const isTop = position === 'top';
  const cue = cues[cueIndex] ?? cues[0];

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
        backgroundColor: `rgba(${style.backgroundColor},${style.backgroundOpacity})`,
        borderRadius: `${style.borderRadius}px`,
        textShadow: style.textShadow,
        opacity: phase === 'visible' ? 1 : 0,
        transition: 'opacity 0.5s ease-in-out',
        fontFamily: resolvedFont,
        fontSize: `${previewFontSize}px`,
        maxWidth: '90%',
      }}
    >
      {displayMode === 'bilingual' && (
        <div className="leading-tight" style={{ color: style.originalTextColor }}>
          {cue.original}
        </div>
      )}
      <div className="leading-tight font-medium" style={{ color: style.textColor }}>
        {cue.translated}
      </div>
    </div>
  );
}

/** Fake progress bar that slowly animates to simulate video playback. */
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
        className="h-full bg-gradient-to-r from-cyan-500 to-blue-400 rounded-r-full"
        style={{
          width: `${progress}%`,
          transition: 'width 0.1s linear',
        }}
      />
    </div>
  );
}

export interface SubtitlePreviewProps {
  /** When true, dims the shell and shows the "Subtitles disabled" cue. */
  disabled: boolean;
  fontSize: number;
  fontSizeMode: SubtitleFontSizeMode;
  backgroundOpacity: number;
  fontFamily: SubtitleFontFamily;
  stylePreset: SubtitleStylePresetId;
  /** Manual style overrides; non-empty means the effective style is Custom. */
  styleOverrides?: Partial<SubtitleStyleOverrides>;
  displayMode: SubtitleDisplayMode;
  position: 'bottom' | 'top';
  /** Sample cues to cycle through. Falls back to a built-in set. */
  cues?: PreviewCue[];
  /** Optional small chip label tying the preview to a style (e.g. "Neutral"). */
  styleChip?: string;
  /** When true (default), show Appearance summary chips under the shell. */
  showSummaryChips?: boolean;
}

/** Built-in default cues (Vietnamese) — backwards compatible fallback. */
const DEFAULT_CUES: PreviewCue[] = [
  { original: 'Hello world', translated: 'Xin chào thế giới' },
  { original: 'How are you today?', translated: 'Hôm nay bạn thế nào?' },
  { original: 'Welcome back', translated: 'Chào mừng trở lại' },
];

/** Mini video-player preview shell with an animated subtitle cue. */
export function SubtitlePreview({
  disabled,
  fontSize,
  fontSizeMode,
  backgroundOpacity,
  fontFamily,
  stylePreset,
  styleOverrides = {},
  displayMode,
  position,
  cues = DEFAULT_CUES,
  styleChip,
  showSummaryChips = true,
}: SubtitlePreviewProps) {
  const chips = buildAppearanceSummaryChips({
    position,
    displayMode,
    fontSizeMode,
    fontSize,
    backgroundOpacity,
  });
  const styleChipLabel =
    Object.keys(styleOverrides).length > 0
      ? 'Custom'
      : SUBTITLE_STYLE_PRESETS[stylePreset]?.label ?? 'Classic';

  return (
    <div className="space-y-2" data-testid="subtitle-preview">
      <div
        className={`relative rounded-lg overflow-hidden transition-all duration-300 ${
          disabled ? 'opacity-50 grayscale pointer-events-none' : ''
        }`}
        aria-hidden="true"
        style={{
          height: '210px',
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
        <div
          className="absolute inset-0 opacity-5"
          style={{
            backgroundImage:
              'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(255,255,255,0.03) 2px, rgba(255,255,255,0.03) 4px)',
          }}
        />

        {/* Style chip tying the preview to the translation-style knobs (FR-9). */}
        {styleChip && !disabled && (
          <div className="absolute top-3 left-3 z-20">
            <span className="inline-flex items-center text-[10px] font-medium px-1.5 py-0.5 rounded bg-cyan-500/15 text-cyan-300 border border-cyan-500/20">
              {styleChip}
            </span>
          </div>
        )}

        {/* Decorative play button */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div
            className={`flex items-center justify-center w-9 h-9 rounded-full bg-white/10 border border-white/20 backdrop-blur-sm transition-opacity duration-300 ${
              disabled ? 'opacity-40' : ''
            }`}
          >
            <Play className="w-4 h-4 text-white/60 fill-white/60 ml-0.5" />
          </div>
        </div>

        {/* Animated subtitle cue */}
        <AnimatedCue
          cues={cues}
          fontSize={fontSize}
          fontSizeMode={fontSizeMode}
          backgroundOpacity={backgroundOpacity}
          fontFamily={fontFamily}
          stylePreset={stylePreset}
          styleOverrides={styleOverrides}
          displayMode={displayMode}
          position={position}
          disabled={disabled}
        />

        {/* Progress bar — simulates video playback timeline */}
        {!disabled && <ProgressBar />}
      </div>

      {showSummaryChips && !disabled && (
        <div
          className="flex flex-wrap gap-1.5"
          data-testid="subtitle-preview-summary"
          aria-live="polite"
        >
          {[styleChipLabel, chips.position, chips.display, chips.size, chips.opacity].map(
            (label) => (
              <span
                key={label}
                className="inline-flex items-center text-[10px] font-medium px-1.5 py-0.5 rounded bg-zinc-800/80 text-zinc-400 border border-zinc-700/50"
              >
                {label}
              </span>
            ),
          )}
        </div>
      )}
    </div>
  );
}
