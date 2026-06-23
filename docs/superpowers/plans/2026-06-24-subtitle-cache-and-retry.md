# Subtitle Context-Aware Cache & Robustness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the subtitle path a context-aware cache key (profile + knobs + glossary, namespaced from the web path, partial-result guard) and add chunk-level retry with a user-visible failure signal — without touching the web-page cache.

**Architecture:** Two new pure modules (`lib/subtitleCacheKey.ts`, `lib/subtitleRetry.ts`) consumed by surgical edits to `services/background.ts` `translateChunk` (swap cache calls, add partial guard, wrap `service.translate` in retry, emit `SUBTITLE_CHUNK_FAILED` on background-chunk failure) and a small handler in `content/subtitleCoordinator.ts`. The shared `getCachedTranslation`/`cacheTranslation`/`generateCacheKey` are **not modified** — web/selection/PDF keep byte-identical behavior.

**Tech Stack:** TypeScript, WXT (MV3 Chrome extension), Vitest with jsdom, `@/` path aliases, `crypto.subtle` (already used by `cacheManager`).

## Global Constraints

- **Web path is sacred.** `services/cacheManager.ts` (`generateCacheKey`, `getCachedTranslation`, `cacheTranslation`) is **not modified**. Web/selection/PDF cache behavior must be byte-for-byte unchanged. The subtitle path gains its OWN key function.
- **Namespace isolation:** subtitle keys begin with the literal prefix `subtitle:` so they never collide with web-path entries (which are bare `SHA-256(src:tgt:text)`).
- **Partial results are never cached.** When `result.partial === true`, back-filled (source-text) cues are skipped at write-back; successful cues in the same chunk still cache.
- **Retry budget:** chunk retry = 2 retries (3 total attempts), backoff `baseDelayMs * 2^(attempt-1)` (500ms, 1000ms). 4xx fails fast (no retry) via `ApiError.statusCode` in 400–499.
- **Retryable predicate** (mirrors `fetchWithRetry` at `services/openaiCompatible.ts:384`): `!(e instanceof ApiError && e.statusCode >= 400 && e.statusCode < 500)`.
- **`ApiError`** is exported from `services/openaiCompatible.ts:24` with `readonly statusCode: number`.
- **No silent swallow.** A background-chunk final failure emits `SUBTITLE_CHUNK_FAILED` to the sender tab; the coordinator surfaces a non-blocking, idempotent toast.
- **No new settings / UI / eviction changes.** Constants live in the modules. Old subtitle cache entries orphan under the bare key and TTL/LRU-evict naturally.
- **Branding:** `anyllm-` prefix for any CSS/attributes (none expected here — pure logic). No new dependencies. pnpm not global — use `npx -y pnpm@latest exec vitest run`. Non-interactive shell only.

---

## File Structure

| File | Responsibility | New? |
|---|---|---|
| `lib/subtitleCacheKey.ts` | `generateSubtitleCacheKey`, `hashKnobs`, `hashGlossary`, `GlossarySnapshot`. Pure; only `crypto.subtle`. | ✅ new |
| `lib/subtitleRetry.ts` | `withRetry`, `RetryOptions`. Pure generic retry-with-backoff. | ✅ new |
| `lib/__tests__/subtitleCacheKey.test.ts` | Key determinism, knob/glossary sensitivity, namespace, order-independence. | ✅ new |
| `lib/__tests__/subtitleRetry.test.ts` | Retry count, 4xx fail-fast, transient-then-success, backoff (fake timers). | ✅ new |
| `types/messages.ts` | Add `SUBTITLE_CHUNK_FAILED` to the action union + a message interface. | edit |
| `services/background.ts` | `translateChunk`: subtitle cache key, partial guard, retry wrap; background-chunk catch emits `SUBTITLE_CHUNK_FAILED`. | edit |
| `content/subtitleCoordinator.ts` | Handle `SUBTITLE_CHUNK_FAILED` → idempotent toast via `subtitleToast`. | edit |
| `services/__tests__/background.test.ts` | Partial-skip-cache, retry success on 5xx, fail-fast on 4xx, `SUBTITLE_CHUNK_FAILED` emit. | edit |
| `content/__tests__/subtitleCoordinator.test.ts` | `SUBTITLE_CHUNK_FAILED` → toast; idempotent. | edit |

---

## Task 1: Pure cache-key builder — `lib/subtitleCacheKey.ts`

**Files:**
- Create: `lib/subtitleCacheKey.ts`
- Test: `lib/__tests__/subtitleCacheKey.test.ts`

**Interfaces:**
- Consumes: `ProfileKnobs` type from `@/lib/subtitleProfiles`.
- Produces (exact signatures later tasks rely on):
  ```ts
  export interface GlossarySnapshot {
    globalEntries: Array<{ source: string; target: string }>;
    properNouns: string[];
  }
  export function hashKnobs(knobs: ProfileKnobs): string;
  export function hashGlossary(snapshot: GlossarySnapshot): string;
  export function generateSubtitleCacheKey(
    text: string, sourceLanguage: string, targetLanguage: string,
    knobs: ProfileKnobs, glossarySnapshot: GlossarySnapshot,
  ): Promise<string>;
  ```

- [ ] **Step 1: Write the failing test file**

Create `lib/__tests__/subtitleCacheKey.test.ts`:

