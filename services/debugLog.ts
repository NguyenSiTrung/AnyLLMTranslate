/**
 * Debug logging gate.
 *
 * Sensitive logs (LLM prompts/responses, page text, user content) must never
 * appear in the default console. They are emitted only when `settings.debugMode`
 * is on. Operational logs (status updates, key counts, structural metadata
 * without page text) remain un-gated.
 *
 * The settings value is cached in module scope and refreshed on a 5s TTL to
 * avoid hitting chrome.storage on every LLM call. The first read is sync
 * (returns false) if chrome.storage is not yet reachable, so logs stay silent
 * by default rather than throwing.
 */

import { loadSettings } from '@/lib/config';

let cachedEnabled = false;
let lastReadAt = 0;
const TTL_MS = 5_000;

/** Returns true if debugMode is currently enabled. Caches for 5s. */
export async function isDebugLoggingEnabledAsync(): Promise<boolean> {
  const now = Date.now();
  if (now - lastReadAt < TTL_MS) return cachedEnabled;
  try {
    const settings = await loadSettings();
    cachedEnabled = Boolean(settings.debugMode);
    lastReadAt = now;
  } catch {
    cachedEnabled = false;
  }
  return cachedEnabled;
}

/**
 * Synchronous check used from LLM request/response logging.
 * Returns the last cached value. On the very first call (before any async
 * read) the default is `false` (logging off), which is the safe behaviour.
 *
 * P2: if the cache is stale (past TTL or invalidated), schedule a background
 * refresh so the NEXT call observes the new value — without blocking this call
 * on an async read (logging paths must stay sync). This is what makes a
 * debugMode toggle take effect promptly instead of being stuck on the old
 * cached value until the next explicit warmup.
 */
export function isDebugLoggingEnabled(): boolean {
  const now = Date.now();
  if (now - lastReadAt >= TTL_MS) {
    // Fire-and-forget refresh; keep returning the last known value for THIS call.
    void isDebugLoggingEnabledAsync();
  }
  return cachedEnabled;
}

/** Invalidate the cached debug value. Called on settings change so the next
 *  log call observes the new value without waiting for TTL expiry.
 *
 *  P2 bug: previously this set `cachedEnabled = false` directly. That meant
 *  toggling debugMode ON via storage.onChanged immediately reset the cache to
 *  false, so debug logging stayed broken until the next 5s TTL read (and on a
 *  quiet SW that may never happen before eviction). Now it only clears the TTL
 *  timestamp — the cached value is left intact (not clobbered to false) and the
 *  next sync `isDebugLoggingEnabled()` call schedules a background refresh. */
export function invalidateDebugCache(): void {
  lastReadAt = 0;
}

/** Warm the cache from current settings. Should be called at SW startup. */
export async function warmDebugCache(): Promise<void> {
  await isDebugLoggingEnabledAsync();
}
