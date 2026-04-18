/**
 * Inline Translate Section — configure key-gesture translation settings.
 * Header uses inline SectionHeader pattern (consistent with GeneralSection).
 */

import { Zap } from 'lucide-react';
import { Card } from '@/ui/Card';
import { Toggle } from '@/ui/Toggle';
import { Slider } from '@/ui/Slider';
import { FieldGroup } from '@/ui/FieldGroup';
import { Select } from '@/ui/Select';
import { useSettingsStore } from '@/stores/settingsStore';
import { LANGUAGES } from '@/lib/languages';

export function InlineTranslateSection() {
  const inlineTranslate = useSettingsStore((s) => s.inlineTranslate);
  const updateSetting = useSettingsStore((s) => s.updateSetting);

  const handleToggle = (enabled: boolean) => {
    updateSetting({ inlineTranslate: { ...inlineTranslate, enabled } });
  };

  const handleTapCount = (tapCount: number) => {
    updateSetting({ inlineTranslate: { ...inlineTranslate, tapCount } });
  };

  const handleTimeWindow = (timeWindowMs: number) => {
    updateSetting({ inlineTranslate: { ...inlineTranslate, timeWindowMs } });
  };

  const handleTargetLanguage = (e: React.ChangeEvent<HTMLSelectElement>) => {
    updateSetting({ inlineTranslate: { ...inlineTranslate, targetLanguage: e.target.value } });
  };

  const gestureLabel =
    inlineTranslate.triggerKey === ' '
      ? `Space × ${inlineTranslate.tapCount}`
      : `${inlineTranslate.triggerKey} × ${inlineTranslate.tapCount}`;

  return (
    <div className="space-y-4">
      <Card
        title="Inline Translation"
        icon={<Zap className="w-3.5 h-3.5" />}
        variant="bordered"
      >
        <div className="space-y-5">
          {/* Enable / Disable */}
          <Toggle
            id="inline-translate-toggle"
            label="Enable Inline Translation"
            description="Translate text in input fields with a quick key gesture"
            checked={inlineTranslate.enabled}
            onChange={handleToggle}
          />

          {/* Target Language */}
          <FieldGroup
            label="Target Language"
            description="Language to translate text input content to"
          >
            <Select
              id="inline-translate-target-language"
              value={inlineTranslate.targetLanguage}
              onChange={handleTargetLanguage}
              disabled={!inlineTranslate.enabled}
              options={LANGUAGES.map((lang) => ({
                value: lang.code,
                label: lang.name,
              }))}
            />
          </FieldGroup>

          {/* Current gesture display */}
          <div className="flex items-center gap-3 px-4 py-3 rounded-lg bg-zinc-800/40 border border-zinc-700/50">
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-zinc-400">Gesture:</span>
              <kbd className="px-2 py-0.5 bg-zinc-800 border border-zinc-700 rounded text-xs text-zinc-300 font-mono">
                {gestureLabel}
              </kbd>
            </div>
            <span className="text-xs text-zinc-500">
              within {inlineTranslate.timeWindowMs}ms
            </span>
          </div>

          {/* Tap Count */}
          <FieldGroup
            label="Tap Count"
            description={`Number of consecutive key presses to trigger translation (${inlineTranslate.tapCount})`}
          >
            <Slider
              id="inline-translate-tap-count"
              min={2}
              max={5}
              step={1}
              value={inlineTranslate.tapCount}
              onChange={handleTapCount}
              disabled={!inlineTranslate.enabled}
            />
          </FieldGroup>

          {/* Time Window */}
          <FieldGroup
            label="Time Window"
            description={`Maximum time between key presses (${inlineTranslate.timeWindowMs}ms)`}
          >
            <Slider
              id="inline-translate-time-window"
              min={200}
              max={1000}
              step={50}
              value={inlineTranslate.timeWindowMs}
              onChange={handleTimeWindow}
              disabled={!inlineTranslate.enabled}
            />
          </FieldGroup>
        </div>
      </Card>

      {/* Usage Hints */}
      <Card title="How It Works" variant="bordered">
        <div className="space-y-2 text-xs text-zinc-400">
          <p>
            Press{' '}
            <kbd className="px-1.5 py-0.5 bg-zinc-800 border border-zinc-700 rounded text-zinc-300 font-mono">
              {gestureLabel}
            </kbd>{' '}
            rapidly in any text input to translate its contents.
          </p>
          <ul className="list-disc list-inside space-y-1 text-zinc-500">
            <li>Works in text inputs, search boxes, textareas, and rich text editors</li>
            <li>Translated text replaces the original — use <kbd className="px-1 py-0.5 bg-zinc-800/60 border border-zinc-700/50 rounded text-zinc-400 font-mono text-[10px]">Ctrl+Z</kbd> to undo</li>
            <li>Password fields and code editors are automatically excluded</li>
            <li>Uses separate target language from page translation</li>
          </ul>
        </div>
      </Card>
    </div>
  );
}
