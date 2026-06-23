# Subtitle Context-Aware Cache & Robustness — Design

Date: 2026-06-24
Status: Approved (pending user spec review)
Roadmap: Sub-project 6 of the subtitle-quality pipeline (final sub-project).

## Problem

Two independent gaps in the subtitle translation path, both confirmed by code
inspection.

### Cache-key gap

The subtitle path reuses the generic translation cache with key
`SHA-256(src:tgt:text)` (`services/cacheManager.ts:21-33`). Nothing that
changes the *output* participates in the key:

- **No profile / knobs.** A cue translated under the `cinematic` profile
  (casual, idiomatic) and later requested under `educational` (neutral,
  literal) returns the same cached cinematic translation. Per-tab/global
  `knobOverrides` (`types/config.ts:137`) have zero effect on cache identity.
- **No glossary.** A cue translated before the rolling proper-noun glossary
  populated is cached; the same text in a later chunk is served from cache,
  ignoring the now-populated glossary. A newly-added user glossary entry
  likewise leaves previously-cached translations stale.
- **No path identity.** The subtitle path and the web-page path share the
  exact key, so a web-page translation (HTML-preservation prompt) and a
  subtitle translation of identical text collide on one slot.
- **Partial results cached as valid.** When the LLM omits some IDs, the service
  back-fills them with the source text and sets `partial: true`
  (`services/openaiCompatible.ts:104-112`) — but `translateChunk` writes the
  chunk to cache without checking `partial` (`background.ts:526`), persisting
  source-text-as-translation.

### Retry gap

Only network-level retry exists: `fetchWithRetry` (2 retries, 5xx + network
errors, not 4xx) at `services/openaiCompatible.ts:303-393`. Above it:

- **No chunk-level retry.** When `service.translate` finally returns
  `success: false`, `translateChunk` throws once. The first-chunk failure
  propagates to `{ success: false }` (visible). Background-chunk failure is
  **silently swallowed** (`background.ts:640-642`): a bare `console.warn`, the
  chunk's cues keep original text, no re-queue, no user signal.
- **No user signal on failure.** A film with one failed background chunk
  mid-playback shows a stretch of original-language text with no indication
  *why* — the user cannot tell a transient failure from a broken extension.

## Goal

Fix the cache key so subtitle translations are keyed on everything that changes
their output (profile, knobs, glossary), never cache partial results, and add
chunk-level retry with a user-visible failure signal — all without touching the
working web-page cache path.

## Approach

### Cache-key revision — subtitle-only

A new `generateSubtitleCacheKey` folds in profile, resolved knobs, and glossary
state. The **shared `generateCacheKey` is untouched** — web/selection/PDF keep
byte-identical behavior. This is the cardinal regression guard: the web path is
the project's sensitive core, and the cross-path collision is theoretical
(subtitle cue text vs. web paragraphs rarely overlap); the bugs that actually
fire are all within the subtitle path.

```
subtitleKey = SHA-256(
  'subtitle'                  // namespace — isolates from web-path entries
  : src : tgt : text
  : profileKnobsHash          // resolved ProfileKnobs (preset + overrides)
  : glossaryHash              // user global glossary + rolling/film glossary
)
```

- **Namespace prefix** `subtitle:` cheaply isolates subtitle entries from web
  entries without a second cache layer. Old subtitle entries (under the bare
  key) orphan and TTL/LRU-evict out naturally — no explicit migration.
- **`profileKnobsHash`** — stable hash of the *resolved* `ProfileKnobs` (preset
  + global + per-tab overrides via `resolveEffectiveKnobs`). Different profiles
  → different keys → no cross-profile staleness.
- **`glossaryHash`** — hash of the user global glossary plus the current
  rolling/film proper-noun glossary snapshot. A cue re-translated after the
  glossary grows gets a fresh key.

Why not a richer *shared* key or a split cache: the shared-key change ripples to
4 call sites (web/subtitle/selection/PDF) and penalizes the web cache for a
subtitle fix; the split doubles maintenance (two eviction paths). Subtitle-only
fixes every actually-firing bug at the lowest blast radius.

### Partial-result guard

Before cache write-back in `translateChunk`, check `result.partial`. If true,
**skip caching** for the back-filled (source-text) cues — don't persist
source-text-as-translation. The successful cues in the same chunk still cache.

### Retry + user signal — chunk-level with backoff

**Chunk-level retry** wrapping the existing `service.translate` in
`translateChunk`:

- Up to **2 retries** with exponential backoff (~500ms, ~1s).
- **Abort early on 4xx** (`ApiError.statusCode` in 400–499) — bad model/auth
  won't recover from a retry.
- Cache-hits within the chunk remain free on each retry (only uncached cues are
  re-sent).

