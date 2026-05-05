/**
 * Inline Translate Section — configure key-gesture translation settings.
 * Header uses inline SectionHeader pattern (consistent with GeneralSection).
 */

import { TextCursorInput } from 'lucide-react';
import { Card } from '@/ui/Card';
import { Toggle } from '@/ui/Toggle';
import { Slider } from '@/ui/Slider';
import { FieldGroup } from '@/ui/FieldGroup';
import { Select } from '@/ui/Select';
import { useSettingsStore } from '@/stores/settingsStore';
import { LANGUAGES } from '@/lib/languages';

export function InlineTranslateSection() {
  const inlineTranslate = useSettingsStore((s) => s.inlineTranslate);
  const updateSettings = useSettingsStore((s) => s.updateSettings);
  const targetLanguages = LANGUAGES.filter((l) => l.code !== 'auto');

  const handleToggle = (enabled: boolean) => {
    updateSettings({ inlineTranslate: { ...inlineTranslate, enabled } });
  };

  const handleTapCount = (tapCount: number) => {
    updateSettings({ inlineTranslate: { ...inlineTranslate, tapCount } });
  };

  const handleTimeWindow = (timeWindowMs: number) => {
    updateSettings({ inlineTranslate: { ...inlineTranslate, timeWindowMs } });
  };

  const handleTargetLanguage = (targetLanguage: string) => {
    updateSettings({ inlineTranslate: { ...inlineTranslate, targetLanguage } });
  };

  const gestureLabel =
    inlineTranslate.triggerKey === ' '
      ? `Space × ${inlineTranslate.tapCount}`
      : `${inlineTranslate.triggerKey} × ${inlineTranslate.tapCount}`;

  return (
    <div className="animate-fade-in-up">
      {/* Inline section header — consistent with GeneralSection */}
      <div className="sticky top-0 z-10 backdrop-blur-md bg-[#09090b]/95 pt-4 pb-4 mb-3 -mt-4 flex items-center gap-3">
        <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-amber-600/15 border border-amber-500/20">
          <TextCursorInput className="w-4 h-4 text-amber-400" />
        </div>
        <div>
          <h2 className="text-base font-semibold text-zinc-100 leading-tight">Inline Translation</h2>
          <p className="text-xs text-zinc-500 mt-0.5">Translate text in input fields with a quick key gesture.</p>
        </div>
      </div>

      <div className="space-y-4">
        <div className="animate-stagger" style={{ '--stagger-delay': '0' } as React.CSSProperties}>
          <Card
            title="Configuration"
            icon={<TextCursorInput className="w-3.5 h-3.5" />}
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

              {/* Target Language */}
              <FieldGroup
                label="Target Language"
                description="The language to translate text inputs into."
                hint="Type the first few letters to jump to a language."
                htmlFor="inline-translate-target-language"
              >
                <Select
                  id="inline-translate-target-language"
                  value={inlineTranslate.targetLanguage}
                  onChange={(e) => handleTargetLanguage(e.target.value)}
                  options={targetLanguages.map((lang) => ({
                    value: lang.code,
                    label: `${lang.nativeName} (${lang.name})`,
                  }))}
                  disabled={!inlineTranslate.enabled}
                />
              </FieldGroup>

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
        </div>

        {/* Usage Hints */}
        <div className="animate-stagger" style={{ '--stagger-delay': '1' } as React.CSSProperties}>
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
              </ul>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
