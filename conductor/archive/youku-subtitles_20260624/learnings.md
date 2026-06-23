# Track Learnings: youku-subtitles_20260624

Patterns, gotchas, and context discovered during implementation.

## Codebase Patterns (Inherited)

### Subtitle Handler Architecture
- `SubtitleHandler` interface lives in `inject/subtitleHandlers/registry.ts:9-35`. Methods: `platform`, `detect()`, `getPatterns()`, `transformResponse()`, optional `getMetadataPatterns()` / `extractAvailableTracks()` / `getDomCueSource()` / `isWatchPage()`.
- Handlers live in `inject/subtitleHandlers/`. 5 existing: youtube, udemy, coursera, linkedin, hbomax. (No netflix handler despite docs.)
- `subtitleCoordinator.ts` and `registry.ts` are platform-agnostic — no edits needed to add a handler.
- Handlers must be registered in BOTH worlds: `entrypoints/inject.content/index.ts` (MAIN) + `entrypoints/content.ts` (ISOLATED). Content scripts match `<all_urls>` so no manifest/host-permission changes.

### DOM Cue Scraping (HBO Max precedent)
- `getDomCueSource(): DomCueSource` contract — MutationObserver on stable ancestor, re-resolve cue selector per fire, sample `video.currentTime` (via shared `findPrimaryVideo()`) for timing, deferred-attach for late-mounting SPA player, rolling buffer reset on track switch.
- Native captions hidden via `visibility: hidden !important` (coordinator DOM branch).
- `extractAvailableTracks()` returns `url: undefined` for DOM-sourced platforms.
- Manual activation: `tryAutoActivateForDom({ manual: true })` (Alt+S / context menu) — does not require `track.url` or `autoActivateSubtitles`.
- Track switch: MAIN emits `SUBTITLE_DOM_TRACK_CHANGED` → ISOLATED clears `domOriginalCues`/`domTranslationMap`, empties overlay, sends `CANCEL_SUBTITLE_SESSION`.

### Wiring Touchpoints (per Explore report)
- `lib/subtitleSites.ts:17-23` — add to `SUPPORTED_SUBTITLE_SITES`. **MUST** update `lib/__tests__/subtitleSites.test.ts:10-16` (length 5→6, ordered array assertion).
- `services/background.ts:714-727` — `SUBTITLE_ALLOWLIST` gates the CORS-bypass `FETCH_SUBTITLE` path. Add Youku CDN domains here for the overlay-fallback fetch (Phase 2).
- `lib/subtitleProfiles.ts:46-53` — `DOMAIN_PROFILE_MAP` hostname → `'educational'|'media'|'cinematic'`. Youku (drama/film) → `'cinematic'`.
- `lib/findPrimaryVideo()` — shared video-selection helper for cue sampling + overlay attachment.

### Testing Conventions
- Test files in `tests/unit/`, vitest (`describe`/`it`/`expect`). Template: `courseraHandler.test.ts` (closest to a DOM/VTT handler), simpler sibling `udemyHandler.test.ts`.
- `setLocation(hostname, pathname)` via `Object.defineProperty(window, 'location', ...)`, restore in `afterEach`.
- Nested `describe` per method. Standard cases: `platform` id, `detect()` true for canonical+subdomain false for spoofed, `getPatterns` match real URLs, `transformResponse` parses fixtures, `extractAvailableTracks` malformed → `[]` with `console.warn` spy.
- Coordinator test pattern: `vi.resetModules()` before dynamic import in `beforeEach`, then call `startCoordinator()` explicitly; capture listener handlers in module-level vars from mock factories.
- `FetchInterceptor` captures `window.fetch` at module load — mock `fetch` before dynamic import of inject modules. jsdom `XMLHttpRequest` fires real `readystatechange` — use spies.

## Youku Platform Context (from sample HTML analysis)

- **Player:** Youku custom H5 player (KUI framework, v9.8.7). MSE/blob video (`<video src="blob:...">`), **DRM-protected** (`isDRM: '1'`).
- **No `<track>`/`textTracks`** — captions render as **SVG `<text>/<tspan>` inside `<div id="subtitle">`** (z-index:2, absolute, pointer-events:none). SVG `<text x=... y=...>` with stroke + fill styling, e.g. `<text x="2.33" y="0"><tspan ... y="42.17">They've just passed out.</tspan></text>`.
- **No subtitle URL or API endpoint in static HTML.** `playerConfig` has only `vid`, `defaultCkey`, `ikuDefaultCkey` (signed request tokens). Subtitle payload fetched dynamically at runtime (likely via c.youku.com / mtop.youku.com / acs.youku.com) — requires live DevTools observation.
- **Player container:** `<div id="ykPlayer" class="youku-player">`.
- **Video IDs:** encrypted form `XNjQ4MDkzODY2NA==` (`videoId2`), numeric `1620234666` (`videoId`), show/album `ecee4c5475b64bccb933` (`showid_en`).
- **Watch URL:** youku.tv `https://www.youku.tv/v/v_show/id_XNjQ...==.html`.
- **Locale:** page `vi_VN`; hreflang locales zh_CN, zh_TW, in_ID, ms_MY, es_ES, en_US, th_TH, pt_BR, vi_VN.

### Youku Language Codes (non-standard → BCP-47 map needed)
From the subtitle picker (`com="subtitle"` panel, `data-val`):

