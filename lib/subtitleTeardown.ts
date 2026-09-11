/**
 * Teardown decision for an active subtitle session when settings change.
 *
 * The coordinator caches settings and only refreshes its overlay config on
 * change; without this predicate, switching subtitles off (or disabling the
 * site you are on) left the overlay running, kept translating cues, and held a
 * background session open. Kept pure so the decision is unit-testable and the
 * side effects stay in the coordinator.
 */

import type { SubtitleSettings } from '@/types/config';

/**
 * Should the active subtitle session for `platform` be torn down?
 *
 * True when subtitles were switched off, or when `platform` was not disabled
 * before the change and is now in `next.disabledSubtitleSites`. A platform that
 * was already disabled (or another platform being disabled) is not a teardown —
 * no session for it should be running anyway.
 */
export function shouldTeardownSubtitleSession(
  prev: SubtitleSettings,
  next: SubtitleSettings,
  platform: string,
): boolean {
  if (prev.enabled && !next.enabled) return true;
  const wasDisabled = (prev.disabledSubtitleSites ?? []).includes(platform);
  const isDisabled = (next.disabledSubtitleSites ?? []).includes(platform);
  return !wasDisabled && isDisabled;
}
