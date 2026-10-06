<!-- conductor-refresh: 2026-10-05 all (package.json/pnpm-lock unchanged, CI unchanged; no stack or tooling drift in the three post-refresh commits. Quality gates RERUN this refresh: 743/743 green across 117 files in 23.6 s (the 118th file was a stale duplicate test, now deleted), tsc 0, lint 38 errors, build 3.92 MB. Coverage not rerun — last measured 2026-09-28 at 80.26/77.40/83.08.) -->
# Tech Stack — AnyLLMTranslate

## Core Language

| Technology | Version | Rationale |
|-----------|---------|-----------|
| **TypeScript** | 5.x | Type safety across all extension contexts (background, content, inject, UI) |
| **Node.js** | ≥ 20.12.0 | Pinned via `package.json` `engines` (WXT/Vite toolchain) |

## Build & Tooling

| Technology | Version | Rationale |
|-----------|---------|-----------|
| **WXT** | 0.20.22 | Modern Chrome Extension framework with Manifest V3 native support, multi-entry builds, hot reload |
| **@wxt-dev/module-react** | 1.x | WXT React integration module for React entrypoints |
| **Vite** | 8.x | Bundled with WXT — fast builds, HMR, ESBuild-powered |
| **pnpm** | 9.x | Fast, disk-efficient package manager |

## UI Layer

| Technology | Version | Rationale |
|-----------|---------|-----------|
| **React** | 19.x | Component-based UI for popup, options page, side panel |
| **Tailwind CSS** | 4.x | Utility-first styling for extension UI components |
| **Lucide React** | latest | Consistent, lightweight icon set |
| **Zustand** | 5.x | Lightweight reactive state management, synced with chrome.storage |
| **pdfjs-dist** | 4.x | PDF.js library for built-in PDF viewer — canvas rendering, text extraction, page proxy streaming |
| **pdf-lib** | 1.x | PDF generation library for dual/mono export assembly — page embedding, text overlay, rectangle masking (Helvetica fallback; `@pdf-lib/fontkit` no longer a package dependency after Fast-path removal) |

## Extension APIs

| API | Usage |
|-----|-------|
| **chrome.storage.local** | Settings persistence, provider config |
| **chrome.runtime** | Message passing between background ↔ content ↔ popup |
| **chrome.tabs** | Tab-level translation state, live DOM-outline capture, and temporary-tab fallback for Site Rule suggestions |
| **host_permissions** | YouTube watch/timedtext access for embedded-caption fallback and link pre-align (`*://*.youtube.com/*`); Max/HBO Max subtitle hosts and their CDN edges — `*://*.max.com/*`, `*://*.hbomax.com/*`, `*://*.media.max.com/*`, `*://*.hbo.com/*` (HBO landing host the player redirects through), `*://*.delivery.mp.microsoft.com/*` (Microsoft delivery edge some Max clients stream from) — kept in sync with the background subtitle fetch allow-list and `docs/PUBLISHING.md` (MAX-39/42); Nous Portal inference gateway (`https://inference-api.nousresearch.com/*`); scientific-PDF loopback (`http://127.0.0.1/*`, `http://localhost/*`) |
| **chrome.sidePanel** | Side panel reading view |
| **chrome.contextMenus** | Right-click translation actions |
| **chrome.commands** | Keyboard shortcuts |

## Data Layer

| Technology | Usage |
|-----------|-------|
| **IndexedDB** (via idb-keyval) | Translation result caching, glossary storage |
| **chrome.storage.local** | User settings, provider configuration |

## CSS Strategy

| Approach | Context |
|----------|---------|
| **CSS Custom Properties + inject.css** | Translation themes on host pages — avoids shadow DOM conflicts |
| **Tailwind CSS** | Extension-owned UI only (popup, options, side panel) |

## Testing