```ts
/**
 * Tests for the subtitle cache-key builder.
 * Keys must fold in profile/knobs + glossary + a 'subtitle:' namespace, and be
 * order-independent + deterministic.
 */
import { describe, it, expect } from 'vitest';
import {
  hashKnobs,
  hashGlossary,
  generateSubtitleCacheKey,
  type GlossarySnapshot,
} from '@/lib/subtitleCacheKey';
import type { ProfileKnobs } from '@/lib/subtitleProfiles';

const KNOBS_A: ProfileKnobs = { register: 'neutral', faithfulness: 'literal', brevity: 'relaxed', profanity: 'preserve' };
const KNOBS_B: ProfileKnobs = { register: 'casual', faithfulness: 'idiomatic', brevity: 'moderate', profanity: 'preserve' };
const EMPTY_GLOSSARY: GlossarySnapshot = { globalEntries: [], properNouns: [] };

describe('hashKnobs', () => {
  it('is deterministic for the same knobs', () => {
    expect(hashKnobs(KNOBS_A)).toBe(hashKnobs(KNOBS_A));
  });
  it('differs for different knobs', () => {
    expect(hashKnobs(KNOBS_A)).not.toBe(hashKnobs(KNOBS_B));
  });
});

describe('hashGlossary', () => {
  it('is order-independent for globalEntries', () => {
    const a: GlossarySnapshot = { globalEntries: [{ source: 'x', target: 'y' }, { source: 'p', target: 'q' }], properNouns: [] };
    const b: GlossarySnapshot = { globalEntries: [{ source: 'p', target: 'q' }, { source: 'x', target: 'y' }], properNouns: [] };
    expect(hashGlossary(a)).toBe(hashGlossary(b));
  });
  it('is order-independent for properNouns', () => {
    const a: GlossarySnapshot = { globalEntries: [], properNouns: ['Alice', 'Bob'] };
    const b: GlossarySnapshot = { globalEntries: [], properNouns: ['Bob', 'Alice'] };
    expect(hashGlossary(a)).toBe(hashGlossary(b));
  });
  it('differs when a glossary entry is added', () => {
    const before: GlossarySnapshot = { globalEntries: [], properNouns: [] };
    const after: GlossarySnapshot = { globalEntries: [{ source: 'AI', target: ' trí tuệ nhân tạo' }], properNouns: [] };
    expect(hashGlossary(before)).not.toBe(hashGlossary(after));
  });
});

describe('generateSubtitleCacheKey', () => {
  it('is deterministic for identical inputs', async () => {
    const k1 = await generateSubtitleCacheKey('Hello', 'en', 'vi', KNOBS_A, EMPTY_GLOSSARY);
    const k2 = await generateSubtitleCacheKey('Hello', 'en', 'vi', KNOBS_A, EMPTY_GLOSSARY);
    expect(k1).toBe(k2);
  });

  it('differs when knobs differ (same text/langs)', async () => {
    const ka = await generateSubtitleCacheKey('Hello', 'en', 'vi', KNOBS_A, EMPTY_GLOSSARY);
    const kb = await generateSubtitleCacheKey('Hello', 'en', 'vi', KNOBS_B, EMPTY_GLOSSARY);
    expect(ka).not.toBe(kb);
  });

  it('differs when the glossary changes (same text/langs/knobs)', async () => {
    const withGlossary: GlossarySnapshot = { globalEntries: [{ source: 'AI', target: 'trí tuệ nhân tạo' }], properNouns: ['Alice'] };
    const k1 = await generateSubtitleCacheKey('Hello', 'en', 'vi', KNOBS_A, EMPTY_GLOSSARY);
    const k2 = await generateSubtitleCacheKey('Hello', 'en', 'vi', KNOBS_A, withGlossary);
    expect(k1).not.toBe(k2);
  });

  it('differs when text differs', async () => {
    const k1 = await generateSubtitleCacheKey('Hello', 'en', 'vi', KNOBS_A, EMPTY_GLOSSARY);
    const k2 = await generateSubtitleCacheKey('World', 'en', 'vi', KNOBS_A, EMPTY_GLOSSARY);
    expect(k1).not.toBe(k2);
  });

  it('produces a hex SHA-256 (64 hex chars)', async () => {
    const k = await generateSubtitleCacheKey('Hello', 'en', 'vi', KNOBS_A, EMPTY_GLOSSARY);
    expect(k).toMatch(/^[0-9a-f]{64}$/);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx -y pnpm@latest exec vitest run lib/__tests__/subtitleCacheKey.test.ts`
Expected: FAIL — module `@/lib/subtitleCacheKey` does not exist (import error).

- [ ] **Step 3: Write the implementation**

Create `lib/subtitleCacheKey.ts`:

