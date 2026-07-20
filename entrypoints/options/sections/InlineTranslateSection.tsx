/**
 * Inline Translate Section — hero enable, reactive preview, progressive disclosure.
 * Spec: docs/superpowers/specs/2026-07-10-inline-settings-tab-redesign-design.md
 */

import type { ReactNode } from 'react';
import {
  TextCursorInput,
  Keyboard,
  ShieldOff,
  Languages,
  Type,
  RotateCcw,
  SlidersHorizontal,
} from 'lucide-react';
import { SectionHeader } from '@/ui/SectionHeader';
import { stagger } from '@/lib/styleUtils';
import { Card } from '@/ui/Card';
import { Toggle } from '@/ui/Toggle';
import { Slider } from '@/ui/Slider';
import { FieldGroup } from '@/ui/FieldGroup';
import { Select } from '@/ui/Select';
import { SegmentedControl } from '@/ui/SegmentedControl';
import { AdvancedDisclosure } from '@/ui/AdvancedDisclosure';
import { DisabledDimmer } from '@/ui/DisabledDimmer';
import { Badge } from '@/ui/Badge';
import { Button } from '@/ui/Button';
import { Textarea } from '@/ui/Textarea';
import { useSettingsStore } from '@/stores/settingsStore';
import { LANGUAGES } from '@/lib/languages';
import { DEFAULT_INLINE_TRANSLATE_BLOCKLIST } from '@/types/config';
import { InlineTranslatePreview } from '@/entrypoints/options/components/InlineTranslatePreview';
import { useDeferredCommit } from '@/entrypoints/options/hooks/useDeferredCommit';

const DUAL_MODE_OPTIONS: { value: string; label: string; icon: ReactNode }[] = [
  {
    value: 'translation-only',
    label: 'Translation only',
    icon: <Type className="w-3.5 h-3.5" />,
  },
  {
    value: 'dual',
    label: 'Original + translation',
    icon: <Languages className="w-3.5 h-3.5" />,
  },
];

