/**
 * TranslationEngineCard — prompt editor, translation behavior, and context
 * awareness, extracted from the monolithic AdvancedSection. The prompt editor
 * lives behind a progressive disclosure; it expands automatically once the
 * prompt diverges from the built-in template.
 */

import { AlertTriangle, BrainCircuit, RotateCcw } from 'lucide-react';
import { useSettingsStore } from '@/stores/settingsStore';
import {
  DEFAULT_SYSTEM_PROMPT_TEMPLATE,
  validatePromptTemplate,
} from '@/services/base';
import { useDeferredCommit } from '@/entrypoints/options/hooks/useDeferredCommit';
import { Card } from '@/ui/Card';
import { Badge } from '@/ui/Badge';
import { Button } from '@/ui/Button';
import { Toggle } from '@/ui/Toggle';
import { Select } from '@/ui/Select';
import { Textarea } from '@/ui/Textarea';
import { FieldGroup } from '@/ui/FieldGroup';
import { SettingsGroup } from '@/ui/SettingsGroup';
import { DisabledDimmer } from '@/ui/DisabledDimmer';
import { AdvancedDisclosure } from '@/ui/AdvancedDisclosure';

export function TranslationEngineCard() {
  const settings = useSettingsStore();
  const updateSettings = useSettingsStore((s) => s.updateSettings);

  // FR-9: Global System Prompt editor relocated here from the Providers tab.
  // Keep edits local until blur so storage-sync writes cannot replace the
  // controlled textarea while the user is typing.
  const promptField = useDeferredCommit(
    settings.customSystemPrompt ?? DEFAULT_SYSTEM_PROMPT_TEMPLATE,
    (customSystemPrompt) => updateSettings({ customSystemPrompt }),
  );
  const promptValidation = promptField.value
    ? validatePromptTemplate(promptField.value)
    : null;
  const isPromptCustom = promptField.value !== DEFAULT_SYSTEM_PROMPT_TEMPLATE;
  const promptWarnings =
    promptValidation && !promptValidation.valid ? promptValidation.warnings : [];

  /** FR-5 — insert a template variable at the cursor (or append) and commit. */
  const insertVariable = (variable: string) => {
    const el = document.getElementById('advanced-system-prompt') as HTMLTextAreaElement | null;
    const text = promptField.value;
    const start = el?.selectionStart ?? text.length;
    const end = el?.selectionEnd ?? text.length;
    const next =
      el && typeof el.setRangeText === 'function'
        ? text.slice(0, start) + variable + text.slice(end)
        : text + variable;
    if (el && typeof el.setRangeText === 'function') {
      el.setRangeText(variable, start, end, 'end');
    }
    promptField.adopt(next);
    updateSettings({ customSystemPrompt: next });
  };

  return (
    <Card
      variant="bordered"
      title="Translation engine"
      description="Prompting, output behavior, reliability, and page context."
      icon={<BrainCircuit className="w-3.5 h-3.5" />}
      headerExtra={
        isPromptCustom ? (
          <Badge variant="info">Customized</Badge>
        ) : (
          <Badge variant="success">Using default</Badge>
        )
      }
    >
      <div className="space-y-6">
        <AdvancedDisclosure
          label="System prompt"
          idPrefix="translation-engine-prompt"
          defaultExpanded={isPromptCustom}
        >
          <div className="overflow-hidden rounded-xl border border-zinc-800/90 bg-zinc-950/50">
            <div className="flex flex-wrap items-center gap-2 border-b border-zinc-800/90 bg-zinc-900/40 px-3 py-2">
              <span className="text-[11px] font-medium text-zinc-500">Insert</span>
              {(
                [
                  { token: '{{targetLanguage}}', tip: 'Target language name' },
                  { token: '{{glossary}}', tip: 'Active glossary terms' },
                ] as const
              ).map(({ token, tip }) => (
                <button
                  key={token}
                  type="button"
                  title={tip}
                  onClick={() => insertVariable(token)}
                  className="inline-flex items-center rounded-md border border-cyan-500/20 bg-cyan-500/10 px-2 py-0.5 font-mono text-[11px] text-cyan-200/90 transition-colors hover:border-cyan-400/40 hover:bg-cyan-500/20 hover:text-cyan-100 cursor-pointer"
                >
                  {token}
                </button>
              ))}
              <span className="ml-auto hidden text-[11px] text-zinc-600 sm:inline">
                Click to insert at cursor
              </span>
            </div>
            <Textarea
              id="advanced-system-prompt"
              value={promptField.value}
              onChange={(e) => promptField.setValue(e.target.value)}
              onBlur={promptField.commit}
              rows={8}
              mono
              flush
              aria-label="Custom prompt template"
            />
          </div>

          {promptWarnings.length > 0 && (
            <ul className="mt-3 space-y-1.5 rounded-lg border border-amber-500/25 bg-amber-500/10 px-3 py-2.5">
              {promptWarnings.map((w) => (
                <li key={w} className="flex items-start gap-2 text-xs text-amber-300">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  <span>{w}</span>
                </li>
              ))}
            </ul>
          )}

          <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
            <p className="text-[11px] text-zinc-600">
              Changes save automatically. Reset restores the built-in template.
            </p>
            <Button
              variant="ghost"
              size="sm"
              icon={<RotateCcw className="w-3 h-3" />}
              onClick={() => {
                promptField.adopt(DEFAULT_SYSTEM_PROMPT_TEMPLATE);
                updateSettings({ customSystemPrompt: null });
              }}
              disabled={!isPromptCustom}
            >
              Reset to default
            </Button>
          </div>
        </AdvancedDisclosure>

        <SettingsGroup title="Selection & formatting" description="Richer output for short and structured text.">
          <Toggle
            id="selection-dictionary-toggle"
            checked={settings.selectionDictionaryEnabled}
            onChange={(checked) => updateSettings({ selectionDictionaryEnabled: checked })}
            label="Dictionary mode for selection"
            description="Short selections get phonetics, definitions, and examples. Longer sentences stay translation-only."
          />
          <Toggle
            id="rich-translate-toggle"
            checked={settings.enableRichTranslate}
            onChange={(checked) => updateSettings({ enableRichTranslate: checked })}
            label="Rich translate (inline markup)"
            description="Preserve bold, links, code, and other inline formatting in translated paragraphs."
          />
        </SettingsGroup>

        <div className="border-t border-zinc-800/80 pt-5">
          <SettingsGroup title="Efficiency & reliability" description="Spend fewer tokens and recover faster from flaky providers.">
            <Toggle
              id="source-lang-detect-toggle"
              checked={settings.enableSourceLanguageDetection}
              onChange={(checked) => updateSettings({ enableSourceLanguageDetection: checked })}
              label="Source-language detection"
              description="Skip text already in the target language — saves tokens and latency."
            />
            <Toggle
              id="failure-cache-toggle"
              checked={settings.enableFailureCache}
              onChange={(checked) => updateSettings({ enableFailureCache: checked })}
              label="Failure cache"
              description="Remember recent failures so flaky providers aren't retried on every scroll."
            />
            <Toggle
              id="web-resume-toggle"
              checked={settings.enableWebResume}
              onChange={(checked) => updateSettings({ enableWebResume: checked })}
              label="Cross-session resume"
              description="Restore translated state after refresh when the cache still holds results."
            />
          </SettingsGroup>
        </div>

        <div className="rounded-xl border border-sky-500/20 bg-sky-500/[0.04] px-4 py-3.5">
          <Toggle
            id="streaming-toggle"
            checked={settings.enableStreamingTranslation}
            onChange={(checked) => updateSettings({ enableStreamingTranslation: checked })}
            label="Streaming translation"
            labelExtra={<Badge variant="info">Default on</Badge>}
            description="Fill translations as the response streams instead of waiting for the full batch. Falls back to non-streaming if the stream fails. Turn off via Classic page-scope preset."
          />
        </div>

        <div className="border-t border-zinc-800/80 pt-5">
          <SettingsGroup title="Context awareness" description="Give the model page context so terminology stays consistent across a site.">
            <Toggle
              id="context-aware-toggle"
              checked={settings.enableContextAwareTranslation}
              onChange={(checked) => updateSettings({ enableContextAwareTranslation: checked })}
              label="Context-aware translation"
              description="Inject page title, description, and domain into prompts for more consistent wording."
            />

            <DisabledDimmer
              disabled={!settings.enableContextAwareTranslation}
              className="space-y-4 rounded-xl border border-emerald-500/15 bg-emerald-500/[0.03] p-4"
            >
              <Toggle
                id="page-category-detection-toggle"
                checked={settings.enableLLMPageCategoryDetection}
                onChange={(checked) => updateSettings({ enableLLMPageCategoryDetection: checked })}
                disabled={!settings.enableContextAwareTranslation}
                label="LLM page category detection"
                description="Detect the page topic with a background LLM call for better terminology. Uses one additional AI request."
              />

              {settings.enableLLMPageCategoryDetection && (
                <div className="animate-fade-in-up border-t border-emerald-500/10 pt-4">
                  <FieldGroup
                    label="Detection mode"
                    description="Async upgrades context after the first paints; blocking waits for a category before translating."
                    htmlFor="llm-category-mode-select"
                  >
                    <Select
                      id="llm-category-mode-select"
                      value={settings.llmCategoryDetectionMode}
                      onChange={(e) =>
                        updateSettings({
                          llmCategoryDetectionMode: e.target.value as 'async' | 'blocking',
                        })
                      }
                      disabled={!settings.enableContextAwareTranslation}
                      options={[
                        { value: 'async', label: 'Async — no delay, progressive upgrade' },
                        { value: 'blocking', label: 'Blocking — wait before first translation' },
                      ]}
                    />
                  </FieldGroup>
                </div>
              )}
            </DisabledDimmer>
          </SettingsGroup>
        </div>
      </div>
    </Card>
  );
}
