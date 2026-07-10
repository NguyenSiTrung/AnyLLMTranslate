/**
 * YouTube ASR re-alignment (local + optional AI/BYOK).
 */

import { Sparkles } from 'lucide-react';
import { Card } from '@/ui/Card';
import { Badge } from '@/ui/Badge';
import { DisabledDimmer } from '@/ui/DisabledDimmer';
import { Toggle } from '@/ui/Toggle';
import { DEFAULT_YOUTUBE_ASR_RESEGMENT_SETTINGS } from '@/types/config';
import type { SubtitleCardBaseProps } from './types';

export function CaptionQualityCard({ settings, disabled, onUpdate }: SubtitleCardBaseProps) {
  const asr = settings.youtubeAsrResegment ?? DEFAULT_YOUTUBE_ASR_RESEGMENT_SETTINGS;
  const masterOn = asr.enable;

  return (
    <Card
      title="Caption quality"
      description="Improve auto-generated YouTube captions before translation."
      icon={<Sparkles className="w-3.5 h-3.5" />}
      variant="bordered"
      headerExtra={<Badge variant="info">YouTube</Badge>}
    >
      <DisabledDimmer disabled={disabled}>
        <div className="space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-sm text-zinc-200">Improve auto-generated captions</p>
              <p className="text-xs text-zinc-500 mt-0.5 leading-relaxed">
                Re-chunk fragmented ASR captions into clearer sentences before translation.
                Human-uploaded tracks are unchanged.
              </p>
            </div>
            <Toggle
              id="youtube-asr-resegment-enable"
              ariaLabel="Improve auto-generated captions"
              checked={masterOn}
              disabled={disabled}
              onChange={(checked) => {
                onUpdate({
                  youtubeAsrResegment: {
                    ...asr,
                    enable: checked,
                    aiEnable: checked ? asr.aiEnable : false,
                  },
                });
              }}
            />
          </div>

          <div
            className={`rounded-lg border p-3 space-y-1 ${
              masterOn
                ? 'border-cyan-500/15 bg-cyan-500/[0.03]'
                : 'border-zinc-800/50 bg-transparent opacity-70'
            }`}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm text-zinc-300">AI re-align</p>
                <p className="text-xs text-zinc-500 mt-0.5 leading-relaxed">
                  Use your configured LLM (BYOK) for smarter sentence boundaries. Falls back
                  to local rules if the AI call fails. Uses extra tokens.
                </p>
              </div>
              <Toggle
                id="youtube-asr-resegment-ai-enable"
                ariaLabel="AI re-align auto-generated captions"
                checked={asr.aiEnable}
                disabled={disabled || !masterOn}
                onChange={(checked) => {
                  onUpdate({
                    youtubeAsrResegment: { ...asr, aiEnable: checked },
                  });
                }}
              />
            </div>
          </div>
        </div>
      </DisabledDimmer>
    </Card>
  );
}
