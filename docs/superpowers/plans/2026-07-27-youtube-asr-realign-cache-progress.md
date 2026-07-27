# YouTube ASR AI Re-align Cache, Progress & Manager Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cache successful YouTube AI re-align results, show stage/batch/hit-miss progress on the page, and let users list/delete/clear/force-rerun saved entries from Subtitles settings.

**Architecture:** Pure key/hash helpers + dedicated IndexedDB store (background-owned). Content coordinator looks up cache before `RESEGMENT_YOUTUBE_ASR`, saves on AI success, and drives pre-translate progress via mini-progress/toast. Options shows a Caption quality summary strip plus a full **Saved caption re-aligns** manager card. Local-only resegment stays uncached.

**Tech Stack:** TypeScript, Vitest, idb-keyval, React 19 + Testing Library, existing subtitle coordinator / options card patterns, chrome.runtime messaging.

**Spec:** `docs/superpowers/specs/2026-07-27-youtube-asr-realign-cache-progress-design.md`

## Global Constraints

- Cache **AI re-align only** (not local-only resegment).
- Storage: dedicated IndexedDB (`anyllm-asr-realign-cache`), never mixed into translation cache or film glossary.
- Missing `videoId` → skip cache read/write; AI + progress still run.
- Partial AI failure → fail-open to local; **do not** save.
- v1 cache key does **not** include provider/model; Force re-run is the invalidate path.
- Always cache on successful AI when AI is enabled (no new master toggle).
- Caps: max **50** entries, max **32 MB** approx; LRU on `lastUsedAt`.
- Background owns IDB; content/options use messages.
- Track work with **bd**; do not use TodoWrite.
- Prefer non-interactive shell flags; run targeted vitest paths listed per task.
- TDD: failing tests first, then minimal implementation, then commit.
- Prefer `GIT_AUTHOR_NAME` / `GIT_COMMITTER_*` env if local `user.name` is unset — do not run `git config`. Author: `AnyLLMTranslate Agent <agent@anyllmtranslate.local>`.

---

## File map

| File | Responsibility |
|------|----------------|
| Create `lib/youtubeAsrRealignCache.ts` | Pure: content hash, cache key, YouTube meta URLs, size estimate, LRU pick, summary mapping, formatters |
| Create `lib/__tests__/youtubeAsrRealignCache.test.ts` | Unit tests for pure helpers |
| Create `services/youtubeAsrRealignStore.ts` | IDB get/set/list/delete/clear/stats + eviction + single-flight map; never-throw |
| Create `services/__tests__/youtubeAsrRealignStore.test.ts` | Store tests with mocked idb-keyval |
| Modify `lib/constants.ts` | `STORAGE_KEYS.ASR_REALIGN_DB` / `ASR_REALIGN_STORE` |
| Modify `types/messages.ts` | New actions + payload types; extend `RESEGMENT` with optional progress tabId; union updates |
| Modify `services/base.ts` | Optional `onProgress` on `resegmentYoutubeAsr` |
| Modify `services/openaiCompatible.ts` | Call `onProgress` per batch |
| Modify `services/background.ts` | Handlers for cache CRUD/stats; progress fan-out; single-flight around AI+save |
| Modify `content/miniProgress.ts` | Support pre-translate stages (`realigning`, `realign-cached`) |
| Modify `content/__tests__/miniProgress.test.ts` | Stage label tests |
| Modify `content/subtitleToast.ts` | Optional short status helpers if needed (or keep using existing `showSubtitleToast`) |
| Modify `content/subtitleCoordinator.ts` | Cache lookup/save + progress stages around AI path |
| Modify `content/__tests__/subtitleCoordinator.test.ts` | Hit/miss/fail-open/progress tests (extend existing) |
| Modify `entrypoints/options/sections/subtitles/CaptionQualityCard.tsx` | Summary strip + Manage + Clear all |
| Create `entrypoints/options/sections/subtitles/SavedCaptionRealignsCard.tsx` | Full manager UI |
| Create `entrypoints/options/sections/subtitles/__tests__/SavedCaptionRealignsCard.test.tsx` | Manager UI tests |
| Modify `entrypoints/options/sections/SubtitlesSection.tsx` | Mount manager card; id for Manage scroll |
| Modify `entrypoints/options/sections/__tests__/SubtitlesSection.test.tsx` | Wire summary/manager smoke if present |
| Spec (done) | `docs/superpowers/specs/2026-07-27-youtube-asr-realign-cache-progress-design.md` |

**Do not modify:** translation `cacheManager` eviction semantics, film glossary store schema, local `applyYoutubeAsrResegment` algorithm, non-YouTube handlers.

---

### Task 1: Pure cache key + meta helpers

**Files:**
- Create: `lib/youtubeAsrRealignCache.ts`
- Create: `lib/__tests__/youtubeAsrRealignCache.test.ts`

