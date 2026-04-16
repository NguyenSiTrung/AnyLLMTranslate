/**
 * Subtitles Settings Section — position, font size, opacity controls.
 * Header uses inline SectionHeader pattern (consistent with GeneralSection).
 * Position uses SegmentedControl for consistency with General tab.
 */

import { Subtitles as SubtitlesIcon } from 'lucide-react';
import { useSettingsStore } from '@/stores/settingsStore';
import { FieldGroup } from '@/ui/FieldGroup';
import { Toggle } from '@/ui/Toggle';
import { Slider } from '@/ui/Slider';
import { Card } from '@/ui/Card';
import { SegmentedControl } from '@/ui/SegmentedControl';

const POSITION_OPTIONS: { value: 'bottom' | 'top'; label: string }[] = [
  { value: 'bottom', label: 'Bottom' },
  { value: 'top', label: 'Top' },
];

export function SubtitlesSection() {
  const subtitleSettings = useSettingsStore((s) => s.subtitleSettings);
  const updateSettings = useSettingsStore((s) => s.updateSettings);

  const handleUpdate = (partial: Partial<typeof subtitleSettings>) => {
    updateSettings({
      subtitleSettings: { ...subtitleSettings, ...partial },
    });
  };

  return (
    <div className="animate-fade-in-up">
      {/* Inline section header — consistent with GeneralSection */}
      <div className="flex items-center gap-3 mb-7">
        <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-blue-600/15 border border-blue-500/20">
          <SubtitlesIcon className="w-4 h-4 text-blue-400" />
        </div>
        <div>
          <h2 className="text-base font-semibold text-zinc-100 leading-tight">Subtitle Settings</h2>
          <p className="text-xs text-zinc-500 mt-0.5">Configure how translated subtitles appear on video players.</p>
        </div>
      </div>

      <div className="space-y-4">
        <div className="animate-stagger" style={{ '--stagger-delay': '0' } as React.CSSProperties}>
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

              {/* Position — SegmentedControl for consistency */}
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
            </div>
          </Card>
        </div>

        {/* Preview */}
        <div className="animate-stagger" style={{ '--stagger-delay': '1' } as React.CSSProperties}>
          <Card title="Preview" variant="bordered">
            <div className="relative bg-zinc-950 rounded-lg h-28 flex items-end justify-center overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-b from-zinc-800 to-zinc-900" />
              <div
                className={`relative z-10 px-4 py-2 rounded text-center mb-2 ${
                  subtitleSettings.position === 'top' ? 'self-start mt-2 mb-auto' : ''
                }`}
                style={{
                  backgroundColor: `rgba(0, 0, 0, ${subtitleSettings.backgroundOpacity})`,
                  fontSize: `${Math.min(subtitleSettings.fontSize, 18)}px`,
                }}
              >
                <span className="text-white">Xin chào thế giới</span>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
