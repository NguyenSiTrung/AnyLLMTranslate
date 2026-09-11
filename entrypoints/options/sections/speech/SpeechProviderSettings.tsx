/**
 * SpeechProviderSettings — AI-voice provider configuration behind the
 * "Advanced provider settings" disclosure: credential source, pool or custom
 * endpoint, model and voice loading. Values map to unchanged TtsSettings keys.
 */

import { List, Loader2 } from 'lucide-react';
import {
  OPENAI_TTS_VOICE_SUGGESTIONS,
  type ExtensionSettings,
  type TtsCredentialSource,
  type TtsSettings,
} from '@/types/config';
import type { TtsVoiceChoice } from '@/lib/tts/listTtsVoices';
import { Button } from '@/ui/Button';
import { FieldGroup } from '@/ui/FieldGroup';
import { Input } from '@/ui/Input';
import { Select } from '@/ui/Select';
import { Toggle } from '@/ui/Toggle';

const TTS_CREDENTIAL_SOURCE_OPTIONS: { value: TtsCredentialSource; label: string }[] = [
  { value: 'pool', label: 'Use provider from pool' },
  { value: 'custom', label: 'Custom TTS endpoint' },
];

export interface SpeechProviderSettingsProps {
  value: TtsSettings;
  settings: ExtensionSettings;
  enabledProviders: ExtensionSettings['providers'];
  poolIdMissing: boolean;
  showVoice: boolean;
  canLoad: boolean;
  modelChoices: string[];
  modelListError: string | null;
  loadingModels: boolean;
  voiceChoices: TtsVoiceChoice[];
  voiceListError: string | null;
  loadingVoices: boolean;
  disabled?: boolean;
  onLoadModels: () => void;
  onLoadVoices: () => void;
  onChange: (value: TtsSettings) => void;
}

export function SpeechProviderSettings({
  value,
  enabledProviders,
  poolIdMissing,
  showVoice,
  canLoad,
  modelChoices,
  modelListError,
  loadingModels,
  voiceChoices,
  voiceListError,
  loadingVoices,
  disabled = false,
  onLoadModels,
  onLoadVoices,
  onChange,
}: SpeechProviderSettingsProps) {
  return (
    <div className="space-y-4">
      <FieldGroup
        label="TTS credentials"
        htmlFor="tts-credential-source"
        hint="Custom endpoint fully overrides the pool for Speak only"
      >
        <Select
          id="tts-credential-source"
          value={value.credentialSource}
          disabled={disabled}
          onChange={(e) =>
            onChange({
              ...value,
              credentialSource: e.target.value as TtsCredentialSource,
            })
          }
          options={TTS_CREDENTIAL_SOURCE_OPTIONS.map((o) => ({
            value: o.value,
            label: o.label,
          }))}
        />
      </FieldGroup>

      {value.credentialSource === 'pool' ? (
        <div className="space-y-2">
          <FieldGroup label="Pool provider" htmlFor="tts-pool-provider">
            <Select
              id="tts-pool-provider"
              value={value.poolProviderId}
              disabled={disabled}
              onChange={(e) => onChange({ ...value, poolProviderId: e.target.value })}
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
              value={value.customBaseUrl}
              disabled={disabled}
              onChange={(e) => onChange({ ...value, customBaseUrl: e.target.value })}
              placeholder="https://api.example.com/v1"
            />
          </FieldGroup>
          <FieldGroup label="Custom API key" htmlFor="tts-custom-api-key">
            <Input
              id="tts-custom-api-key"
              type="password"
              autoComplete="off"
              value={value.customApiKey}
              disabled={disabled}
              onChange={(e) => onChange({ ...value, customApiKey: e.target.value })}
              placeholder="Optional if host needs no key"
            />
          </FieldGroup>
          {!value.customBaseUrl.trim() && (
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
            value={value.model}
            disabled={disabled}
            onChange={(e) => onChange({ ...value, model: e.target.value })}
            placeholder="e.g. tts-1 or your-host-model-id"
            className="flex-1"
          />
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={disabled || loadingModels || !canLoad}
            onClick={onLoadModels}
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
                  value.model === id
                    ? 'bg-cyan-500/15 text-cyan-200'
                    : 'text-zinc-300'
                }`}
                onClick={() => onChange({ ...value, model: id })}
              >
                {id}
              </button>
            ))}
          </div>
        )}
      </FieldGroup>

      <Toggle
        id="tts-show-voice-toggle"
        checked={value.showVoiceField}
        disabled={disabled}
        onChange={(checked) => onChange({ ...value, showVoiceField: checked })}
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
              value={value.voice}
              disabled={disabled}
              onChange={(e) => onChange({ ...value, voice: e.target.value })}
              placeholder="alloy or mistral-voice-id"
              className="flex-1"
            />
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={disabled || loadingVoices || !canLoad}
              onClick={onLoadVoices}
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
                    value.voice === v.id
                      ? 'bg-cyan-500/15 text-cyan-200'
                      : 'text-zinc-300'
                  }`}
                  onClick={() => onChange({ ...value, voice: v.id })}
                >
                  {v.label}
                </button>
              ))}
            </div>
          )}
        </FieldGroup>
      )}
    </div>
  );
}
