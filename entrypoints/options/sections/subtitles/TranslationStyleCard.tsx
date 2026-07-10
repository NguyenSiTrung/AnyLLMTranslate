/**
 * Translation-style knobs (full-width stack) + Advanced timeout.
 * Four-option segments use SegmentedControl multi-row layout so labels never clip.
 */

import { RotateCcw, SlidersHorizontal } from 'lucide-react';
import { Card } from '@/ui/Card';
import { Badge } from '@/ui/Badge';
import { Button } from '@/ui/Button';
import { DisabledDimmer } from '@/ui/DisabledDimmer';
import { SegmentedControl } from '@/ui/SegmentedControl';
import { AdvancedDisclosure } from '@/ui/AdvancedDisclosure';
import { Slider } from '@/ui/Slider';
import { KNOB_SPEC, type KnobKey } from './knobSpec';
import type { SubtitleCardBaseProps } from './types';

export function TranslationStyleCard({ settings, disabled, onUpdate }: SubtitleCardBaseProps) {
  const overrides = settings.knobOverrides ?? {};
  const overrideCount = KNOB_SPEC.filter((k) => overrides[k.key] !== undefined).length;

  const handleKnobChange = (knob: KnobKey, value: string) => {
    const next = { ...overrides };
    if (value === 'auto') {
      const { [knob]: _removed, ...rest } = next;
      onUpdate({ knobOverrides: rest });
      return;
    }
    (next as Record<string, string>)[knob] = value;
    onUpdate({ knobOverrides: next });
  };

  return (
    <Card
      title="Translation style"
      description="Auto follows each site profile. Override knobs to apply them everywhere."
      icon={<SlidersHorizontal className="w-3.5 h-3.5" />}
      variant="bordered"
      headerExtra={
        overrideCount > 0 ? <Badge variant="info">{overrideCount} custom</Badge> : undefined
      }
    >
      <DisabledDimmer disabled={disabled}>
        <div className="space-y-4">
          {/* Full-width stack: 4-option segments need the full controls-rail width. */}
          <div className="space-y-5">
            {KNOB_SPEC.map((knob) => {
              const overridden = overrides[knob.key] !== undefined;
              return (
                <div key={knob.key} className="min-w-0 space-y-2">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-zinc-200">{knob.label}</p>
                      <p className="text-[11px] text-zinc-500 leading-relaxed">{knob.description}</p>
                    </div>
                    <div className="shrink-0 pt-0.5 text-[10px] text-zinc-500">
                      {overridden ? (
                        <span className="inline-flex items-center gap-1 text-cyan-400">
                          <span className="inline-block w-1.5 h-1.5 rounded-full bg-cyan-400" />
                          Custom
                        </span>
                      ) : (
                        <span>Profile default</span>
                      )}
                    </div>
                  </div>
                  <SegmentedControl
                    label={knob.label}
                    options={knob.options}
                    value={overrides[knob.key] ?? 'auto'}
                    onChange={(v) => handleKnobChange(knob.key, v)}
                    disabled={disabled}
                    size="sm"
                    accent="cyan"
                  />
                </div>
              );
            })}
          </div>

          <Button
            type="button"
            variant="ghost"
            size="sm"
            icon={<RotateCcw className="w-3 h-3" />}
            disabled={disabled || overrideCount === 0}
            onClick={() => onUpdate({ knobOverrides: {} })}
          >
            Reset to profile defaults
          </Button>

          <AdvancedDisclosure label="Advanced">
            <Slider
              id="subtitle-translation-timeout"
              label="Translation Timeout"
              value={settings.translationTimeout}
              min={10}
              max={120}
              step={1}
              onChange={(v) => onUpdate({ translationTimeout: v })}
              formatValue={(v) => `${v}s`}
              minLabel="10s"
              maxLabel="120s"
              accentClassName="accent-cyan-500"
              disabled={disabled}
            />
            <p className="text-[10px] text-zinc-500 mt-2 leading-relaxed">
              Max seconds to wait for each subtitle chunk to translate before falling back to
              the original text. Lower values keep subtitles in sync on fast connections; raise
              it for slow local LLMs.
            </p>
          </AdvancedDisclosure>
        </div>
      </DisabledDimmer>
    </Card>
  );
}