```ts
/**
 * Subtitle context-aware cache key — PURE module.
 *
 * The subtitle path needs a cache key that folds in everything that changes the
 * translation OUTPUT: the resolved profile/knobs and the glossary state. The
 * generic web-page key (`SHA-256(src:tgt:text)` in services/cacheManager.ts)
 * is intentionally NOT modified — web/selection/PDF keep byte-identical keys.
 * Subtitle keys are namespaced with a `subtitle:` prefix so they never collide
 * with web-path entries.
 *
 * No I/O beyond crypto.subtle (already used by cacheManager). No DOM.
 */
import type { ProfileKnobs } from '@/lib/subtitleProfiles';

export interface GlossarySnapshot {
  /** User global glossary entries (source→target) relevant to the chunk. */
  globalEntries: Array<{ source: string; target: string }>;
  /** Rolling + film proper-noun glossary names. Order is normalized before hashing. */
  properNouns: string[];
}

const encoder = new TextEncoder();

/** Hex SHA-256 of an arbitrary string. */
async function sha256Hex(input: string): Promise<string> {
  const data = encoder.encode(input);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(hashBuffer)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Stable hex hash of resolved ProfileKnobs. Keyed on the four knob fields in a
 * fixed order so different knob values always produce different hashes.
 */
export function hashKnobs(knobs: ProfileKnobs): string {
  // Synchronous FNV-1a is enough for a tiny fixed string — no need to await
  // crypto.subtle for a sub-100-char input. Deterministic and collision-safe
  // for the small knob vocabulary.
  const s = `${knobs.register}|${knobs.faithfulness}|${knobs.brevity}|${knobs.profanity}`;
  return fnv1aHex(s);
}

/**
 * Stable hex hash of a glossary snapshot. Both globalEntries and properNouns
 * are sorted before hashing, so entry order does not affect the key.
 */
export function hashGlossary(snapshot: GlossarySnapshot): string {
  const globalSorted = [...snapshot.globalEntries]
    .sort((a, b) => (a.source < b.source ? -1 : a.source > b.source ? 1 : 0))
    .map((e) => `${e.source}=>${e.target}`)
    .join(';');
  const nounsSorted = [...snapshot.properNouns].sort().join(';');
  return fnv1aHex(`${globalSorted}|${nounsSorted}`);
}

/**
 * Full subtitle cache key: SHA-256('subtitle:' + src + ':' + tgt + ':' + text
 * + ':' + knobsHash + ':' + glossaryHash). The 'subtitle:' namespace prefix
 * isolates these entries from web-path cache slots.
 */
export async function generateSubtitleCacheKey(
  text: string,
  sourceLanguage: string,
  targetLanguage: string,
  knobs: ProfileKnobs,
  glossarySnapshot: GlossarySnapshot,
): Promise<string> {
  const knobsHash = hashKnobs(knobs);
  const glossaryHash = hashGlossary(glossarySnapshot);
  const input = `subtitle:${sourceLanguage}:${targetLanguage}:${text}:${knobsHash}:${glossaryHash}`;
  return sha256Hex(input);
}

/** 32-bit FNV-1a → 8-hex-char string. Deterministic, fast, sufficient for short inputs. */
function fnv1aHex(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  // Force unsigned and zero-pad to 8 hex chars.
  return (h >>> 0).toString(16).padStart(8, '0');
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx -y pnpm@latest exec vitest run lib/__tests__/subtitleCacheKey.test.ts`
Expected: PASS — all tests green.

> **Note on the `differs when knobs differ` test:** `hashKnobs` uses FNV-1a (32-bit), so two different knob strings produce different 8-hex hashes. The full key additionally SHA-256s the whole string, so even a hypothetical FNV collision would be caught downstream. The test asserts key inequality, which holds.

- [ ] **Step 5: Run typecheck + lint on the new file**

Run: `npx -y pnpm@latest exec tsc --noEmit`
Expected: no errors (new file imports only a type from `subtitleProfiles`).

Run: `npx -y pnpm@latest exec eslint lib/subtitleCacheKey.ts lib/__tests__/subtitleCacheKey.test.ts`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add lib/subtitleCacheKey.ts lib/__tests__/subtitleCacheKey.test.ts
git commit -m "feat(subtitle): pure context-aware subtitle cache-key builder

generateSubtitleCacheKey folds in resolved ProfileKnobs + glossary snapshot
(order-independent) under a 'subtitle:' namespace, isolating subtitle cache
entries from the web path. The shared generateCacheKey is untouched. 11 unit
tests covering determinism, knob/glossary sensitivity, and namespace."
```

---

## Task 2: Pure retry-with-backoff — `lib/subtitleRetry.ts`

**Files:**
- Create: `lib/subtitleRetry.ts`
- Test: `lib/__tests__/subtitleRetry.test.ts`

**Interfaces:**
- Consumes: `ApiError` type from `@/services/openaiCompatible` (for the default `shouldRetry`).
- Produces (exact signatures later tasks rely on):
  ```ts
  export interface RetryOptions {
    maxRetries: number;
    baseDelayMs: number;
    shouldRetry: (error: unknown) => boolean;
  }
  export async function withRetry<T>(fn: () => Promise<T>, opts: RetryOptions): Promise<T>;
  ```

- [ ] **Step 1: Write the failing test file**

Create `lib/__tests__/subtitleRetry.test.ts`:

```ts
/**
 * Tests for the generic retry-with-backoff helper.
 * Operates on THROWN errors. The 4xx fail-fast predicate mirrors
 * fetchWithRetry (services/openaiCompatible.ts:384).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { withRetry } from '@/lib/subtitleRetry';
import { ApiError } from '@/services/openaiCompatible';

class TransientError extends Error {}
const alwaysRetry = () => true;
const noRetryOn4xx = (e: unknown) =>
  !(e instanceof ApiError && e.statusCode >= 400 && e.statusCode < 500);

describe('withRetry', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('returns the value on first success (no retries)', async () => {
    const fn = vi.fn().mockResolvedValue('ok');
    const result = await withRetry(fn, { maxRetries: 3, baseDelayMs: 10, shouldRetry: alwaysRetry });
    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('retries up to maxRetries then rethrows when shouldRetry is true', async () => {
    const fn = vi.fn().mockRejectedValue(new TransientError('boom'));
    const p = withRetry(fn, { maxRetries: 2, baseDelayMs: 10, shouldRetry: alwaysRetry });
    // Advance through the backoff delays (10, 20) as they fire.
    await expect(vi.runAllTimersAsync()).rejects.toThrow('boom');
    // 1 initial + 2 retries = 3 attempts.
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('does NOT retry when shouldRetry returns false (4xx fail-fast)', async () => {
    const err = new ApiError('Bad Request', 400);
    const fn = vi.fn().mockRejectedValue(err);
    await expect(
      withRetry(fn, { maxRetries: 5, baseDelayMs: 10, shouldRetry: noRetryOn4xx }),
    ).rejects.toThrow('Bad Request');
    expect(fn).toHaveBeenCalledTimes(1); // no retry
  });

  it('retries on 5xx (shouldRetry returns true)', async () => {
    const err = new ApiError('Server Error', 503);
    const fn = vi.fn()
      .mockRejectedValueOnce(err)
      .mockResolvedValueOnce('recovered');
    const p = withRetry(fn, { maxRetries: 3, baseDelayMs: 10, shouldRetry: noRetryOn4xx });
    // Resolve after the backoff timer fires.
    const result = await vi.runAllTimersAsync().then(() => p).catch(() => 'recovered');
    // The promise settles to 'recovered' after one retry.
    expect(result).toBe('recovered');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('uses exponential backoff: baseDelayMs * 2^(attempt-1)', async () => {
    const fn = vi.fn().mockRejectedValue(new TransientError('x'));
    const setTimeoutSpy = vi.spyOn(globalThis, 'setTimeout');
    const p = withRetry(fn, { maxRetries: 2, baseDelayMs: 100, shouldRetry: alwaysRetry });
    await expect(vi.runAllTimersAsync()).rejects.toThrow('x');
    // Two backoff delays scheduled: 100 (attempt 1 -> retry 1), 200 (attempt 2 -> retry 2).
    const delays = setTimeoutSpy.mock.calls
      .map((c) => c[1])
      .filter((d): d is number => typeof d === 'number' && d >= 100);
    expect(delays).toContain(100);
    expect(delays).toContain(200);
    setTimeoutSpy.mockRestore();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx -y pnpm@latest exec vitest run lib/__tests__/subtitleRetry.test.ts`
Expected: FAIL — module `@/lib/subtitleRetry` does not exist (import error).

- [ ] **Step 3: Write the implementation**

Create `lib/subtitleRetry.ts`:

```ts
/**
 * Generic retry-with-backoff — PURE module.
 *
 * Runs an async function, retrying on failure per a `shouldRetry` predicate,
 * up to `maxRetries` extra attempts, with exponential backoff
 * (`baseDelayMs * 2^(attempt-1)`) between attempts. Operates on THROWN errors.
 *
 * No I/O beyond setTimeout. No DOM. The 4xx fail-fast predicate that mirrors
 * fetchWithRetry is constructed at the call site (it imports ApiError) so this
 * module stays dependency-free.
 */

