/**
 * SpeechQuickSetup — the everyday Speak controls: speech source, rate, and a
 * persistent Test voice action. Provider-specific fields live behind the
 * "Advanced provider settings" disclosure in SpeechProviderSettings.
 */

import { Volume2 } from 'lucide-react';
import type { TtsPreferredBackend, TtsSettings } from '@/types/config';
import { Button } from '@/ui/Button';
import { FieldGroup } from '@/ui/FieldGroup';
import { SegmentedControl } from '@/ui/SegmentedControl';

const BACKENDS = [
  { value: 'auto', label: 'Automatic' },
  { value: 'browser', label: 'Browser voice' },
  { value: 'provider', label: 'AI voice' },
] satisfies Array<{ value: TtsPreferredBackend; label: string }>;

interface SpeechQuickSetupProps {
  value: TtsSettings;
  disabled?: boolean;
  onChange: (value: TtsSettings) => void;
  onTest: () => void;
  testing: boolean;
}

export function SpeechQuickSetup({
  value,
  disabled = false,
  onChange,
  onTest,
  testing,
}: SpeechQuickSetupProps) {
  return (
    <div className="space-y-4">
      <div>
        <p className="mb-1 text-sm font-medium text-zinc-200">Speech source</p>
        <p className="mb-3 text-xs leading-relaxed text-zinc-500">
          Automatic uses an AI provider when one is configured, otherwise your
          browser&apos;s built-in voice. Browser voice is free and local.
        </p>
        <SegmentedControl
          id="speech-backend"
          label="Speech source"
          options={BACKENDS}
          value={value.preferredBackend}
          onChange={(preferredBackend) => onChange({ ...value, preferredBackend })}
          layout="grid"
          accent="cyan"
          disabled={disabled}
        />
      </div>

      <FieldGroup
        label="Speech rate"
        htmlFor="tts-rate"
        hint={`${value.rate.toFixed(1)}× · 0.5–2.0`}
      >
        <input
          id="tts-rate"
          type="range"
          min={0.5}
          max={2}
          step={0.1}
          value={value.rate}
          disabled={disabled}
          onChange={(e) => onChange({ ...value, rate: Number(e.target.value) })}
          className="w-full accent-cyan-500 disabled:opacity-50"
        />
      </FieldGroup>

      <Button
        type="button"
        variant="secondary"
        size="sm"
        disabled={disabled || testing}
        onClick={onTest}
      >
        <Volume2 className="h-3.5 w-3.5" />
        {testing ? 'Testing…' : 'Test voice'}
      </Button>
    </div>
  );
}