**Interfaces:**
- Consumes: `SubtitleCue` from `@/types/subtitle`; timed units `{ text, startMs, endMs }`
- Produces:
  - `export const ASR_REALIGN_CACHE_MODE = 'ai' as const`
  - `export const ASR_REALIGN_MAX_ENTRIES = 50`
  - `export const ASR_REALIGN_MAX_BYTES = 32 * 1024 * 1024`
  - `export interface AsrRealignTimedUnit { text: string; startMs: number; endMs: number }`
  - `export interface YoutubeAsrRealignCacheEntry { key: string; videoId: string; language: string; mode: 'ai'; title?: string; thumbnailUrl?: string; youtubeUrl?: string; cueCount: number; byteSize: number; contentHash: string; createdAt: number; lastUsedAt: number; cues: SubtitleCue[] }`
  - `export interface YoutubeAsrRealignCacheSummary` — same as entry **without** `cues`
  - `export function canonicalizeAsrRealignInput(units: AsrRealignTimedUnit[]): string`
  - `export async function hashAsrRealignContent(units: AsrRealignTimedUnit[]): Promise<string>` — SHA-256 hex of canonicalize
  - `export function buildAsrRealignCacheKey(videoId: string, language: string, contentHash: string): string` → `ai:{videoId}:{language}:{contentHash}`
  - `export function youtubeWatchUrl(videoId: string): string`
  - `export function youtubeThumbnailUrl(videoId: string): string` → `https://i.ytimg.com/vi/{id}/mqdefault.jpg`
  - `export function stripYoutubeTitleSuffix(title: string): string` — strip trailing ` - YouTube`
  - `export function estimateAsrRealignEntryBytes(entry: Omit<YoutubeAsrRealignCacheEntry, 'byteSize'> | YoutubeAsrRealignCacheEntry): number`
  - `export function toAsrRealignSummary(entry: YoutubeAsrRealignCacheEntry): YoutubeAsrRealignCacheSummary`
  - `export function pickLruKeysToEvict(entries: Array<{ key: string; lastUsedAt: number; byteSize: number }>, opts: { maxEntries: number; maxBytes: number; incomingBytes: number }): string[]`
  - `export function formatAsrRealignBytes(bytes: number): string` — reuse same style as cacheManager (`0 B`, `KB`, `MB`)
  - `export function sortAsrRealignSummaries(list: YoutubeAsrRealignCacheSummary[], sort: 'lastUsed' | 'newest'): YoutubeAsrRealignCacheSummary[]`

- [ ] **Step 1: Write the failing tests**

Create `lib/__tests__/youtubeAsrRealignCache.test.ts`:

```typescript
import { describe, expect, it, vi, beforeEach } from 'vitest';
import {
  buildAsrRealignCacheKey,
  canonicalizeAsrRealignInput,
  hashAsrRealignContent,
  youtubeWatchUrl,
  youtubeThumbnailUrl,
  stripYoutubeTitleSuffix,
  estimateAsrRealignEntryBytes,
  toAsrRealignSummary,
  pickLruKeysToEvict,
  sortAsrRealignSummaries,
  formatAsrRealignBytes,
  type YoutubeAsrRealignCacheEntry,
} from '@/lib/youtubeAsrRealignCache';

const units = [
  { text: 'Hello', startMs: 0, endMs: 400 },
  { text: 'world', startMs: 400, endMs: 900 },
];

describe('youtubeAsrRealignCache pure helpers', () => {
  beforeEach(() => {
    vi.stubGlobal('crypto', {
      subtle: {
        digest: vi.fn(async (_algo: string, data: ArrayBuffer) => {
          const bytes = new Uint8Array(data);
          const out = new Uint8Array(32);
          for (let i = 0; i < bytes.length; i++) out[i % 32] ^= bytes[i];
          return out.buffer;
        }),
      },
    });
  });

  it('canonicalizes units stably and hashes them', async () => {
    expect(canonicalizeAsrRealignInput(units)).toBe('Hello\t0\t400\nworld\t400\t900');
    const a = await hashAsrRealignContent(units);
    const b = await hashAsrRealignContent([...units].reverse().reverse());
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(a).toBe(b);
    const c = await hashAsrRealignContent([{ ...units[0], text: 'Hello!' }, units[1]]);
    expect(c).not.toBe(a);
  });

  it('builds cache key and YouTube URLs', () => {
    expect(buildAsrRealignCacheKey('abc123', 'en', 'deadbeef')).toBe('ai:abc123:en:deadbeef');
    expect(youtubeWatchUrl('abc123')).toBe('https://www.youtube.com/watch?v=abc123');
    expect(youtubeThumbnailUrl('abc123')).toBe('https://i.ytimg.com/vi/abc123/mqdefault.jpg');
    expect(stripYoutubeTitleSuffix('My Video - YouTube')).toBe('My Video');
    expect(stripYoutubeTitleSuffix('Plain')).toBe('Plain');
  });

  it('estimates bytes, maps summary, formats size, sorts, and picks LRU victims', () => {
    const entry: YoutubeAsrRealignCacheEntry = {
      key: 'ai:v:en:h',
      videoId: 'v',
      language: 'en',
      mode: 'ai',
      cueCount: 1,
      byteSize: 0,
      contentHash: 'h',
      createdAt: 10,
      lastUsedAt: 20,
      cues: [{ startTime: 0, endTime: 1, text: 'hi' }],
    };
    const bytes = estimateAsrRealignEntryBytes(entry);
    expect(bytes).toBeGreaterThan(10);
    const summary = toAsrRealignSummary({ ...entry, byteSize: bytes });
    expect(summary).not.toHaveProperty('cues');
    expect(summary.byteSize).toBe(bytes);
    expect(formatAsrRealignBytes(0)).toBe('0 B');
    expect(formatAsrRealignBytes(2048)).toMatch(/KB/);

    const sorted = sortAsrRealignSummaries(
      [
        { ...summary, key: 'a', lastUsedAt: 1, createdAt: 100 },
        { ...summary, key: 'b', lastUsedAt: 50, createdAt: 10 },
      ],
      'lastUsed',
    );
    expect(sorted.map((s) => s.key)).toEqual(['b', 'a']);

    const victims = pickLruKeysToEvict(
      [
        { key: 'old', lastUsedAt: 1, byteSize: 100 },
        { key: 'new', lastUsedAt: 9, byteSize: 100 },
      ],
      { maxEntries: 2, maxBytes: 150, incomingBytes: 80 },
    );
    expect(victims).toContain('old');
    expect(victims).not.toContain('new');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run lib/__tests__/youtubeAsrRealignCache.test.ts`

Expected: FAIL — module not found

- [ ] **Step 3: Implement pure module**

Create `lib/youtubeAsrRealignCache.ts` implementing the interfaces above.