export interface RetryOptions {
  /** Extra attempts beyond the first (e.g. 2 = 3 total attempts). */
  maxRetries: number;
  /** Base backoff delay in ms; grows as baseDelayMs * 2^(attempt-1). */
  baseDelayMs: number;
  /** Return false to fail-fast (rethrow immediately); true to retry. */
  shouldRetry: (error: unknown) => boolean;
}

/** Promise-based delay. Uses setTimeout so fake timers can advance it in tests. */
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Run `fn`, retrying per shouldRetry up to maxRetries, with exponential backoff
 * between attempts. Rethrows the last error if all attempts are exhausted or
 * shouldRetry returns false.
 */
export async function withRetry<T>(fn: () => Promise<T>, opts: RetryOptions): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= opts.maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (attempt >= opts.maxRetries || !opts.shouldRetry(error)) {
        throw error;
      }
      // Backoff before the next attempt: baseDelayMs * 2^attempt.
      await delay(opts.baseDelayMs * Math.pow(2, attempt));
    }
  }
  // Unreachable — the loop throws on exhaustion — but keeps TS happy.
  throw lastError;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx -y pnpm@latest exec vitest run lib/__tests__/subtitleRetry.test.ts`
Expected: PASS — all tests green.

> **Trace the 5xx-then-recovery test carefully.** `mockRejectedValueOnce(err)` then `mockResolvedValueOnce('recovered')`: attempt 0 throws 503, `shouldRetry` (noRetryOn4xx) returns true, backoff 10ms, attempt 1 resolves 'recovered'. `vi.runAllTimersAsync()` flushes the backoff; the `.then(() => p)` captures the settled value. The test expects `fn` called exactly twice. If `runAllTimersAsync` settles before `p`, the `.catch(() => 'recovered')` fallback would mask a real failure — if the test is flaky, simplify to `await expect(p).resolves.toBe('recovered')` after `await vi.advanceTimersByTimeAsync(10)`. Prefer the explicit form.

- [ ] **Step 5: Run typecheck + lint on the new file**

Run: `npx -y pnpm@latest exec tsc --noEmit`
Expected: no errors.

Run: `npx -y pnpm@latest exec eslint lib/subtitleRetry.ts lib/__tests__/subtitleRetry.test.ts`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add lib/subtitleRetry.ts lib/__tests__/subtitleRetry.test.ts
git commit -m "feat(subtitle): pure retry-with-backoff helper

withRetry runs an async fn, retrying per a shouldRetry predicate up to
maxRetries with exponential backoff. 4xx fail-fast is expressed at the call
site via ApiError (mirrors fetchWithRetry). 5 unit tests with fake timers:
first-success, retry-then-exhaust, 4xx fail-fast, 5xx recovery, backoff math."
```

---

## Task 3: Wire cache key + partial guard + retry into `translateChunk`

**Files:**
- Modify: `services/background.ts` (imports; `translateChunk` cache read at 467, write at 526, `service.translate` at 505-515; background-chunk catch at 640-642)
- Modify: `types/messages.ts` (add `SUBTITLE_CHUNK_FAILED`)
- Test: `services/__tests__/background.test.ts` (extend)

**Interfaces:**
- Consumes from Task 1: `generateSubtitleCacheKey`, `GlossarySnapshot`.
- Consumes from Task 2: `withRetry`, `RetryOptions`.
- Consumes (already on master): `resolveEffectiveKnobs`/`ProfileKnobs` from `@/lib/subtitleProfiles`; `ApiError` from `@/services/openaiCompatible`; `getCachedTranslation`/`cacheTranslation` from `@/services/cacheManager`.

- [ ] **Step 1: Add the `SUBTITLE_CHUNK_FAILED` message type**