export function InlineTranslateSection() {
  const inlineTranslate = useSettingsStore((s) => s.inlineTranslate);
  const updateSettings = useSettingsStore((s) => s.updateSettings);
  const targetLanguages = LANGUAGES.filter((l) => l.code !== 'auto');
  const enabled = inlineTranslate.enabled;

  const patch = (partial: Partial<typeof inlineTranslate>) => {
    updateSettings({ inlineTranslate: { ...inlineTranslate, ...partial } });
  };

  const gestureLabel =
    inlineTranslate.triggerKey === ' '
      ? `Space × ${inlineTranslate.tapCount}`
      : `${inlineTranslate.triggerKey} × ${inlineTranslate.tapCount}`;

  // Local draft so newlines / trailing spaces survive while typing. Parse +
  // persist only on blur (trim/filter on every keystroke ate separators and
  // made the textarea feel unfocused / untypable).
  const blocklistCommitted = (inlineTranslate.blocklistPatterns ?? []).join('\n');
  const blocklistField = useDeferredCommit(blocklistCommitted, (text) => {
    const patterns = text
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean);
    // Read latest store so blur-commit does not clobber concurrent patches.
    const current = useSettingsStore.getState().inlineTranslate;
    void updateSettings({
      inlineTranslate: { ...current, blocklistPatterns: patterns },
    });
  });
  const languagePrefixField = useDeferredCommit(
    inlineTranslate.languagePrefix ?? '/',
    (languagePrefix) => {
      const current = useSettingsStore.getState().inlineTranslate;
      void updateSettings({
        inlineTranslate: { ...current, languagePrefix },
      });
    },
  );
  const patternCount = blocklistField.value
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean).length;

  const resetBlocklist = () => {
    const next = [...DEFAULT_INLINE_TRANSLATE_BLOCKLIST];
    const text = next.join('\n');
    blocklistField.adopt(text);
    patch({ blocklistPatterns: next });
  };

  const dualModeValue = inlineTranslate.dualMode ? 'dual' : 'translation-only';

  return (
    <div className="animate-fade-in-up">
      <SectionHeader
        title="Inline Translation"
        description="Translate text in inputs with a key gesture or Alt+I."
        icon={<TextCursorInput className="w-4 h-4" />}
        accentColor="amber"
      />

      {/* Hero enable */}
      <div className="mb-4 rounded-xl border border-amber-500/30 bg-amber-500/[0.04] p-4">
        <Toggle
          id="inline-translate-toggle"
          label="Enable Inline Translation"
          description={
            enabled
              ? 'Active in text fields on pages that are not blocklisted.'
              : 'Off — enable to translate text inside inputs with a key gesture or Alt+I.'
          }
          checked={enabled}
          onChange={(next) => patch({ enabled: next })}
        />
      </div>

      <div className="space-y-4">
        {/* 1. Preview */}
        <div className="animate-stagger" style={stagger(0)}>
          <Card
            title="Preview"
            description="Sample field that mirrors your current settings. No real translation runs here."
            icon={<TextCursorInput className="w-3.5 h-3.5" />}
            variant="bordered"
          >
            <InlineTranslatePreview
              disabled={!enabled}
              targetLanguage={inlineTranslate.targetLanguage}
              dualMode={inlineTranslate.dualMode ?? false}
              enableLanguagePrefix={inlineTranslate.enableLanguagePrefix ?? true}
              languagePrefix={inlineTranslate.languagePrefix ?? '/'}
              tapCount={inlineTranslate.tapCount}
              timeWindowMs={inlineTranslate.timeWindowMs}
              triggerKeyLabel={gestureLabel}
            />
          </Card>
        </div>

        {/* 2. Trigger */}
        <div className="animate-stagger" style={stagger(1)}>
          <Card
            title="Trigger"
            description="Default language and how the key gesture fires."
            icon={<Keyboard className="w-3.5 h-3.5" />}
            variant="bordered"
          >
            <DisabledDimmer disabled={!enabled}>
              <div className="space-y-5">
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
                    disabled={!enabled}
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
                    disabled={!enabled}
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
                    disabled={!enabled}
                  />
                </FieldGroup>
              </div>
            </DisabledDimmer>
          </Card>
        </div>

        {/* 3. Write & language */}
        <div className="animate-stagger" style={stagger(2)}>
          <Card
            title="Write & language"
            description="How the translated text is written back and optional per-request language overrides."
            icon={<Languages className="w-3.5 h-3.5" />}
            variant="bordered"
          >
            <DisabledDimmer disabled={!enabled}>
              <div className="space-y-5">
                <FieldGroup
                  label="Write mode"
                  description="Translation only replaces the field. Original + translation keeps both."
                >
                  <SegmentedControl
                    id="inline-translate-dual-mode"
                    label="Write mode"
                    options={DUAL_MODE_OPTIONS}
                    value={dualModeValue}
                    onChange={(v) => patch({ dualMode: v === 'dual' })}
                    disabled={!enabled}
                  />
                </FieldGroup>

                <Toggle
                  id="inline-translate-prefix-toggle"
                  label="Enable Language Prefix"
                  description="Leading tokens like /en or /ja set the target language for that request"
                  checked={inlineTranslate.enableLanguagePrefix ?? true}
                  onChange={(enableLanguagePrefix) => patch({ enableLanguagePrefix })}
                  disabled={!enabled}
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
                    value={languagePrefixField.value}
                    onChange={(e) => languagePrefixField.setValue(e.target.value.slice(0, 1))}
                    onBlur={() => {
                      if (languagePrefixField.value) {
                        languagePrefixField.commit();
                        return;
                      }
                      languagePrefixField.adopt('/');
                      const current = useSettingsStore.getState().inlineTranslate;
                      void updateSettings({
                        inlineTranslate: { ...current, languagePrefix: '/' },
                      });
                    }}
                    disabled={!enabled || !(inlineTranslate.enableLanguagePrefix ?? true)}
                    className="w-16 px-3 py-2 rounded-lg bg-zinc-900 border border-zinc-700 text-sm text-zinc-200 font-mono focus:outline-none focus:ring-2 focus:ring-amber-500/40 disabled:opacity-50"
                    aria-label="Language prefix character"
                  />
                </FieldGroup>

                <Toggle
                  id="inline-translate-fallback-undo"
                  label="Fallback Undo"
                  description="Re-triggering the gesture/shortcut restores the original when native Ctrl+Z is unavailable"
                  checked={inlineTranslate.enableFallbackUndo ?? true}
                  onChange={(enableFallbackUndo) => patch({ enableFallbackUndo })}
                  disabled={!enabled}
                />
              </div>
            </DisabledDimmer>
          </Card>
        </div>

        {/* 4. Site blocklist */}
        <div className="animate-stagger" style={stagger(3)}>
          <Card
            title="Site blocklist"
            description="Disable inline translate on matching hosts. Wildcards (*) supported."
            icon={<ShieldOff className="w-3.5 h-3.5" />}
            variant="bordered"
            headerExtra={
              <Badge variant="info">
                {patternCount} pattern{patternCount === 1 ? '' : 's'}
              </Badge>
            }
          >
            <DisabledDimmer disabled={!enabled}>
              <div className="space-y-3">
                <FieldGroup
                  label="Blocked hosts / patterns"
                  description="One pattern per line (e.g. *figma.com)."
                  htmlFor="inline-translate-blocklist"
                >
                  <Textarea
                    id="inline-translate-blocklist"
                    rows={6}
                    value={blocklistField.value}
                    onChange={(e) => blocklistField.setValue(e.target.value)}
                    onBlur={blocklistField.commit}
                    disabled={!enabled}
                    mono
                    spellCheck={false}
                    aria-label="Blocklist patterns"
                    className="min-h-[6rem] resize-y text-xs"
                  />
                </FieldGroup>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  icon={<RotateCcw className="w-3 h-3" />}
                  onClick={resetBlocklist}
                  disabled={!enabled}
                >
                  Reset to defaults
                </Button>
              </div>
            </DisabledDimmer>
          </Card>
        </div>

        {/* 5. Advanced timing */}
        <div className="animate-stagger" style={stagger(4)}>
          <Card
            title="Advanced"
            description="Fine-tune gesture recognition. Defaults work for most users."
            icon={<SlidersHorizontal className="w-3.5 h-3.5" />}
            variant="bordered"
          >
            <DisabledDimmer disabled={!enabled}>
              <AdvancedDisclosure label="Gesture timing" idPrefix="inline-gesture-timing">
                <div className="space-y-5">
                  <FieldGroup
                    label="Idle Debounce"
                    description={`Wait after the last trigger tap before firing (${inlineTranslate.idleMs ?? 0}ms). 0 = fire immediately.`}
                  >
                    <Slider
                      id="inline-translate-idle-ms"
                      min={0}
                      max={500}
                      step={25}
                      value={inlineTranslate.idleMs ?? 0}
                      onChange={(idleMs) => patch({ idleMs })}
                      disabled={!enabled}
                    />
                  </FieldGroup>
                  <FieldGroup
                    label="Trigger Gap"
                    description={`Minimum gap between counted taps (${inlineTranslate.triggerGapMs ?? 0}ms). 0 = no gap filter.`}
                  >
                    <Slider
                      id="inline-translate-gap-ms"
                      min={0}
                      max={200}
                      step={10}
                      value={inlineTranslate.triggerGapMs ?? 0}
                      onChange={(triggerGapMs) => patch({ triggerGapMs })}
                      disabled={!enabled}
                    />
                  </FieldGroup>
                  <FieldGroup
                    label="Tolerance"
                    description={`Extra noisy taps allowed before reset (${inlineTranslate.triggerToleranceCount ?? 0})`}
                  >
                    <Slider
                      id="inline-translate-tolerance"
                      min={0}
                      max={3}
                      step={1}
                      value={inlineTranslate.triggerToleranceCount ?? 0}
                      onChange={(triggerToleranceCount) => patch({ triggerToleranceCount })}
                      disabled={!enabled}
                    />
                  </FieldGroup>
                </div>
              </AdvancedDisclosure>
            </DisabledDimmer>
          </Card>
        </div>

        {/* 6. How it works */}
        <div className="animate-stagger" style={stagger(5)}>
          <Card title="How it works" variant="bordered">
            <ul className="list-disc list-inside space-y-1.5 text-xs text-zinc-500">
              <li>
                Press{' '}
                <kbd className="px-1.5 py-0.5 bg-zinc-800 border border-zinc-700 rounded text-zinc-300 font-mono">
                  {gestureLabel}
                </kbd>{' '}
                in a text field, or{' '}
                <kbd className="px-1.5 py-0.5 bg-zinc-800 border border-zinc-700 rounded text-zinc-300 font-mono">
                  Alt+I
                </kbd>{' '}
                (customize under chrome://extensions/shortcuts).
              </li>
              <li>
                Prefix example:{' '}
                <code className="text-zinc-400">
                  {(inlineTranslate.languagePrefix ?? '/') + 'en hello'}
                </code>{' '}
                + gesture → English, strips the prefix token.
              </li>
              <li>Works in text inputs, search boxes, textareas, and contentEditable fields.</li>
              <li>
                Undo with Ctrl+Z when available; otherwise re-trigger if Fallback Undo is on.
              </li>
              <li>
                Password fields, code editors, blocklisted hosts, browser internal pages, and the
                Web Store are excluded.
              </li>
            </ul>
          </Card>
        </div>
      </div>
    </div>
  );
}
