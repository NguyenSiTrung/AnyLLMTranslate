# Popup Category Detection Timing — Design

Date: 2026-06-19
Status: Approved (pending user spec review)

## Problem

When Page Category Detection is enabled and the category is set to **Auto**, the
popup (opened by clicking the extension in the tray) only shows a detected category
for pages that match the synchronous heuristic — the hardcoded `DOMAIN_CATEGORY_MAP`
plus meta-keyword / h1 text matching in `content/utils/pageContext.ts`.

For two common cases the popup shows `Auto` with **no** detected category until much
later:

1. **Regular pages not in the domain map** (e.g. a random blog, a docs site that isn't
   MDN/python). The LLM-based detection (`detectLLMCategoryIfNeeded`) only runs inside
   `translatePieces` in `entrypoints/content.ts` — i.e. only when a translation is
   actually issued. If the user opens the popup before translating, the LLM result
   doesn't exist yet.
2. **Subtitle watch pages** (YouTube `/watch`, Udemy `/learn/...`, etc.). LLM
   detection only runs inside `buildSubtitlePageContext` in
   `content/subtitleCoordinator.ts`, which is only invoked when subtitles are actually
   being translated (after the user presses play and a track is discovered). Before
   that, the popup shows nothing.

The `getPageCategory` handler (`content.ts:459-471`) does fall back to a fresh
heuristic on popup open (`llmDetected ?? heuristic`), but for non-domain-map pages the
heuristic is `undefined`. The LLM `pageCategoryUpdate` broadcast only happens later,
after a translation triggers detection — by which point the user may have already
looked at the popup and seen a bare `Auto`.

## Goal

The popup should show an auto-detected category (when one is detectable) for regular
pages and subtitle watch pages, *before* any translation is issued, without
materially increasing LLM cost for pages where the user never interacts.

## Approach (hybrid, split by page type)

1. **Regular (non-subtitle) pages — lazy, on popup open.**
   No proactive LLM call for pages the user never opens the popup on. When the popup
   queries `getPageCategory` and `autoDetected` is still empty, the content script kicks
   off `detectLLMCategoryIfNeeded` (async mode) and the popup's existing
   `pageCategoryUpdate` listener fills in the result when it resolves. The existing
   behavior where page translation also triggers detection is preserved, so the
   category is still populated by the time the user translates.

2. **Subtitle watch pages — proactive on load.**
   When the subtitle coordinator starts on a watch page (`isOnWatchPage()`), it
   proactively runs `detectLLMCategoryIfNeeded` (async) once, lightly debounced, so
   the category is usually known by the time the user opens the popup or presses play.

3. **Subtitle pages — fallback on popup open.**
   The same lazy `getPageCategory` path as regular pages acts as a fallback if the
   proactive load-time detection hasn't completed (slow LLM, popup opened immediately
   after load). An in-flight guard prevents a duplicate call.

## Components

### A. `content/utils/pageContext.ts` — shared detection trigger helper

Extract a reusable helper, e.g.:

```ts
export async function triggerAutoCategoryDetection(
  settings: ExtensionSettings,
  manualOverride: string | undefined,
  onDetected: (category: string) => void,
): Promise<void>
```

It wraps `extractPageContext(document, settings.enableLLMPageCategoryDetection)` +
`detectLLMCategoryIfNeeded(...)` with the standard `onDetected` callback
(`setAutoDetectedCategory(cat)` + `broadcastCategoryInfo(settings, override)`).
Callers that already inline this pattern (`translatePieces`, `buildSubtitlePageContext`,
and the new lazy/proactive triggers) use the helper, removing duplication.

`detectLLMCategoryIfNeeded` itself is unchanged — it already no-ops on override,
existing auto-detected value, or LLM `'Other'` results.

### B. `entrypoints/content.ts` — lazy detection on `getPageCategory`

