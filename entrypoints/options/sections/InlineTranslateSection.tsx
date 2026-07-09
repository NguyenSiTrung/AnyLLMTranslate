/**
 * Inline Translate Section — full advanced panel for key-gesture + Alt+I translation.
 */

import { TextCursorInput, Keyboard, ShieldOff, Languages } from 'lucide-react';
import { SectionHeader } from '@/ui/SectionHeader';
import { stagger } from '@/lib/styleUtils';
import { Card } from '@/ui/Card';
import { Toggle } from '@/ui/Toggle';
import { Slider } from '@/ui/Slider';
import { FieldGroup } from '@/ui/FieldGroup';
import { Select } from '@/ui/Select';
import { useSettingsStore } from '@/stores/settingsStore';
import { LANGUAGES } from '@/lib/languages';
import { DEFAULT_INLINE_TRANSLATE_BLOCKLIST } from '@/types/config';

export function InlineTranslateSection() {
  const inlineTranslate = useSettingsStore((s) => s.inlineTranslate);
  const updateSettings = useSettingsStore((s) => s.updateSettings);
  const targetLanguages = LANGUAGES.filter((l) => l.code !== 'auto');

  const patch = (partial: Partial<typeof inlineTranslate>) => {
    updateSettings({ inlineTranslate: { ...inlineTranslate, ...partial } });
  };

  const gestureLabel =
    inlineTranslate.triggerKey === ' '
      ? `Space × ${inlineTranslate.tapCount}`
      : `${inlineTranslate.triggerKey} × ${inlineTranslate.tapCount}`;

  const blocklistText = (inlineTranslate.blocklistPatterns ?? []).join('\n');

  const handleBlocklistChange = (value: string) => {
    const patterns = value
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean);
    patch({ blocklistPatterns: patterns });
  };

  const resetBlocklist = () => {
    patch({ blocklistPatterns: [...DEFAULT_INLINE_TRANSLATE_BLOCKLIST] });
  };

  return (
    <div className="animate-fade-in-up">
      <SectionHeader
        title="Inline Translation"
        description="Translate text in input fields with a key gesture or Alt+I."
        icon={<TextCursorInput className="w-4 h-4" />}
        accentColor="amber"
      />

      <div className="space-y-4">
        {/* Core configuration */}
        <div className="animate-stagger" style={stagger(0)}>
          <Card
            title="Configuration"
            icon={<TextCursorInput className="w-3.5 h-3.5" />}
            variant="bordered"
          >
            <div className="space-y-5">
              <Toggle
                id="inline-translate-toggle"
                label="Enable Inline Translation"
                description="Translate text in input fields with a quick key gesture or shortcut"
                checked={inlineTranslate.enabled}
                onChange={(enabled) => patch({ enabled })}
              />

              <div className="flex flex-wrap items-center gap-3 px-4 py-3 rounded-lg bg-zinc-800/40 border border-zinc-700/50">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-zinc-400">Gesture:</span>
                  <kbd className="px-2 py-0.5 bg-zinc-800 border border-zinc-700 rounded text-xs text-zinc-300 font-mono">
                    {gestureLabel}
                  </kbd>
                </div>
                <span className="text-xs text-zinc-500">
                  within {inlineTranslate.timeWindowMs}ms
                </span>
                <div className="flex items-center gap-1.5 ml-auto">
                  <span className="text-xs text-zinc-400">Shortcut:</span>
                  <kbd className="px-2 py-0.5 bg-zinc-800 border border-zinc-700 rounded text-xs text-zinc-300 font-mono">
                    Alt+I
                  </kbd>
                </div>
              </div>

              <FieldGroup
                label="Target Language"
                description="Default language for input translation (overridable with /en-style prefixes)."
                hint="Type the first few letters to jump to a language."
                htmlFor="inline-translate-target-language"
              >
                <Select
                  id="inline-translate-target-language"
                  value={inlineTranslate.targetLanguage}
                  onChange={(e) => patch({ targetLanguage: e.target.value })}
                  options={targetLanguages.map((lang) => ({
                    value: lang.code,
                    label: `${lang.nativeName} (${lang.name})`,
                  }))}
                  disabled={!inlineTranslate.enabled}
                />
              </FieldGroup>

              <FieldGroup
                label="Tap Count"
                description={`Number of consecutive key presses to trigger (${inlineTranslate.tapCount})`}
              >
                <Slider
                  id="inline-translate-tap-count"
                  min={2}
                  max={5}
                  step={1}
                  value={inlineTranslate.tapCount}
                  onChange={(tapCount) => patch({ tapCount })}
                  disabled={!inlineTranslate.enabled}
                />
              </FieldGroup>

              <FieldGroup
                label="Time Window"
                description={`Maximum span for the gesture burst (${inlineTranslate.timeWindowMs}ms)`}
              >
                <Slider
                  id="inline-translate-time-window"
                  min={200}
                  max={1000}
                  step={50}
                  value={inlineTranslate.timeWindowMs}
                  onChange={(timeWindowMs) => patch({ timeWindowMs })}
                  disabled={!inlineTranslate.enabled}
                />
              </FieldGroup>
            </div>
          </Card>
        </div>

        {/* Gesture timing */}
        <div className="animate-stagger" style={stagger(1)}>
          <Card
            title="Gesture Timing"
            icon={<Keyboard className="w-3.5 h-3.5" />}
            variant="bordered"
          >
            <div className="space-y-5">
              <FieldGroup
                label="Idle Debounce"
                description={`Wait after the last trigger tap before firing (${inlineTranslate.idleMs}ms). 0 = fire immediately.`}
              >
                <Slider
                  id="inline-translate-idle-ms"
                  min={0}
                  max={500}
                  step={25}
                  value={inlineTranslate.idleMs ?? 0}
                  onChange={(idleMs) => patch({ idleMs })}
                  disabled={!inlineTranslate.enabled}
                />
              </FieldGroup>

              <FieldGroup
                label="Trigger Gap"
                description={`Minimum gap between counted taps (${inlineTranslate.triggerGapMs}ms). 0 = no gap filter.`}
              >
                <Slider
                  id="inline-translate-gap-ms"
                  min={0}
                  max={200}
                  step={10}
                  value={inlineTranslate.triggerGapMs ?? 0}
                  onChange={(triggerGapMs) => patch({ triggerGapMs })}
                  disabled={!inlineTranslate.enabled}
                />
              </FieldGroup>

              <FieldGroup
                label="Tolerance"
                description={`Extra noisy taps allowed before reset (${inlineTranslate.triggerToleranceCount})`}
              >
                <Slider
                  id="inline-translate-tolerance"
                  min={0}
                  max={3}
                  step={1}
                  value={inlineTranslate.triggerToleranceCount ?? 0}
                  onChange={(triggerToleranceCount) => patch({ triggerToleranceCount })}
                  disabled={!inlineTranslate.enabled}
                />
              </FieldGroup>
            </div>
          </Card>
        </div>

        {/* Language prefix + dual mode */}
        <div className="animate-stagger" style={stagger(2)}>
          <Card
            title="Language Prefix & Write Mode"
            icon={<Languages className="w-3.5 h-3.5" />}
            variant="bordered"
          >
            <div className="space-y-5">
              <Toggle
                id="inline-translate-prefix-toggle"
                label="Enable Language Prefix"
                description="Leading tokens like /en or /ja set the target language for that request"
                checked={inlineTranslate.enableLanguagePrefix ?? true}
                onChange={(enableLanguagePrefix) => patch({ enableLanguagePrefix })}
                disabled={!inlineTranslate.enabled}
              />

              <FieldGroup
                label="Prefix Character"
                description="Character that starts a language override (default /)."
                htmlFor="inline-translate-prefix-char"
              >
                <input
                  id="inline-translate-prefix-char"
                  type="text"
                  maxLength={1}
                  value={inlineTranslate.languagePrefix ?? '/'}
                  onChange={(e) => {
                    const languagePrefix = e.target.value.slice(0, 1) || '/';
                    patch({ languagePrefix });
                  }}
                  disabled={!inlineTranslate.enabled || !inlineTranslate.enableLanguagePrefix}
                  className="w-16 px-3 py-2 rounded-lg bg-zinc-900 border border-zinc-700 text-sm text-zinc-200 font-mono focus:outline-none focus:ring-2 focus:ring-amber-500/40 disabled:opacity-50"
                  aria-label="Language prefix character"
                />
              </FieldGroup>

              <Toggle
                id="inline-translate-dual-mode"
                label="Dual Mode"
                description="Keep original text and append the translation (default: translation only)"
                checked={inlineTranslate.dualMode ?? false}
                onChange={(dualMode) => patch({ dualMode })}
                disabled={!inlineTranslate.enabled}
              />

              <Toggle
                id="inline-translate-fallback-undo"
                label="Fallback Undo"
                description="Re-triggering the gesture/shortcut restores the original when native Ctrl+Z is unavailable"
                checked={inlineTranslate.enableFallbackUndo ?? true}
                onChange={(enableFallbackUndo) => patch({ enableFallbackUndo })}
                disabled={!inlineTranslate.enabled}
              />
            </div>
          </Card>
        </div>

        {/* Blocklist */}
        <div className="animate-stagger" style={stagger(3)}>
          <Card
            title="Site Blocklist"
            icon={<ShieldOff className="w-3.5 h-3.5" />}
            variant="bordered"
          >
            <div className="space-y-3">
              <FieldGroup
                label="Blocked hosts / patterns"
                description="One pattern per line. Wildcards (*) supported (e.g. *figma.com). Inline translate is disabled on matching pages."
                htmlFor="inline-translate-blocklist"
              >
                <textarea
                  id="inline-translate-blocklist"
                  rows={6}
                  value={blocklistText}
                  onChange={(e) => handleBlocklistChange(e.target.value)}
                  disabled={!inlineTranslate.enabled}
                  className="w-full px-3 py-2 rounded-lg bg-zinc-900 border border-zinc-700 text-xs text-zinc-200 font-mono focus:outline-none focus:ring-2 focus:ring-amber-500/40 disabled:opacity-50 resize-y min-h-[6rem]"
                  spellCheck={false}
                  aria-label="Blocklist patterns"
                />
              </FieldGroup>
              <button
                type="button"
                onClick={resetBlocklist}
                disabled={!inlineTranslate.enabled}
                className="text-xs text-amber-400/90 hover:text-amber-300 disabled:opacity-50 underline-offset-2 hover:underline"
              >
                Reset to defaults
              </button>
            </div>
          </Card>
        </div>

        {/* Usage Hints */}
        <div className="animate-stagger" style={stagger(4)}>
          <Card title="How It Works" variant="bordered">
            <div className="space-y-2 text-xs text-zinc-400">
              <p>
                Press{' '}
                <kbd className="px-1.5 py-0.5 bg-zinc-800 border border-zinc-700 rounded text-zinc-300 font-mono">
                  {gestureLabel}
                </kbd>{' '}
                rapidly in any text input, or use{' '}
                <kbd className="px-1.5 py-0.5 bg-zinc-800 border border-zinc-700 rounded text-zinc-300 font-mono">
                  Alt+I
                </kbd>{' '}
                (customize under{' '}
                <span className="text-zinc-300">chrome://extensions/shortcuts</span>
                ).
              </p>
              <ul className="list-disc list-inside space-y-1 text-zinc-500">
                <li>
                  Prefix example:{' '}
                  <code className="text-zinc-400">/en hello</code> + gesture → English, strips{' '}
                  <code className="text-zinc-400">/en</code>
                </li>
                <li>
                  Works in text inputs, search boxes, textareas, and contentEditable fields
                </li>
                <li>
                  Use{' '}
                  <kbd className="px-1 py-0.5 bg-zinc-800/60 border border-zinc-700/50 rounded text-zinc-400 font-mono text-[10px]">
                    Ctrl+Z
                  </kbd>{' '}
                  to undo when write-back used native insertText; otherwise re-trigger for
                  fallback restore
                </li>
                <li>Password fields, code editors, and blocklisted hosts are excluded</li>
                <li>
                  Does not work on browser internal pages or the Web Store due to browser
                  security restrictions
                </li>
              </ul>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