| Technology | Version | Usage |
|-----------|---------|-------|
| **Vitest** | 3.x | Unit tests for DOM walker, translation engine, parsers |
| **@vitest/coverage-v8** | 3.x | V8-based code coverage provider for Vitest |
| **jsdom** | 29.x | DOM environment for unit tests (Vitest environment) |
| **Playwright** | - | E2E testing with Chrome extension loading |
| **Testing Library** | latest | React component tests |

## Code Quality

| Technology | Version | Usage |
|-----------|---------|-------|
| **ESLint** | 10.x | Flat config with TypeScript rules |
| **Prettier** | 3.x | Code formatting |

## Developer Scripts

| Script | Command | Purpose |
|--------|---------|----------|
| `dev` | `wxt` | Start dev server with hot reload |
| `dev:firefox` | `wxt -b firefox` | Dev server for Firefox |
| `build` | `wxt build` | Production build for Chrome MV3 |
| `build:firefox` | `wxt build -b firefox` | Production build for Firefox |
| `zip` | `wxt zip` | Package for Chrome Web Store |
| `zip:firefox` | `wxt zip -b firefox` | Package for Firefox Add-ons |
| `zip:source` | `bash scripts/source-archive.sh` | Reviewer source archive from a curated allow-list (see `docs/PUBLISHING.md`) |
| `compile` | `tsc --noEmit` | Type-check without emitting |
| `test` | `vitest run` | Run test suite once |
| `test:fast` | `vitest run lib tests/unit` | Fast subset — lib + tests/unit only |
| `test:watch` | `vitest` | Run tests in watch mode |
| `test:coverage` | `vitest run --coverage` | Run tests with V8 coverage report |
| `lint` | `eslint .` | Check for lint errors |
| `lint:fix` | `eslint . --fix` | Auto-fix lint errors |
| `format` | `prettier --write '**/*.{ts,tsx,css,json,md}'` | Format all source files |

## CI/CD

| Technology | Usage |
|-----------|-------|
| **Chrome Web Store API** | Manual extension publishing via `pnpm zip` |
| **GitHub Actions — `pages.yml`** | Deploys `docs/guide/` to GitHub Pages on `master` push (path-scoped) / `workflow_dispatch`; OIDC `pages` permissions |
| **GitHub Actions — `bridge-image.yml`** | Builds + publishes the scientific-pdf-bridge Docker image to GHCR on `master` pushes touching `services/scientific-pdf-bridge/**` and `v*` tags |

## Architecture Decisions

### Why WXT over CRXJS?
- WXT is actively maintained and purpose-built for MV3
- Built-in support for content scripts, background workers, and UI pages
- Better TypeScript integration and developer experience

### Why Zustand over Redux/Jotai?
- Minimal boilerplate for extension state management
- Easy synchronization with chrome.storage.local
- Tiny bundle size (~1KB)

### Why IndexedDB for cache?
- No storage limits (unlike chrome.storage.local 10MB cap)
- Structured data with indexed queries
- Async, non-blocking operations

### Why CSS Custom Properties for themes?
- Works seamlessly with host page styles
- No shadow DOM complexity
- Theme switching is instant (CSS variable update)
- 15+ themes achievable with variable swapping

### Why a bundled PDF.js viewer?
- Chrome's built-in PDF viewer runs in a sandboxed plugin — content scripts cannot access the rendered DOM
- Bundling `pdfjs-dist` (~1.38 MB worker) inside the extension gives full control over page rendering, text extraction, and translation overlay
- The viewer is an unlisted WXT page (`entrypoints/pdf-viewer/`) that opens via redirect or popup action
- Side-by-side layout (canvas left, translated result right) avoids injecting into the original PDF rendering pipeline

