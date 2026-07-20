# Track Learnings: web-translate-hardening_20260720

Patterns, gotchas, and context discovered during implementation.

## Codebase Patterns (Inherited)

From `conductor/patterns.md` and related archived web tracks
(`web-translate-v3_20260714`, `web-pipeline-hardening_20260708`,
`web-bilingual-quality_20260707`, `bilingual-display-ux_20260505`):

- Non-stream path already has `translationSession` stale-response guard — extend
  the same contract to streaming piece events and port abort.
- Content script owns page lifecycle; background SW is stateless per-session.
  Abort/disconnect must not leave orphan ports.
- Host-page styling uses `data-anyllm-*` + `styles/inject.css` — no Tailwind on
  inject path; minimize new `!important`.
- Rich translations reconstruct via DOM APIs, never raw `innerHTML`.
- Subtitle cache uses `subtitle:` namespace — web cache fingerprint changes must
  not break isolation.
- `promise.finally().catch()` when storing promises in Maps for dedup.
- Parallel web sub-batch tests need explicit pool key throttle
  (`concurrencyLimit: 0`, `interval: 0`, `safeKeyThrottleMigrated: true`).
- jsdom MutationObserver/event tests need an async tick before asserting.
- Storage mocks nest settings under `anyllm-translate-settings`.
- Prefer top-level `import type` over inline `import('…').Type`.
- Resume identity uses parentPath+text (`lib/resumeIdentity.ts`) — collisions on
  repeated cards/comments are a known risk this track should harden around.
- Translation-only hides originals via CSS on `[data-anyllm-role="original"]` —
  incomplete cleanup leaves content invisible.

### Analysis anchors (2026-07-20)

| P0 finding | Primary locus |
|------------|---------------|
| Stop clears pieces before snapshot | `entrypoints/content.ts` `stopTranslation` |
| Stream bypasses session guard | `streamTranslate` piece handler |
| Concurrent start interleave | `startTranslation` mid-await |
| Resume races viewport dispatch | observe-then-`void restoreFromSnapshot` |
| Section dismiss incomplete | `content/sectionTranslate.ts` |
| Cache key incomplete | `services/cacheManager.ts` `generateCacheKey` |

---

<!-- Learnings from implementation will be appended below -->

## [2026-07-20] - Phase 1: P0 Lifecycle Correctness
Thread: T-019f7e7a-c7f3-7040-a707-d814f175f871
- **Implemented:** Thin session contract (`lib/translationSession.ts`), stream piece guard + port registry, stop-before-clear snapshot freeze, lifecycle mutex, resume-before-observe, section dismiss canonical restore, web cache fingerprint (FR-1…FR-6).
- **Files changed:** `entrypoints/content.ts`, `lib/translationSession.ts`, `lib/cacheFingerprint.ts`, `lib/webResume.ts` (tests), `content/sectionTranslate.ts`, `services/cacheManager.ts`, `services/background.ts`, lifecycle/section/cache tests.
- **Learnings:**
  - Patterns: Extract session id + abort registry + mutex into a pure lib; content owns one instance. Stream handlers must check session on *every* `piece` event, not only final `done`.
  - Gotchas: `writeResumeSnapshot` must freeze pieces synchronously before `allPieces = []` — async IDB write alone is not enough if it closes over the live array. jsdom has no IDB — fixture FR-2/FR-4 with pure freeze + `matchResumeTranslations` contracts.
  - Context: Resume fingerprint at restore is currently `targetLanguage` (+ content hash); full config fingerprint lives on the **cache** key path (`resolveWebCacheScope`: baseUrl, model, prompt hash, glossary hash, category mode, temperature, rich-v1).
  - Fingerprint fields: `providerEndpoint`, `model`, `promptVersion`, `glossaryHash`, `categoryMode`, `temperature`, `richFormatVersion`. Languages remain on primary SHA key. Subtitle `subtitle:` / `getCachedTranslationByKey` untouched.
---

## [2026-07-20] - Phase 2–4: SPA scale, layout/a11y seams, rules
Thread: T-019f7e7a-c7f3-7040-a707-d814f175f871
- **Implemented:** Piece registry + prune (FR-7); bounded cache concurrency (FR-11); adaptive metrics key helpers (FR-12); safer langDetect + skip bar 0.78 (FR-13); stream unfinished-only fallback (FR-14); hover in-flight WeakMap (FR-15); rich token validation (FR-16); piece element map + CSS.escape (FR-29); keyboard retry (FR-25); site-rule most-specific (FR-28); blocklist label boundary (FR-28).
- **Files changed:** `entrypoints/content.ts`, `lib/langDetect.ts`, `lib/parallelCacheLookup.ts`, `lib/adaptiveBatching.ts`, `lib/translationQualityCheck.ts`, `lib/siteRules.ts`, `content/hoverTranslate.ts`, `content/translationDisplay.ts`, `content/inlineTranslate/blocklist.ts`, tests.
- **Learnings:**
  - Patterns: `Map<pieceId>` + `WeakMap<parent, Map<text, piece>>` replaces O(N×M) `allPieces.some`. Prefer translating over silent skip when script family is ambiguous (Han-only, generic Cyrillic).
  - Gotchas: `*figma.com` must use dot-boundary (`h === domain || h.endsWith('.'+domain)`), never `endsWith('figma.com')`. `findMatchingRule` most-specific: exact host score 1000+len beats longer wildcards.
  - Deferred / partial (document for follow-up): full SPA history revision observer (FR-8), mutation idle-budget + shadow-root observe (FR-9 deep), per-piece clone map rebuild elimination (FR-10 partial via pieceElements map), provider throttle atomic reservation (FR-12 pool path), full flex/grid insertion rewrite (FR-17), TO theme CSS full reset matrix (FR-18), table colspan (FR-21), status tab identity popup ignore (FR-27) — fixtures + pure helpers landed where file-local; remaining CSS/layout polish can be a successor track if real-site smoke finds gaps.
---

## [2026-07-20] - Phase 5: Fixture matrix & suite
- **Implemented:** Consolidated FR-30 fixtures in `webTranslateLifecycle`, langDetect, cacheManager, sectionTranslate, qualityCheck, siteRules, blocklist parity; full suite 638 pass; lint clean on touched files.
- **Subtitle/PDF:** No intentional behavior change; subtitle cache namespace isolation preserved (ByKey path).
---