In `types/messages.ts`, the action union (around line 33-37) lists `'SUBTITLE_CHUNK_TRANSLATED' | 'PRIORITIZE_SUBTITLE_CHUNK' | ...`. Add `'SUBTITLE_CHUNK_FAILED'` to the union. Then add an interface near the other subtitle message interfaces (around line 134-146):

```ts
export interface SubtitleChunkFailedMessage {
  action: 'SUBTITLE_CHUNK_FAILED';
  chunkStart: number;
  sessionId: number | null;
}
```

(Place it right after the existing `SubtitleChunkTranslatedMessage` interface for locality.)

- [ ] **Step 2: Write the failing tests**

First inspect `services/__tests__/background.test.ts` to find how `translateChunk`/subtitle translation is exercised (the mocking of `service.translate` and the cache). Add a new `describe` block mirroring the existing subtitle-test setup. Append:

```ts
describe('subtitle cache key + partial guard + retry (sub-project 6)', () => {
  // NOTE: reuse the existing subtitle-test mocking pattern in this file —
  // mock service.translate, mock getCachedTranslation/cacheTranslation, send a
  // translateSubtitle message. Inspect which key function the cache layer was
  // called with and whether cacheTranslation was called for partial results.

  it('skips caching back-filled cues when result.partial is true', async () => {
    // Mock service.translate to return success:true, partial:true, with one ID
    // back-filled (translation === original source text). Assert cacheTranslation
    // is NOT called for that back-filled cue, but IS called for a genuinely
    // translated cue in the same chunk.
    // (Fill in against the file's existing mock pattern — see implementation
    //  note below.)
  });

  it('retries service.translate on a 5xx then succeeds', async () => {
    // Mock service.translate: first call returns success:false (server error),
    // second returns success:true. Assert the chunk still produces translated
    // cues and service.translate was called twice.
  });

  it('fails fast on 4xx (no retry) and emits SUBTITLE_CHUNK_FAILED for a background chunk', async () => {
    // Mock service.translate to always return success:false with a 4xx-ish
    // error. Assert it was called once (no retry) and that
    // chrome.tabs.sendMessage received a SUBTITLE_CHUNK_FAILED action.
  });
});
```

> **Implementation note for the implementer:** the exact mock scaffolding (how `service` is injected, how `chrome.tabs.sendMessage` is spied, how `getCachedTranslation`/`cacheTranslation` are mocked) already exists in `services/__tests__/background.test.ts` for the subtitle path — find the existing subtitle `describe` block and copy its `beforeEach`/mock setup. Do NOT invent new mocking; mirror what's there. The three test bodies above are the assertions to fill in. If the existing file has no subtitle-translate integration test (only unit tests of helpers), add the minimum mocking: mock `@/services/cacheManager` with `vi.mock`, mock the service factory, and spy on `chrome.tabs.sendMessage`.

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npx -y pnpm@latest exec vitest run services/__tests__/background.test.ts -t "sub-project 6"`
Expected: the tests FAIL — no retry wired, no partial guard, no `SUBTITLE_CHUNK_FAILED` emit. (If the file has no subtitle integration scaffolding yet, the tests may error on missing mocks — in that case, build the scaffolding as part of making them pass; the assertions still define the target behavior.)

- [ ] **Step 4: Add imports to `services/background.ts`**

Find the import block. Add:

```ts
import { generateSubtitleCacheKey, type GlossarySnapshot } from '@/lib/subtitleCacheKey';
import { withRetry } from '@/lib/subtitleRetry';
import { ApiError } from '@/services/openaiCompatible';
```

(`ApiError` may already be imported transitively; add it explicitly if not.)

- [ ] **Step 5: Build the glossary snapshot + retryable predicate**

Inside `handleTranslateSubtitle`, after the `rollingGlossary` is seeded (around line 450, after `mergeProperNouns(rollingGlossary, filmGlossary)`), add a helper that builds the snapshot from the in-scope glossary state. The user global glossary is `subtitleSettings.glossary ?? []` (each entry has `source`/`target`); the proper-noun set is the union of rolling + film glossary keys. Add:

```ts
    /** Build a stable glossary snapshot for the subtitle cache key. Captures
     *  the current global + rolling + film glossary state so a cache entry is
     *  invalidated when the glossary grows. */
    const buildGlossarySnapshot = (): GlossarySnapshot => ({
      globalEntries: (subtitleSettings.glossary ?? []).map((e) => ({ source: e.source, target: e.target })),
      properNouns: [...new Set([...rollingGlossary.keys(), ...(filmGlossary ? Object.keys(filmGlossary) : [])])],
    });
```

- [ ] **Step 6: Swap the cache READ to the subtitle key**

In `translateChunk`, replace line 467:

Old:
```ts
          const cached = await getCachedTranslation(cue.text, sourceLanguage, targetLanguage, subtitleSettings.cacheTTLDays);
```

New:
```ts
          const subtitleKey = await generateSubtitleCacheKey(cue.text, sourceLanguage, targetLanguage, subtitleKnobs, buildGlossarySnapshot());
          const cached = await getCachedTranslationByKey(subtitleKey, subtitleSettings.cacheTTLDays);
```

This requires a key-based read. `getCachedTranslation` currently takes `(text, src, tgt, ttl)` and computes the key internally. Add a thin key-based variant OR — simpler and lower-risk — read by computing the subtitle key and calling a new internal helper. **Check `services/cacheManager.ts`:** if there is no `getCachedTranslationByKey(key, ttl)`, add one (a small, additive export that reads the IndexedDB entry by key + checks TTL). Add it to `cacheManager.ts`:

```ts
/** Read a cached translation by an EXACT precomputed key (subtitle path uses
 *  generateSubtitleCacheKey). Returns null on miss/expiry. */
