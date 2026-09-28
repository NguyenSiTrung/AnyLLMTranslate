/**
 * Global caption translation mode — progressive vs full-track quality.
 * Spec: docs/superpowers/specs/2026-09-27-subtitle-plus-mode-design.md §K.
 */

import { Gauge } from 'lucide-react';
import { Card } from '@/ui/Card';
import { DisabledDimmer } from '@/ui/DisabledDimmer';
import { Toggle } from '@/ui/Toggle';
import type { SubtitleCardBaseProps } from './types';

export function TranslationModeCard({ settings, disabled, onUpdate }: SubtitleCardBaseProps) {
  return (
    <Card
      title="Translation mode"
      description="How translated captions are produced on each video."
      icon={<Gauge className="w-3.5 h-3.5" />}
      variant="bordered"
    >
      <DisabledDimmer disabled={disabled}>
        <Toggle
          id="subtitle-plus-mode-enable"
          label="Full-track quality mode"
          ariaLabel="Full-track quality mode"
          description="Freeze one term list for the whole track, translate it in parallel, and show nothing until it is ready. More consistent names and terms; waits for the whole track; uses extra AI calls. Only applies to players that provide the full track."
          checked={settings.translationMode === 'plus'}
          disabled={disabled}
          onChange={(checked) => {
            onUpdate({ translationMode: checked ? 'plus' : 'progressive' });
          }}
        />
      </DisabledDimmer>
    </Card>
  );
}