In the `getPageCategory` handler (`content.ts:459-471`), when the singleton LLM value
is `undefined` AND LLM detection is enabled AND no `categoryOverride` exists AND no
detection is already in flight, fire the async detection helper (fire-and-forget).
The handler still returns the heuristic (`llmDetected ?? heuristic`) immediately for
instant display. The popup's existing `pageCategoryUpdate` listener then updates the
display when the LLM resolves.

The in-flight guard (see D) prevents repeated calls if the popup is closed/reopened
while a detection is pending.

### C. `content/subtitleCoordinator.ts` — proactive load-time detection

Add `triggerProactiveCategoryDetection()` called once near the start of
`startCoordinator()` when `isOnWatchPage()` is true, detection is enabled, no override
exists, and no existing auto-detected value. Debounce ~1500ms after coordinator start
to let page metadata settle (titles, meta tags) before extracting page context.

On SPA navigation reset (the existing `startSpaNavigationWatcher` path), re-evaluate:
clearing the singleton's auto-detected value is out of scope (it stays per-page-load),
but the proactive trigger should re-run if the new watch page still has no detection
and no override. The in-flight guard prevents duplicates.

Uses the same shared helper from A and writes to the singleton + broadcasts, identical
to `buildSubtitlePageContext`'s existing `onDetected` callback.

### D. In-flight guard in `content/categoryState.ts`

Add module-level in-flight tracking:

```ts
let categoryDetectionInFlight = false;
export function isCategoryDetectionInFlight(): boolean { ... }
export function setCategoryDetectionInFlight(v: boolean): void { ... }
```

The flag is set `true` before firing detection and cleared in the `onDetected`
callback (success) and on failure. This prevents the lazy `getPageCategory` path and
the proactive subtitle path from both firing concurrently for the same page.

`_resetCategoryState()` (test helper) also resets this flag.

## Data flow

- **Regular page, popup opened first:** popup → `getPageCategory` → content returns
  heuristic immediately + fires async LLM detection → `onDetected` → singleton set +
  `broadcastCategoryInfo` → popup `pageCategoryUpdate` listener updates display.
- **Regular page, translate first:** unchanged — `translatePieces` already triggers
  detection; popup opened later reads the populated singleton.
- **Subtitle watch page (proactive):** coordinator starts → debounced proactive
  detection → `onDetected` → singleton + broadcast. Popup opened later reads the
  singleton directly.
- **Subtitle page, popup opened before proactive resolves:** lazy `getPageCategory`
  path fires; in-flight guard prevents a duplicate proactive call.

## Error handling

- All detection is async / fire-and-forget; failures are swallowed (existing pattern
  in `detectLLMCategoryIfNeeded`). The in-flight flag is cleared in both the
  `onDetected` success path and any catch, so a failed detection doesn't permanently
  block future lazy requests.
- `detectLLMCategoryIfNeeded` already no-ops on `'Other'` / missing category — unchanged.
- Broadcasts to a closed popup are silently dropped (existing `.catch(() => {})`).

## Testing

- **Unit:** `getPageCategory` with an empty singleton triggers exactly one async
  detection across multiple calls while one is in flight (in-flight guard).
- **Unit:** proactive subtitle detection no-ops when a manual override is set or an
  auto-detected value already exists.
- **Unit:** in-flight flag is cleared on both success and failure paths.
- **Manual:** open popup on a non-domain-map article page → category appears within
  ~1-2s without translating; on a YouTube `/watch` page → category present without
  pressing play; reopen the popup → category shows instantly from the singleton.

## Out of scope

- No changes to the `DOMAIN_CATEGORY_MAP`, blocking-mode semantics, or category
  override resolution (`override > siteRule > autoDetected`).
- No new user-facing settings.
- No clearing of the singleton auto-detected value on SPA navigation (it stays
  per-page-load; re-detection is gated by the existing `existingAutoDetected`
  short-circuit in `detectLLMCategoryIfNeeded`).