### Why an optional Scientific PDF Docker bridge?
- Layout-preserving scientific translation (pdf2zh / PDFMathTranslate) needs Python + models — must **not** ship in the MV3 bundle (size + AGPL)
- Thin FastAPI orchestrator in `services/scientific-pdf-bridge/` calls pdf2zh at **runtime** only; extension talks HTTP to loopback (`127.0.0.1:17890` by default)
- Per-job OpenAI-compatible credentials come from the extension provider pool — no second credential store
- `MOCK_TRANSLATE=1` enables CI/smoke without downloading ONNX models
- Helper scripts: `scripts/scientific-pdf-docker.sh` / `scientific-pdf-up.sh` / `scientific-pdf-down.sh`; compose: `docker-compose.scientific-pdf.yml`
- Production extension build (`.output/chrome-mv3`) is ≈ **3.85 MB** total (`du` 3.7 MB; WXT reports 3.85 MB) as of 2026-09-12; bridge is external

### Why no dedicated TTS / speech package?
- Selection **Speak** uses the browser **Web Speech API** (`speechSynthesis`) for zero-dependency offline voices, with pure `pickBrowserVoice` matching speak language
- Optional provider TTS hits OpenAI-compatible `/audio/speech` (plus Mistral Voxtral dialect) from the **background** service worker only (keys never enter content scripts)
- **Hybrid credentials** (`pool` | `custom`) and **per-language stacks** (`languageOverrides`) are pure settings + resolve helpers — no second credential store UI and no new npm deps
- Pure modules in `lib/tts/`: `resolveTtsBackend`, `providerTts`, `pickBrowserVoice`, `listTtsVoices`

### Why thinkingMode is request-shape, not a new SDK?
- Hosted models differ: NIM/vLLM style `chat_template_kwargs.enable_thinking` vs Google AI Studio `reasoning_effort`
- Pure mappers in `lib/thinkingMode.ts` keep `OpenAICompatibleService` free of per-vendor SDK deps
- `auto` omits fields so server defaults apply; rejection self-heals like `response_format`

### Why Google multi-model is pure helpers, not a new package?
- Free-tier Gemini RPM/RPD are **per model** (and per project); stacking Flash + Flash-Lite needs first-class `(key × model)` slots without a vendor SDK
- Pure `lib/googleMultiModel.ts` + `resolveSlots` expansion keep the pool coordinator free of Gemini-specific npm deps
- Composite `slotId` (`keyId::model`) scopes circuit breakers and throttle so one model’s 429 does not cool siblings on the same key
- Non-Google providers strip `models` / `modelStrategy` on normalize — zero schema migration for other catalogs
- **Empty model ids must not empty the pool:** `resolveProviderModels` always returns at least one entry (may be `""`) so default/blank model configs still yield a dispatchable slot

### Why thinkingDetection is pure helpers, not a new package?
- Connection-test verdicts need to judge whether Thinking **Off** suppressed reasoning without a vendor SDK
- Pure `lib/thinkingDetection.ts` inspects `reasoning_content` and `<think>` tags; `providerTester` only wires request shape + UI summary
- Same pure-lib style as `thinkingMode.ts` / multi-model — unit-testable without chrome or network

### Why player chrome is plain DOM, not React
- In-player chrome (`content/playerChrome/`) injects into host video players where React would fight site CSP/event systems; it uses lightweight shadow-DOM DOM builders and reuses existing subtitle prefs/message paths instead of a second settings blob.
- **Hybrid mount:** per-site adapters (YouTube/Udemy/Coursera) inject into native control bars when selectors match; a rect-tracked **floating fallback** keeps the feature on every other player, including fullscreen via reparenting. Native failure never removes the feature.
- **Soft-mirror visibility** is a pure state machine (`visibility.ts`) driven by adapter signals or an activity heuristic on the player root, with a sticky open-panel exception — unit-testable without chrome APIs.

### Why Site Rule suggestions use structural outlines?
- Full HTML and article bodies are unnecessary and privacy-expensive for selector inference. `lib/siteRuleSuggest/outline.ts` emits a capped semantic outline with bounded text samples.
- The background prefers a matching open tab, then loads a temporary inactive tab so SPA/login-aware pages can still provide rendered structure without granting broad remote fetch logic.
- Provider failures and invalid JSON fail open to deterministic heuristics; all LLM fields pass hostname/selector sanitization before the editable draft reaches UI.
- The `tabs` permission is required to query matching tabs and manage the temporary capture tab.