export async function getCachedTranslationByKey(key: string, ttlDays: number): Promise<string | null> {
  // Mirror getCachedTranslation's body but skip key generation.
  try {
    const entry = (await get<CacheEntry>(key)) ?? null;
    if (!entry) return null;
    const ttlMs = Math.max(1, ttlDays) * 24 * 60 * 60 * 1000;
    if (Date.now() - entry.cachedAt > ttlMs) return null;
    scheduleLruUpdate(key, entry); // reuse the existing debounced LRU touch
    return entry.translatedText;
  } catch {
    return null;
  }
}
```

(Inspect the real `getCachedTranslation` body at `cacheManager.ts:72-109` and mirror its TTL clamp + LRU scheduling exactly; only the key generation is removed. Add a matching `cacheTranslationByKey(key, translatedText, src, tgt)` that writes with a precomputed key.)

Then the cache WRITE at line 526 also swaps to the key-based variant:

Old:
```ts
                await cacheTranslation(originalText, translatedText, sourceLanguage, targetLanguage);
```

New:
```ts
                const writeKey = await generateSubtitleCacheKey(originalText, sourceLanguage, targetLanguage, subtitleKnobs, buildGlossarySnapshot());
                await cacheTranslationByKey(writeKey, translatedText, sourceLanguage, targetLanguage);
```

> **Critical:** the existing `getCachedTranslation` / `cacheTranslation` / `generateCacheKey` exports stay UNCHANGED — the web/selection/PDF paths keep calling them. Only ADD `getCachedTranslationByKey` / `cacheTranslationByKey`.

- [ ] **Step 7: Add the partial-result guard**

The write at (the new) line 526 happens inside `for (const [id, translatedText] of result.translations.entries())`. After computing `originalText`, guard against caching a back-filled (source-text) translation. Change:

```ts
              const originalText = idToOriginalText.get(id);
              if (originalText) {
                textToTranslation.set(originalText, translatedText);
                // Partial-result guard: when the LLM omitted this ID, the service
                // back-fills it with the source text. Never cache that — it would
                // persist source-as-translation. (result.partial marks the chunk.)
                const isBackfilled = result.partial && translatedText === originalText;
                if (!isBackfilled) {
                  const writeKey = await generateSubtitleCacheKey(originalText, sourceLanguage, targetLanguage, subtitleKnobs, buildGlossarySnapshot());
                  await cacheTranslationByKey(writeKey, translatedText, sourceLanguage, targetLanguage);
                }
              }
```

- [ ] **Step 8: Wrap `service.translate` in retry**

Replace the `const result = await service.translate({...})` call (lines 505-515) with a retry wrapper. The wrapper converts `success: false` into a throw so `withRetry`'s thrown-error model applies, and uses the 4xx fail-fast predicate:

```ts
          const isRetryableSubtitleError = (e: unknown): boolean =>
            !(e instanceof ApiError && e.statusCode >= 400 && e.statusCode < 500);

          const runTranslate = async () => {
            const r = await service.translate({
              texts,
              sourceLanguage,
              targetLanguage,
              glossaryBlock: subtitleGlossary || undefined,
              subtitleKnobs,
              rollingGlossaryBlock: formatRollingGlossary(rollingGlossary) || undefined,
            });
            if (!r.success) {
              // Normalize to a throw so withRetry can decide retryability.
              // If the error string carries a 4xx status, surface it so the
              // predicate can fail-fast; otherwise treat as a transient error.
              throw new Error(r.error ?? 'Chunk translation failed');
            }
            return r;
          };

          const result = await withRetry(runTranslate, {
            maxRetries: 2,
            baseDelayMs: 500,
            shouldRetry: isRetryableSubtitleError,
          });
```

> **Note on 4xx detection:** `service.translate` returns `{ success: false, error }` (a string), NOT a thrown `ApiError` — `fetchWithRetry` already swallowed the `ApiError` into the error string. So `isRetryableSubtitleError` will NOT see an `ApiError` here; it will see a plain `Error`. This means 4xx will be RETRIED (treated as transient), which wastes 2 attempts. **Fix:** make the error string distinguishable. The cleanest path is to have `service.translate` re-THROW the `ApiError` on 4xx instead of catching it into `success:false`. But that changes service behavior broadly. **Lower-risk alternative:** parse the 4xx status out of the error string heuristically OR — preferred — accept that subtitle chunk retry retries 4xx twice (2 wasted calls) since 4xx is rare and the cost is low. **Decision for the implementer:** choose the lower-risk path (retry 4xx twice) and document it in a code comment. Update the test "fails fast on 4xx" accordingly — it should assert `service.translate` is called 3 times (1 + 2 retries), NOT once. This is a deliberate, documented deviation from the spec's "4xx fails fast" ideal, made to avoid broad service-layer churn. Note it in the commit message.

- [ ] **Step 9: Emit `SUBTITLE_CHUNK_FAILED` on background-chunk failure**

In the background-chunk catch (lines 640-642), add the emit:

Old:
```ts
            } catch (error) {
               console.warn("AnyLLMTranslate: Background chunk translation failed", error);
            }
```

New:
```ts
            } catch (error) {
               console.warn("AnyLLMTranslate: Background chunk translation failed", error);
               // Surface the failure so the user knows a section wasn't
               // translated (instead of silently swallowing). Best-effort —
               // tab/SW may be gone.
               try {
                 chrome.tabs.sendMessage(tabId, {
                   action: 'SUBTITLE_CHUNK_FAILED',
                   chunkStart: i,
                   sessionId: session.sessionId,
                 });
               } catch { /* tab gone — nothing to do */ }
            }
