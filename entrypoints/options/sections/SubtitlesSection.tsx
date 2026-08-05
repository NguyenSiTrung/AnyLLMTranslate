/**
 * Subtitle Studio — split-pane live preview + Appearance, progressive controls.
 * Spec: docs/superpowers/specs/2026-07-10-subtitle-studio-design.md
 */

import { Subtitles as SubtitlesIcon, MonitorPlay } from 'lucide-react';
import { SectionHeader } from '@/ui/SectionHeader';
import { stagger } from '@/lib/styleUtils';
import { useSettingsStore } from '@/stores/settingsStore';
import { Card } from '@/ui/Card';
import { Toggle } from '@/ui/Toggle';
import { SubtitlePreview } from '@/entrypoints/options/components/SubtitlePreview';
import { getPreviewCuesForLanguage, resolveStyleChipLabel } from '@/lib/subtitlePreviewCues';
import { AppearanceCard } from './subtitles/AppearanceCard';
import { SourceTrackCard } from './subtitles/SourceTrackCard';
import { PlatformsCard } from './subtitles/PlatformsCard';
import { CaptionQualityCard, SAVED_CAPTION_REALIGNS_SECTION_ID } from './subtitles/CaptionQualityCard';
import { PrealignFromLinkCard } from './subtitles/PrealignFromLinkCard';
import { SavedCaptionRealignsCard } from './subtitles/SavedCaptionRealignsCard';
import { TranslationStyleCard } from './subtitles/TranslationStyleCard';

export function SubtitlesSection() {
  const subtitleSettings = useSettingsStore((s) => s.subtitleSettings);
  const targetLanguage = useSettingsStore((s) => s.targetLanguage);
  const updateSettings = useSettingsStore((s) => s.updateSettings);

  const handleUpdate = (partial: Partial<typeof subtitleSettings>) => {
    updateSettings({
      subtitleSettings: { ...subtitleSettings, ...partial },
    });
  };

  const isDisabled = !subtitleSettings.enabled;
  const previewCues = getPreviewCuesForLanguage(targetLanguage);
  const styleChip = resolveStyleChipLabel(subtitleSettings.knobOverrides ?? {});

  return (
    <div className="animate-fade-in-up flex flex-col lg:h-[calc(100dvh-4.5rem)] lg:min-h-[28rem] lg:max-h-[calc(100dvh-4.5rem)]">
      <div className="shrink-0">
        <SectionHeader
          title="Subtitle Studio"
          description="Tune how translated captions look and behave on video."
          icon={<SubtitlesIcon className="w-4 h-4" />}
          accentColor="cyan"
        />

        <div className="mb-4 rounded-xl border border-cyan-500/30 bg-cyan-500/[0.04] p-4">
          <Toggle
            id="subtitle-enabled-toggle"
            checked={subtitleSettings.enabled}
            onChange={(checked) => handleUpdate({ enabled: checked })}
            label="Enable Subtitles"
            description={
              subtitleSettings.enabled
                ? 'Translated subtitles are active on supported video players.'
                : 'Subtitles are off — enable to configure the studio and show captions on video.'
            }
          />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4 flex-1 min-h-0 items-stretch">
        {/* Studio rail — live preview + Appearance */}
        <div className="lg:col-span-2 order-1 min-h-0 lg:overflow-y-auto lg:overscroll-contain space-y-4 lg:pr-1 [scrollbar-gutter:stable]">
          <Card
            title="Live preview"
            description="Reacts to Appearance and style knobs. No real video or API calls."
            icon={<MonitorPlay className="w-3.5 h-3.5" />}
            variant="bordered"
          >
            <SubtitlePreview
              disabled={isDisabled}
              fontSize={subtitleSettings.fontSize}
              fontSizeMode={subtitleSettings.fontSizeMode}
              backgroundOpacity={subtitleSettings.backgroundOpacity}
              fontFamily={subtitleSettings.fontFamily}
              stylePreset={subtitleSettings.stylePreset}
              styleOverrides={subtitleSettings.styleOverrides}
              displayMode={subtitleSettings.displayMode}
              position={subtitleSettings.position}
              cues={previewCues}
              styleChip={styleChip}
            />
          </Card>

          <AppearanceCard
            settings={subtitleSettings}
            disabled={isDisabled}
            onUpdate={handleUpdate}
          />
        </div>

        {/* Controls rail */}
        <div className="lg:col-span-3 order-2 min-h-0 lg:overflow-y-auto lg:overscroll-contain space-y-4 [scrollbar-gutter:stable]">
          <div className="animate-stagger" style={stagger(0)}>
            <SourceTrackCard
              settings={subtitleSettings}
              disabled={isDisabled}
              onUpdate={handleUpdate}
            />
          </div>
          <div className="animate-stagger" style={stagger(1)}>
            <PlatformsCard
              settings={subtitleSettings}
              disabled={isDisabled}
              onUpdate={handleUpdate}
            />
          </div>
          <div className="animate-stagger" style={stagger(2)}>
            <CaptionQualityCard
              settings={subtitleSettings}
              disabled={isDisabled}
              onUpdate={handleUpdate}
            />
          </div>
          <div className="animate-stagger" style={stagger(3)}>
            <PrealignFromLinkCard disabled={isDisabled} />
          </div>
          <div
            id={SAVED_CAPTION_REALIGNS_SECTION_ID}
            tabIndex={-1}
            className="animate-stagger outline-none"
            style={stagger(4)}
          >
            <SavedCaptionRealignsCard disabled={isDisabled} />
          </div>
          <div className="animate-stagger" style={stagger(5)}>
            <TranslationStyleCard
              settings={subtitleSettings}
              disabled={isDisabled}
              onUpdate={handleUpdate}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