Notes:
- Canonical form: one unit per line `text + '\\t' + startMs + '\\t' + endMs`, join with `\\n`.
- Hash: `crypto.subtle.digest('SHA-256', ...)` → hex (same style as `subtitleCacheKey` / `cacheManager`).
- `estimateAsrRealignEntryBytes`: `TextEncoder` length of `key` + `JSON.stringify` of entry with `byteSize` omitted or zeroed so size field does not feedback.
- `pickLruKeysToEvict`: sort by `lastUsedAt` ascending; while `entries.length - victims + 1 > maxEntries` or `sum(bytes of kept) + incomingBytes > maxBytes`, push next oldest key.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run lib/__tests__/youtubeAsrRealignCache.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/youtubeAsrRealignCache.ts lib/__tests__/youtubeAsrRealignCache.test.ts
GIT_AUTHOR_NAME="AnyLLMTranslate Agent" GIT_AUTHOR_EMAIL="agent@anyllmtranslate.local" \
GIT_COMMITTER_NAME="AnyLLMTranslate Agent" GIT_COMMITTER_EMAIL="agent@anyllmtranslate.local" \
git commit -m "$(cat <<'EOF'
feat(asr): pure helpers for AI re-align cache keys and LRU

Add content hash, cache key, YouTube meta URLs, size estimate, and
eviction candidate selection for the ASR re-align store.
EOF
)"
```

---

### Task 2: IndexedDB store + constants

**Files:**
- Modify: `lib/constants.ts` — add ASR realign DB keys under `STORAGE_KEYS`
- Create: `services/youtubeAsrRealignStore.ts`
- Create: `services/__tests__/youtubeAsrRealignStore.test.ts`

**Interfaces:**
- Consumes: helpers + types from `lib/youtubeAsrRealignCache.ts`; `idb-keyval` `createStore`, `get`, `set`, `del`, `entries`, `clear`
- Produces:
  - `export async function getAsrRealignEntry(key: string): Promise<YoutubeAsrRealignCacheEntry | undefined>`
  - `export async function touchAsrRealignEntry(key: string): Promise<void>` — bump `lastUsedAt`
  - `export async function saveAsrRealignEntry(entry: YoutubeAsrRealignCacheEntry): Promise<void>` — set byteSize if 0, evict, set
  - `export async function listAsrRealignSummaries(): Promise<YoutubeAsrRealignCacheSummary[]>`
  - `export async function deleteAsrRealignEntry(key: string): Promise<void>`
  - `export async function clearAsrRealignCache(): Promise<void>`
  - `export async function getAsrRealignCacheStats(): Promise<{ entryCount: number; totalBytes: number }>`
  - All functions **never throw** (catch → undefined / no-op / zeros)

Single-flight (in this module or background — prefer store module export):

- `export function getOrCreateAsrRealignInflight<T>(key: string, factory: () => Promise<T>): Promise<T>`
- `export function clearAsrRealignInflight(key: string): void`

- [ ] **Step 1: Write the failing store tests**

Create `services/__tests__/youtubeAsrRealignStore.test.ts` with an in-memory idb mock (same pattern as `lib/__tests__/webResume.test.ts` / stats tests):

```typescript
import { beforeEach, describe, expect, it, vi } from 'vitest';

const memory = new Map<string, unknown>();

vi.mock('idb-keyval', () => ({
  createStore: vi.fn(() => ({})),
  get: vi.fn(async (key: string) => memory.get(key)),
  set: vi.fn(async (key: string, val: unknown) => {
    memory.set(key, val);
  }),
  del: vi.fn(async (key: string) => {
    memory.delete(key);
  }),
  entries: vi.fn(async () => [...memory.entries()]),
  clear: vi.fn(async () => {
    memory.clear();
  }),
}));

import {
  getAsrRealignEntry,
  saveAsrRealignEntry,
  listAsrRealignSummaries,
  deleteAsrRealignEntry,
  clearAsrRealignCache,
  getAsrRealignCacheStats,
  touchAsrRealignEntry,
  getOrCreateAsrRealignInflight,
} from '../youtubeAsrRealignStore';
import type { YoutubeAsrRealignCacheEntry } from '@/lib/youtubeAsrRealignCache';

function makeEntry(over: Partial<YoutubeAsrRealignCacheEntry> = {}): YoutubeAsrRealignCacheEntry {
  return {
    key: 'ai:vid:en:hash1',
    videoId: 'vid',
    language: 'en',
    mode: 'ai',
    title: 'Sample',
    thumbnailUrl: 'https://i.ytimg.com/vi/vid/mqdefault.jpg',
    youtubeUrl: 'https://www.youtube.com/watch?v=vid',
    cueCount: 1,
    byteSize: 0,
    contentHash: 'hash1',
    createdAt: 1000,
    lastUsedAt: 1000,
    cues: [{ startTime: 0, endTime: 1, text: 'hello' }],
    ...over,
  };
}

