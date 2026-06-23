/**
 * Subtitle profiles — maps supported subtitle sites to a named profile, and
 * each profile to a preset of translation knobs. Profiles are data, not code
 * branches: the subtitle prompt builder consumes the resolved knobs.
 *
 * See docs/superpowers/specs/2026-06-23-subtitle-profiles-and-prompt-design.md.
 */

/** The three subtitle site profiles. */
export type SubtitleProfile = 'educational' | 'media' | 'cinematic';

/** Tone/register of the translation. */
export type Register = 'formal' | 'neutral' | 'casual';

/** How closely the translation tracks the source wording. */
export type Faithfulness = 'literal' | 'balanced' | 'idiomatic';

/** How aggressively the translation trims for on-screen brevity. */
export type Brevity = 'relaxed' | 'moderate' | 'terse';

/** How to handle strong profanity. */
export type Profanity = 'preserve' | 'soften' | 'remove';

/** The four translation knobs a profile presets. */
export interface ProfileKnobs {
  register: Register;
  faithfulness: Faithfulness;
  brevity: Brevity;
  profanity: Profanity;
}

/** Preset knob values per profile. */
export const PROFILE_PRESETS: Record<SubtitleProfile, ProfileKnobs> = {
  educational: { register: 'neutral', faithfulness: 'literal',  brevity: 'relaxed',  profanity: 'preserve' },
  media:       { register: 'neutral', faithfulness: 'balanced', brevity: 'moderate', profanity: 'preserve' },
  cinematic:   { register: 'casual',  faithfulness: 'idiomatic', brevity: 'moderate', profanity: 'preserve' },
};

/**
 * Hostname → profile map. Hostnames only (no scheme, no path) — callers pass
 * `window.location.hostname`. This is intentionally a SEPARATE map from
 * `DOMAIN_CATEGORY_MAP` in content/utils/pageContext.ts: that map feeds
 * web-page category detection with coarse free-form strings; this one feeds
 * subtitle translation with a strict 3-value enum.
 */
export const DOMAIN_PROFILE_MAP: Record<string, SubtitleProfile> = {
  'udemy.com': 'educational',
  'coursera.org': 'educational',
  'linkedin.com': 'educational',
  'youtube.com': 'media',
  'max.com': 'cinematic',
  'hbomax.com': 'cinematic',
};

/**
 * Resolve a subtitle profile from a hostname. Unknown domains fall back to
 * `'media'` (balanced defaults).
 */
export function resolveProfile(hostname: string): SubtitleProfile {
  return DOMAIN_PROFILE_MAP[hostname] ?? 'media';
}

/** A partial set of knob values — absent knobs inherit from the layer below. */
export type KnobOverride = Partial<ProfileKnobs>;

/**
 * Resolve the effective knobs by layering partial overrides over the profile
 * preset. Precedence: perTab > global > preset. Keys absent from an override
 * inherit from the layer below. An unknown profile string falls back to 'media'
 * (guards against malformed untrusted runtime data, matching resolveProfile).
 *
 * With both overrides empty/absent this returns PROFILE_PRESETS[profile]
 * exactly — today's behavior, byte-for-byte.
 */
export function resolveEffectiveKnobs(
  profile: SubtitleProfile,
  globalOverride?: KnobOverride,
  perTabOverride?: KnobOverride,
): ProfileKnobs {
  return {
    ...(PROFILE_PRESETS[profile] ?? PROFILE_PRESETS.media),
    ...(globalOverride ?? {}),
    ...(perTabOverride ?? {}),
  };
}
