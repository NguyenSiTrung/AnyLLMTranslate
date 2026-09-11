/**
 * Per-language TTS voice overrides for selection Speak — summary list with a
 * Drawer-based create/edit flow. Preserves the stored TtsLanguageOverride[]
 * values; empty fields inherit the global model/voice.
 */

import { useMemo, useState } from 'react';
import type {
  ExtensionSettings,
  TtsCredentialSource,
  TtsLanguageOverride,
} from '@/types/config';
import { getLanguageName, getTargetLanguages } from '@/lib/languages';
import { Button } from '@/ui/Button';
import { Drawer } from '@/ui/Drawer';
import { FieldGroup } from '@/ui/FieldGroup';
import { Input } from '@/ui/Input';
import { Select } from '@/ui/Select';

const TTS_OVERRIDE_CREDENTIAL_OPTIONS: {
  value: '' | TtsCredentialSource;
  label: string;
}[] = [
  { value: '', label: 'Inherit global' },
  { value: 'pool', label: 'Pool provider' },
  { value: 'custom', label: 'Custom TTS endpoint' },
];

export function normalizedOverrideLang(code: string): string {
  return code.trim().toLowerCase().replace(/_/g, '-');
}

export function isDuplicateLanguage(
  rows: TtsLanguageOverride[],
  editingIndex: number | null,
  language: string,
): boolean {
  const normalized = normalizedOverrideLang(language);
  return (
    Boolean(normalized) &&
    rows.some(
      (row, index) =>
        index !== editingIndex && normalizedOverrideLang(row.language) === normalized,
    )
  );
}

function firstUnusedLanguage(rows: TtsLanguageOverride[]): string {
  const used = new Set(rows.map((row) => normalizedOverrideLang(row.language)));
  return (
    getTargetLanguages().find(
      (language) => !used.has(normalizedOverrideLang(language.code)),
    )?.code ?? ''
  );
}