describe('youtubeAsrRealignStore', () => {
  beforeEach(() => {
    memory.clear();
    vi.clearAllMocks();
  });

  it('saves, gets, lists summaries without cues, touches, deletes, clears, stats', async () => {
    await saveAsrRealignEntry(makeEntry());
    const got = await getAsrRealignEntry('ai:vid:en:hash1');
    expect(got?.cues[0]?.text).toBe('hello');
    expect(got?.byteSize).toBeGreaterThan(0);

    const list = await listAsrRealignSummaries();
    expect(list).toHaveLength(1);
    expect(list[0]).not.toHaveProperty('cues');

    const before = got!.lastUsedAt;
    await touchAsrRealignEntry('ai:vid:en:hash1');
    const touched = await getAsrRealignEntry('ai:vid:en:hash1');
    expect(touched!.lastUsedAt).toBeGreaterThanOrEqual(before);

    const stats = await getAsrRealignCacheStats();
    expect(stats.entryCount).toBe(1);
    expect(stats.totalBytes).toBeGreaterThan(0);

    await deleteAsrRealignEntry('ai:vid:en:hash1');
    expect(await getAsrRealignEntry('ai:vid:en:hash1')).toBeUndefined();

    await saveAsrRealignEntry(makeEntry());
    await clearAsrRealignCache();
    expect(await getAsrRealignCacheStats()).toEqual({ entryCount: 0, totalBytes: 0 });
  });

  it('coalesces inflight factories per key', async () => {
    let calls = 0;
    const p1 = getOrCreateAsrRealignInflight('k', async () => {
      calls++;
      await new Promise((r) => setTimeout(r, 20));
      return 'ok';
    });
    const p2 = getOrCreateAsrRealignInflight('k', async () => {
      calls++;
      return 'other';
    });
    await expect(Promise.all([p1, p2])).resolves.toEqual(['ok', 'ok']);
    expect(calls).toBe(1);
  });

  it('never throws when idb fails', async () => {
    const { get } = await import('idb-keyval');
    vi.mocked(get).mockRejectedValueOnce(new Error('idb down'));
    await expect(getAsrRealignEntry('x')).resolves.toBeUndefined();
  });
});
```

Also add one eviction test: save many tiny entries beyond `ASR_REALIGN_MAX_ENTRIES` by temporarily mocking the constant **or** by exporting an internal `_evictForTest` — prefer implementing eviction inside `saveAsrRealignEntry` using real constants and, for the test, save 51 entries with increasing `lastUsedAt` and assert oldest key is gone (only if test runtime is OK). If too slow/heavy, unit-test eviction solely via `pickLruKeysToEvict` (Task 1) and in store test spy that `del` is called when over max by injecting oversized `byteSize` fields.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run services/__tests__/youtubeAsrRealignStore.test.ts`

Expected: FAIL — module not found

- [ ] **Step 3: Add constants + implement store**

In `lib/constants.ts` inside `STORAGE_KEYS`:

```typescript
  ASR_REALIGN_DB: 'anyllm-asr-realign-cache',
  ASR_REALIGN_STORE: 'entries',
```

Implement `services/youtubeAsrRealignStore.ts`:
- Lazy `createStore(STORAGE_KEYS.ASR_REALIGN_DB, STORAGE_KEYS.ASR_REALIGN_STORE)`
- `saveAsrRealignEntry`: compute `byteSize` via `estimateAsrRealignEntryBytes`; load all entries; `pickLruKeysToEvict`; `del` victims; `set` new entry
- `listAsrRealignSummaries`: `entries()` → map `toAsrRealignSummary`
- Inflight `Map<string, Promise<unknown>>` with delete in `finally`

- [ ] **Step 4: Run tests**

Run: `pnpm exec vitest run services/__tests__/youtubeAsrRealignStore.test.ts lib/__tests__/youtubeAsrRealignCache.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/constants.ts services/youtubeAsrRealignStore.ts services/__tests__/youtubeAsrRealignStore.test.ts
GIT_AUTHOR_NAME="AnyLLMTranslate Agent" GIT_AUTHOR_EMAIL="agent@anyllmtranslate.local" \
GIT_COMMITTER_NAME="AnyLLMTranslate Agent" GIT_COMMITTER_EMAIL="agent@anyllmtranslate.local" \
git commit -m "$(cat <<'EOF'
feat(asr): IndexedDB store for AI re-align cache

Background-owned idb-keyval store with list/stats/delete/clear,
LRU caps, fail-open errors, and in-flight coalescing.
EOF
)"
```

---

### Task 3: Message types + AI batch progress hook

**Files:**
- Modify: `types/messages.ts`
- Modify: `services/base.ts`
- Modify: `services/openaiCompatible.ts`
- Modify: `services/__tests__/openaiCompatible.test.ts` (extend or add focused cases)
- Modify: `services/background.ts` (wire progress + CRUD handlers in Task 4; this task can add types + service progress only)

**Interfaces:**

Add to `MessageAction`:
```typescript
  | 'GET_ASR_REALIGN_CACHE'
  | 'SAVE_ASR_REALIGN_CACHE'
  | 'LIST_ASR_REALIGN_CACHE'
  | 'DELETE_ASR_REALIGN_CACHE'
  | 'CLEAR_ASR_REALIGN_CACHE'
  | 'ASR_REALIGN_CACHE_STATS'
  | 'ASR_REALIGN_PROGRESS'
  | 'ASR_REALIGN_CACHE_UPDATED'
```

Message shapes:

```typescript
export interface GetAsrRealignCacheMessage {
  action: 'GET_ASR_REALIGN_CACHE';
  key: string;
}
export interface GetAsrRealignCacheResult {
  success: boolean;
  entry?: YoutubeAsrRealignCacheEntry; // import type from lib or re-export a types-safe duplicate in messages
  error?: string;
}

export interface SaveAsrRealignCacheMessage {
  action: 'SAVE_ASR_REALIGN_CACHE';
  entry: YoutubeAsrRealignCacheEntry;
}
export interface SaveAsrRealignCacheResult {
  success: boolean;
  error?: string;
}

export interface ListAsrRealignCacheMessage {
  action: 'LIST_ASR_REALIGN_CACHE';
}
export interface ListAsrRealignCacheResult {
  success: boolean;
  entries?: YoutubeAsrRealignCacheSummary[];
  error?: string;
}

export interface DeleteAsrRealignCacheMessage {
  action: 'DELETE_ASR_REALIGN_CACHE';
  key: string;
}
export interface ClearAsrRealignCacheMessage {
  action: 'CLEAR_ASR_REALIGN_CACHE';
}
export interface AsrRealignCacheStatsMessage {
  action: 'ASR_REALIGN_CACHE_STATS';
}
export interface AsrRealignCacheStatsResult {
  success: boolean;
  entryCount?: number;
  totalBytes?: number;
  error?: string;
}

/** Background → content tab during AI resegment batches */
export interface AsrRealignProgressMessage {
  action: 'ASR_REALIGN_PROGRESS';
  phase: 'realigning';
  current: number;
  total: number;
}

/** Background → extension pages after mutate */
export interface AsrRealignCacheUpdatedMessage {
  action: 'ASR_REALIGN_CACHE_UPDATED';
}
```

