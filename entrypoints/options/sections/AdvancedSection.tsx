/**
 * Advanced Settings Section — cache, export/import, debug mode, and context features.
 */

import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import {
  Download,
  Upload,
  Trash2,
  HardDrive,
  Wrench,
  Database,
  BrainCircuit,
  FileText,
  Braces,
  Bug,
  AlertTriangle,
  RotateCcw,
  Sparkles,
  ShieldAlert,
  Gauge,
  Zap,
  CheckCircle2,
  FlaskConical,
  Volume2,
  List,
  Loader2,
  Lock,
} from 'lucide-react';
import { SectionHeader } from '@/ui/SectionHeader';
import { stagger } from '@/lib/styleUtils';
import { useSettingsStore } from '@/stores/settingsStore';
import {
  DEFAULT_SETTINGS,
  DEFAULT_PDF_SETTINGS,
  DEFAULT_SCIENTIFIC_PDF_SETTINGS,
  DEFAULT_TTS_SETTINGS,
  OPENAI_TTS_VOICE_SUGGESTIONS,
  type ExtensionSettings,
  type TtsCredentialSource,
  type TtsLanguageOverride,
  type TtsPreferredBackend,
  type TtsSettings,
} from '@/types/config';
import {
  mergeTtsSettings,
  pickTtsCredentials,
  shouldOfferVoiceField,
} from '@/lib/tts/resolveTtsBackend';
import { getTargetLanguages } from '@/lib/languages';
import { listProviderModels } from '@/services/providerTester';
import {
  listTtsVoices,
  type TtsVoiceChoice,
} from '@/lib/tts/listTtsVoices';
import { Card } from '@/ui/Card';
import { Button } from '@/ui/Button';
import { Toggle } from '@/ui/Toggle';
import { Modal } from '@/ui/Modal';
import { Input } from '@/ui/Input';
import { Select } from '@/ui/Select';
import { FieldGroup } from '@/ui/FieldGroup';
import { Badge } from '@/ui/Badge';
import { Textarea } from '@/ui/Textarea';
import { DisabledDimmer } from '@/ui/DisabledDimmer';
import { AdvancedDisclosure } from '@/ui/AdvancedDisclosure';
import { DangerZone, DangerAction } from '@/ui/DangerZone';
import { SettingsGroup } from '@/ui/SettingsGroup';
import { useToast } from '@/ui/ToastProvider';
import { useDeferredCommit } from '@/entrypoints/options/hooks/useDeferredCommit';
import { useCacheStats } from '@/entrypoints/options/hooks/useCacheStats';
import {
  DEFAULT_SYSTEM_PROMPT_TEMPLATE,
  validatePromptTemplate,
} from '@/services/base';
import {
  applyPageScopePreset,
  detectPageScopePreset,
  PAGE_SCOPE_PRESET_OPTIONS,
  type PageScopePreset,
} from '@/lib/pageScopePreset';
import {
  mergeScientificPdfSettings,
  resolveScientificPdfStatus,
  shouldWarnNonLoopbackServerUrl,
  type ScientificPdfStatus,
} from '@/lib/scientificPdf';
import { ScientificPdfWizard } from '@/entrypoints/options/components/ScientificPdfWizard';
import {
  BackupDecryptError,
  decryptBackup,
  detectFormat,
  encryptBackup,
  sanitizeImportObject,
  serializeSettings,
} from '@/lib/backup';
import {
  BackupPasswordDialog,
  ImportSummaryDialog,
} from '@/entrypoints/options/components/BackupDialogs';
import {
  ADVANCED_SECTION_IDS,
  scrollToAdvancedSection,
} from '@/entrypoints/options/lib/scrollToAdvancedSection';
import { extractSettings } from '@/stores/settingsStore';

const SECTION_ANCHOR_CLASS =
  'animate-stagger scroll-mt-4 rounded-xl outline-none data-[advanced-section-highlight=true]:ring-2 data-[advanced-section-highlight=true]:ring-cyan-500/40 data-[advanced-section-highlight=true]:ring-offset-2 data-[advanced-section-highlight=true]:ring-offset-zinc-950';

// Cache anchor lives on a DangerAction <li> inside the overflow-hidden DangerZone,
// so the highlight uses an inset ring (outer rings would be clipped).
const CACHE_ANCHOR_CLASS =
  'scroll-mt-4 outline-none data-[advanced-section-highlight=true]:ring-2 data-[advanced-section-highlight=true]:ring-inset data-[advanced-section-highlight=true]:ring-amber-500/50';

const CHIP_BASE_CLASS =
  'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500/50 focus-visible:ring-offset-1 focus-visible:ring-offset-zinc-950 hover:brightness-110';

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function scientificStatusBadge(status: ScientificPdfStatus): {
  variant: 'info' | 'success' | 'warning' | 'danger';
  label: string;
} {
  switch (status) {
    case 'ready':
      return { variant: 'success', label: 'Ready' };
    case 'offline':
      return { variant: 'warning', label: 'Offline' };
    default:
      return { variant: 'info', label: 'Not installed' };
  }
}

const TTS_BACKEND_OPTIONS: { value: TtsPreferredBackend; label: string }[] = [
  { value: 'auto', label: 'Auto (provider if configured)' },
  { value: 'browser', label: 'Browser only' },
  { value: 'provider', label: 'Provider first (fallback to browser)' },
];

const TTS_CREDENTIAL_SOURCE_OPTIONS: { value: TtsCredentialSource; label: string }[] = [
  { value: 'pool', label: 'Use provider from pool' },
  { value: 'custom', label: 'Custom TTS endpoint' },
];

const TTS_OVERRIDE_CREDENTIAL_OPTIONS: {
  value: '' | TtsCredentialSource;
  label: string;
}[] = [
  { value: '', label: 'Inherit global' },
  { value: 'pool', label: 'Pool provider' },
  { value: 'custom', label: 'Custom TTS endpoint' },
];

const TTS_ISH_MODEL_RE = /tts|speech|audio|voice/i;

function sortTtsModelChoices(ids: string[]): string[] {
  const preferred: string[] = [];
  const rest: string[] = [];
  for (const id of ids) {
    if (TTS_ISH_MODEL_RE.test(id)) preferred.push(id);
    else rest.push(id);
  }
  return [...preferred, ...rest];
}

function normalizedOverrideLang(code: string): string {
  return code.trim().toLowerCase().replace(/_/g, '-');
}

function isDuplicateLanguage(
  rows: TtsLanguageOverride[],
  index: number,
  language: string,
): boolean {
  const n = normalizedOverrideLang(language);
  if (!n) return false;
  return rows.some(
    (r, i) => i !== index && normalizedOverrideLang(r.language) === n,
  );
}