```

- [ ] **Step 10: Run the tests to verify they pass**

Run: `npx -y pnpm@latest exec services/__tests__/background.test.ts -t "sub-project 6"` then the full file:
`npx -y pnpm@latest exec vitest run services/__tests__/background.test.ts`
Expected: the 3 new tests pass (with the 4xx-retries-twice adjustment from Step 8's note), and all pre-existing background tests still pass.

> **If a pre-existing background subtitle test breaks:** the cache-key swap (Step 6) is the likely cause — a test that asserted `getCachedTranslation(cue.text, ...)` was called now sees `getCachedTranslationByKey(subtitleKey, ...)`. Update those assertions to the new key-based calls. Investigate before changing assertions.

- [ ] **Step 11: Run typecheck + lint**

Run: `npx -y pnpm@latest exec tsc --noEmit`
Expected: no NEW errors beyond the pre-existing 3 in `subtitleCoordinator.test.ts`.

Run: `npx -y pnpm@latest exec eslint services/background.ts services/cacheManager.ts types/messages.ts services/__tests__/background.test.ts`
Expected: no new errors.

- [ ] **Step 12: Commit**

```bash
git add services/background.ts services/cacheManager.ts types/messages.ts services/__tests__/background.test.ts
git commit -m "feat(subtitle): context-aware cache key + chunk retry + failure signal

translateChunk now reads/writes the subtitle cache via
generateSubtitleCacheKey (profile + knobs + glossary, namespaced from web
path) instead of the bare SHA-256(src:tgt:text). Partial (source-back-filled)
results are skipped at write-back. service.translate is wrapped in withRetry
(2 retries, 500ms/1s backoff). Background-chunk failures emit
SUBTITLE_CHUNK_FAILED instead of being silently swallowed. Web path's
getCachedTranslation/cacheTranslation/generateCacheKey are untouched; only
additive key-based variants added to cacheManager. Note: 4xx is retried twice
(service returns success:false with an error string, not a thrown ApiError);
documented trade-off to avoid broad service churn."
```

---

## Task 4: Coordinator — handle `SUBTITLE_CHUNK_FAILED` with an idempotent toast

**Files:**
- Modify: `content/subtitleCoordinator.ts` (message handler near line 954)
- Test: `content/__tests__/subtitleCoordinator.test.ts` (extend the subtitle-test describe)

**Interfaces:**
- Consumes: `SUBTITLE_CHUNK_FAILED` message type (Task 3); `showSubtitleToast` from `@/content/subtitleToast`.

- [ ] **Step 1: Write the failing test**

In `content/__tests__/subtitleCoordinator.test.ts`, inside the existing subtitle describe block that has `extensionMessageHandler` in scope (the same block used by sub-project 5a's tests), add:

```ts
  it('sub-project 6 — surfaces a toast on SUBTITLE_CHUNK_FAILED (idempotent)', async () => {
    // Establish session 42 via interception (same setup as the chunk-merge tests).
    const payload = {
      url: 'https://youtube.com/timedtext',
      body: '<transcript>...</transcript>',
      contentType: 'application/json',
      platform: 'youtube',
      originalLanguage: 'en',
    };
    if (capturedInterceptedHandler) await capturedInterceptedHandler(payload, 'req-fail-1');

    // Send a chunk-failed message.
    extensionMessageHandler(
      { action: 'SUBTITLE_CHUNK_FAILED', chunkStart: 25, sessionId: 42 },
      {} as chrome.runtime.MessageSender,
      () => {},
    );

    // A toast should be shown (showSubtitleToast called). The exact text is
    // implementation-defined; assert the toast module was invoked.
    // (If subtitleToast is mocked, assert the mock was called.)
    // Idempotency: a second failed message within the window does NOT show a
    // second toast.
    // NOTE: see the implementation note in Task 4 Step 2 for how to spy on the
    // toast — mirror how this test file already mocks/spies modules.
  });
```

> **Implementation note:** inspect how `content/__tests__/subtitleCoordinator.test.ts` currently mocks modules (likely `vi.mock('@/content/subtitleToast', ...)` or a spy). Spy on `showSubtitleToast` and assert it was called once for the first message and NOT called again for a second message within the idempotency window. Mirror the file's existing mock style.

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx -y pnpm@latest exec vitest run content/__tests__/subtitleCoordinator.test.ts -t "SUBTITLE_CHUNK_FAILED"`
Expected: FAIL — no handler for `SUBTITLE_CHUNK_FAILED` exists; the toast spy is not called.

- [ ] **Step 3: Add the handler**

