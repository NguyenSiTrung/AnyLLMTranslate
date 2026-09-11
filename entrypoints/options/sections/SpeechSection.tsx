/**
 * Speech settings tab — selection-bubble Speak configuration promoted from
 * Advanced → Translation Quality to a first-class Media tab.
 */

import { Volume2 } from 'lucide-react';
import { SectionHeader } from '@/ui/SectionHeader';
import { Toggle } from '@/ui/Toggle';
import { DisabledDimmer } from '@/ui/DisabledDimmer';
import { useSettingsStore } from '@/stores/settingsStore';
import { DEFAULT_TTS_SETTINGS, type TtsSettings } from '@/types/config';
import { mergeTtsSettings } from '@/lib/tts/resolveTtsBackend';
import { SpeechConfiguration } from './speech/SpeechConfiguration';

export function SpeechSection() {
  const settings = useSettingsStore();
  const updateSettings = useSettingsStore((state) => state.updateSettings);
  const tts = mergeTtsSettings(settings.tts ?? DEFAULT_TTS_SETTINGS);
  const patch = (partial: Partial<TtsSettings>) =>
    updateSettings({ tts: { ...tts, ...partial } });

  return (
    <div className="animate-fade-in-up">
      <SectionHeader
        title="Speech"
        description="Listen to original or translated text using browser or AI voices."
        icon={<Volume2 className="h-4 w-4" />}
        accentColor="cyan"
      />
      <div className="mb-4 rounded-xl border border-cyan-500/30 bg-cyan-500/[0.04] p-4">
        <Toggle
          id="speech-enabled-toggle"
          checked={tts.enabled}
          onChange={(enabled) => patch({ enabled })}
          label="Enable Speak"
          description={
            tts.enabled
              ? 'The Speak action is available after translating selected text.'
              : 'Enable to show the Speak action in the selection translation bubble.'
          }
        />
      </div>
      <DisabledDimmer disabled={!tts.enabled}>
        <SpeechConfiguration
          tts={tts}
          settings={settings}
          disabled={!tts.enabled}
          onChange={(next) => updateSettings({ tts: next })}
        />
      </DisabledDimmer>
    </div>
  );
}