function TtsLanguageOverrideRow({
  row,
  index,
  rows,
  globalModel,
  globalVoice,
  enabledProviders,
  onChange,
  onRemove,
}: {
  row: TtsLanguageOverride;
  index: number;
  rows: TtsLanguageOverride[];
  globalModel: string;
  globalVoice: string;
  enabledProviders: ExtensionSettings['providers'];
  onChange: (next: TtsLanguageOverride) => void;
  onRemove: () => void;
}) {
  const languageOptions = useMemo(
    () =>
      getTargetLanguages().map((l) => ({
        value: l.code,
        label: `${l.name} (${l.code})`,
      })),
    [],
  );

  const credSource = row.credentialSource ?? '';
  const duplicate = isDuplicateLanguage(rows, index, row.language);
  const langInList = languageOptions.some((o) => o.value === row.language);
  const selectOptions = langInList
    ? languageOptions
    : row.language
      ? [{ value: row.language, label: row.language }, ...languageOptions]
      : languageOptions;

  const patchRow = (partial: Partial<TtsLanguageOverride>) => {
    const next = { ...row, ...partial };
    if (partial.language != null && isDuplicateLanguage(rows, index, partial.language)) {
      return;
    }
    onChange(next);
  };

  return (
    <div className="space-y-3 rounded-lg border border-zinc-800 bg-zinc-900/50 p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <FieldGroup label="Language" htmlFor={`tts-lang-${index}`}>
            <Select
              id={`tts-lang-${index}`}
              value={row.language}
              onChange={(e) => {
                const language = e.target.value;
                if (isDuplicateLanguage(rows, index, language)) return;
                patchRow({ language });
              }}
              options={selectOptions}
            />
            {duplicate && (
              <p className="mt-1 text-xs text-rose-400/90">
                This language is already configured in another row.
              </p>
            )}
          </FieldGroup>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="mt-6 shrink-0 text-zinc-400 hover:text-rose-300"
          onClick={onRemove}
        >
          Remove
        </Button>
      </div>

      <FieldGroup label="Credentials" htmlFor={`tts-lang-cred-${index}`}>
        <Select
          id={`tts-lang-cred-${index}`}
          value={credSource}
          onChange={(e) => {
            const v = e.target.value as '' | TtsCredentialSource;
            if (!v) {
              const { credentialSource: _c, poolProviderId: _p, customBaseUrl: _u, customApiKey: _k, ...rest } =
                row;
              onChange({ ...rest, language: row.language });
              return;
            }
            patchRow({ credentialSource: v });
          }}
          options={TTS_OVERRIDE_CREDENTIAL_OPTIONS.map((o) => ({
            value: o.value,
            label: o.label,
          }))}
        />
      </FieldGroup>

      {credSource === 'pool' && (
        <FieldGroup label="Pool provider" htmlFor={`tts-lang-pool-${index}`}>
          <Select
            id={`tts-lang-pool-${index}`}
            value={row.poolProviderId ?? ''}
            onChange={(e) => patchRow({ poolProviderId: e.target.value })}
            options={[
              { value: '', label: 'First available provider' },
              ...enabledProviders.map((p) => ({
                value: p.id,
                label: `${p.displayName || p.id} · ${p.baseUrl}`,
              })),
            ]}
          />
        </FieldGroup>
      )}

      {credSource === 'custom' && (
        <div className="grid gap-3 sm:grid-cols-2">
          <FieldGroup label="Custom base URL" htmlFor={`tts-lang-url-${index}`}>
            <Input
              id={`tts-lang-url-${index}`}
              type="url"
              value={row.customBaseUrl ?? ''}
              onChange={(e) => patchRow({ customBaseUrl: e.target.value })}
              placeholder="https://api.example.com/v1"
            />
          </FieldGroup>
          <FieldGroup label="Custom API key" htmlFor={`tts-lang-key-${index}`}>
            <Input
              id={`tts-lang-key-${index}`}
              type="password"
              autoComplete="off"
              value={row.customApiKey ?? ''}
              onChange={(e) => patchRow({ customApiKey: e.target.value })}
              placeholder="Optional if host needs no key"
            />
          </FieldGroup>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <FieldGroup label="Model" htmlFor={`tts-lang-model-${index}`}>
          <Input
            id={`tts-lang-model-${index}`}
            type="text"
            value={row.model ?? ''}
            onChange={(e) => patchRow({ model: e.target.value })}
            placeholder={globalModel.trim() || 'Inherit global model'}
          />
        </FieldGroup>
        <FieldGroup label="Voice / voice_id" htmlFor={`tts-lang-voice-${index}`}>
          <Input
            id={`tts-lang-voice-${index}`}
            type="text"
            value={row.voice ?? ''}
            onChange={(e) => patchRow({ voice: e.target.value })}
            placeholder={globalVoice.trim() || 'Inherit global voice'}
          />
        </FieldGroup>
      </div>
    </div>
  );
}

function TtsSettingsGroup({
  tts,
  settings,
  onChange,
}: {
  tts: TtsSettings;
  settings: ExtensionSettings;
  onChange: (tts: TtsSettings) => void;
}) {
  const merged = mergeTtsSettings(tts);
  const { success: showSuccess, error: showError } = useToast();
  const [testing, setTesting] = useState(false);
  const [loadingModels, setLoadingModels] = useState(false);
  const [modelChoices, setModelChoices] = useState<string[]>([]);
  const [modelListError, setModelListError] = useState<string | null>(null);
  const [loadingVoices, setLoadingVoices] = useState(false);
  const [voiceChoices, setVoiceChoices] = useState<TtsVoiceChoice[]>([]);
  const [voiceListError, setVoiceListError] = useState<string | null>(null);

  const previewSettings = useMemo(
    (): ExtensionSettings => ({ ...settings, tts: merged }),
    [settings, merged],
  );
  const previewCreds = useMemo(
    () => pickTtsCredentials(previewSettings),
    [previewSettings],
  );
  const enabledProviders = useMemo(
    () => (settings.providers ?? []).filter((p) => p.enabled),
    [settings.providers],
  );
  const poolIdMissing =
    merged.credentialSource === 'pool' &&
    merged.poolProviderId.trim().length > 0 &&
    !enabledProviders.some((p) => p.id === merged.poolProviderId);
  const voiceBaseUrl = previewCreds?.baseUrl ?? '';
  const showVoice = shouldOfferVoiceField(merged, voiceBaseUrl);
  const providerBackendDimmed = merged.preferredBackend === 'browser';

  const patch = (partial: Partial<TtsSettings>) => {
    onChange({ ...merged, ...partial });
  };

  const handleLoadModels = async () => {
    const creds = pickTtsCredentials({ ...settings, tts: merged });
    if (!creds?.baseUrl) {
      showError('Configure a pool provider or custom TTS base URL first');
      return;
    }
    setLoadingModels(true);
    setModelListError(null);
    try {
      const result = await listProviderModels({
        baseUrl: creds.baseUrl,
        apiKey: creds.apiKey,
      });
      if (!result.success) {
        setModelChoices([]);
        const err = result.error ?? 'Failed to list models';
        setModelListError(err);
        showError(err);
        return;
      }
      const sorted = sortTtsModelChoices(result.models);
      setModelChoices(sorted);
      if (sorted.length === 0) {
        showError('No models returned');
      } else {
        showSuccess(`Loaded ${sorted.length} models`);
      }
    } finally {
      setLoadingModels(false);
    }
  };

  const handleLoadVoices = async () => {
    const creds = pickTtsCredentials({ ...settings, tts: merged });
    if (!creds?.baseUrl) {
      showError('Configure a pool provider or custom TTS base URL first');
      return;
    }
    setLoadingVoices(true);
    setVoiceListError(null);
    try {
      const result = await listTtsVoices({
        baseUrl: creds.baseUrl,
        apiKey: creds.apiKey,
      });
      if (!result.success) {
        setVoiceChoices([]);
        const err = result.error ?? 'Failed to list voices';
        setVoiceListError(err);
        showError(err);
        return;
      }
      setVoiceChoices(result.voices);
      if (result.voices.length === 0) {
        showError(
          'No voices returned. Create a voice in Mistral Console → Audio, or check the API key.',
        );
      } else {
        showSuccess(`Loaded ${result.voices.length} voices`);
      }
    } finally {
      setLoadingVoices(false);
    }
  };

  const handleTest = async () => {
    setTesting(true);
    try {
      if (merged.preferredBackend === 'browser' || !merged.enabled) {
        if (typeof speechSynthesis === 'undefined') {
          showError('Browser speech is not available');
          return;
        }
        const utt = new SpeechSynthesisUtterance(
          'AnyLLMTranslate speech test. Browser voice is working.',
        );
        utt.rate = merged.rate;
        speechSynthesis.speak(utt);
        showSuccess('Playing browser test voice');
        return;
      }

      const res = (await chrome.runtime.sendMessage({
        action: 'SYNTHESIZE_SPEECH',
        text: 'AnyLLMTranslate speech test. Provider voice is working.',
      })) as { success?: boolean; error?: string; audioBase64?: string; mimeType?: string };

      if (!res?.success || !res.audioBase64) {
        showError(res?.error ?? 'Provider TTS failed — try Browser only or check API key');
        return;
      }
      const binary = atob(res.audioBase64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      const url = URL.createObjectURL(
        new Blob([bytes], { type: res.mimeType || 'audio/mpeg' }),
      );
      const audio = new Audio(url);
      audio.onended = () => URL.revokeObjectURL(url);
      await audio.play();
      showSuccess('Playing provider test voice');
    } catch (e) {
      showError(e instanceof Error ? e.message : 'Speech test failed');
    } finally {
      setTesting(false);
    }
  };

  return (
    <SettingsGroup
      title="Speech (selection Speak)"
      description="Read selection translations aloud. Use a pool provider or a custom OpenAI-compatible TTS endpoint (/audio/speech). Browser voice is free and local."
    >
      <Toggle
        id="tts-enabled-toggle"
        checked={merged.enabled}
        onChange={(checked) => patch({ enabled: checked })}
        label="Enable Speak on selection bubble"
        description="Show and allow the Speak action after translating selected text."
      />
      <DisabledDimmer disabled={!merged.enabled}>
        <div className="space-y-4">
          <FieldGroup label="Backend" htmlFor="tts-backend">
            <Select
              id="tts-backend"
              value={merged.preferredBackend}
              onChange={(e) =>
                patch({ preferredBackend: e.target.value as TtsPreferredBackend })
              }
              options={TTS_BACKEND_OPTIONS.map((o) => ({
                value: o.value,
                label: o.label,
              }))}
            />
          </FieldGroup>

          <DisabledDimmer disabled={providerBackendDimmed}>
            <div className="space-y-4">
              <FieldGroup
                label="TTS credentials"
                htmlFor="tts-credential-source"
                hint="Custom endpoint fully overrides the pool for Speak only"
              >
                <Select
                  id="tts-credential-source"
                  value={merged.credentialSource}
                  onChange={(e) =>
                    patch({
                      credentialSource: e.target.value as TtsCredentialSource,
                    })
                  }
                  options={TTS_CREDENTIAL_SOURCE_OPTIONS.map((o) => ({
                    value: o.value,
                    label: o.label,
                  }))}
                />
              </FieldGroup>

              {merged.credentialSource === 'pool' ? (
                <div className="space-y-2">
                  <FieldGroup label="Pool provider" htmlFor="tts-pool-provider">
                    <Select
                      id="tts-pool-provider"
                      value={merged.poolProviderId}
                      onChange={(e) => patch({ poolProviderId: e.target.value })}
                      options={[
                        { value: '', label: 'First available provider' },
                        ...enabledProviders.map((p) => ({
                          value: p.id,
                          label: `${p.displayName || p.id} · ${p.baseUrl}`,
                        })),
                      ]}
                    />
                  </FieldGroup>
                  {enabledProviders.length === 0 && (
                    <p className="text-xs text-amber-400/90">
                      No enabled providers — add one in Providers or use Custom TTS endpoint.
                    </p>
                  )}
                  {poolIdMissing && (
                    <p className="text-xs text-amber-400/90">
                      Selected TTS provider is missing or disabled.
                    </p>
                  )}
                </div>
              ) : (
                <div className="grid gap-4 sm:grid-cols-2">
                  <FieldGroup
                    label="Custom base URL"
                    htmlFor="tts-custom-base-url"
                    hint="OpenAI-compatible …/v1"
                  >
                    <Input
                      id="tts-custom-base-url"
                      type="url"
                      value={merged.customBaseUrl}
                      onChange={(e) => patch({ customBaseUrl: e.target.value })}
                      placeholder="https://api.example.com/v1"
                    />
                  </FieldGroup>
                  <FieldGroup label="Custom API key" htmlFor="tts-custom-api-key">
                    <Input
                      id="tts-custom-api-key"
                      type="password"
                      autoComplete="off"
                      value={merged.customApiKey}
                      onChange={(e) => patch({ customApiKey: e.target.value })}
                      placeholder="Optional if host needs no key"
                    />
                  </FieldGroup>
                  {!merged.customBaseUrl.trim() && (
                    <p className="text-xs text-amber-400/90 sm:col-span-2">
                      Enter a base URL or switch to pool.
                    </p>
                  )}
                </div>
              )}

              <FieldGroup
                label="Model"
                htmlFor="tts-model"
                hint="OpenAI: tts-1 · Mistral: voxtral-mini-tts-2603 (aliases like …-latest are normalized)"
              >
                <div className="flex gap-2">
                  <Input
                    id="tts-model"
                    type="text"
                    value={merged.model}
                    onChange={(e) => patch({ model: e.target.value })}
                    placeholder="e.g. tts-1 or your-host-model-id"
                    className="flex-1"
                  />
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    disabled={loadingModels || !previewCreds?.baseUrl}
                    onClick={() => void handleLoadModels()}
                  >
                    {loadingModels ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <List className="h-3.5 w-3.5" />
                    )}
                    {loadingModels ? 'Loading…' : 'Load models'}
                  </Button>
                </div>
                {modelListError && (
                  <p className="mt-1 text-xs text-rose-400/90">{modelListError}</p>
                )}
                {modelChoices.length > 0 && (
                  <div className="mt-2 max-h-40 overflow-y-auto rounded-lg border border-zinc-800 bg-zinc-950/60 p-1">
                    {modelChoices.map((id) => (
                      <button
                        key={id}
                        type="button"
                        className={`block w-full rounded-md px-2 py-1 text-left text-xs transition-colors hover:bg-zinc-800 ${
                          merged.model === id
                            ? 'bg-cyan-500/15 text-cyan-200'
                            : 'text-zinc-300'
                        }`}
                        onClick={() => patch({ model: id })}
                      >
                        {id}
                      </button>
                    ))}
                  </div>
                )}
              </FieldGroup>

              <Toggle
                id="tts-show-voice-toggle"
                checked={merged.showVoiceField}
                onChange={(checked) => patch({ showVoiceField: checked })}
                label="Show voice field"
                description="OpenAI uses voice names (alloy…). Mistral Voxtral needs a voice_id from Console → Audio → Voices. Hidden by default for other hosts."
              />

              {showVoice && (
                <FieldGroup
                  label="Voice / voice_id"
                  htmlFor="tts-voice"
                  hint="OpenAI: alloy/nova… · Mistral: Load voices or paste voice_id (required)"
                >
                  <div className="flex gap-2">
                    <Input
                      id="tts-voice"
                      type="text"
                      list="tts-voice-suggestions"
                      value={merged.voice}
                      onChange={(e) => patch({ voice: e.target.value })}
                      placeholder="alloy or mistral-voice-id"
                      className="flex-1"
                    />
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      disabled={loadingVoices || !previewCreds?.baseUrl}
                      onClick={() => void handleLoadVoices()}
                    >
                      {loadingVoices ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <List className="h-3.5 w-3.5" />
                      )}
                      {loadingVoices ? 'Loading…' : 'Load voices'}
                    </Button>
                  </div>
                  <datalist id="tts-voice-suggestions">
                    {OPENAI_TTS_VOICE_SUGGESTIONS.map((v) => (
                      <option key={v} value={v} />
                    ))}
                    {voiceChoices.map((v) => (
                      <option key={`loaded-${v.id}`} value={v.id}>
                        {v.label}
                      </option>
                    ))}
                  </datalist>
                  {voiceListError && (
                    <p className="mt-1 text-xs text-rose-400/90">{voiceListError}</p>
                  )}
                  {voiceChoices.length > 0 && (
                    <div className="mt-2 max-h-40 overflow-y-auto rounded-lg border border-zinc-800 bg-zinc-950/60 p-1">
                      {voiceChoices.map((v) => (
                        <button
                          key={v.id}
                          type="button"
                          className={`block w-full rounded-md px-2 py-1 text-left text-xs transition-colors hover:bg-zinc-800 ${
                            merged.voice === v.id
                              ? 'bg-cyan-500/15 text-cyan-200'
                              : 'text-zinc-300'
                          }`}
                          onClick={() => patch({ voice: v.id })}
                        >
                          {v.label}
                        </button>
                      ))}
                    </div>
                  )}
                </FieldGroup>
              )}
            </div>
          </DisabledDimmer>

          <div className="space-y-3 rounded-lg border border-zinc-800 bg-zinc-950/40 p-3">
            <div>
              <p className="text-sm font-medium text-zinc-200">Per-language voices</p>
              <p className="mt-0.5 text-xs text-zinc-500">
                When Speak original/translation uses this language, use this stack instead
                of the defaults above. Empty fields inherit globals.
              </p>
            </div>

            {merged.languageOverrides.length === 0 && (
              <p className="text-xs text-zinc-500">No language overrides yet.</p>
            )}

            <div className="space-y-3">
              {merged.languageOverrides.map((row, index) => (
                <TtsLanguageOverrideRow
                  key={`tts-lang-${index}-${row.language}`}
                  row={row}
                  index={index}
                  rows={merged.languageOverrides}
                  globalModel={merged.model}
                  globalVoice={merged.voice}
                  enabledProviders={enabledProviders}
                  onChange={(next) => {
                    const list = [...merged.languageOverrides];
                    list[index] = next;
                    patch({ languageOverrides: list });
                  }}
                  onRemove={() => {
                    patch({
                      languageOverrides: merged.languageOverrides.filter(
                        (_, i) => i !== index,
                      ),
                    });
                  }}
                />
              ))}
            </div>

            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => {
                const used = new Set(
                  merged.languageOverrides
                    .map((r) => normalizedOverrideLang(r.language))
                    .filter(Boolean),
                );
                const defaultLang =
                  getTargetLanguages().find((l) => !used.has(l.code.toLowerCase()))
                    ?.code ?? 'en';
                if (used.has(normalizedOverrideLang(defaultLang))) {
                  showError('Every listed language already has an override');
                  return;
                }
                patch({
                  languageOverrides: [
                    ...merged.languageOverrides,
                    { language: defaultLang },
                  ],
                });
              }}
            >
              Add language
            </Button>
          </div>

          <FieldGroup
            label="Rate"
            htmlFor="tts-rate"
            hint={`${merged.rate.toFixed(1)}× · 0.5–2.0`}
          >
            <input
              id="tts-rate"
              type="range"
              min={0.5}
              max={2}
              step={0.1}
              value={merged.rate}
              onChange={(e) => patch({ rate: Number(e.target.value) })}
              className="w-full accent-cyan-500"
            />
          </FieldGroup>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={testing}
            onClick={() => void handleTest()}
          >
            <Volume2 className="h-3.5 w-3.5" />
            {testing ? 'Testing…' : 'Test voice'}
          </Button>
        </div>
      </DisabledDimmer>
    </SettingsGroup>
  );
}

