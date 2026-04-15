# Plan: Cache Integration Hardening

## Phase 1: Fix handleTranslateSelection Cache Read
<!-- execution: sequential -->

> File: `services/background.ts`

- [x] Task 1: Write failing tests — `handleTranslateSelection` cache read behavior
  - Test: mock `getCachedTranslation` to return a hit → assert `service.translate` NOT called, cached value returned
  - Test: mock `getCachedTranslation` to return null → assert `service.translate` IS called
  - Test: cache hit path still returns correct `{ success: true, translatedText }` shape

- [x] Task 2: Implement cache read in `handleTranslateSelection`
  - Call `getCachedTranslation(message.text, message.sourceLanguage, message.targetLanguage)` before `service.translate()`
  - If hit: return `{ success: true, translatedText: cached }` immediately
  - If miss: proceed with existing LLM call + write-back (unchanged)

- [x] Task 3: Run tests + lint, commit
  - `pnpm test` — all passing
  - `pnpm lint` — clean
  - Commit: `fix(cache): add cache read to handleTranslateSelection` (cce9d19)

---

## Phase 2: Fix handleTranslate Cache Integration
<!-- execution: sequential -->

> File: `services/background.ts`

- [ ] Task 1: Write failing tests for cached/uncached split in `handleTranslate`
  - Test: all pieces cached → `service.translate` NOT called, all results returned
  - Test: no pieces cached → `service.translate` called with all pieces (existing behavior)
  - Test: mixed — only uncached pieces sent to `service.translate`
  - Test: piece `id` mapping preserved correctly in merged response

- [ ] Task 2: Implement cache split + merge in `handleTranslate`
  - For each piece in `message.pieces`: check `getCachedTranslation(piece.text, ...)`
  - Split into `cachedResults: { id, translatedText }[]` and `uncachedPieces[]`
  - If `uncachedPieces.length > 0`: call `service.translate()` with only uncached pieces; write-back each result via `cacheTranslation()`
  - Merge `cachedResults` + fresh results; return as `{ success: true, results: [...] }`

- [ ] Task 3: Run tests + lint, commit
  - `pnpm test` — all passing
  - `pnpm lint` — clean
  - Commit: `feat(cache): integrate IndexedDB cache into page translation pipeline`

---

## Phase 3: Eviction Scheduling
<!-- execution: parallel -->
<!-- depends: -->

> Files: `entrypoints/background.ts`, `wxt.config.ts`

- [ ] Task 1: Check and add `alarms` permission
  <!-- files: wxt.config.ts -->
  - Inspect `wxt.config.ts` manifest permissions array
  - Add `"alarms"` if not already present

- [ ] Task 2: Write failing tests for eviction scheduling
  <!-- files: entrypoints/background.ts -->
  - Test: `evictCache()` called once on SW startup (mock evictCache, assert called)
  - Test: `chrome.alarms.create` called with `{ name: 'cache-evict', periodInMinutes: 1440 }`
  - Test: `chrome.alarms.onAlarm` fires with `name === 'cache-evict'` → `evictCache()` called

- [ ] Task 3: Implement eviction in `entrypoints/background.ts`
  <!-- files: entrypoints/background.ts -->
  <!-- depends: task2 -->
  - Import `evictCache` from `@/services/cacheManager`
  - On startup: call `evictCache()` (fire-and-forget, non-blocking)
  - Register alarm: `chrome.alarms.create('cache-evict', { periodInMinutes: 1440 })`
  - Listen: `chrome.alarms.onAlarm.addListener(alarm => { if (alarm.name === 'cache-evict') evictCache(); })`

- [ ] Task 4: Run tests + lint, commit
  <!-- files: entrypoints/background.ts, wxt.config.ts -->
  <!-- depends: task3 -->
  - `pnpm test` — all passing
  - `pnpm lint` — clean
  - Commit: `feat(cache): schedule daily eviction via chrome.alarms`

---

## Phase 4: Batch LRU Updates
<!-- execution: sequential -->
<!-- depends: -->

> File: `services/cacheManager.ts`

- [ ] Task 1: Write failing tests for batched LRU writes
  - Test: 10 consecutive cache hits trigger only 1 `set()` call (not 10)
  - Test: pending batch flushes after debounce window (~500ms via fake timers)
  - Test: cache still returns correct `translatedText` values while batch is pending
  - Test: each unique key gets its latest `lastAccessedAt` in the batch

- [ ] Task 2: Implement debounced LRU flush in `getCachedTranslation`
  - Remove immediate `await set(key, entry, getStore())` after `lastAccessedAt` update
  - Add module-level `pendingLruUpdates = new Map<string, CacheEntry>()`
  - Add `lruFlushTimer: ReturnType<typeof setTimeout> | null`
  - On cache hit: push to `pendingLruUpdates`, schedule/reset debounce timer (500ms)
  - On flush: iterate `pendingLruUpdates`, batch `set()` all entries, clear map + timer

- [ ] Task 3: Run full suite + lint, commit
  - `pnpm test` — all 408+ tests passing
  - `pnpm lint` — clean
  - Commit: `perf(cache): batch LRU lastAccessedAt writes to reduce IndexedDB overhead`
