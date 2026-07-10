/**
 * Preferred source track language + auto-activate.
 */

import { Languages } from 'lucide-react';
import { Card } from '@/ui/Card';
import { DisabledDimmer } from '@/ui/DisabledDimmer';
import { FieldGroup } from '@/ui/FieldGroup';
import { Select } from '@/ui/Select';
import { Toggle } from '@/ui/Toggle';
import { LANGUAGES } from '@/lib/languages';
import type { SubtitleCardBaseProps } from './types';

export function SourceTrackCard({ settings, disabled, onUpdate }: SubtitleCardBaseProps) {
  const preferredLanguages = LANGUAGES.filter((l) => l.code !== 'auto');

  return (
    <Card
      title="Source track"
      description="Which caption track to prefer before translating to your target language."
      icon={<Languages className="w-3.5 h-3.5" />}
      variant="bordered"
    >
      <DisabledDimmer disabled={disabled}>
        <div className="space-y-5">
          <FieldGroup
            label="Preferred source subtitle language"
            description="Choose the subtitle track language to auto-select before translating."
            hint="Used when platforms expose multiple subtitle tracks."
            htmlFor="subtitle-preferred-language"
          >
            <Select
              id="subtitle-preferred-language"
              value={settings.preferredSubtitleLanguage}
              onChange={(e) => onUpdate({ preferredSubtitleLanguage: e.target.value })}
              disabled={disabled}
              options={preferredLanguages.map((lang) => ({
                value: lang.code,
                label: `${lang.nativeName} (${lang.name})`,
              }))}
            />
          </FieldGroup>
          <Toggle
            id="subtitle-auto-activate-toggle"
            checked={settings.autoActivateSubtitles}
            onChange={(checked) => onUpdate({ autoActivateSubtitles: checked })}
            label="Auto-Activate Subtitles"
            description="Automatically fetch and translate when the preferred language is detected."
            disabled={disabled}
          />
        </div>
      </DisabledDimmer>
    </Card>
  );
}