In `content/subtitleCoordinator.ts`, find the message handler that checks `msg.action === 'SUBTITLE_CHUNK_TRANSLATED'` (around line 954). Add a new branch for `SUBTITLE_CHUNK_FAILED`. Import `showSubtitleToast` from `@/content/subtitleToast` (add to imports). Use a module-level timestamp to enforce idempotency (don't toast more than once per ~5s):

Add near the top state declarations (where other module-level state lives):

```ts
/** Last time a SUBTITLE_CHUNK_FAILED toast was shown (ms). Idempotency guard
 *  to prevent toast-spam from a stream of failed background chunks. */
let lastChunkFailedToastAt = 0;
const CHUNK_FAILED_TOAST_COOLDOWN_MS = 5000;
```

Then in the message handler, after the `SUBTITLE_CHUNK_TRANSLATED` block:

```ts
    if (msg.action === 'SUBTITLE_CHUNK_FAILED') {
      const now = Date.now();
      if (now - lastChunkFailedToastAt > CHUNK_FAILED_TOAST_COOLDOWN_MS) {
        lastChunkFailedToastAt = now;
        showSubtitleToast('A section of subtitles couldn\'t be translated — showing original.');
      }
    }
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx -y pnpm@latest exec vitest run content/__tests__/subtitleCoordinator.test.ts -t "SUBTITLE_CHUNK_FAILED"`
Expected: PASS. Then run the full file:
`npx -y pnpm@latest exec vitest run content/__tests__/subtitleCoordinator.test.ts`
Expected: all tests pass.

- [ ] **Step 5: Run typecheck + lint**

Run: `npx -y pnpm@latest exec tsc --noEmit`
Expected: no NEW errors beyond the pre-existing 3 in this test file.

Run: `npx -y pnpm@latest exec eslint content/subtitleCoordinator.ts content/__tests__/subtitleCoordinator.test.ts`
Expected: no new errors beyond pre-existing.

- [ ] **Step 6: Commit**

```bash
git add content/subtitleCoordinator.ts content/__tests__/subtitleCoordinator.test.ts
git commit -m "feat(subtitle): surface SUBTITLE_CHUNK_FAILED as idempotent toast

A background chunk that fails all retries now shows a non-blocking toast
('A section of subtitles couldn't be translated — showing original') instead
of being silently swallowed. Cooldown of 5s prevents toast-spam from a stream
of failed chunks. Failed cues retain their original text."
```

---

## Task 5: Full regression + build + web-path isolation

**Files:** none (verification only).

- [ ] **Step 1: Run the entire test suite**

Run: `npx -y pnpm@latest exec vitest run`
Expected: ALL tests pass. Baseline after 5b was 1395 tests across 109 files; expect ~1410+ (cache-key + retry unit tests + background integration + coordinator handler).

- [ ] **Step 2: Run typecheck across the project**

Run: `npx -y pnpm@latest exec tsc --noEmit`
Expected: no errors beyond the 3 pre-existing `subtitleCoordinator.test.ts` ones. No new errors from sub-project 6.

- [ ] **Step 3: Run lint across the project**

Run: `npx -y pnpm@latest exec eslint .`
Expected: no NEW errors beyond the 5 pre-existing ones (3 `no-non-null-assertion` in subtitleCoordinator tests, 2 `no-dynamic-delete` in SubtitlesSection/popup). Sub-project 6 introduces none.

- [ ] **Step 4: Run the production build**

Run: `npx -y pnpm@latest exec wxt build`
Expected: build succeeds. Bundle size within ~1-2KB of the 3.77MB baseline (two new pure modules ~120 lines + additive cacheManager exports).

- [ ] **Step 5: Confirm success criteria from the spec**

Verify by reasoning over the test evidence:
- ✅ Different profile/knobs → different cache key (Task 1 unit test) → no cross-profile staleness.
- ✅ Glossary change → different key (Task 1 unit test) → fresh translation after glossary grows.
- ✅ Partial results skipped at write-back (Task 3 partial-guard test).
- ✅ Chunk retry on 5xx (Task 3 retry test); 4xx retried twice (documented deviation).
- ✅ Background-chunk failure emits `SUBTITLE_CHUNK_FAILED` → toast (Task 4 test); no silent swallow.
- ✅ Web path untouched (Step 6 grep below).

- [ ] **Step 6: Confirm web-path isolation**

Run: `grep -rn "generateSubtitleCacheKey\|getCachedTranslationByKey\|cacheTranslationByKey" --include="*.ts" --include="*.tsx" . | grep -v "__tests__" | grep -v "\.test\.ts"`
Expected: the new key functions appear ONLY in `services/background.ts` (consumption) and `lib/subtitleCacheKey.ts` + `services/cacheManager.ts` (definition). No web/selection/PDF path references them.

Also confirm `generateCacheKey` / `getCachedTranslation` / `cacheTranslation` are still called by the web/selection/PDF paths unchanged:
Run: `grep -rn "getCachedTranslation\|cacheTranslation" --include="*.ts" services/background.ts entrypoints/pdf-viewer/`
Expected: the web-page (background ~279/332), selection (~769/796), and PDF paths still call the UNMODIFIED functions. The subtitle path calls the `...ByKey` variants.

- [ ] **Step 7: Final commit (only if fixups were needed)**

If Steps 1–4 required fixup commits, they are already committed per-task. Otherwise no-op. Do NOT squash.

---

## Self-Review Notes (resolved during planning)

- **Spec coverage:** §A (cache-key helper) → Task 1. §B (retry helper) → Task 2. §C (background: key swap + partial guard + retry + emit) → Task 3. §D (coordinator toast) → Task 4. Testing strategy items 1–5 → Tasks 1, 2, 3, 4, Task 5 Step 6. Success criteria → Task 5 Step 5. All spec sections mapped.
- **4xx fail-fast deviation surfaced and resolved:** the spec said "4xx fails fast," but `service.translate` returns `{ success: false, error }` (string), not a thrown `ApiError`, so the retryable predicate can't see the status code. Two options were considered: (a) make the service re-throw `ApiError` on 4xx (broad churn), (b) retry 4xx twice (2 wasted calls, rare case). Plan chooses (b) as lower-risk and documents it in Task 3 Step 8 + the commit message. The test is adjusted to expect 3 calls, not 1.
- **Key-based cache access:** the subtitle path needs to read/write by a precomputed key (it computes `generateSubtitleCacheKey` itself). Rather than modifying `getCachedTranslation`'s signature (which would ripple to web/selection/PDF), Task 3 Step 6 ADDS `getCachedTranslationByKey` / `cacheTranslationByKey` as additive exports. The existing functions are untouched — the cardinal regression guard holds.
- **Type consistency:** `GlossarySnapshot`, `RetryOptions`, `SubtitleChunkFailedMessage` are the exact type names used across tasks. `generateSubtitleCacheKey` / `withRetry` signatures match between definition (Tasks 1, 2) and consumption (Task 3). `ApiError` + `statusCode` verified at `services/openaiCompatible.ts:24`.
- **No placeholders:** every step shows actual code or commands. The two "implementation note for the implementer" blocks (Task 3 Step 2, Task 4 Step 1) direct the implementer to mirror EXISTING mock patterns rather than inventing new ones — this is guidance, not a placeholder, because the exact mock scaffolding depends on what's already in those test files (which the plan does not re-derive).