| Youku code | `data-val` | Language | → BCP-47 |
|---|---|---|---|
| CHS | default | 简体中文 (Simplified) | zh-Hans |
| CHT | cht | 繁體中文 (Traditional) | zh-Hant |
| EN | en | English | en |
| KR | kr | 한국어 | ko |
| ES | es | Español | es |
| PO | po | Português | pt |
| TH | th | ภาษาไทย | th |
| AR | ar | العربية (auto-translated) | ar |
| ID | id | Bahasa Indonesia | id |
| VI | vi | Tiếng Việt | vi |
| MS | ms | Bahasa Melayu (auto-translated) | ms |

**Note:** `AR` and `MS` are flagged "auto-translated" by Youku — may be generated on-demand.

---

<!-- Learnings from implementation will be appended below -->

## [2026-06-24] Phase 1 & 2: YoukuHandler + Wiring
- **Implemented:** `YoukuHandler` (DOM cue scraping) mirroring HBO Max; pure `youkuCodeToLanguage()` map; registered in both worlds; added to `SUPPORTED_SUBTITLE_SITES`; mapped to `cinematic`; context-menu + auto-activate reuse the generic coordinator paths unchanged.
- **Files changed:** `inject/subtitleHandlers/youku.ts` (new), `tests/unit/youkuHandler.test.ts` (new), `lib/subtitleSites.ts`, `lib/subtitleProfiles.ts`, `entrypoints/inject.content/index.ts`, `entrypoints/content.ts`, `entrypoints/background.ts`, plus 3 test fixtures (`subtitleSites`, `subtitleProfiles`, `SubtitlesSection`).
- **Tests:** 58 new youku tests + 7 new profile tests; 1477/1478 suite (1 pre-existing date-rollover unrelated). tsc/lint/build clean for new code (5 pre-existing lint + 3 pre-existing tsc errors tracked as subtitle-quality follow-up).
- **Learnings:**
  - **Pattern:** `resolveProfile()` was exact-hostname-only, so subdomains (`v.youku.com`, `www.youku.tv`, `m.youku.com`) fell through to `media`. Made it subdomain-aware via a label-stripping walk (match host → strip leftmost label → re-match, stop at 2 labels). Latent HBO Max gap surfaced as a bonus regression test: `play.hbomax.com` was silently `media` before. Generic improvement — any future multi-subdomain platform benefits.
  - **Pattern:** Youku videoId is base64-like and the watch URL appends `.html` (`/v_show/id_XNjQ4...==.html`). The naive `([^/]+)` capture swallowed the `.html`. Use `([^/.]+)` since the id charset never contains `.` or `/`.
  - **Pattern:** Youku marks the active picker item inconsistently — class (`current`/`active`/`on`/`selected`) OR `aria-selected="true"`. `readActiveLanguage()` checks both; class check uses a word-boundary regex so a future item class like `subtle-current` won't false-positive.
  - **Pattern:** When two DOM-cue platforms share the same `methodHint` ('DOM cue scraping' — HBO Max + Youku), the SubtitlesSection test's `getByText` (singular) breaks. Switch to `getAllByText(...).toHaveLength(2)`. The UI renders from `SUPPORTED_SUBTITLE_SITES.map(...)`, so adding a site needs no component change — only the test's hardcoded counts.
  - **Context:** `data-val="default"` is Youku's Simplified-Chinese sentinel (not a real code). Map it to `zh-Hans` in `YOUKU_CODE_TO_LANGUAGE` alongside `chs`.
  - **Gotcha:** `domCueSource.ts` hardcodes the HBO Max track-change observer to `[data-testid="player-ux-text-track-button"]`. Youku's picker has no such attribute, so on Youku the `SUBTITLE_DOM_TRACK_CHANGED` bridge event won't fire on manual track switch. Acceptable for Phase 1 (cue text still updates via the generic observer; buffer reset is best-effort). Flagged for a future generalization — the selector should be derived from the `DomCueSource` contract (e.g. an optional `trackSwitchSelector`).

## [2026-06-24] Phase 3.3: domCueSource track-switch generalization (closes 8v6)
- **Implemented:** Added optional `trackSwitchSelector?` + `trackSwitchAttribute?` (default `aria-checked`) to `DomCueSource`; `domCueSource.ts` reads them from the contract, uses `element.matches()` so descendant combinators (Youku's `[com="subtitle"] [data-val]`) work, and skips the observer entirely when no selector is configured. HBO Max now declares its previously-hardcoded config (behavior unchanged); Youku declares `aria-selected`.
- **Files changed:** `types/subtitle.ts`, `inject/domCueSource.ts`, `inject/subtitleHandlers/hbomax.ts`, `inject/subtitleHandlers/youku.ts`, `tests/unit/domCueSource.test.ts`.
- **Commit:** 9cde01f. 2 new tests RED→GREEN; suite 1479/1480 (1 pre-existing date-rollover).
- **Learnings:**
  - **Pattern:** When a generic module hardcodes a platform-specific selector, move it to the per-platform contract as an optional field and have the generic module read it — the diff is small and the behavior for existing platforms is byte-identical (they declare the same config they used to get for free). Same "pure data at the seam" philosophy as `resolveEffectiveKnobs` and `videoIdExtractor`.
  - **Pattern:** `element.matches(selector)` handles descendant combinators (`A B`) that `attributeFilter` alone cannot — the mutation fires on the deepest target, and `matches()` returns true whether the element is the button itself (HBO Max) or a nested picker item (Youku). Use it instead of `getAttribute('data-testid') === '...'` equality.
  - **TDD note:** When moving hardcoded behavior into a contract field, the existing tests' fixture must declare the field too — otherwise the (previously-implicit) behavior disappears and the test fails. Updated `makeDomSource()` in `domCueSource.test.ts` to include HBO Max's `trackSwitchSelector`/`trackSwitchAttribute` so the existing "resets on track switch" test stays valid now that the observer is conditional.
