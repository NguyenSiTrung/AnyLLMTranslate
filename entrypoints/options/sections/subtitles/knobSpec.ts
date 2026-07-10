/**
 * Data-driven translation-style knobs and Appearance segment options.
 */

import type {
  SubtitleDisplayMode,
  SubtitleFontFamily,
  SubtitleFontSizeMode,
} from '@/types/config';
import type { ProfileKnobs } from '@/lib/subtitleProfiles';

export type KnobKey = keyof ProfileKnobs;

export interface KnobSpec {
  key: KnobKey;
  label: string;
  description: string;
  options: { value: string; label: string }[];
}

export const POSITION_OPTIONS: { value: 'bottom' | 'top'; label: string }[] = [
  { value: 'bottom', label: 'Bottom' },
  { value: 'top', label: 'Top' },
];

export const FONT_FAMILY_OPTIONS: { value: SubtitleFontFamily; label: string }[] = [
  { value: 'system', label: 'System' },
  { value: 'serif', label: 'Serif' },
  { value: 'monospace', label: 'Mono' },
];

export const DISPLAY_MODE_OPTIONS: { value: SubtitleDisplayMode; label: string }[] = [
  { value: 'bilingual', label: 'Bilingual' },
  { value: 'translation-only', label: 'Translated' },
];

export const FONT_SIZE_MODE_OPTIONS: { value: SubtitleFontSizeMode; label: string }[] = [
  { value: 'fixed', label: 'Fixed' },
  { value: 'auto', label: 'Auto' },
];

export const KNOB_SPEC: KnobSpec[] = [
  {
    key: 'register',
    label: 'Register',
    description: 'Formal ↔ casual tone',
    options: [
      { value: 'auto', label: 'Auto' },
      { value: 'formal', label: 'Formal' },
      { value: 'neutral', label: 'Neutral' },
      { value: 'casual', label: 'Casual' },
    ],
  },
  {
    key: 'faithfulness',
    label: 'Faithfulness',
    description: 'Word-for-word vs natural phrasing',
    options: [
      { value: 'auto', label: 'Auto' },
      { value: 'literal', label: 'Literal' },
      { value: 'balanced', label: 'Balanced' },
      { value: 'idiomatic', label: 'Idiomatic' },
    ],
  },
  {
    key: 'brevity',
    label: 'Brevity',
    description: 'How short on-screen lines stay',
    options: [
      { value: 'auto', label: 'Auto' },
      { value: 'relaxed', label: 'Relaxed' },
      { value: 'moderate', label: 'Moderate' },
      { value: 'terse', label: 'Terse' },
    ],
  },
  {
    key: 'profanity',
    label: 'Profanity',
    description: 'Keep, soften, or remove strong language',
    options: [
      { value: 'auto', label: 'Auto' },
      { value: 'preserve', label: 'Preserve' },
      { value: 'soften', label: 'Soften' },
      { value: 'remove', label: 'Remove' },
    ],
  },
];
