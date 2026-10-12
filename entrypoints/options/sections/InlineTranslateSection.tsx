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
import {
  DEFAULT_INLINE_TRANSLATE_BLOCKLIST,
  INLINE_TRIGGER_KEYS,
  INLINE_TRIGGER_TIMEOUT_MAX_MS,
  INLINE_TRIGGER_TIMEOUT_MIN_MS,
  type InlineTriggerKey,
} from '@/types/config';
import { formatGestureLabel } from '@/lib/shortcutDisplay';
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

const KEY_LABELS: Record<InlineTriggerKey, string> = {
  ' ': 'Space',
  '/': '/  slash',
  '=': '=  equals',
  ';': ';  semicolon',
  ',': ',  comma',
  '.': '.  period',
  ':': ':  colon',
};

/** Starting-key select value that turns language prefixes off. */
const STARTING_KEY_NONE = 'none';

export function InlineTranslateSection() {
  const inlineTranslate = useSettingsStore((s) => s.inlineTranslate);
  const updateSettings = useSettingsStore((s) => s.updateSettings);
  const targetLanguages = LANGUAGES.filter((l) => l.code !== 'auto');
  const enabled = inlineTranslate.enabled;

  const patch = (partial: Partial<typeof inlineTranslate>) => {
    updateSettings({ inlineTranslate: { ...inlineTranslate, ...partial } });
  };

  const gestureLabel = formatGestureLabel(inlineTranslate.tapCount, inlineTranslate.triggerKey);
  const prefixEnabled = inlineTranslate.enableLanguagePrefix ?? true;
  const startingKey = prefixEnabled ? (inlineTranslate.languagePrefix ?? '/') : STARTING_KEY_NONE;
  const startingKeyOptions = [
    { value: STARTING_KEY_NONE, label: 'None (no language prefix)' },
    ...INLINE_TRIGGER_KEYS.filter((k) => k !== ' ' && k !== inlineTranslate.triggerKey).map((k) => ({
      value: k,
      label: KEY_LABELS[k],
    })),
  ];

  const setTrailingKey = (triggerKey: InlineTriggerKey) => {
    // A starting key equal to the trailing key would be ambiguous: turn prefixes off.
    const clash = prefixEnabled && triggerKey === inlineTranslate.languagePrefix;
    patch(clash ? { triggerKey, enableLanguagePrefix: false } : { triggerKey });
  };

  const setStartingKey = (value: string) => {
    if (value === STARTING_KEY_NONE) {
      patch({ enableLanguagePrefix: false });
      return;
    }
    patch({ enableLanguagePrefix: true, languagePrefix: value });
  };

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
              enableLanguagePrefix={prefixEnabled}
              languagePrefix={inlineTranslate.languagePrefix ?? '/'}
              tapCount={inlineTranslate.tapCount}
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
                    taps ≤ {inlineTranslate.triggerGapMs}ms apart
                  </span>
                  <div className="flex items-center gap-1.5 ml-auto">
                    <span className="text-xs text-zinc-400">Shortcut:</span>
                    <kbd className="px-2 py-0.5 bg-zinc-800 border border-zinc-700 rounded text-xs text-zinc-300 font-mono">
                      Alt+I
                    </kbd>
                  </div>
                </div>

                <Toggle
                  id="inline-translate-gesture-toggle"
                  label="Key gesture"
                  description="Translate by tapping the trailing key at the end of your text. Off = Alt+I only."
                  checked={inlineTranslate.gestureEnabled ?? true}
                  onChange={(gestureEnabled) => patch({ gestureEnabled })}
                  disabled={!enabled}
                />

                <FieldGroup
                  label="Target Language"
                  description="Default language for input translation."
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
                  label="Trailing key"
                  description="Tap this key at the end of the text to translate."
                  htmlFor="inline-translate-trailing-key"
                >
                  <Select
                    id="inline-translate-trailing-key"
                    value={inlineTranslate.triggerKey}
                    onChange={(e) => setTrailingKey(e.target.value as InlineTriggerKey)}
                    options={INLINE_TRIGGER_KEYS.map((k) => ({ value: k, label: KEY_LABELS[k] }))}
                    disabled={!enabled || inlineTranslate.gestureEnabled === false}
                  />
                </FieldGroup>

                <FieldGroup
                  label="Starting key"
                  description={`Start the text with it plus a language to override the target, e.g. ${
                    prefixEnabled ? `${startingKey}${startingKey}en hello` : 'none set'
                  }.`}
                  htmlFor="inline-translate-starting-key"
                >
                  <Select
                    id="inline-translate-starting-key"
                    value={startingKey}
                    onChange={(e) => setStartingKey(e.target.value)}
                    options={startingKeyOptions}
                    disabled={!enabled}
                  />
                </FieldGroup>

                <FieldGroup
                  label="Combo interval"
                  description={`Maximum pause between taps of a non-space trailing key (${inlineTranslate.triggerTimeoutMs}ms)`}
                >
                  <Slider
                    id="inline-translate-combo-interval"
                    min={INLINE_TRIGGER_TIMEOUT_MIN_MS}
                    max={INLINE_TRIGGER_TIMEOUT_MAX_MS}
                    step={50}
                    value={inlineTranslate.triggerTimeoutMs}
                    onChange={(triggerTimeoutMs) => patch({ triggerTimeoutMs })}
                    disabled={!enabled || inlineTranslate.triggerKey === ' '}
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
                  id="inline-translate-auto-language"
                  label="Reply in the conversation's language"
                  description="On supported chat sites, translate into the language of the messages around the field."
                  checked={inlineTranslate.autoLanguageEnable ?? true}
                  onChange={(autoLanguageEnable) => patch({ autoLanguageEnable })}
                  disabled={!enabled}
                />

                <Toggle
                  id="inline-translate-auto-page-language"
                  label="Use the page language"
                  description="When no conversation language is found, translate into the page's language."
                  checked={inlineTranslate.autoLanguagePageEnable ?? false}
                  onChange={(autoLanguagePageEnable) => patch({ autoLanguagePageEnable })}
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
            description="Fine-tune timing, prompts and undo. Defaults work for most users."
            icon={<SlidersHorizontal className="w-3.5 h-3.5" />}
            variant="bordered"
          >
            <DisabledDimmer disabled={!enabled}>
              <AdvancedDisclosure label="Advanced options" idPrefix="inline-advanced">
                <div className="space-y-5">
                  <FieldGroup
                    label="Tap Count"
                    description={`Consecutive trailing-key taps that trigger (${inlineTranslate.tapCount})`}
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
                    label="Tap Gap"
                    description={`Maximum pause between Space taps (${inlineTranslate.triggerGapMs}ms)`}
                  >
                    <Slider
                      id="inline-translate-tap-gap"
                      min={100}
                      max={1000}
                      step={50}
                      value={inlineTranslate.triggerGapMs}
                      onChange={(triggerGapMs) => patch({ triggerGapMs })}
                      disabled={!enabled}
                    />
                  </FieldGroup>
                  <FieldGroup
                    label="Idle wait"
                    description={`Quiet time after the last Space tap before translating (${inlineTranslate.idleMs}ms)`}
                  >
                    <Slider
                      id="inline-translate-idle-ms"
                      min={0}
                      max={1000}
                      step={50}
                      value={inlineTranslate.idleMs}
                      onChange={(idleMs) => patch({ idleMs })}
                      disabled={!enabled}
                    />
                  </FieldGroup>
                  <FieldGroup
                    label="Tolerance"
                    description={`Extra Space taps above the tap count that still translate (${inlineTranslate.triggerToleranceCount})`}
                  >
                    <Slider
                      id="inline-translate-tolerance"
                      min={0}
                      max={3}
                      step={1}
                      value={inlineTranslate.triggerToleranceCount}
                      onChange={(triggerToleranceCount) => patch({ triggerToleranceCount })}
                      disabled={!enabled}
                    />
                  </FieldGroup>
                  <FieldGroup
                    label="Cancel window"
                    description={`Typing within this time after the trigger cancels the translation (${inlineTranslate.cancelWindowMs}ms)`}
                  >
                    <Slider
                      id="inline-translate-cancel-window"
                      min={0}
                      max={10000}
                      step={500}
                      value={inlineTranslate.cancelWindowMs}
                      onChange={(cancelWindowMs) => patch({ cancelWindowMs })}
                      disabled={!enabled}
                    />
                  </FieldGroup>
                  <FieldGroup
                    label="Minimum duration"
                    description={`Keep the loading indicator at least this long before writing (${inlineTranslate.minDurationMs}ms)`}
                  >
                    <Slider
                      id="inline-translate-min-duration"
                      min={0}
                      max={3000}
                      step={100}
                      value={inlineTranslate.minDurationMs}
                      onChange={(minDurationMs) => patch({ minDurationMs })}
                      disabled={!enabled}
                    />
                  </FieldGroup>
                  <Toggle
                    id="inline-translate-confirm-long"
                    label="Confirm long text"
                    description="Ask before translating a long draft"
                    checked={inlineTranslate.confirmLongText ?? true}
                    onChange={(confirmLongText) => patch({ confirmLongText })}
                    disabled={!enabled}
                  />
                  <FieldGroup
                    label="Long text threshold"
                    description={`Characters above which to ask first (${inlineTranslate.confirmLongTextLength}; 0 = never ask)`}
                  >
                    <Slider
                      id="inline-translate-long-text"
                      min={0}
                      max={2000}
                      step={50}
                      value={inlineTranslate.confirmLongTextLength}
                      onChange={(confirmLongTextLength) => patch({ confirmLongTextLength })}
                      disabled={!enabled || inlineTranslate.confirmLongText === false}
                    />
                  </FieldGroup>
                  <Toggle
                    id="inline-translate-language-bar"
                    label="Target-language bar"
                    description="After translating, show a bar to switch the language or undo"
                    checked={inlineTranslate.enableTargetLanguageBar ?? true}
                    onChange={(enableTargetLanguageBar) => patch({ enableTargetLanguageBar })}
                    disabled={!enabled}
                  />
                  <Toggle
                    id="inline-translate-fallback-undo"
                    label="Fallback Undo"
                    description="Re-triggering the gesture/shortcut restores the original when native Ctrl+Z is unavailable"
                    checked={inlineTranslate.enableFallbackUndo ?? true}
                    onChange={(enableFallbackUndo) => patch({ enableFallbackUndo })}
                    disabled={!enabled}
                  />
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
              {prefixEnabled && (
                <li>
                  Prefix example:{' '}
                  <code className="text-zinc-400">{`${startingKey}${startingKey}en hello`}</code> +
                  gesture → English, strips the prefix token.
                </li>
              )}
              <li>
                After translating, the bar under the field switches the language (re-translating
                your original text) or undoes the change.
              </li>
              <li>Works in text inputs, search boxes, textareas, and contentEditable fields.</li>
              <li>
                Undo with Ctrl+Z or the bar&apos;s Undo; otherwise re-trigger if Fallback Undo is on.
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
