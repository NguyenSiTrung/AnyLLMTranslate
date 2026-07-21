import { ChevronDown, Palette } from 'lucide-react';
import type { ThemeName, DisplayMode, NamedGlossaryList } from '@/types/config';
import type { ProfileKnobs } from '@/lib/subtitleProfiles';
import { Toggle as SharedToggle } from '@/ui/Toggle';
import { SegmentedControl } from '@/ui/SegmentedControl';
import { CustomSelect } from './CustomSelect';
import { TYPOGRAPHY, SPACING, THEME_LABELS } from '../lib/typography';

const SUBTITLE_KNOBS: {
  knob: keyof ProfileKnobs;
  opts: string[];
}[] = [
  { knob: 'faithfulness', opts: ['auto', 'literal', 'balanced', 'idiomatic'] },
  { knob: 'brevity', opts: ['auto', 'relaxed', 'moderate', 'terse'] },
  { knob: 'register', opts: ['auto', 'formal', 'neutral', 'casual'] },
  { knob: 'profanity', opts: ['auto', 'preserve', 'soften', 'remove'] },
];

export function QuickSettings({
  expanded,
  onToggle,
  theme,
  onThemeChange,
  displayMode,
  onDisplayModeChange,
  subtitlesEnabled,
  onSubtitlesToggle,
  subtitleLists,
  activeSubtitleListId,
  activeHostname,
  onSubtitleListChange,
  styleExpanded,
  onStyleToggle,
  tabOverrides,
  onTabKnob,
  onOpenMoreSettings,
}: {
  expanded: boolean;
  onToggle: () => void;
  theme: ThemeName;
  onThemeChange: (theme: ThemeName) => void;
  displayMode: DisplayMode;
  onDisplayModeChange: (mode: DisplayMode) => void;
  subtitlesEnabled: boolean;
  onSubtitlesToggle: () => void;
  subtitleLists: NamedGlossaryList[];
  activeSubtitleListId: string | null;
  activeHostname: string | null;
  onSubtitleListChange: (listId: string | null) => void;
  styleExpanded: boolean;
  onStyleToggle: () => void;
  tabOverrides: Partial<ProfileKnobs>;
  onTabKnob: (knob: keyof ProfileKnobs, value: string) => void;
  onOpenMoreSettings: () => void;
}) {
  return (
    <div className="border-t border-zinc-900/80 pt-3">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        className="w-full flex items-center justify-between text-zinc-400 hover:text-zinc-200 transition-colors group"
      >
        <span className={TYPOGRAPHY.label}>Quick settings</span>
        <ChevronDown
          className={`w-4 h-4 transition-all duration-300 ${expanded ? 'rotate-180' : ''} group-hover:text-zinc-200`}
        />
      </button>

      {expanded && (
        <div className="mt-3 space-y-3 animate-in fade-in slide-in-from-top-2 duration-300">
          <div className="bg-zinc-900/70 backdrop-blur-xl border border-zinc-800/80 rounded-2xl p-3.5 space-y-3.5 shadow-lg shadow-black/20">
            <div className={SPACING.sm}>
              <CustomSelect
                id="popup-theme"
                label="Visual Theme"
                icon={Palette}
                value={theme}
                onChange={(val) => onThemeChange(val as ThemeName)}
                options={(Object.entries(THEME_LABELS) as [ThemeName, string][]).map(
                  ([value, label]) => ({ value, label }),
                )}
              />
            </div>

            <div className={SPACING.sm}>
              <label className={TYPOGRAPHY.label}>Display Mode</label>
              <SegmentedControl
                size="sm"
                label="Display mode"
                value={displayMode}
                onChange={onDisplayModeChange}
                options={[
                  { value: 'bilingual-below', label: 'Bilingual' },
                  { value: 'translation-only', label: 'Translation only' },
                ]}
              />
            </div>

            <SharedToggle
              checked={subtitlesEnabled}
              onChange={onSubtitlesToggle}
              label="Subtitle Translation"
            />

            {subtitlesEnabled && (
              <div className="pt-1">
                <div className="mb-3 space-y-1.5">
                  <CustomSelect
                    id="popup-subtitle-dictionary"
                    label="Subtitle dictionary"
                    value={activeSubtitleListId ?? ''}
                    onChange={(value) => onSubtitleListChange(value || null)}
                    options={[
                      { value: '', label: 'None' },
                      ...subtitleLists.map((list) => ({ value: list.id, label: list.name })),
                    ]}
                  />
                  <p className="text-[10px] text-zinc-500 leading-relaxed">
                    {activeSubtitleListId && activeHostname
                      ? `Using last choice for ${activeHostname}`
                      : 'No list for this site'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={onStyleToggle}
                  aria-expanded={styleExpanded}
                  className="w-full flex items-center justify-between text-zinc-400 hover:text-zinc-200 transition-colors text-xs"
                >
                  <span>Subtitle style (this tab)</span>
                  <ChevronDown
                    className={`w-3.5 h-3.5 transition-all duration-300 ${styleExpanded ? 'rotate-180' : ''}`}
                  />
                </button>
                {styleExpanded && (
                  <div className="mt-3 space-y-3">
                    <p className="text-[10px] text-zinc-500 leading-relaxed">
                      Applies to upcoming lines. Auto uses the site&apos;s profile. Resets on reload.
                    </p>
                    {SUBTITLE_KNOBS.map(({ knob, opts }) => (
                      <div key={knob}>
                        <SegmentedControl
                          size="sm"
                          label={knob}
                          value={(tabOverrides[knob] as string) ?? 'auto'}
                          onChange={(v) => onTabKnob(knob, v)}
                          options={opts.map((opt) => ({
                            value: opt,
                            label: opt.charAt(0).toUpperCase() + opt.slice(1),
                          }))}
                        />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={onOpenMoreSettings}
            className="text-[11px] text-blue-400 hover:text-blue-300 transition-colors px-0.5"
          >
            More in Settings →
          </button>
        </div>
      )}
    </div>
  );
}
