/**
 * Shared props for Subtitle Studio card modules.
 */

import type { SubtitleSettings } from '@/types/config';

export type SubtitleSettingsPatch = Partial<SubtitleSettings>;

export interface SubtitleCardBaseProps {
  settings: SubtitleSettings;
  /** True when master Enable Subtitles is off. */
  disabled: boolean;
  onUpdate: (partial: SubtitleSettingsPatch) => void;
}