### Why Plus mode is a run state machine, not a flag on the progressive loop?
- Progressive translation is a playback-priority queue: chunk order, glossary growth and reveal timing are all emergent. Plus needs the opposite — one terminology decision frozen *before* the first cue and a single reveal point — so it ships as a separate run state machine (`content/subtitlePlusRun.ts` + the background controller) with an explicit `preflight → translate → commit` lifecycle and exactly one terminal message (`SUBTITLE_PLUS_COMPLETE`, always sent).
- `translateChunk` was **parameterized** (cache-key fn, glossary block, forward-merge flag) rather than forked, so the progressive caller passes today's values and keeps byte-identical cache keys and prompts. Plus scopes its own cache/storage namespace instead of inheriting the film-glossary keys.
- Eligibility is a pure predicate (`lib/subtitlePlusEligibility.ts`) re-validated in the background — a delta request is never a complete track even if a caller mislabels it — and every downgrade (`ineligible` / `empty-prep` / `prep-failed`) is surfaced to the user rather than silently falling back.

### Why is consent enforced at every boundary instead of a single UI gate?
- CWS treats “prominent disclosure + affirmative consent” as a precondition for handling user data, so a UI-only checkbox cannot be the enforcement point: `services/background.ts` refuses user-data messages with `CONSENT_REQUIRED_ERROR`, the content script stops the session with a sticky banner (no page text read, zero network), the popup swaps its whole surface for the disclosure, and the wizard's Privacy step cannot be skipped. `lib/privacyConsent.ts` versions the disclosure, so a changed data practice (vs. `PRIVACY_POLICY_VERSION`) re-discloses automatically.

### Why do page-translation reads and teardown span shadow roots?
- Modern site chrome (and some article bodies) live in open shadow roots, where `querySelectorAll` from the document does not reach. `content/shadowDomRoots.ts` centralizes root discovery so extraction, piece retirement and teardown agree on one set of roots — otherwise a re-run stacks a second translation over invisible-to-the-walker nodes or leaves translated pieces behind after the page edits its own source.