Extend `ResegmentYoutubeAsrMessage`:
```typescript
export interface ResegmentYoutubeAsrMessage {
  action: 'RESEGMENT_YOUTUBE_ASR';
  language: string;
  units: Array<{ text: string; startMs: number; endMs: number }>;
  /** When set, background emits ASR_REALIGN_PROGRESS to this tab */
  progressTabId?: number;
}
```

Update `ExtensionMessage` union with all new request types (progress/updated may be fire-and-forget outbound).

`services/base.ts`:
```typescript
resegmentYoutubeAsr?(
  units: AsrTimedUnit[],
  language: string,
  onProgress?: (current: number, total: number) => void,
): Promise<ResegmentYoutubeAsrResult>;
```

`openaiCompatible.resegmentYoutubeAsr`: before each batch (1-based `current`), call `onProgress?.(batchIndex + 1, batches.length)`.

- [ ] **Step 1: Write/extend failing test for progress callback**

In `services/__tests__/openaiCompatible.test.ts`, add a test that mocks `fetchCompletion` for 2 batches and asserts `onProgress` called with `(1,2)` then `(2,2)`. Use existing service construction helpers in that file.

- [ ] **Step 2: Run test — expect fail** (signature/callback missing)

Run: `pnpm exec vitest run services/__tests__/openaiCompatible.test.ts`

- [ ] **Step 3: Implement types + onProgress in service**

- [ ] **Step 4: Run tests — PASS**

- [ ] **Step 5: Commit**

```bash
git add types/messages.ts services/base.ts services/openaiCompatible.ts services/__tests__/openaiCompatible.test.ts
GIT_AUTHOR_NAME="AnyLLMTranslate Agent" GIT_AUTHOR_EMAIL="agent@anyllmtranslate.local" \
GIT_COMMITTER_NAME="AnyLLMTranslate Agent" GIT_COMMITTER_EMAIL="agent@anyllmtranslate.local" \
git commit -m "$(cat <<'EOF'
feat(asr): message types and AI re-align batch progress callback

Add cache CRUD/stats/progress message contracts and report batch
i/n from openaiCompatible.resegmentYoutubeAsr.
EOF
)"
```

---

### Task 4: Background handlers (cache CRUD + progress + single-flight AI)

**Files:**
- Modify: `services/background.ts`
- Create or extend: `services/__tests__/background.asrRealignCache.test.ts` (mock store + pool)

**Interfaces:**
- Consumes: store functions; existing `handleResegmentYoutubeAsr` path; `chrome.tabs.sendMessage`
- Produces: switch cases for all new actions; enhanced resegment handler

**Resegment handler behavior:**

```typescript
async function handleResegmentYoutubeAsr(message, sender): Promise<ResegmentYoutubeAsrResult> {
  const tabId = message.progressTabId ?? sender.tab?.id;
  const onProgress = tabId != null
    ? (current: number, total: number) => {
        void chrome.tabs.sendMessage(tabId, {
          action: 'ASR_REALIGN_PROGRESS',
          phase: 'realigning',
          current,
          total,
        } satisfies AsrRealignProgressMessage).catch(() => {});
      }
    : undefined;
  // existing pool dispatch, pass onProgress into service.resegmentYoutubeAsr
}
```

**Cache handlers:** thin wrappers around store; after save/delete/clear broadcast:

```typescript
chrome.runtime.sendMessage({ action: 'ASR_REALIGN_CACHE_UPDATED' }).catch(() => {});
```

**Coordinator-facing AI+cache orchestration** may live either:
- **Preferred in content** (Task 6): content GET → maybe RESEGMENT → SAVE, or
- **Optional background helper** `RESEGMENT_YOUTUBE_ASR_CACHED` — **do not add** unless content path is too racy; stick to explicit GET/RESEGMENT/SAVE from content for clarity.

Single-flight for AI: when content might double-call, background can wrap resegment+optional save — for v1, content uses `getOrCreateAsrRealignInflight` via a new message `RUN_ASR_REALIGN` **or** keep inflight only around background resegment by key derived from hash of units.

Minimal approach for v1:
- Background exports internal inflight on `language + hash(units)` string during `RESEGMENT_YOUTUBE_ASR` only.
- Content still does GET/SAVE separately.

```typescript
const inflightKey = `${message.language}:${await hashAsrRealignContent(message.units)}`;
return getOrCreateAsrRealignInflight(inflightKey, () => dispatchResegment(...));
```

- [ ] **Step 1: Write failing background tests**

Mock `youtubeAsrRealignStore` and assert:
- `GET_ASR_REALIGN_CACHE` returns entry
- `LIST` returns summaries
- `DELETE` / `CLEAR` call store and return success
- `STATS` returns counts
- `RESEGMENT_YOUTUBE_ASR` with `progressTabId` calls `chrome.tabs.sendMessage` with progress (mock service that invokes onProgress)

Follow existing `services/__tests__/background.*.test.ts` patterns for loading the SW handler.

- [ ] **Step 2: Run — FAIL**

- [ ] **Step 3: Implement handlers in `background.ts` switch**

- [ ] **Step 4: Run — PASS**

- [ ] **Step 5: Commit**

```bash
git add services/background.ts services/__tests__/background.asrRealignCache.test.ts
GIT_AUTHOR_NAME="AnyLLMTranslate Agent" GIT_AUTHOR_EMAIL="agent@anyllmtranslate.local" \
GIT_COMMITTER_NAME="AnyLLMTranslate Agent" GIT_COMMITTER_EMAIL="agent@anyllmtranslate.local" \
git commit -m "$(cat <<'EOF'
feat(asr): background handlers for re-align cache and progress

Wire IDB cache CRUD/stats and emit ASR_REALIGN_PROGRESS to the
requesting tab during AI batch resegment.
EOF
)"
```