export function AdvancedSection() {
  const settings = useSettingsStore();
  const updateSettings = useSettingsStore((s) => s.updateSettings);
  const resetToDefaults = useSettingsStore((s) => s.resetToDefaults);
  const [clearStatus, setClearStatus] = useState<'idle' | 'clearing' | 'done'>('idle');
  const [showResetModal, setShowResetModal] = useState(false);
  const [showClearCacheModal, setShowClearCacheModal] = useState(false);
  const [showScientificWizard, setShowScientificWizard] = useState(false);
  const [scientificHealthOk, setScientificHealthOk] = useState<boolean | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { success: showSuccess, error: showError } = useToast();
  const cacheStats = useCacheStats();
  const replaceSettings = useSettingsStore((s) => s.replaceSettings);
  const [showExportPassword, setShowExportPassword] = useState(false);
  const [showImportPassword, setShowImportPassword] = useState(false);
  const [pendingEncryptedText, setPendingEncryptedText] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordBusy, setPasswordBusy] = useState(false);
  const [importBusy, setImportBusy] = useState(false);
  const [importMeta, setImportMeta] = useState<{
    recognized: Record<string, unknown>;
    ignored: string[];
    source: 'plain' | 'encrypted';
  } | null>(null);

  // Cache configuration — commit-on-blur via useDeferredCommit (FR-9).
  // onCommit is just the store write; range validation + error state live in
  // the blur wrappers below. Per-field success toasts are dropped (the sidebar
  // "Auto-saved" badge already confirms every store write), matching the
  // providers-ux-refactor deferred-commit pattern.
  const ttlField = useDeferredCommit(settings.cacheTTLDays, (v) => updateSettings({ cacheTTLDays: v }));
  const maxCacheField = useDeferredCommit(settings.maxCacheSizeMB, (v) => updateSettings({ maxCacheSizeMB: v }));
  const maxBatchField = useDeferredCommit(settings.maxBatchChars, (v) => updateSettings({ maxBatchChars: v }));
  const maxRpmField = useDeferredCommit(settings.maxRpm ?? 0, (v) => updateSettings({ maxRpm: v }));
  // FR-2: request-boundary budget fields.
  const maxGroupField = useDeferredCommit(settings.maxTextGroupLengthPerRequest, (v) => updateSettings({ maxTextGroupLengthPerRequest: v }));
  const maxLengthField = useDeferredCommit(settings.maxTextLengthPerRequest, (v) => updateSettings({ maxTextLengthPerRequest: v }));
  // FR-4: negative-cache TTL field.
  const failureTtlField = useDeferredCommit(settings.failureCacheTtlMinutes, (v) => updateSettings({ failureCacheTtlMinutes: v }));
  const [cacheTTLError, setCacheTTLError] = useState('');
  const [maxCacheSizeError, setMaxCacheSizeError] = useState('');
  const [maxBatchCharsError, setMaxBatchCharsError] = useState('');
  const [maxRpmError, setMaxRpmError] = useState('');

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

  const hasApiKeys =
    Boolean(settings.provider?.apiKey) ||
    (settings.providers ?? []).some((p) => (p.keys ?? []).some((k) => Boolean(k.apiKey)));

  const handleExportPlain = useCallback(() => {
    const full = extractSettings(settings);
    const blob = new Blob([serializeSettings(full)], { type: 'application/json' });
    downloadBlob(
      blob,
      `anyllm-translate-settings-${new Date().toISOString().slice(0, 10)}.json`,
    );
    // P2 security: the full export carries every API key in cleartext.
    if (hasApiKeys) {
      showError('Exported file contains your API keys in cleartext — keep it private!');
    } else {
      showSuccess('Settings exported successfully');
    }
  }, [settings, hasApiKeys, showSuccess, showError]);

  const handleExportEncrypted = useCallback(
    async (password: string) => {
      setPasswordBusy(true);
      setPasswordError(null);
      try {
        const full = extractSettings(settings);
        const envelope = await encryptBackup(full, password);
        downloadBlob(
          new Blob([envelope], { type: 'application/json' }),
          `anyllm-translate-backup-${new Date().toISOString().slice(0, 10)}.json`,
        );
        setShowExportPassword(false);
        showSuccess('Encrypted backup exported — keep the passphrase safe!');
      } catch {
        setPasswordError('Encryption failed — try again.');
      } finally {
        setPasswordBusy(false);
      }
    },
    [settings, showSuccess],
  );

  const handleImportFile = useCallback(
    async (file: File) => {
      try {
        const text = await file.text();
        if (detectFormat(text) === 'encrypted') {
          setPendingEncryptedText(text);
          setPasswordError(null);
          setShowImportPassword(true);
          return;
        }
        const { recognized, ignored } = sanitizeImportObject(JSON.parse(text));
        setImportMeta({ recognized, ignored, source: 'plain' });
      } catch {
        showError('Failed to import settings. Invalid JSON file.');
      }
    },
    [showError],
  );

  const handleImportPassword = useCallback(
    async (password: string) => {
      if (!pendingEncryptedText) return;
      setPasswordBusy(true);
      setPasswordError(null);
      try {
        const decrypted = await decryptBackup(pendingEncryptedText, password);
        const { recognized, ignored } = sanitizeImportObject(decrypted);
        setShowImportPassword(false);
        setPendingEncryptedText(null);
        setImportMeta({ recognized, ignored, source: 'encrypted' });
      } catch (err) {
        setPasswordError(
          err instanceof BackupDecryptError
            ? err.message
            : 'Wrong password or corrupted file',
        );
      } finally {
        setPasswordBusy(false);
      }
    },
    [pendingEncryptedText],
  );

  const handleImportApply = useCallback(
    async (replaceAll: boolean) => {
      if (!importMeta || importBusy) return;
      setImportBusy(true);
      try {
        if (replaceAll) {
          await replaceSettings(importMeta.recognized);
        } else {
          await updateSettings(importMeta.recognized);
        }
        // Surface unknown keys so users notice a partial/partially-stale import.
        if (importMeta.ignored.length > 0) {
          showSuccess(
            `Imported ${Object.keys(importMeta.recognized).length} settings; ignored ${importMeta.ignored.length} unknown key(s): ${importMeta.ignored.join(', ')}`,
          );
        } else {
          showSuccess('Settings imported successfully!');
        }
      } catch {
        showError('Failed to import settings.');
      } finally {
        setImportBusy(false);
        setImportMeta(null);
      }
    },
    [importMeta, importBusy, replaceSettings, updateSettings, showSuccess, showError],
  );

  const handleClearCache = useCallback(async () => {
    setShowClearCacheModal(false);
    setClearStatus('clearing');
    try {
      const response = await chrome.runtime.sendMessage({ action: 'CLEAR_CACHE' });
      if (response?.success) {
        setClearStatus('done');
        showSuccess('Translation cache cleared');
        void cacheStats.refresh();
      } else {
        throw new Error('Clear cache failed');
      }
      setTimeout(() => setClearStatus('idle'), 2000);
    } catch {
      setClearStatus('idle');
      showError('Failed to clear cache');
    }
  }, [showSuccess, showError, cacheStats.refresh]);

  const handleReset = useCallback(() => {
    resetToDefaults();
    setShowResetModal(false);
    showSuccess('All settings reset to defaults');
  }, [resetToDefaults, showSuccess]);

  // Cache configuration blur handlers — validate, set/clear error, then commit
  // (useDeferredCommit handles the dirty-check + external sync on reset/import).
  const handleCacheTTLBlur = () => {
    const value = Number(ttlField.value);
    if (value < 1 || value > 365) {
      setCacheTTLError('Must be between 1 and 365 days');
      return;
    }
    setCacheTTLError('');
    ttlField.commit();
  };

  const handleMaxCacheSizeBlur = () => {
    const value = Number(maxCacheField.value);
    if (value < 10 || value > 1000) {
      setMaxCacheSizeError('Must be between 10 and 1000 MB');
      return;
    }
    setMaxCacheSizeError('');
    maxCacheField.commit();
  };

  const handleMaxBatchCharsBlur = () => {
    const value = Number(maxBatchField.value);
    if (value < 500 || value > 10000) {
      setMaxBatchCharsError('Must be between 500 and 10000 characters');
      return;
    }
    setMaxBatchCharsError('');
    maxBatchField.commit();
  };

  const handleMaxRpmBlur = () => {
    const value = Number(maxRpmField.value);
    if (!Number.isInteger(value) || value < 0 || value > 600) {
      setMaxRpmError('Must be an integer between 0 and 600 (0 = unlimited)');
      return;
    }
    setMaxRpmError('');
    maxRpmField.commit();
  };

  const cacheLimitMb = Number(maxCacheField.value) || settings.maxCacheSizeMB || 1;
  const cacheUsagePct = cacheStats.loading
    ? 0
    : Math.min(100, Math.round((cacheStats.sizeMb / cacheLimitMb) * 100));
  const cacheBarTone =
    cacheUsagePct >= 90 ? 'bg-rose-500' : cacheUsagePct >= 70 ? 'bg-amber-500' : 'bg-cyan-500';
  const pdfAutoOpen = settings.pdfSettings?.autoOpen ?? 'off';
  const pdfOpenMode = settings.pdfSettings?.openMode ?? 'new-tab';
  const neverAutoOpenSites = settings.pdfSettings?.neverAutoOpenSites ?? [];
  // Local draft: join/split/trim on every keystroke stripped commas and spaces
  // so the field could not be edited. Commit parsed hosts on blur.
  const neverAutoOpenCommitted = neverAutoOpenSites.join(', ');
  const neverAutoOpenField = useDeferredCommit(neverAutoOpenCommitted, (text) => {
    const currentPdf =
      useSettingsStore.getState().pdfSettings ?? defaultPdfSettings;
    void updateSettings({
      pdfSettings: {
        ...currentPdf,
        neverAutoOpenSites: text
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
      },
    });
  });
  const scientificPdf = mergeScientificPdfSettings(settings.scientificPdf);
  const scientificStatus = resolveScientificPdfStatus({
    settings: scientificPdf,
    healthOk: scientificHealthOk,
  });
  const scientificBadge = scientificStatusBadge(scientificStatus);
  const scientificNonLoopback = shouldWarnNonLoopbackServerUrl(scientificPdf.serverUrl);
  const defaultPdfSettings = { ...DEFAULT_PDF_SETTINGS };

  const refreshScientificHealth = useCallback(async () => {
    try {
      const res = (await chrome.runtime.sendMessage({
        action: 'SCIENTIFIC_PDF_HEALTH',
      })) as { success?: boolean; status?: string };
      setScientificHealthOk(Boolean(res?.success && res.status === 'ok'));
    } catch {
      setScientificHealthOk(false);
    }
  }, []);

  useEffect(() => {
    if (!scientificPdf.enabled && !scientificPdf.setupCompletedAt) {
      setScientificHealthOk(null);
      return;
    }
    void refreshScientificHealth();
  }, [scientificPdf.enabled, scientificPdf.setupCompletedAt, scientificPdf.serverUrl, refreshScientificHealth]);
  const isPromptCustom = promptField.value !== DEFAULT_SYSTEM_PROMPT_TEMPLATE;
  const promptWarnings =
    promptValidation && !promptValidation.valid ? promptValidation.warnings : [];

  const overviewChips = [
    {
      key: 'prompt',
      targetId: ADVANCED_SECTION_IDS.prompt,
      ariaLabel: 'Jump to Translation System Prompt',
      active: isPromptCustom,
      icon: <Braces className="h-3 w-3" />,
      label: isPromptCustom ? 'Custom prompt' : 'Default prompt',
      activeClass: 'border-cyan-500/30 bg-cyan-500/10 text-cyan-300',
    },
    {
      key: 'context',
      targetId: ADVANCED_SECTION_IDS.context,
      ariaLabel: 'Jump to Context & Intelligence',
      active: settings.enableContextAwareTranslation,
      icon: <BrainCircuit className="h-3 w-3" />,
      label: 'Context',
      activeClass: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300',
    },
    {
      key: 'stream',
      targetId: ADVANCED_SECTION_IDS.quality,
      ariaLabel: 'Jump to Translation Quality',
      active: settings.enableStreamingTranslation,
      icon: <Zap className="h-3 w-3" />,
      label: 'Streaming',
      activeClass: 'border-sky-500/30 bg-sky-500/10 text-sky-300',
    },
    {
      key: 'debug',
      targetId: ADVANCED_SECTION_IDS.developer,
      ariaLabel: 'Jump to Developer',
      active: settings.debugMode,
      icon: <Bug className="h-3 w-3" />,
      label: 'Debug',
      activeClass: 'border-amber-500/35 bg-amber-500/15 text-amber-300',
    },
  ] as const;

  return (
    <div className="animate-fade-in-up">
      <SectionHeader
        title="Advanced"
        description="Performance tuning, intelligence, data portability, and developer tools."
        icon={<Wrench className="w-4 h-4" />}
        accentColor="zinc"
      />

      {/* Overview strip — live cache + feature chips at a glance */}
      <div className="mb-5 overflow-hidden rounded-xl border border-white/10 bg-gradient-to-br from-white/[0.04] via-zinc-950/40 to-zinc-950/80 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
        <div className="grid gap-0 sm:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
          <div className="border-b border-white/5 sm:border-b-0 sm:border-r">
            <div className="flex items-center justify-between gap-2 px-4 pt-4">
              <div className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-zinc-500">
                <HardDrive className="h-3.5 w-3.5 text-cyan-500/80" aria-hidden="true" />
                Translation cache
              </div>
              <div className="flex items-center gap-2.5">
                <span className="text-[11px] tabular-nums text-zinc-400">
                  {cacheStats.loading ? '…' : `${cacheUsagePct}% of ${cacheLimitMb} MB`}
                </span>
                <button
                  type="button"
                  aria-label="Clear translation cache"
                  onClick={() => setShowClearCacheModal(true)}
                  disabled={
                    clearStatus === 'clearing' ||
                    (!cacheStats.loading && cacheStats.entryCount === 0)
                  }
                  className="rounded-md px-1.5 py-0.5 text-[11px] font-semibold text-amber-400/90 transition-colors hover:bg-amber-500/10 hover:text-amber-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/40 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent"
                >
                  Clear…
                </button>
              </div>
            </div>
            <button
              type="button"
              aria-label="Jump to Clear translation cache"
              onClick={() => scrollToAdvancedSection(ADVANCED_SECTION_IDS.cache)}
              className="mt-2 block w-full px-4 pb-4 text-left transition-colors hover:bg-white/[0.03] focus-visible:outline-none focus-visible:bg-white/[0.04]"
            >
              <span className="block text-sm font-semibold tabular-nums text-zinc-100">
                {cacheStats.loading
                  ? 'Measuring…'
                  : `${cacheStats.entryCount.toLocaleString()} entries · ${cacheStats.sizeLabel}`}
              </span>
              <span
                className="mt-3 block h-1.5 overflow-hidden rounded-full bg-zinc-800"
                role="progressbar"
                aria-valuenow={cacheUsagePct}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label="Cache usage"
              >
                <span
                  className={`block h-full rounded-full transition-all duration-500 ${cacheBarTone}`}
                  style={{ width: `${cacheStats.loading ? 8 : Math.max(cacheUsagePct, cacheStats.entryCount > 0 ? 4 : 0)}%` }}
                />
              </span>
            </button>
          </div>

          <div className="p-4">
            <p className="mb-2.5 text-[11px] font-medium uppercase tracking-wider text-zinc-500">
              Active features
            </p>
            <div className="flex flex-wrap gap-1.5">
              {overviewChips.map((chip) => (
                <button
                  key={chip.key}
                  type="button"
                  aria-label={chip.ariaLabel}
                  onClick={() => scrollToAdvancedSection(chip.targetId)}
                  className={`${CHIP_BASE_CLASS} ${
                    chip.active
                      ? chip.activeClass
                      : 'border-zinc-800 bg-zinc-900/50 text-zinc-600 hover:border-zinc-700 hover:text-zinc-400'
                  }`}
                >
                  {chip.icon}
                  {chip.label}
                </button>
              ))}
              <button
                type="button"
                aria-label="Jump to Performance & Throughput"
                onClick={() => scrollToAdvancedSection(ADVANCED_SECTION_IDS.performance)}
                className={`${CHIP_BASE_CLASS} ${
                  maxRpmField.value === 0
                    ? 'border-zinc-800 bg-zinc-900/50 text-zinc-600 hover:border-zinc-700 hover:text-zinc-400'
                    : 'border-blue-500/30 bg-blue-500/10 text-blue-300'
                }`}
              >
                <Gauge className="h-3 w-3" aria-hidden="true" />
                {maxRpmField.value === 0 ? 'RPM unlimited' : `${maxRpmField.value} RPM`}
              </button>
              <button
                type="button"
                aria-label="Jump to PDF Translator"
                onClick={() => scrollToAdvancedSection(ADVANCED_SECTION_IDS.pdf)}
                className={`${CHIP_BASE_CLASS} ${
                  pdfAutoOpen === 'off'
                    ? 'border-zinc-800 bg-zinc-900/50 text-zinc-600 hover:border-zinc-700 hover:text-zinc-400'
                    : 'border-orange-500/30 bg-orange-500/10 text-orange-300'
                }`}
              >
                <FileText className="h-3 w-3" aria-hidden="true" />
                PDF {pdfAutoOpen}
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="space-y-4">
        {/* Translation System Prompt */}
        <div
          id={ADVANCED_SECTION_IDS.prompt}
          tabIndex={-1}
          className={SECTION_ANCHOR_CLASS}
          style={stagger(0)}
        >
          <Card
            variant="bordered"
            accent="cyan"
            title="Translation System Prompt"
            description="Instructions sent with every translation. Use template variables so language and glossary stay dynamic."
            icon={<Braces className="w-3.5 h-3.5" />}
            headerExtra={
              isPromptCustom ? (
                <Badge variant="info">Customized</Badge>
              ) : (
                <Badge variant="success">Default</Badge>
              )
            }
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
          </Card>
        </div>

        {/* Performance & Throughput */}
        <div
          id={ADVANCED_SECTION_IDS.performance}
          tabIndex={-1}
          className={SECTION_ANCHOR_CLASS}
          style={stagger(1)}
        >
          <Card
            variant="bordered"
            accent="blue"
            title="Performance & Throughput"
            description="Cache lifetime, storage ceiling, batch size, and provider rate limits."
            icon={<HardDrive className="w-3.5 h-3.5" />}
            headerExtra={
              !cacheStats.loading ? (
                <span className="text-[11px] tabular-nums text-zinc-500">
                  {cacheStats.entryCount.toLocaleString()} cached
                </span>
              ) : null
            }
          >
            <div className="grid gap-6 lg:grid-cols-2">
              <SettingsGroup title="Cache" description="How long and how much translation data is stored locally.">
                <FieldGroup
                  label="Cache TTL (days)"
                  description="How long translations stay cached before expiring."
                  htmlFor="cache-ttl-input"
                >
                  <Input
                    id="cache-ttl-input"
                    type="number"
                    value={ttlField.value}
                    onChange={(e) => ttlField.setValue(Number(e.target.value))}
                    onBlur={handleCacheTTLBlur}
                    min={1}
                    max={365}
                    error={cacheTTLError}
                    hint="1–365 days"
                  />
                </FieldGroup>
                <FieldGroup
                  label="Max cache size (MB)"
                  description="Hard ceiling for local cache storage."
                  htmlFor="max-cache-size-input"
                >
                  <Input
                    id="max-cache-size-input"
                    type="number"
                    value={maxCacheField.value}
                    onChange={(e) => maxCacheField.setValue(Number(e.target.value))}
                    onBlur={handleMaxCacheSizeBlur}
                    min={10}
                    max={1000}
                    error={maxCacheSizeError}
                    hint="10–1000 MB"
                  />
                  {!cacheStats.loading && (
                    <div className="mt-2">
                      <div className="mb-1 flex justify-between text-[11px] text-zinc-500">
                        <span>Current use</span>
                        <span className="tabular-nums">
                          {cacheStats.sizeLabel} / {cacheLimitMb} MB
                        </span>
                      </div>
                      <div className="h-1 overflow-hidden rounded-full bg-zinc-800">
                        <div
                          className={`h-full rounded-full transition-all duration-500 ${cacheBarTone}`}
                          style={{ width: `${Math.max(cacheUsagePct, cacheStats.entryCount > 0 ? 3 : 0)}%` }}
                        />
                      </div>
                    </div>
                  )}
                </FieldGroup>
              </SettingsGroup>

              <SettingsGroup title="Throughput" description="Batch size and calls per minute to your provider.">
                <FieldGroup
                  label="Max batch characters"
                  description="Maximum characters grouped into one translation request."
                  htmlFor="max-batch-chars-input"
                >
                  <Input
                    id="max-batch-chars-input"
                    type="number"
                    value={maxBatchField.value}
                    onChange={(e) => maxBatchField.setValue(Number(e.target.value))}
                    onBlur={handleMaxBatchCharsBlur}
                    min={500}
                    max={10000}
                    error={maxBatchCharsError}
                    hint="500–10000 chars"
                  />
                </FieldGroup>
                <FieldGroup
                  label="Max requests per minute"
                  description="Cap provider calls to avoid rate limits. Enter a number of requests per minute (req/min). Use 0 for unlimited (local LLMs)."
                  htmlFor="max-rpm-input"
                >
                  <Input
                    id="max-rpm-input"
                    type="number"
                    value={maxRpmField.value}
                    onChange={(e) => maxRpmField.setValue(Number(e.target.value))}
                    onBlur={handleMaxRpmBlur}
                    min={0}
                    max={600}
                    error={maxRpmError}
                    suffix="req/min"
                    placeholder="20"
                    hint="Unit: requests per minute · 0 = unlimited · range 0–600"
                  />
                  {maxRpmField.value === 0 && !maxRpmError && (
                    <div className="mt-2">
                      <Badge variant="info">Unlimited · good for Ollama / LM Studio</Badge>
                    </div>
                  )}
                </FieldGroup>
              </SettingsGroup>
            </div>
          </Card>
        </div>

        {/* Translation Quality */}
        <div
          id={ADVANCED_SECTION_IDS.quality}
          tabIndex={-1}
          className={SECTION_ANCHOR_CLASS}
          style={stagger(2)}
        >
          <Card
            variant="bordered"
            title="Translation Quality"
            description="How text is selected, formatted, skipped, and recovered on the page."
            icon={<Sparkles className="w-3.5 h-3.5" />}
          >
            <div className="space-y-6">
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
                <TtsSettingsGroup
                  tts={settings.tts ?? DEFAULT_TTS_SETTINGS}
                  settings={settings}
                  onChange={(tts) => updateSettings({ tts })}
                />
              </div>

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

              <AdvancedDisclosure label="Request budget & failure TTL" idPrefix="quality-budgets">
                <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                  <FieldGroup
                    label="Max pieces per request"
                    description="Paragraphs grouped into one LLM call (0 = unlimited)."
                    htmlFor="max-text-group-input"
                  >
                    <Input
                      id="max-text-group-input"
                      type="number"
                      value={maxGroupField.value}
                      onChange={(e) => maxGroupField.setValue(Number(e.target.value))}
                      onBlur={maxGroupField.commit}
                      min={0}
                      max={50}
                      hint="0–50 · default 4"
                    />
                  </FieldGroup>
                  <FieldGroup
                    label="Max characters per request"
                    description="Total characters in one LLM request (0 = unlimited)."
                    htmlFor="max-text-length-input"
                  >
                    <Input
                      id="max-text-length-input"
                      type="number"
                      value={maxLengthField.value}
                      onChange={(e) => maxLengthField.setValue(Number(e.target.value))}
                      onBlur={maxLengthField.commit}
                      min={0}
                      max={20000}
                      hint="0–20000 · default 2000"
                    />
                  </FieldGroup>
                  <FieldGroup
                    label="Failure cache TTL (minutes)"
                    description="How long failures are remembered before retry."
                    htmlFor="failure-ttl-input"
                  >
                    <Input
                      id="failure-ttl-input"
                      type="number"
                      value={failureTtlField.value}
                      onChange={(e) => failureTtlField.setValue(Number(e.target.value))}
                      onBlur={failureTtlField.commit}
                      min={1}
                      max={1440}
                      hint="1–1440 · default 120"
                    />
                  </FieldGroup>
                </div>
              </AdvancedDisclosure>

              <div className="border-t border-zinc-800/80 pt-5">
                <SettingsGroup
                  title="Page walk tuning"
                  description="What parts of the DOM are eligible for translation."
                >
                  <FieldGroup
                    label="Page scope preset"
                    description="Quick profiles for walk + streaming. Classic restores pre-v3 defaults."
                    htmlFor="page-scope-preset"
                  >
                    <Select
                      id="page-scope-preset"
                      value={(() => {
                        const detected = detectPageScopePreset({
                          enableStreamingTranslation: settings.enableStreamingTranslation,
                          enableAsideCaps: settings.enableAsideCaps,
                          enableBodyTagWhitelist: settings.enableBodyTagWhitelist,
                          enableSmartExcludes: settings.enableSmartExcludes,
                        });
                        return detected === 'custom' ? 'custom' : detected;
                      })()}
                      onChange={(e) => {
                        const val = e.target.value;
                        if (val === 'custom') return;
                        updateSettings(applyPageScopePreset(val as PageScopePreset));
                      }}
                      options={[
                        ...PAGE_SCOPE_PRESET_OPTIONS.map((o) => ({
                          value: o.value,
                          label: o.label,
                        })),
                        {
                          value: 'custom',
                          label: 'Custom (mixed)',
                        },
                      ]}
                    />
                  </FieldGroup>
                  <p className="text-[11px] text-zinc-500 -mt-2 mb-1 leading-relaxed">
                    {(() => {
                      const detected = detectPageScopePreset({
                        enableStreamingTranslation: settings.enableStreamingTranslation,
                        enableAsideCaps: settings.enableAsideCaps,
                        enableBodyTagWhitelist: settings.enableBodyTagWhitelist,
                        enableSmartExcludes: settings.enableSmartExcludes,
                      });
                      if (detected === 'custom') {
                        return 'Individual toggles below don’t match a named preset.';
                      }
                      return (
                        PAGE_SCOPE_PRESET_OPTIONS.find((o) => o.value === detected)?.description ??
                        ''
                      );
                    })()}
                  </p>
                  <Toggle
                    id="body-tag-whitelist-toggle"
                    checked={settings.enableBodyTagWhitelist}
                    onChange={(checked) => updateSettings({ enableBodyTagWhitelist: checked })}
                    label="Body-tag whitelist"
                    description="Only translate direct body children that are MAIN, ARTICLE, SECTION, or DIV — skips nav, aside, header, footer."
                  />
                  <Toggle
                    id="aside-caps-toggle"
                    checked={settings.enableAsideCaps}
                    onChange={(checked) => updateSettings({ enableAsideCaps: checked })}
                    label="Aside text caps"
                    description="Limit sidebar/aside work: skip long paragraphs and cap each region at 1000 characters. On by default (Balanced); Classic turns this off."
                  />
                  <Toggle
                    id="adaptive-batching-toggle"
                    checked={settings.enableAdaptiveBatching}
                    onChange={(checked) => updateSettings({ enableAdaptiveBatching: checked })}
                    label="Adaptive batch size"
                    description="Adjust pieces/characters per request from recent latency. Off by default — fixed budgets above still apply when disabled."
                  />
                  <Toggle
                    id="cache-key-model-toggle"
                    checked={settings.cacheKeyIncludesModel}
                    onChange={(checked) => updateSettings({ cacheKeyIncludesModel: checked })}
                    label="Model-scoped cache keys"
                    description="Include the active model in the cache key so switching models does not reuse prior translations. Off by default."
                  />
                  <Toggle
                    id="quality-check-toggle"
                    checked={settings.enableTranslationQualityCheck}
                    onChange={(checked) =>
                      updateSettings({ enableTranslationQualityCheck: checked })
                    }
                    label="Translation quality self-check"
                    description="After a batch, re-prompt once if the model echoes the source or drops rich-translate tags. Off by default."
                  />
                  <Toggle
                    id="layout-containment-toggle"
                    checked={settings.enableLayoutContainment}
                    onChange={(checked) => updateSettings({ enableLayoutContainment: checked })}
                    label="Layout containment"
                    description="Safer insertion for flex/grid cards (may slightly alter host layout). Off by default."
                  />
                  <Toggle
                    id="shadow-dom-walk-toggle"
                    checked={settings.enableShadowDomWalk}
                    onChange={(checked) => updateSettings({ enableShadowDomWalk: checked })}
                    label="Walk open Shadow DOM"
                    description="Extract text from open shadow roots (web components). Off by default."
                  />
                </SettingsGroup>
              </div>
            </div>
          </Card>
        </div>

        {/* Context & Intelligence */}
        <div
          id={ADVANCED_SECTION_IDS.context}
          tabIndex={-1}
          className={SECTION_ANCHOR_CLASS}
          style={stagger(3)}
        >
          <Card
            variant="bordered"
            accent="emerald"
            title="Context & Intelligence"
            description="Give the model page context so terminology stays consistent across a site."
            icon={<BrainCircuit className="w-3.5 h-3.5" />}
            headerExtra={
              settings.enableContextAwareTranslation ? (
                <Badge variant="success">On</Badge>
              ) : (
                <Badge variant="info">Off</Badge>
              )
            }
          >
            <div className="space-y-4">
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
                  description="Detect the page topic with a background LLM call for better terminology. Uses a small extra request."
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
            </div>
          </Card>
        </div>

        {/* PDF Translator — open behavior + Docker bridge */}
        <div
          id={ADVANCED_SECTION_IDS.pdf}
          tabIndex={-1}
          className={SECTION_ANCHOR_CLASS}
          style={stagger(4)}
        >
          <Card
            variant="bordered"
            accent="amber"
            title="PDF Translator"
            description="Detect PDF tabs and open the built-in viewer. Translation runs only via the local Docker bridge (pdf2zh)."
            icon={<FileText className="w-3.5 h-3.5" />}
            headerExtra={
              <Badge variant={pdfAutoOpen === 'off' ? 'info' : 'warning'}>
                {pdfAutoOpen === 'off' ? 'Manual' : pdfAutoOpen === 'prompt' ? 'Prompt' : 'Auto'}
              </Badge>
            }
          >
            <div className="grid gap-5 sm:grid-cols-2">
              <FieldGroup
                label="Auto-open mode"
                description="When a PDF tab is detected, how aggressively to open the translator."
                htmlFor="pdf-auto-open-select"
              >
                <Select
                  id="pdf-auto-open-select"
                  value={pdfAutoOpen}
                  onChange={(e) =>
                    updateSettings({
                      pdfSettings: {
                        ...(settings.pdfSettings ?? defaultPdfSettings),
                        autoOpen: e.target.value as 'off' | 'prompt' | 'auto',
                      },
                    })
                  }
                  options={[
                    { value: 'off', label: 'Off — manual only' },
                    { value: 'prompt', label: 'Prompt — show banner button' },
                    { value: 'auto', label: 'Auto — open immediately' },
                  ]}
                />
              </FieldGroup>

              <FieldGroup
                label="Open mode"
                description="New tab keeps the native viewer; same tab replaces it."
                htmlFor="pdf-open-mode-select"
              >
                <Select
                  id="pdf-open-mode-select"
                  value={pdfOpenMode}
                  onChange={(e) =>
                    updateSettings({
                      pdfSettings: {
                        ...(settings.pdfSettings ?? defaultPdfSettings),
                        openMode: e.target.value as 'new-tab' | 'same-tab',
                      },
                    })
                  }
                  options={[
                    { value: 'new-tab', label: 'New tab' },
                    { value: 'same-tab', label: 'Same tab (replace)' },
                  ]}
                />
              </FieldGroup>
            </div>

            {pdfAutoOpen !== 'off' && (
              <div className="mt-5 animate-fade-in-up" aria-live="polite">
                <FieldGroup
                  label="Never auto-open these sites"
                  description="Comma-separated hostnames. Auto-open stays suppressed even when enabled above."
                  htmlFor="pdf-never-open-input"
                >
                  <Input
                    id="pdf-never-open-input"
                    type="text"
                    placeholder="example.com, arxiv.org"
                    value={neverAutoOpenField.value}
                    onChange={(e) => neverAutoOpenField.setValue(e.target.value)}
                    onBlur={neverAutoOpenField.commit}
                  />
                  {(() => {
                    const draftHosts = neverAutoOpenField.value
                      .split(',')
                      .map((s) => s.trim())
                      .filter(Boolean);
                    if (draftHosts.length === 0) return null;
                    return (
                      <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                        <span className="text-[11px] text-zinc-500">Skipping:</span>
                        {draftHosts.map((host) => (
                          <span
                            key={host}
                            className="inline-flex items-center rounded-md border border-amber-500/20 bg-amber-500/10 px-1.5 py-0.5 text-[11px] text-amber-200/90"
                          >
                            {host}
                          </span>
                        ))}
                      </div>
                    );
                  })()}
                </FieldGroup>
              </div>
            )}
          </Card>
        </div>

        {/* Scientific PDF (layout-preserving bridge) */}
        <div className="animate-stagger" style={stagger(5)}>
          <Card
            variant="bordered"
            accent="amber"
            title="Scientific PDF"
            description="PDF translation runs only via a local Docker bridge (pdf2zh). When the bridge is offline, PDF Translate shows as unavailable in the viewer."
            icon={<FlaskConical className="w-3.5 h-3.5" />}
            headerExtra={<Badge variant={scientificBadge.variant}>{scientificBadge.label}</Badge>}
          >
            <div className="grid gap-4">
              <Toggle
                checked={scientificPdf.enabled}
                onChange={(checked) =>
                  updateSettings({
                    scientificPdf: {
                      ...scientificPdf,
                      enabled: checked,
                    },
                  })
                }
                label="Enable PDF bridge"
                description="Required for PDF Translate. Uses the same provider pool as normal page translation. There is no in-browser Fast PDF path."
              />
              <FieldGroup
                label="Bridge server URL"
                description="Default is loopback. Credentials and the full PDF are sent here only for PDF translate jobs."
                htmlFor="scientific-pdf-server-url"
              >
                <Input
                  id="scientific-pdf-server-url"
                  type="text"
                  value={scientificPdf.serverUrl}
                  onChange={(e) =>
                    updateSettings({
                      scientificPdf: {
                        ...scientificPdf,
                        serverUrl: e.target.value,
                      },
                    })
                  }
                  placeholder={DEFAULT_SCIENTIFIC_PDF_SETTINGS.serverUrl}
                />
              </FieldGroup>
              {scientificNonLoopback && (
                <p className="text-xs text-rose-300" role="status">
                  Warning: server URL is not loopback. You may send PDFs and API keys to a remote
                  host — only continue if you trust it.
                </p>
              )}
              <div className="flex flex-wrap items-center gap-2">
                <Button type="button" onClick={() => setShowScientificWizard(true)}>
                  Set up…
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => void refreshScientificHealth()}
                >
                  Refresh status
                </Button>
              </div>
              <p className="text-[11px] leading-relaxed text-zinc-500">
                Privacy: Scientific mode sends the full PDF plus short-lived provider credentials to
                the configured server URL. Prefer{' '}
                <code className="rounded bg-zinc-800 px-1">http://127.0.0.1</code> only. No second
                API key store — the active pool is used per job.
              </p>
            </div>
          </Card>
        </div>

        <ScientificPdfWizard
          open={showScientificWizard}
          onClose={() => {
            setShowScientificWizard(false);
            void refreshScientificHealth();
          }}
        />

        {/* Data Portability */}
        <div className="animate-stagger" style={stagger(6)}>
          <Card
            variant="bordered"
            title="Data Portability"
            description="Back up or restore all settings as plain JSON or a password-encrypted backup. Useful before resets or when moving browsers."
            icon={<Database className="w-3.5 h-3.5" />}
          >
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="flex flex-col gap-3 rounded-xl border border-white/10 bg-white/[0.02] p-4 transition-colors hover:border-white/15 hover:bg-white/[0.03]">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-blue-500/25 bg-blue-500/10 text-blue-400">
                  <Download className="h-4 w-4" aria-hidden="true" />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium text-zinc-100">Export settings</p>
                  <p className="mt-0.5 text-xs leading-relaxed text-zinc-500">
                    Download a JSON backup of providers, rules, glossary, and preferences.
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    id="export-settings-btn"
                    variant="secondary"
                    size="sm"
                    onClick={handleExportPlain}
                    icon={<Download className="w-3.5 h-3.5" />}
                  >
                    Export JSON
                  </Button>
                  <Button
                    id="export-encrypted-btn"
                    variant="secondary"
                    size="sm"
                    onClick={() => setShowExportPassword(true)}
                    icon={<Lock className="w-3.5 h-3.5" />}
                  >
                    Encrypted backup…
                  </Button>
                </div>
              </div>

              <div className="flex flex-col gap-3 rounded-xl border border-white/10 bg-white/[0.02] p-4 transition-colors hover:border-white/15 hover:bg-white/[0.03]">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-emerald-500/25 bg-emerald-500/10 text-emerald-400">
                  <Upload className="h-4 w-4" aria-hidden="true" />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium text-zinc-100">Import settings</p>
                  <p className="mt-0.5 text-xs leading-relaxed text-zinc-500">
                    Restore a plain JSON export or a password-encrypted backup. Choose merge or
                    exact replace before applying.
                  </p>
                </div>
                <Button
                  id="import-settings-btn"
                  variant="secondary"
                  size="sm"
                  onClick={() => fileInputRef.current?.click()}
                  icon={<Upload className="w-3.5 h-3.5" />}
                  className="w-full sm:w-auto"
                >
                  Import JSON
                </Button>
                <input
                  ref={fileInputRef}
                  data-testid="import-settings-file"
                  type="file"
                  accept=".json"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) void handleImportFile(file);
                    e.target.value = '';
                  }}
                />
              </div>
            </div>

            <div
              className={`mt-3 flex items-start gap-2 rounded-lg border px-3 py-2.5 text-xs ${
                hasApiKeys
                  ? 'border-amber-500/30 bg-amber-500/10 text-amber-300'
                  : 'border-zinc-800 bg-zinc-900/40 text-zinc-500'
              }`}
            >
              {hasApiKeys ? (
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              ) : (
                <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-zinc-600" aria-hidden="true" />
              )}
              <span>
                {hasApiKeys
                  ? 'Plain JSON exports include ALL your API keys in cleartext. Treat the file as a secret. Use "Encrypted backup" to move keys safely between devices.'
                  : 'Plain JSON exports include provider configuration. Once API keys are added, they appear as cleartext in plain JSON exports — prefer "Encrypted backup" for moving devices.'}
              </span>
            </div>
          </Card>
        </div>

        {/* Developer */}
        <div
          id={ADVANCED_SECTION_IDS.developer}
          tabIndex={-1}
          className={SECTION_ANCHOR_CLASS}
          style={stagger(7)}
        >
          <Card
            variant="bordered"
            accent={settings.debugMode ? 'amber' : undefined}
            title="Developer"
            description="Diagnostics for troubleshooting translation and content-script issues."
            icon={<Bug className="w-3.5 h-3.5" />}
            headerExtra={
              settings.debugMode ? <Badge variant="warning">Logging on</Badge> : undefined
            }
          >
            <div
              className={`rounded-xl border px-4 py-3.5 transition-colors ${
                settings.debugMode
                  ? 'border-amber-500/25 bg-amber-500/[0.06]'
                  : 'border-zinc-800/80 bg-zinc-950/30'
              }`}
            >
              <Toggle
                id="debug-mode-toggle"
                checked={settings.debugMode}
                onChange={(checked) => updateSettings({ debugMode: checked })}
                label="Debug mode"
                description="Verbose logs in the browser console (background + content scripts). Turn off after debugging — it can be noisy."
              />
            </div>
          </Card>
        </div>

        {/* Danger Zone — isolated, severity-ranked destructive actions */}
        <div className="animate-stagger" style={stagger(8)}>
          <DangerZone description="Irreversible or costly actions. Export a backup first if you plan to reset.">
            <DangerAction
              id={ADVANCED_SECTION_IDS.cache}
              tabIndex={-1}
              className={CACHE_ANCHOR_CLASS}
              severity="caution"
              icon={<Trash2 />}
              title="Clear translation cache"
              description="Deletes every stored translation and cross-session resume snapshots. The next pages you open will re-fetch from your provider and may incur API costs."
              meta={
                <div className="inline-flex flex-wrap items-center gap-2 text-[11px]">
                  <span className="inline-flex items-center gap-1.5 rounded-md border border-zinc-700/80 bg-zinc-900/70 px-2 py-1 font-medium tabular-nums text-zinc-300">
                    <HardDrive className="h-3 w-3 text-zinc-500" aria-hidden="true" />
                    {cacheStats.loading
                      ? 'Measuring cache…'
                      : `${cacheStats.entryCount.toLocaleString()} entries · ${cacheStats.sizeLabel}`}
                  </span>
                  {!cacheStats.loading && cacheStats.entryCount === 0 && (
                    <span className="text-zinc-600">Cache is already empty</span>
                  )}
                </div>
              }
              action={
                <Button
                  id="clear-cache-btn"
                  variant="warning"
                  size="sm"
                  onClick={() => setShowClearCacheModal(true)}
                  disabled={clearStatus === 'clearing'}
                  loading={clearStatus === 'clearing'}
                  icon={<Trash2 className="w-3.5 h-3.5" />}
                >
                  {clearStatus === 'done' ? 'Cleared' : 'Clear cache'}
                </Button>
              }
            />

            <DangerAction
              severity="critical"
              icon={<ShieldAlert />}
              title="Reset all settings"
              description="Restores factory defaults. Provider keys, dictionary, site rules, themes, and prompts are wiped. Cannot be undone."
              meta={
                <p className="inline-flex items-center gap-1.5 text-[11px] text-zinc-500">
                  <Download className="h-3 w-3 shrink-0 text-zinc-600" aria-hidden="true" />
                  Tip: use <span className="font-medium text-zinc-400">Data Portability → Export</span> above first.
                </p>
              }
              action={
                <Button
                  id="reset-all-settings-btn"
                  variant="destructive"
                  size="sm"
                  onClick={() => setShowResetModal(true)}
                  icon={<RotateCcw className="w-3.5 h-3.5" />}
                >
                  Reset everything
                </Button>
              }
            />
          </DangerZone>
        </div>
      </div>

      {/* Clear Cache Confirmation Modal */}
      {showClearCacheModal && (
        <Modal
          title="Clear translation cache?"
          message={
            <div className="space-y-3">
              <p>
                This permanently deletes all cached translations
                {!cacheStats.loading && cacheStats.entryCount > 0
                  ? ` (${cacheStats.entryCount.toLocaleString()} entries · ${cacheStats.sizeLabel})`
                  : ''}
                .
              </p>
              <ul className="space-y-1.5 rounded-lg border border-zinc-800 bg-zinc-950/60 px-3 py-2.5 text-xs text-zinc-400">
                <li className="flex gap-2">
                  <span className="text-amber-400/80">•</span>
                  Future pages re-fetch from your provider
                </li>
                <li className="flex gap-2">
                  <span className="text-amber-400/80">•</span>
                  May incur additional API costs
                </li>
                <li className="flex gap-2">
                  <span className="text-emerald-400/70">•</span>
                  Settings, dictionary, and site rules are kept
                </li>
              </ul>
            </div>
          }
          variant="danger"
          confirmLabel="Clear cache"
          cancelLabel="Keep cache"
          onConfirm={handleClearCache}
          onCancel={() => setShowClearCacheModal(false)}
        />
      )}

      {/* Reset Confirmation Modal */}
      {showResetModal && (
        <Modal
          title="Reset all settings?"
          message={
            <div className="space-y-3">
              <p>Everything returns to factory defaults. This cannot be undone.</p>
              <ul className="space-y-1.5 rounded-lg border border-rose-500/20 bg-rose-500/[0.06] px-3 py-2.5 text-xs text-zinc-400">
                <li className="flex gap-2">
                  <span className="text-rose-400">•</span>
                  Provider API keys and endpoints
                </li>
                <li className="flex gap-2">
                  <span className="text-rose-400">•</span>
                  Custom dictionary and site rules
                </li>
                <li className="flex gap-2">
                  <span className="text-rose-400">•</span>
                  Themes, prompts, and performance tuning
                </li>
              </ul>
              <p className="text-xs text-amber-300/80">
                Export a backup from Data Portability first if you might need these later.
              </p>
            </div>
          }
          variant="danger"
          confirmLabel="Reset everything"
          cancelLabel="Keep settings"
          onConfirm={handleReset}
          onCancel={() => setShowResetModal(false)}
        />
      )}

      {/* Encrypted Export Password Modal */}
      {showExportPassword && (
        <BackupPasswordDialog
          title="Encrypt backup"
          message={
            <p>
              The file is encrypted with your passphrase (PBKDF2 + AES-256-GCM). Anyone with the
              file and this passphrase can restore it on any device. If you forget the passphrase,
              the backup is unrecoverable.
            </p>
          }
          confirmLabel="Encrypt & download"
          requireConfirm
          error={passwordError}
          busy={passwordBusy}
          onConfirm={(password) => void handleExportEncrypted(password)}
          onCancel={() => {
            setShowExportPassword(false);
            setPasswordError(null);
          }}
        />
      )}

      {/* Encrypted Import Password Modal */}
      {showImportPassword && (
        <BackupPasswordDialog
          title="Unlock backup"
          message="Enter the passphrase that was used when this backup was exported."
          confirmLabel="Unlock"
          error={passwordError}
          busy={passwordBusy}
          onConfirm={(password) => void handleImportPassword(password)}
          onCancel={() => {
            setShowImportPassword(false);
            setPendingEncryptedText(null);
            setPasswordError(null);
          }}
        />
      )}

      {/* Import Summary Modal */}
      {importMeta && (
        <ImportSummaryDialog
          source={importMeta.source}
          recognizedCount={Object.keys(importMeta.recognized).length}
          ignored={importMeta.ignored}
          busy={importBusy}
          onConfirm={(replaceAll) => void handleImportApply(replaceAll)}
          onCancel={() => setImportMeta(null)}
        />
      )}
    </div>
  );
}