- Quality gates snapshot (2026-10-05, rerun this refresh): **743** Vitest TCs across **117** test files — the full default `vitest run` is **green in 23.6 s**. The file count dropped from 118 because this refresh deleted `entrypoints/options/sections/__tests__/captionQualityPlus.test.tsx`: commit `945a388` documented renaming it to `translationModeCard.test.tsx` and staged only the addition, so both files shipped and the stale one (importing `CaptionQualityCard`, which no longer renders the toggle) failed deterministically at HEAD. The replacement file is a strict superset (it adds a disabled-state case), so removing the duplicate cost no coverage. **Both load-sensitive files flake even in isolation** — `services/__tests__/background.streamStats.test.ts` failed 3 of 6 isolated runs and `content/__tests__/subtitleCoordinator.test.ts` 1 of 5, with the failing *case* moving between runs — so the earlier "both pass in isolation" claim was wrong: isolation does not clear them. `tsc --noEmit` **0 errors**. **ESLint: 38 errors — the lint gate is NOT green**, unchanged from the 2026-09-28 snapshot: 32 in `content/__tests__/webTranslateLifecycle.test.ts` (`no-explicit-any` ×30, `consistent-type-imports` ×2), 4 `no-useless-escape` in `services/__tests__/background.plus.test.ts`, 1 `no-non-null-assertion` at `entrypoints/content.ts:1564`, and 1 `preserve-caught-error` at `services/providerPool.ts:573`. Filed as `AnyLLMTranslate-e140`; the count must not grow until it is fixed. Build: **3.92 MB** WXT total (`du` 3.8 MB). Coverage was **not** rerun (no source changed in this window); last measurement 2026-09-28 = 80.26 % statements / 77.40 % branches / 83.08 % functions. `package.json` and `pnpm-lock.yaml` are unchanged since 2026-08-05 (only the `zip:source` script line) — 8th consecutive window with no dependency drift. CI/CD unchanged — `pages.yml` and `bridge-image.yml` remain the only two workflows.
- Quality-gate policy change (2026-09-11, user decision): the test-coverage target is now **≥70 %** (was ≥80 %). The old target stopped being the governing rule the moment `inject/**` entered the coverage include — the full surface measured 78.31 %, so a floor of 70 % is the number new work is held to. `CONTRIBUTING.md` and `conductor/workflow.md` were updated in the same change.
- Source/tests added since 2026-09-10 (no new npm deps): `lib/subtitleTeardown.ts` (+ `lib/__tests__/subtitleTeardown.test.ts`), `inject/__tests__/maxVttPerformanceCapture.test.ts` (19 Max capture cases), `tests/unit/hbomaxHandler.test.ts`, `entrypoints/options/sections/subtitles/__tests__/SourceTrackCard.test.tsx`. Heavily modified: `content/subtitleCoordinator.ts` (+418 lines for Max lifecycle/language/tier work), `inject/maxVttPerformanceCapture.ts`, `inject/domCueSource.ts`, `inject/xhrInterceptor.ts`, `lib/maxMpdSubtitles.ts`, `lib/maxSubtitleLanguages.ts`, `lib/youtubeAsrResegment.ts`, `inject/subtitleHandlers/youtube.ts`.
- Config/tooling: `vitest.config.ts` coverage `include` gained `inject/**` (MAIN-world Max capture + handlers were previously invisible to coverage); `wxt.config.ts` `host_permissions` gained `*://*.hbo.com/*` and `*://*.delivery.mp.microsoft.com/*`, mirrored in `docs/PUBLISHING.md`; `MAX-39` added a host-permission pre-flight before offering the Max manifest tier.
- Source/tests added 2026-09-11→12 (round-2 hardening, no new npm deps): `inject/subtitleHandlers/worldHandlers.ts` (single handler registry shared by MAIN + isolated worlds) + `tests/unit/worldHandlers.test.ts`; `lib/subtitleRetry.ts` `isRetryableTranslationError` + `lib/__tests__/subtitleRetry.test.ts`; `MAX_MANIFEST_CUES` in `lib/constants.ts`. Heavily modified: `inject/maxVttPerformanceCapture.ts` (+148 — pathname-tail representation identity, `failedSegments` cooldown recovery, bounded buffer), `services/background.ts` (+308 — per-tab fetch `AbortController`s, `SEGMENT_FETCH_CONCURRENCY = 4` ordered DASH fan-out with 30 s body-read deadline, wildcard-aware host-permission pre-flight), `content/subtitleCoordinator.ts` (+318 — MSE delta accumulation, playhead-anchored buffer window, `notifyUntranslatedSection`), `entrypoints/content.ts` + `entrypoints/inject.content/index.ts` (world-registry wiring), `types/subtitle.ts` (MPD status union). `.gitignore` gained `.workbuddy-ai/`.
- Docs added: `docs/hbomax-subtitle-risk-audit.md` (42 findings, per-finding status table, §7 round-2 implementation table, §8 live-verification backlog) and `docs/superpowers/plans/2026-09-11-hbomax-subtitle-fixes.md` (936-line eight-phase plan); round 2 added `docs/superpowers/plans/2026-09-11-subtitle-hardening-round2.md` (783-line seven-task plan, all tasks checked).
- Source added 2026-09-12→28 (no new npm deps): `lib/privacyConsent.ts` (versioned disclosure + `hasValidConsent` + `CONSENT_REQUIRED_ERROR`), `lib/subtitlePlusEligibility.ts` (`resolvePlusEligibility`, `PLUS_MIN_CUES`, `PLUS_HINT_MIN_CUES`), `content/subtitlePlusRun.ts` (Plus run controller), `content/shadowDomRoots.ts` (467 lines — document + open-shadow-root extraction/teardown), `lib/pdfSiteExceptions.ts`, `entrypoints/options/lib/settingsTabs.ts` (tab registry), the Speech / PDF / Advanced card component splits (`entrypoints/options/sections/{speech,pdf}/`, `…/sections/advanced/{AdvancedSectionNav,TranslationEngineCard,PerformanceCard,WebsiteCompatibilityCard,DataRecoveryCard,DiagnosticsCard}.tsx`), `entrypoints/options/components/wizard/steps/ConsentStep.tsx` + `sections/PrivacyConsentCard.tsx` + `popup/components/ConsentRequiredPanel.tsx`, `scripts/source-archive.sh`, `__mocks__/wxt/sandbox.ts`, and `.agents/{setup,resume}`. Heavily modified: `entrypoints/options/sections/AdvancedSection.tsx` (2,462 lines decomposed), `content/inlineTranslate/{writeback,editable,feedback,orchestrate}.ts`, `services/background.ts`, `content/translationDisplay.ts`, `content/mutationWatcher.ts`, `entrypoints/content.ts`, `types/config.ts` (+52 — `SubtitleTranslationMode`, `privacyConsent`, `inlineGestureWindowMigrated`), `types/messages.ts` (+44 — `completeTrack`, `SUBTITLE_PLUS_{PROGRESS,COMPLETE}`, `failed[]`), `wxt.config.ts`, `vitest.config.ts` + `vitest.setup.ts`.
- Docs added 2026-09-12→28: `docs/store-listing.md` (every CWS dashboard field + the listing/policy/code-agreement rule), the **hosted** `docs/guide/privacy.html` (the submission policy URL, deployed by `pages.yml`), `docs/PUBLISHING.md` rewrite, and the design/plan set `docs/superpowers/specs/2026-09-12-advanced-settings-redesign-design.md`, `docs/superpowers/plans/2026-09-12-{advanced-settings-redesign,settings-pdf-tab,settings-speech-tab}.md`, `docs/superpowers/plans/2026-09-20-inline-translate-chat-hardening.md`, `docs/superpowers/specs/2026-09-27-subtitle-plus-mode-design.md`, `docs/superpowers/plans/2026-09-27-subtitle-plus-mode.md`.
- Config/tooling 2026-09-12→28: `vitest.config.ts` now maps `wxt/sandbox` to `__mocks__/wxt/sandbox.ts` and runs `pool: 'threads'` (a process fork per file cost 117 s + 5 load-sensitive failures on a 4-core host, versus ~63 s all-green with threads); `vitest.setup.ts` adds a global `afterEach` timer hand-back so a leaked fake timer cannot poison later files; `wxt.config.ts` drops the unused `activeTab` permission (comment records why it must not come back) and narrows `web_accessible_resources` from `assets/*` + `icon/*` to `icon/128.png`; `package.json` `zip:source` runs `bash scripts/source-archive.sh`; `.gitignore` gained the bd schema-gate flock files and `.amp/portals/*`.
- Source/tests changed 2026-09-29→10-05 (no source, no npm deps): **only test-file and docs churn** — `entrypoints/options/sections/__tests__/captionQualityPlus.test.tsx` **deleted** (a stale duplicate of `translationModeCard.test.tsx` left behind by `945a388`'s never-staged rename; it was the only deterministic red in the suite), `CLAUDE.md` deleted in favour of `AGENTS.md` (`029853b`), and `README.md` resynced to the codebase (`1c99463`). No file under `lib/`, `services/`, `content/`, `inject/`, `entrypoints/`, `types/`, `stores/` or `styles/` changed, so the 2026-09-28 coverage numbers still describe HEAD.