---

### Task 5: Mini-progress pre-translate stages

**Files:**
- Modify: `content/miniProgress.ts`
- Modify: `content/__tests__/miniProgress.test.ts`

**Interfaces:**
- Extend `MiniProgressOptions`:

```typescript
export type MiniProgressStatus =
  | 'translating'
  | 'done'
  | 'idle'
  | 'error'
  | 'realigning'
  | 'realign-cached';

export interface MiniProgressOptions {
  translated: number;
  total: number;
  status: MiniProgressStatus;
  onStop: () => void;
  /** Optional override label (e.g. cache hit one-liner) */
  label?: string;
}
```

Label rules:
- `realigning`: `label ?? \`Re-aligning captions… ${translated}/${total}\``
- `realign-cached`: `label ?? 'Using saved re-align'`
- existing translating/done unchanged
- For `realign-cached`, `total` may be `1` and `translated` `1`; still show bar briefly
- Stop button: keep for realigning (calls onStop → coordinator should cancel session if applicable); for `realign-cached` Stop can no-op hide

- [ ] **Step 1: Failing tests** for new statuses’ label text

- [ ] **Step 2: Run — FAIL**

- [ ] **Step 3: Implement**

- [ ] **Step 4: Run — PASS**

- [ ] **Step 5: Commit**

```bash
git add content/miniProgress.ts content/__tests__/miniProgress.test.ts
GIT_AUTHOR_NAME="AnyLLMTranslate Agent" GIT_AUTHOR_EMAIL="agent@anyllmtranslate.local" \
GIT_COMMITTER_NAME="AnyLLMTranslate Agent" GIT_COMMITTER_EMAIL="agent@anyllmtranslate.local" \
git commit -m "$(cat <<'EOF'
feat(ui): mini-progress stages for caption re-align

Support realigning and saved-cache labels before translation progress.
EOF
)"
```

---

### Task 6: Coordinator cache + progress wiring

**Files:**
- Modify: `content/subtitleCoordinator.ts` (ASR block ~606–670)
- Modify: `content/__tests__/subtitleCoordinator.test.ts`

**Interfaces:**
- Consumes: message APIs; pure hash/key helpers; `updateMiniProgress` / `showSubtitleToast` / `hideMiniProgress`
- Produces: updated intercept path behavior

**Algorithm (replace AI block):**

```typescript
// after local applyYoutubeAsrResegment → cues, resegmentMode local|off
if (asrEnable && asrAiEnable && platform === 'youtube' && isAsrTrack && rawCues.length > 0) {
  const units = prepareYoutubeAsrAiInput({ body, cues: rawCues });
  const videoId = trackMeta?.videoId /* or state.availableTracks[0]?.videoId */;
  let usedCache = false;

  const showRealignProgress = (status: 'realigning' | 'realign-cached', current: number, total: number) => {
    updateMiniProgress({
      translated: current,
      total: Math.max(total, 1),
      status,
      onStop: () => {
        cancelBackgroundSubtitleSession();
        hideMiniProgress();
      },
    });
  };

  const onProgressMsg = (msg: AsrRealignProgressMessage) => {
    if (msg?.action !== 'ASR_REALIGN_PROGRESS') return;
    showRealignProgress('realigning', msg.current, msg.total);
  };
  chrome.runtime.onMessage.addListener(onProgressMsg);

  try {
    if (units.length > 0 && videoId) {
      const contentHash = await hashAsrRealignContent(units);
      const key = buildAsrRealignCacheKey(videoId, originalLanguage || 'en', contentHash);
      const cached = (await chrome.runtime.sendMessage({
        action: 'GET_ASR_REALIGN_CACHE',
        key,
      })) as GetAsrRealignCacheResult | undefined;

      if (cached?.success && cached.entry?.cues?.length) {
        cues = cached.entry.cues;
        resegmentMode = 'ai';
        usedCache = true;
        showRealignProgress('realign-cached', 1, 1);
        // touch happens in GET handler or explicit — prefer GET bumps lastUsedAt in background
      } else {
        showRealignProgress('realigning', 0, 1);
        const tabId = /* optional: not always known in CS */;
        const aiResult = await chrome.runtime.sendMessage({
          action: 'RESEGMENT_YOUTUBE_ASR',
          language: originalLanguage || 'en',
          units,
          // progressTabId: omit; background uses sender.tab.id
        }) as ResegmentYoutubeAsrResult | undefined;

        if (aiResult?.success && aiResult.cues?.length) {
          cues = aiResult.cues;
          resegmentMode = 'ai';
          const title = stripYoutubeTitleSuffix(document.title || '');
          const entry = {
            key,
            videoId,
            language: originalLanguage || 'en',
            mode: 'ai' as const,
            title: title || undefined,
            thumbnailUrl: youtubeThumbnailUrl(videoId),
            youtubeUrl: youtubeWatchUrl(videoId),
            cueCount: cues.length,
            byteSize: 0,
            contentHash,
            createdAt: Date.now(),
            lastUsedAt: Date.now(),
            cues,
          };
          void chrome.runtime.sendMessage({ action: 'SAVE_ASR_REALIGN_CACHE', entry });
        } else {
          console.warn('...');
          showSubtitleToast('AI re-align failed · using local rules');
        }
      }
    } else if (units.length > 0) {
      // no videoId: AI without cache (existing sendMessage path) + progress listener
      showRealignProgress('realigning', 0, 1);
      const aiResult = await chrome.runtime.sendMessage({ ... });
      // same fail-open; no save
    }
  } finally {
    chrome.runtime.onMessage.removeListener(onProgressMsg);
    // do not hide mini progress here if translate will immediately reuse it —
    // translate path should overwrite status to translating
  }

  if (usedCache) {
    // brief pause optional — not required; translate progress replaces label
  }
}
```