/** Form fields bound to a draft; nothing persists until Save. */
function LanguageOverrideFields({
  value,
  rows,
  editingIndex,
  globalModel,
  globalVoice,
  enabledProviders,
  onChange,
}: {
  value: TtsLanguageOverride;
  rows: TtsLanguageOverride[];
  editingIndex: number | null;
  globalModel: string;
  globalVoice: string;
  enabledProviders: ExtensionSettings['providers'];
  onChange: (next: TtsLanguageOverride) => void;
}) {
  const languageOptions = useMemo(
    () =>
      getTargetLanguages().map((l) => ({
        value: l.code,
        label: `${l.name} (${l.code})`,
      })),
    [],
  );

  const credSource = value.credentialSource ?? '';
  const duplicate = isDuplicateLanguage(rows, editingIndex, value.language);
  const langInList = languageOptions.some((o) => o.value === value.language);
  const selectOptions = langInList
    ? languageOptions
    : value.language
      ? [{ value: value.language, label: value.language }, ...languageOptions]
      : languageOptions;

  return (
    <div className="space-y-4">
      <FieldGroup label="Language" htmlFor="tts-lang-draft">
        <Select
          id="tts-lang-draft"
          value={value.language}
          onChange={(e) => onChange({ ...value, language: e.target.value })}
          options={selectOptions}
        />
        {duplicate && (
          <p className="mt-1 text-xs text-rose-400/90">
            This language is already configured in another row.
          </p>
        )}
      </FieldGroup>

      <FieldGroup label="Credentials" htmlFor="tts-lang-cred-draft">
        <Select
          id="tts-lang-cred-draft"
          value={credSource}
          onChange={(e) => {
            const v = e.target.value as '' | TtsCredentialSource;
            if (!v) {
              const {
                credentialSource: _c,
                poolProviderId: _p,
                customBaseUrl: _u,
                customApiKey: _k,
                ...rest
              } = value;
              onChange({ ...rest, language: value.language });
              return;
            }
            onChange({ ...value, credentialSource: v });
          }}
          options={TTS_OVERRIDE_CREDENTIAL_OPTIONS.map((o) => ({
            value: o.value,
            label: o.label,
          }))}
        />
      </FieldGroup>

      {credSource === 'pool' && (
        <FieldGroup label="Pool provider" htmlFor="tts-lang-pool-draft">
          <Select
            id="tts-lang-pool-draft"
            value={value.poolProviderId ?? ''}
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
      )}

      {credSource === 'custom' && (
        <div className="grid gap-3 sm:grid-cols-2">
          <FieldGroup label="Custom base URL" htmlFor="tts-lang-url-draft">
            <Input
              id="tts-lang-url-draft"
              type="url"
              value={value.customBaseUrl ?? ''}
              onChange={(e) => onChange({ ...value, customBaseUrl: e.target.value })}
              placeholder="https://api.example.com/v1"
            />
          </FieldGroup>
          <FieldGroup label="Custom API key" htmlFor="tts-lang-key-draft">
            <Input
              id="tts-lang-key-draft"
              type="password"
              autoComplete="off"
              value={value.customApiKey ?? ''}
              onChange={(e) => onChange({ ...value, customApiKey: e.target.value })}
              placeholder="Optional if host needs no key"
            />
          </FieldGroup>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <FieldGroup
          label="Model"
          htmlFor="tts-lang-model-draft"
          hint={value.model?.trim() ? undefined : 'Uses default model'}
        >
          <Input
            id="tts-lang-model-draft"
            type="text"
            value={value.model ?? ''}
            onChange={(e) => onChange({ ...value, model: e.target.value })}
            placeholder={globalModel.trim() || 'Default model'}
          />
        </FieldGroup>
        <FieldGroup
          label="Voice / voice_id"
          htmlFor="tts-lang-voice-draft"
          hint={value.voice?.trim() ? undefined : 'Uses default voice'}
        >
          <Input
            id="tts-lang-voice-draft"
            type="text"
            value={value.voice ?? ''}
            onChange={(e) => onChange({ ...value, voice: e.target.value })}
            placeholder={globalVoice.trim() || 'Default voice'}
          />
        </FieldGroup>
      </div>
    </div>
  );
}

function overrideSummary(row: TtsLanguageOverride): string {
  const parts: string[] = [];
  parts.push(row.voice?.trim() ? `Voice ${row.voice}` : 'Uses default voice');
  if (row.model?.trim()) parts.push(`model ${row.model}`);
  if (row.credentialSource === 'pool') parts.push('pool provider');
  if (row.credentialSource === 'custom') parts.push('custom endpoint');
  return parts.join(' · ');
}

interface LanguageVoiceOverridesProps {
  value: TtsLanguageOverride[];
  globalModel: string;
  globalVoice: string;
  enabledProviders: ExtensionSettings['providers'];
  disabled?: boolean;
  onChange: (value: TtsLanguageOverride[]) => void;
}

export function LanguageVoiceOverrides({
  value,
  globalModel,
  globalVoice,
  enabledProviders,
  disabled = false,
  onChange,
}: LanguageVoiceOverridesProps) {
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [draft, setDraft] = useState<TtsLanguageOverride | null>(null);

  const openCreate = () => {
    setEditingIndex(null);
    setDraft({ language: firstUnusedLanguage(value) });
  };

  const openEdit = (index: number) => {
    setEditingIndex(index);
    setDraft({ ...value[index] });
  };

  const saveDraft = () => {
    if (!draft || isDuplicateLanguage(value, editingIndex, draft.language)) return;
    onChange(
      editingIndex === null
        ? [...value, draft]
        : value.map((row, index) => (index === editingIndex ? draft : row)),
    );
    setDraft(null);
  };

  return (
    <div className="space-y-3 rounded-lg border border-zinc-800 bg-zinc-950/40 p-3">
      <div>
        <p className="text-sm font-medium text-zinc-200">Per-language voices</p>
        <p className="mt-0.5 text-xs text-zinc-500">
          When Speak original/translation uses this language, use this stack instead
          of the defaults above. Empty fields inherit globals.
        </p>
      </div>

      <p className="text-xs text-zinc-500">
        {value.length === 0
          ? 'No language overrides yet.'
          : `${value.length} language override${value.length === 1 ? '' : 's'}`}
      </p>

      {value.length > 0 && (
        <ul className="space-y-2">
          {value.map((row, index) => (
            <li
              key={`tts-lang-${index}-${row.language}`}
              className="flex items-center justify-between gap-2 rounded-lg border border-zinc-800 bg-zinc-900/50 px-3 py-2"
            >
              <div className="min-w-0">
                <p className="text-sm font-medium text-zinc-200">
                  {row.language
                    ? `${getLanguageName(row.language)} (${row.language})`
                    : 'No language selected'}
                </p>
                <p className="truncate text-xs text-zinc-500">{overrideSummary(row)}</p>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={disabled}
                  onClick={() => openEdit(index)}
                  aria-label={`Edit ${getLanguageName(row.language)}`}
                >
                  Edit
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={disabled}
                  className="text-zinc-400 hover:text-rose-300"
                  onClick={() =>
                    onChange(value.filter((_, rowIndex) => rowIndex !== index))
                  }
                  aria-label={`Remove ${getLanguageName(row.language)}`}
                >
                  Remove
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <Button
        type="button"
        variant="secondary"
        size="sm"
        disabled={disabled || !firstUnusedLanguage(value)}
        onClick={openCreate}
      >
        Add language
      </Button>

      <Drawer
        open={draft !== null}
        title={editingIndex === null ? 'Add language voice' : 'Edit language voice'}
        onClose={() => setDraft(null)}
        footer={
          <Button
            onClick={saveDraft}
            disabled={
              !draft?.language ||
              isDuplicateLanguage(value, editingIndex, draft.language)
            }
          >
            Save override
          </Button>
        }
      >
        {draft && (
          <LanguageOverrideFields
            value={draft}
            rows={value}
            editingIndex={editingIndex}
            globalModel={globalModel}
            globalVoice={globalVoice}
            enabledProviders={enabledProviders}
            onChange={setDraft}
          />
        )}
      </Drawer>
    </div>
  );
}
