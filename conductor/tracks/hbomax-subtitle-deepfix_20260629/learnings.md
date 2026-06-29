# Track Learnings: hbomax-subtitle-deepfix_20260629

Patterns, gotchas, and context discovered during implementation.

## Codebase Patterns (Inherited)

### Subtitle & Interception
- WXT MAIN world injection uses `world: 'MAIN'` and `run_at: 'document_start'` in wxt.config.ts for XHR/fetch access.
- postMessage bridge uses channel identifier 'anyllm-translate') with origin validation and requestId correlation for MAIN ↔ ISOLATED world communication.
- DOM-sourced platforms (Max): manual Alt+S / context menu must call `tryAutoActivateForDom({ manual: true })` — do not require `track.url` or `autoActivateSubtitles`.
- On Max mid-session track switch, MAIN world emits `SUBTITLE_DOM_TRACK_CHANGED` after resetting the cue buffer; ISOLATED clears `domOriginalCues` / `domTranslationMap`, empties overlay cues, and sends `CANCEL_SUBTITLE_SESSION`.
- `getPatternsForCurrentHost()` only registers interceptor patterns when `handler.detect()` is true on the current hostname.
- FetchInterceptor captures `window.fetch` at module load — mock `fetch` before dynamic import of inject modules.
- Coordinator test pattern: call `vi.resetModules()` BEFORE import in `beforeEach`, then call `startCoordinator()` explicitly after import.

### HBO Max Specific
- Max CDN authenticates via auth token in URL query string (`manifest-params=...`), NOT via cookies. Sending `credentials: 'include'` forces credentialed CORS which Max's CDN rejects (returns `Access-Control-Allow-Origin: *`).
- Max renders captions into the DOM — no URL interception for subtitle patterns. Uses `DomCueSource` contract with `[data-testid="cueBoxRowTextCue"]` selector.
- Max streams HLS/DASH through generic Akamai/Fastly CDN edges whose hostnames are NOT max.com/hbomax.com. Manifest patterns match any `.m3u8` / `.mpd` URL when on a Max page.
- Max CDN VTT segment URLs may return a nested DASH MPD instead of VTT; the MPD processor follows the chain.
- Extensionless top-level manifests on `prd.media.max.com` are a single asset-id path segment before query.
- `MAX_LABEL_TO_LANGUAGE` maps English aria-labels to BCP-47 codes; falls back to `label.toLowerCase()` for unknown labels.

### Testing
- Vitest `@/` alias needs `resolve.alias` in vitest.config.ts (tsconfig paths are not auto-resolved by Vite).
- jsdom `XMLHttpRequest` fires real `readystatechange` events — use spies to capture handlers when testing interceptors.
- `vi.clearAllMocks()` resets mock implementations but NOT module-level variables.

### Refactoring
- Pre-existing lint errors in codebase are not introduced by this refactor — refactoring should be lint-neutral.
- When removing dead code, audit type, producer, and all test fixtures that reference it.

---

<!-- Learnings from implementation will be appended below -->