**Background GET handler** must `touchAsrRealignEntry` on hit.

Ensure `trackMeta?.videoId` is populated for YouTube — if discovery already sets it, use it; else try parse from `location.href` (`[?&]v=([^&]+)` or youtu.be) as pure fallback helper in `lib/youtubeAsrRealignCache.ts`:

```typescript
export function extractYoutubeVideoIdFromUrl(url: string): string | undefined
```

Add tests for that helper in Task 1 file if added here (prefer add in Task 1 retroactively in this task’s commit if missing).

- [ ] **Step 1: Failing coordinator tests**

Mock `chrome.runtime.sendMessage`:
1. **Cache hit:** GET returns cues → never calls RESEGMENT; cues become cached
2. **Miss + AI success:** GET miss → RESEGMENT success → SAVE called with entry
3. **AI fail:** RESEGMENT fail → SAVE not called; local cues remain; toast called (mock toast module)
4. **Progress:** simulate progress message updates mini progress label

- [ ] **Step 2: Run — FAIL**

- [ ] **Step 3: Implement coordinator wiring**

- [ ] **Step 4: Run coordinator + miniProgress + store tests — PASS**

- [ ] **Step 5: Commit**

```bash
git add content/subtitleCoordinator.ts content/__tests__/subtitleCoordinator.test.ts lib/youtubeAsrRealignCache.ts lib/__tests__/youtubeAsrRealignCache.test.ts
GIT_AUTHOR_NAME="AnyLLMTranslate Agent" GIT_AUTHOR_EMAIL="agent@anyllmtranslate.local" \
GIT_COMMITTER_NAME="AnyLLMTranslate Agent" GIT_COMMITTER_EMAIL="agent@anyllmtranslate.local" \
git commit -m "$(cat <<'EOF'
feat(asr): use cached AI re-align and show stage progress

Coordinator looks up ASR re-align cache before LLM, saves on success,
fail-opens with a toast, and drives mini-progress stages.
EOF
)"
```

---

### Task 7: Caption quality summary strip

**Files:**
- Modify: `entrypoints/options/sections/subtitles/CaptionQualityCard.tsx`
- Modify: `entrypoints/options/sections/__tests__/SubtitlesSection.test.tsx` (or new `CaptionQualityCard.test.tsx`)

**Interfaces:**
- Props: extend optional `onManageSavedRealigns?: () => void` **or** hardcode scroll to `#saved-caption-realigns` via `document.getElementById`
- Load stats on mount + on `ASR_REALIGN_CACHE_UPDATED`

UI under AI re-align block:

```tsx
<div className="flex flex-wrap items-center justify-between gap-2 pt-1">
  <p className="text-xs text-zinc-500">
    {loading ? 'Measuring saved re-aligns…' : entryCount === 0
      ? 'No saved re-aligns yet'
      : `${entryCount} saved · ${formatAsrRealignBytes(totalBytes)}`}
  </p>
  <div className="flex items-center gap-2">
    <Button size="sm" variant="ghost" onClick={scrollToManager}>Manage</Button>
    <Button size="sm" variant="warning" disabled={entryCount === 0} onClick={...}>Clear all</Button>
  </div>
</div>
```

Clear all → confirm `Modal` → `CLEAR_ASR_REALIGN_CACHE` → refresh stats.

Helper text near AI toggle: “Successful AI re-aligns are saved on this device. Changing models does not auto-invalidate — use Force re-run in Saved caption re-aligns.”

- [ ] **Step 1: Failing UI test** — renders “No saved…”, Manage present; after mocked stats shows `2 saved`

- [ ] **Step 2: Run — FAIL**

- [ ] **Step 3: Implement**

- [ ] **Step 4: Run — PASS**

- [ ] **Step 5: Commit**

```bash
git add entrypoints/options/sections/subtitles/CaptionQualityCard.tsx entrypoints/options/sections/__tests__/SubtitlesSection.test.tsx
GIT_AUTHOR_NAME="AnyLLMTranslate Agent" GIT_AUTHOR_EMAIL="agent@anyllmtranslate.local" \
GIT_COMMITTER_NAME="AnyLLMTranslate Agent" GIT_COMMITTER_EMAIL="agent@anyllmtranslate.local" \
git commit -m "$(cat <<'EOF'
feat(options): Caption quality summary for saved AI re-aligns

Show saved count/size with Manage and Clear all on the Caption quality card.
EOF
)"
```

---

### Task 8: Saved caption re-aligns manager card

**Files:**
- Create: `entrypoints/options/sections/subtitles/SavedCaptionRealignsCard.tsx`
- Create: `entrypoints/options/sections/subtitles/__tests__/SavedCaptionRealignsCard.test.tsx`
- Modify: `entrypoints/options/sections/SubtitlesSection.tsx` — render card after Caption quality with `id="saved-caption-realigns"` wrapper

**UI requirements (from spec):**
- Card title: **Saved caption re-aligns**
- Description: AI re-aligned YouTube captions saved on this device
- Sort control: Last used | Newest (`sortAsrRealignSummaries`)
- Clear all (confirm modal)
- Rows: thumb (`img` with onError placeholder), title, meta (lang · cues · size · dates), Open on YouTube, Delete, Force re-run
- Empty state copy
- Listen for `ASR_REALIGN_CACHE_UPDATED` + refresh on visibility

Force re-run = `DELETE_ASR_REALIGN_CACHE` for that key (same as delete for storage; label differs: “Removes save so the next watch re-runs AI”).

Use existing `Button`, `Card`, `Modal`, `Badge`, `DisabledDimmer`.

Date display: `new Date(ts).toLocaleString()` or relative short form — keep simple `toLocaleString()`.

- [ ] **Step 1: Failing tests** (jsdom + Testing Library)

```tsx
// mock chrome.runtime.sendMessage for LIST / DELETE / CLEAR
it('renders empty state', ...)
it('lists entries and deletes one', ...)
it('clear all confirms and clears', ...)
it('force re-run deletes key', ...)
```

