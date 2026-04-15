# Track: Subtitle Translation Flow — Wire Missing Execution Path

## Overview

The subtitle interception pipeline is architecturally complete but has a critical broken link:
`handleIntercepted()` in `content/subtitleCoordinator.ts` receives intercepted subtitle payloads
but never calls the translation service. As a result, every subtitle intercept times out (5s),
the original untranslated response is replayed to the player, and the overlay fallback
(also untranslated) is activated. No subtitle translation ever occurs.

This track wires the missing execution path: parse cues → translate via background → build
bilingual VTT → post back to XHR/fetch interceptor → player receives translated subtitles.

### Root Cause (from Oracle analysis)

| # | Location | Issue |
|---|----------|-------|
| 1 | `subtitleCoordinator.ts` `handleIntercepted()` | Only sets a timeout. Never parses cues, never calls background `translateSubtitle`, never calls `sendTranslatedSubtitle`. |
| 2 | `content/messageBridge.ts` `sendTranslatedSubtitle()` | Exported but zero call sites — never invoked anywhere in the codebase. |
| 3 | `subtitleCoordinator.ts` `activateOverlayMode()` | Calls `initializeOverlay(cues)` with untranslated cues — overlay fallback shows original language. |
| 4 | `inject/subtitleHandlers/registry.ts` | No `getHandlerByPlatform()` helper — can't resolve handler by platform string in coordinator. |

### Existing Infrastructure (already correct — no changes needed)

- `XhrInterceptor` — blocks handlers, waits for `SUBTITLE_TRANSLATED`, overrides `responseText`, replays handlers ✅
- `FetchInterceptor` — blocks response, waits for `SUBTITLE_TRANSLATED`, returns new `Response(vttContent)` ✅
- `handleTranslateSubtitle()` in `services/background.ts` — fully implemented with cache read/write ✅
- `lib/subtitleBuilder.ts` — `buildBilingualVTT()` and `buildTranslationOnlyVTT()` both exist ✅
- `content/messageBridge.ts` `sendTranslatedSubtitle()` — defined, just never called ✅

---

## Functional Requirements

### FR-1: Parse Intercepted Cues
`handleIntercepted` must resolve the platform handler by `payload.platform` using a new
`getHandlerByPlatform()` registry helper, call `handler.transformResponse(body, contentType, url)`
to parse raw cues, and skip silently if `cues.length === 0` (empty/sprite track).

### FR-2: Translate Cues via Background
After parsing, call `chrome.runtime.sendMessage({ action: 'translateSubtitle', cues,
sourceLanguage, targetLanguage })` where:
- `sourceLanguage` = `payload.originalLanguage` if non-empty, else `settings.sourceLanguage`
- `targetLanguage` = `settings.targetLanguage` (read via `loadSettings()` — ISOLATED world, chrome.* accessible)

### FR-3: Serialize and Return Translated VTT
After background responds with translated cues, call `buildBilingualVTT` or
`buildTranslationOnlyVTT` from `lib/subtitleBuilder.ts` based on `settings.displayMode`.
Call `sendTranslatedSubtitle({ requestId, vttContent })` to post `SUBTITLE_TRANSLATED`
back to MAIN world, unblocking the interceptor before its 5s timeout fires.

### FR-4: Clear Fallback Timeout on Success
On successful translation, call `clearPendingRequest(requestId)` to cancel the
overlay-fallback timer.

### FR-5: Translate Overlay Fallback Cues
In `activateOverlayMode`, after parsing cues from fetched subtitle content, translate them
via background service before calling `initializeOverlay(translatedCues)`. On translation
error, fall back gracefully to `initializeOverlay(cues)` with original cues.

### FR-6: Handle sourceLanguage Gracefully
If `payload.originalLanguage` is empty (not all handlers extract language from URL),
fall back to `settings.sourceLanguage`.

---

## Non-Functional Requirements

- No new dependencies or files introduced beyond the registry helper
- Translation errors are silent (log + let timeout replay original / overlay falls back to original)
- All async operations properly awaited — no floating promises

---

## Acceptance Criteria

- [ ] On a YouTube page, intercepted `timedtext` subtitles are translated and returned to the player
- [ ] On a Udemy page, intercepted `.vtt` subtitles are translated and returned to the player
- [ ] Bilingual mode (`displayMode: 'bilingual-below'`): player shows `translated\noriginal` per cue
- [ ] Translation-only mode (`displayMode: 'translation-only'`): player shows only translated text
- [ ] Overlay fallback (when triggered) shows translated cues, not original language
- [ ] Sprite/empty cue tracks are silently skipped — no background service call made
- [ ] Unit tests cover: handler lookup by platform, translation dispatch and reply, VTT send-back, overlay translate path
- [ ] All existing tests continue to pass (no regressions)

---

## Out of Scope

- Adding new platform handlers (Netflix, etc.)
- Changing the XHR/fetch interceptor block-and-wait mechanism
- UI changes to subtitle controls or overlay appearance
- Changing `handleTranslateSubtitle` in `services/background.ts`
