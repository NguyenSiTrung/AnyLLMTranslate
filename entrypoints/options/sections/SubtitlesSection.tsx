/**
 * Subtitles Settings Section — position, font size, opacity controls.
 * Refactored with shared components.
 */

import { Subtitles as SubtitlesIcon } from 'lucide-react';
import { useSettingsStore } from '@/stores/settingsStore';
import { FieldGroup } from '@/ui/FieldGroup';
import { Toggle } from '@/ui/Toggle';
import { Slider } from '@/ui/Slider';
import { Button } from '@/ui/Button';
import { Card } from '@/ui/Card';

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
      {/* Section header */}
      <Card accent="blue" className="mb-8">
        <div className="flex items-center gap-3">
          <SubtitlesIcon className="w-5 h-5 text-blue-400" />
          <div>
            <h2 className="text-lg font-semibold text-zinc-100">Subtitle Settings</h2>
            <p className="text-xs text-zinc-500">Configure how translated subtitles appear on video players.</p>
          </div>
        </div>
      </Card>

      <Card variant="bordered">
        <div className="space-y-6">
          {/* Enabled Toggle */}
          <Toggle
            id="subtitle-enabled-toggle"
            checked={subtitleSettings.enabled}
            onChange={(checked) => handleUpdate({ enabled: checked })}
            label="Enable Subtitles"
            description="Show translated subtitles on video players."
          />

          {/* Position */}
          <FieldGroup label="Subtitle Position">
            <div className="flex gap-3">
              {(['bottom', 'top'] as const).map((pos) => (
                <Button
                  key={pos}
                  variant={subtitleSettings.position === pos ? 'primary' : 'secondary'}
                  className="flex-1 capitalize"
                  onClick={() => handleUpdate({ position: pos })}
                >
                  {pos}
                </Button>
              ))}
            </div>
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

          {/* Preview */}
          <Card variant="bordered">
            <p className="text-xs text-zinc-500 mb-3">Preview</p>
            <div className="relative bg-zinc-950 rounded-lg h-24 flex items-end justify-center overflow-hidden">
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
      </Card>
    </div>
  );
}
