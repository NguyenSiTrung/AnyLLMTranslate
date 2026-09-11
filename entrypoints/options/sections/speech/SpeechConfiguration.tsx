/**
 * Speech (selection Speak) configuration — extracted from AdvancedSection.tsx
 * during the settings reorganization. Preserves stored TtsSettings values and
 * all TTS runtime behavior (model/voice loading, test voice, overrides).
 *
 * Layout: everyday controls in SpeechQuickSetup, specialist provider fields
 * behind the "Advanced provider settings" disclosure, and per-language voice
 * overrides edited in a drawer via LanguageVoiceOverrides.
 */

import { useMemo, useState } from 'react';
import type { ExtensionSettings, TtsSettings } from '@/types/config';
import {
  mergeTtsSettings,
  pickTtsCredentials,
  shouldOfferVoiceField,
} from '@/lib/tts/resolveTtsBackend';
import { listProviderModels } from '@/services/providerTester';
import {
  listTtsVoices,
  type TtsVoiceChoice,
} from '@/lib/tts/listTtsVoices';
import { AdvancedDisclosure } from '@/ui/AdvancedDisclosure';
import { useToast } from '@/ui/ToastProvider';
import { LanguageVoiceOverrides } from './LanguageVoiceOverrides';
import { SpeechProviderSettings } from './SpeechProviderSettings';
import { SpeechQuickSetup } from './SpeechQuickSetup';

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

export function SpeechConfiguration({
  tts,
  settings,
  disabled = false,
  onChange,
}: {
  tts: TtsSettings;
  settings: ExtensionSettings;
  disabled?: boolean;
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
    <div className="space-y-4">
      <SpeechQuickSetup
        value={merged}
        disabled={disabled}
        onChange={onChange}
        onTest={() => void handleTest()}
        testing={testing}
      />

      {merged.preferredBackend !== 'browser' && (
        <AdvancedDisclosure
          label="Advanced provider settings"
          idPrefix="speech-provider-settings"
          disabled={disabled}
        >
          <SpeechProviderSettings
            value={merged}
            settings={settings}
            enabledProviders={enabledProviders}
            poolIdMissing={poolIdMissing}
            showVoice={showVoice}
            canLoad={Boolean(previewCreds?.baseUrl)}
            modelChoices={modelChoices}
            modelListError={modelListError}
            loadingModels={loadingModels}
            voiceChoices={voiceChoices}
            voiceListError={voiceListError}
            loadingVoices={loadingVoices}
            disabled={disabled}
            onLoadModels={() => void handleLoadModels()}
            onLoadVoices={() => void handleLoadVoices()}
            onChange={onChange}
          />
        </AdvancedDisclosure>
      )}

      <LanguageVoiceOverrides
        value={merged.languageOverrides}
        globalModel={merged.model}
        globalVoice={merged.voice}
        enabledProviders={enabledProviders}
        disabled={disabled}
        onChange={(languageOverrides) =>
          onChange({ ...merged, languageOverrides })
        }
      />
    </div>
  );
}
