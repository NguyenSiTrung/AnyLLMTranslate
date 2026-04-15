# Spec: Cache Integration Hardening

## Overview

The translation cache infrastructure (`cacheManager.ts`) is fully implemented
(IndexedDB, SHA-256 keying, TTL expiry, LRU eviction) but is only wired into
2 of 4 translation paths. This track closes all 4 gaps identified by Oracle analysis:

| Path | Cache Read | Cache Write | Status |
|---|---|---|---|
| `handleTranslate` (page translation) | ❌ | ❌ | **Gap — fix in FR-1** |
| `handleTranslateSubtitle` | ✅ | ✅ | Working |
| `handleTranslateSelection` | ❌ | ✅ | **Partial — fix in FR-2** |
| `evictCache` scheduling | — | — | **Never called — fix in FR-3** |
| LRU write per cache hit | — | — | **N sequential writes — fix in FR-4** |

## Functional Requirements

### FR-1: Page Translation Cache (`handleTranslate`)
- Before sending pieces to the LLM, check IndexedDB cache for each piece text
- Cache hits: merge result immediately, no spinner (instant render)
- Cache misses: show spinner, batch-translate only uncached pieces, write back to cache on success
- Preserve piece ID mapping in the merged response to content script

### FR-2: Text Selection Cache Read (`handleTranslateSelection`)
- Before calling `service.translate()`, call `getCachedTranslation()`
- If cache hit: return immediately without calling the LLM
- Cache write-back on LLM success remains unchanged

### FR-3: Eviction Scheduling
- Call `evictCache()` once on background service worker startup
- Schedule periodic eviction using `chrome.alarms` API (daily — 1440 min interval)
- Prevents unbounded IndexedDB growth beyond the 100MB soft limit
- `chrome.alarms` persist across service worker restarts — safe for MV3

### FR-4: LRU Update Batching in `getCachedTranslation`
- Current: every cache hit triggers an immediate `set()` write to update `lastAccessedAt`
  — causes N sequential IndexedDB writes per page load
- Fix: accumulate LRU updates in a Map, flush in one batched write after 500ms debounce
- Cache read values remain correct during pending flush

## Non-Functional Requirements

- No regressions to existing test suite (408 tests passing)
- All new logic covered by unit tests (AAA pattern, Vitest)
- Cache integration must be transparent to content scripts — message API shape unchanged
- `chrome.alarms` scheduling must survive service worker restarts
- `pnpm lint` must remain clean

## Acceptance Criteria

- [ ] Revisiting a previously translated page — zero LLM API calls for cached pieces
- [ ] Re-selecting the same text — no API call on second selection
- [ ] `evictCache()` is called on SW startup and daily via `chrome.alarms`
- [ ] N cache hits produce 1 batched IndexedDB write (not N writes)
- [ ] All existing 408+ tests pass + new tests for each fix
- [ ] `pnpm lint` clean, no TypeScript `any` leaks

## Out of Scope

- Cache invalidation on model/provider change (future consideration)
- UI to display cache stats / manual clear (already exists in Options page)
- Hover translate persistent cache (session-only `hoverCache` Map is acceptable)
- Changing the content script's spinner protocol (background handles merge transparently)