- [ ] **Step 2: Run — FAIL**

- [ ] **Step 3: Implement card + mount in SubtitlesSection**

```tsx
<div id="saved-caption-realigns" className="animate-stagger" style={stagger(3)}>
  <SavedCaptionRealignsCard disabled={isDisabled} />
</div>
// bump TranslationStyleCard stagger to 4
```

- [ ] **Step 4: Run UI tests + `pnpm exec tsc --noEmit` on touched area if needed**

Run: `pnpm exec vitest run entrypoints/options/sections/subtitles/__tests__/SavedCaptionRealignsCard.test.tsx entrypoints/options/sections/__tests__/SubtitlesSection.test.tsx`

- [ ] **Step 5: Commit**

```bash
git add entrypoints/options/sections/subtitles/SavedCaptionRealignsCard.tsx \
  entrypoints/options/sections/subtitles/__tests__/SavedCaptionRealignsCard.test.tsx \
  entrypoints/options/sections/SubtitlesSection.tsx
GIT_AUTHOR_NAME="AnyLLMTranslate Agent" GIT_AUTHOR_EMAIL="agent@anyllmtranslate.local" \
GIT_COMMITTER_NAME="AnyLLMTranslate Agent" GIT_COMMITTER_EMAIL="agent@anyllmtranslate.local" \
git commit -m "$(cat <<'EOF'
feat(options): Saved caption re-aligns manager on Subtitles tab

List AI re-align cache entries with thumb/title/meta, open on YouTube,
per-row delete, force re-run, and clear all.
EOF
)"
```

---

### Task 9: End-to-end quality gate + product doc touch

**Files:**
- Modify: `conductor/product.md` — one bullet under Video Subtitle Translation noting AI re-align cache + manager + progress (keep concise)
- Optional: `conductor/patterns.md` — short pattern: “ASR re-align cache is IDB + background messages; never page-origin IDB”

- [ ] **Step 1: Run full relevant tests**

```bash
pnpm exec vitest run \
  lib/__tests__/youtubeAsrRealignCache.test.ts \
  services/__tests__/youtubeAsrRealignStore.test.ts \
  services/__tests__/openaiCompatible.test.ts \
  services/__tests__/background.asrRealignCache.test.ts \
  content/__tests__/miniProgress.test.ts \
  content/__tests__/subtitleCoordinator.test.ts \
  entrypoints/options/sections/subtitles/__tests__/SavedCaptionRealignsCard.test.tsx \
  entrypoints/options/sections/__tests__/SubtitlesSection.test.tsx
```

Expected: all PASS

- [ ] **Step 2: Lint + types**

```bash
pnpm exec eslint lib/youtubeAsrRealignCache.ts services/youtubeAsrRealignStore.ts content/miniProgress.ts content/subtitleCoordinator.ts entrypoints/options/sections/subtitles/CaptionQualityCard.tsx entrypoints/options/sections/subtitles/SavedCaptionRealignsCard.tsx entrypoints/options/sections/SubtitlesSection.tsx types/messages.ts services/background.ts services/openaiCompatible.ts services/base.ts
pnpm exec tsc --noEmit
```

Expected: 0 errors

- [ ] **Step 3: Update product.md bullet**

- [ ] **Step 4: Commit**

```bash
git add conductor/product.md conductor/patterns.md
GIT_AUTHOR_NAME="AnyLLMTranslate Agent" GIT_AUTHOR_EMAIL="agent@anyllmtranslate.local" \
GIT_COMMITTER_NAME="AnyLLMTranslate Agent" GIT_COMMITTER_EMAIL="agent@anyllmtranslate.local" \
git commit -m "$(cat <<'EOF'
docs: note AI re-align cache and progress in product context

Record Caption quality cache manager and runtime stage progress for
YouTube ASR AI re-align.
EOF
)"
```

- [ ] **Step 5: Manual smoke checklist (human or browser)**

1. Enable Improve + AI re-align; open YouTube ASR video; see “Re-aligning captions… i/n” then translate.  
2. Reload same video; see “Using saved re-align”; no resegment LLM (network tab / logs).  
3. Options → Subtitles: summary count ≥ 1; manager lists video; Open works.  
4. Force re-run → row gone → reload video → AI runs again.  
5. Clear all → empty; translation cache still intact.  
6. AI off → no re-align chrome; local improve still works.

---

## Spec coverage checklist

| Spec requirement | Task |
|------------------|------|
| AI-only IDB cache | 1–2, 4, 6 |
| Key `ai:videoId:lang:hash` | 1, 6 |
| LRU 50 / 32MB | 1–2 |
| Runtime stage + batch % + hit/miss | 3–6 |
| Fail-open + no partial save | 6 |
| Missing videoId skips cache | 6 |
| Caption quality summary | 7 |
| Saved caption re-aligns manager | 8 |
| Delete / clear / force re-run | 4, 7–8 |
| Progress messages | 3–4, 6 |
| Tests pure/store/coordinator/UI | 1–8 |
| Translation cache isolation | 2, 9 manual |
| No local-only cache | global / 6 |

## Placeholder / consistency self-review

- No TBD steps; all types named consistently `YoutubeAsrRealignCacheEntry` / `YoutubeAsrRealignCacheSummary`.
- Message action names match between Tasks 3–8.
- `onProgress` signature `(current, total)` 1-based current consistent in service + mini-progress.
- GET bumps `lastUsedAt` (Task 4/6).
- Manage scroll target id `saved-caption-realigns` shared by Tasks 7–8.

---

## Execution handoff

Plan complete and saved to `docs/superpowers/plans/2026-07-27-youtube-asr-realign-cache-progress.md`.

**Two execution options:**

1. **Subagent-Driven (recommended)** — fresh subagent per task, review between tasks  
2. **Inline Execution** — execute tasks in this session with checkpoints  

Which approach?