Why chunk-level (not adaptive sub-batch split): by the time a chunk fails,
`fetchWithRetry` already exhausted its 2 network retries — so the failure is
either persistent 5xx, 4xx, or poisoned JSON. Chunk retry with backoff handles
the common persistent-5xx case cheaply. The poison-cue case (one bad cue fails
the whole chunk's JSON) is real but rare; adaptive splitting is a clean *future*
extension point once failure data exists.

**User signal on final failure:**

- First-chunk failure: unchanged — already propagates to `{ success: false }`,
  which the coordinator surfaces.
- Background-chunk failure: new behavior — emit `SUBTITLE_CHUNK_FAILED` so the
  coordinator surfaces a non-blocking toast ("A section of subtitles couldn't
  be translated — showing original"). Failed cues keep their original text
  (already the case) rather than going blank.

## Components

### A. `lib/subtitleCacheKey.ts` — pure cache-key builder (new file)

```ts
import type { ProfileKnobs } from '@/lib/subtitleProfiles';

export interface GlossarySnapshot {
  /** User global glossary entries (source→target) relevant to the chunk. */
  globalEntries: Array<{ source: string; target: string }>;
  /** Rolling + film proper-noun glossary names, sorted for determinism. */
  properNouns: string[];
}

/** Stable hex hash of resolved ProfileKnobs (register/faithfulness/brevity/profanity). */
export function hashKnobs(knobs: ProfileKnobs): string;

/** Stable hex hash of a glossary snapshot (order-independent). */
export function hashGlossary(snapshot: GlossarySnapshot): string;

/** Full subtitle cache key: namespace + langs + text + knobs + glossary. */
export function generateSubtitleCacheKey(
  text: string,
  sourceLanguage: string,
  targetLanguage: string,
  knobs: ProfileKnobs,
  glossarySnapshot: GlossarySnapshot,
): Promise<string>;
```

Pure, no I/O beyond `crypto.subtle` (already used by `cacheManager`). Mirrors
the `subtitleTiming`/`subtitleWrap` pure-module pattern.

### B. `lib/subtitleRetry.ts` — pure retry-with-backoff (new file)

```ts
export interface RetryOptions {
  maxRetries: number;          // total attempts beyond the first
  baseDelayMs: number;         // backoff = baseDelayMs * 2^(attempt-1)
  shouldRetry: (error: unknown) => boolean;  // false on 4xx, true otherwise
}

/** Run `fn`, retrying per shouldRetry up to maxRetries, with backoff between. */
export async function withRetry<T>(fn: () => Promise<T>, opts: RetryOptions): Promise<T>;
```

Used to build a chunk-retry wrapper that knows about `ApiError.statusCode`.
The retryable predicate (mirroring `fetchWithRetry` at
`services/openaiCompatible.ts:384`):

```ts
import { ApiError } from '@/services/openaiCompatible';
// Retry on anything EXCEPT 4xx client errors (bad model/auth won't recover).
const isRetryable = (e: unknown): boolean =>
  !(e instanceof ApiError && e.statusCode >= 400 && e.statusCode < 500);
```

`ApiError` is already exported (`services/openaiCompatible.ts:24`) with a
`readonly statusCode: number` field. `service.translate` returns
`{ success: false, error }` rather than throwing on HTTP failures, so the chunk
retry operates on the `success` flag: if `success === false` and the error
string indicates a retryable condition, retry; the wrapper normalizes this.
(See Testing §2 — the unit tests cover the thrown-error path of `withRetry`
directly; the integration test covers the `success === false` normalization in
`translateChunk`.)

### C. `services/background.ts` — cache key + partial guard + retry (edits)

In `translateChunk`:

- Replace `getCachedTranslation(cue.text, src, tgt, ttl)` with a read against
  `generateSubtitleCacheKey(...)`. The resolved `ProfileKnobs` and current
  glossary snapshot are already in scope at the call site (profile resolution
  at `background.ts:411-419`, glossary at `424-450`).
- Wrap `service.translate(...)` in `withChunkRetry(...)`.
- Before write-back (`background.ts:526`), check `result.partial`: skip caching
  for back-filled cues (keep caching the successful ones).
- Background-chunk catch (`background.ts:640`): emit `SUBTITLE_CHUNK_FAILED`
  (best-effort message to the sender tab) in addition to the `console.warn`.

### D. `content/subtitleCoordinator.ts` — failure toast (edit)

Handle `SUBTITLE_CHUNK_FAILED` → surface a non-blocking toast via the existing
`subtitleToast` infra (`content/subtitleToast.ts`). Idempotent within a short
window so a stream of failed chunks doesn't toast-spam.

## Data flow

```
translateChunk(chunkCues, contextCues)
   │  resolve ProfileKnobs (already in scope) + build GlossarySnapshot
   │
   ├─ per cue: generateSubtitleCacheKey(text, src, tgt, knobs, glossary) → read
   │     hit  → use cached translation
   │     miss → collect for LLM
   │
   ├─ withChunkRetry(() => service.translate(uncached, { subtitleKnobs, ... }))
   │     4xx  → fail fast (no retry)
   │     5xx  → backoff + retry (≤2)
   │     ok   → map translations
   │
   ├─ result.partial? → skip caching back-filled cues; cache the rest
   │  otherwise       → cache all under subtitle key
   │
   └─ on final failure: emit SUBTITLE_CHUNK_FAILED → coordinator toast
```

Web-page / selection / PDF paths continue to call the untouched
`getCachedTranslation` / `cacheTranslation` with `SHA-256(src:tgt:text)`.

## Scope boundaries (what this sub-project is NOT)

- ❌ No web-page / selection / PDF cache changes (`generateCacheKey` untouched).
- ❌ No poison-cue adaptive splitting (future extension point; needs failure
  data first).
- ❌ No new cache settings / UI (constants in modules).
- ❌ No eviction changes (existing daily LRU handles orphaned old keys).
- ❌ No translation-quality changes (profiles/glossary already feed the prompt;
  this sub-project only makes the *cache* respect them).
- ✅ All subtitle profiles/sites benefit.

## Testing strategy

1. **Unit — `lib/subtitleCacheKey.ts`** (new):
   - Same `(text, langs)` under different knobs → different keys; same knobs →
     identical key (determinism).
   - Glossary change (added entry / added proper-noun) → different key;
     unchanged glossary → same key.
   - Namespace prefix `'subtitle:'` present; distinct from the bare
     `generateCacheKey` output for the same inputs.
   - Order-independence: glossary entries in different orders hash the same.
2. **Unit — `lib/subtitleRetry.ts`** (new):
   - Retries on a thrown error up to `maxRetries`, then rethrows.
   - `shouldRetry` returning `false` (4xx) → no retry, immediate rethrow.
   - Succeeds on attempt N (transient) → returns the value, no further retries.
   - Backoff delays increase exponentially (use fake timers).
3. **Integration — `translateChunk`** (extend `background` tests):
   - Partial result (`partial: true`) → cache write skipped for back-filled
     cues; successful cues still cached under the subtitle key.
   - Mocked 5xx on first attempt → retry fires → success on second attempt →
     cues translated once (not duplicated).
   - Mocked 4xx → no retry, chunk fails, `SUBTITLE_CHUNK_FAILED` emitted for a
     background chunk.
4. **Integration — coordinator**: `SUBTITLE_CHUNK_FAILED` → toast surfaced;
   failed cues retain original text; idempotent (no toast-spam on a stream).
5. **Regression — web path**: the web-page path still calls the unmodified
   `getCachedTranslation` / `cacheTranslation` (assert the new subtitle key
   function is not imported by any web/selection/PDF path).

## Files touched

| File | Change | New? |
|---|---|---|
| `lib/subtitleCacheKey.ts` | `generateSubtitleCacheKey`, `hashKnobs`, `hashGlossary`, `GlossarySnapshot` | ✅ new |
| `lib/subtitleRetry.ts` | `withRetry`, `RetryOptions` | ✅ new |
| `lib/__tests__/subtitleCacheKey.test.ts`, `lib/__tests__/subtitleRetry.test.ts` | Unit tests above | ✅ new |
| `services/background.ts` | Subtitle cache key + partial guard + chunk retry + `SUBTITLE_CHUNK_FAILED` emit | edit |
| `content/subtitleCoordinator.ts` | Handle `SUBTITLE_CHUNK_FAILED` → toast | edit |
| `types/messages.ts` | `SUBTITLE_CHUNK_FAILED` message type | edit |
| `services/__tests__/background.test.ts`, `content/__tests__/subtitleCoordinator.test.ts` | Integration + regression | edit |

Net new production logic ≈ 120 lines (two pure helpers + surgical background
edits + coordinator handler).

## Success criteria

- A cue translated under one profile is not served from cache under a different
  profile.
- A cue re-translated after the glossary grows gets a fresh translation.
- Partial (source-back-filled) results are never cached.
- A transiently-failing chunk is retried (not immediately swallowed); a 4xx
  fails fast (no retry).
- A permanently-failed background chunk surfaces a user-visible signal (no
  silent swallow).
- Web-page cache behavior byte-for-byte unchanged (regression guard).

## Roadmap context

This is sub-project **6** (final) of the subtitle-quality pipeline. Siblings:
2. Context & continuity (merged).
3. Per-film proper-noun extraction (merged).
4. User-facing style override controls (merged).
5a. Reading-speed & timing adaptation (merged).
5b. Line-wrapping (merged).
**6. Context-aware cache & robustness (this spec).**
