# Track Learnings: audit-v2_20260623

Patterns, gotchas, and context discovered during implementation.

## Codebase Patterns (Inherited)

- ESLint 9+ uses flat config (eslint.config.mjs), no `--ext` flag needed.
- `promise.finally().catch()` needed to suppress unhandled rejections when storing promises in Maps for dedup.
- `@typescript-eslint/no-dynamic-delete` prohibits `delete obj[key]` — use `Object.fromEntries(Object.entries(obj).filter(...))` instead.
- WXT uses `entrypoints/` dir (not `src/`) for background.ts, content.ts, popup/. Other code lives at project root (lib/, types/, services/, content/).
- Background service worker is stateless per-session (tab states in memory Map, recreated on service worker restart).
- Per-tab session tracking via `Set<number>` for counters — cleared on `restore` action.
- AES-GCM encryption for extension storage: PBKDF2 (SHA-256, 100k iterations) with `chrome.runtime.id` + per-install salt. Prepend random 12-byte IV to ciphertext, base64-encode, prefix with `enc:`.
- Semaphore queue holds SemaphoreWaiter objects, not bare resolve closures. Queue `{ grant, settled }` records.
- Subtitle session teardown on restore/navigation/tab-close: `activeSessions: Map<tabId, session>` + keep-alive alarms.
- Interceptor enable/disable: capture originals into instance fields. FetchInterceptor.disable() should only restore `window.fetch` when it still identity-equals its own `patchedFetch`.
- Deep merge for nested settings objects (provider, subtitleSettings) — handle separately to avoid losing fields on partial updates.
- `getCachedTranslation` returns `null` on miss (not `undefined`) — always guard with `!== null`.
- Monotonically-bumped session id is the simplest way to drop stale async writes after a state reset.
- Validator execution order: `tsc` → `eslint` → `vitest` → `wxt build` — cheapest checks fail fast first.
- All extension identifiers use `anyllm-` prefix: CSS classes, data attributes, storage keys, postMessage channel, global window flags.

---

## [2026-06-23 11:10] - Phase 1: P0 Critical Crashes
- **Implemented:** Fixed 4 P0 crashes: (1) `updateTranslatedCues` never set `state.translatedCues`, so chunk deltas merged onto a fresh array losing initial cues; (2) `LayoutOverlay` declared hooks after an early `return <></>` — Rules of Hooks violation; (3) `removeTranslation` un-marked ALL `[data-anyllm-translated]` elements globally instead of scoping to the removed piece's original; (4) `deduplicateAncestors` only compared against the last-pushed element, missing descendants of earlier ancestors.
- **Files changed:** content/subtitleCoordinator.ts, content/__tests__/subtitleCoordinator.test.ts, entrypoints/pdf-viewer/components/PdfTranslationPane.tsx, content/translationDisplay.ts, content/__tests__/translationDisplay.test.ts, lib/domUtils.ts, lib/__tests__/domUtils.test.ts (new)
- **Learnings:**
  - Patterns: **Wrapper-component for Rules of Hooks with conditional mount** — when a component needs `if (!x) return <></>` but also uses hooks, split into an outer wrapper holding the early-return and an inner component mounted only when `x` is valid. The hook logic stays byte-identical, so all existing tests pass.
  - Patterns: **Translation elements are SIBLINGS of their original, not children.** `applyTranslation` inserts via `insertAfterTranslationGroup` (sibling after the paragraph), so `el.closest([TRANSLATED])` from the translation element returns null. To find the associated original, walk `previousElementSibling` past translation siblings. Only `<li>/<td>/<th>` (contained elements) wrap the original and hold translations as descendants.
  - Gotchas: **`deduplicateAncestors` correctness requires checking against ALL kept elements**, not just `result[result.length - 1]`. A descendant of an earlier-kept ancestor gets wrongly retained if a sibling sits between them in DOM order.
  - Context: `state.translatedCues` is the single source of truth that `mergeTranslatedChunk` reads; `updateTranslatedCues` is the full-array path, `mergeTranslatedChunk` is the chunk-delta path. Both must keep `state.translatedCues` in sync.
  - Gotchas: **A latent pre-existing bug in `usePdfDownload.ts:68`** (`setTimeout(() => document.body.removeChild(a))` with no cleanup) surfaces non-deterministically as an "Unhandled Error" after test teardown when test ordering changes. This is Phase 6 Task 32 — not a Phase 1 regression.
---
