<!-- conductor-refresh: 2026-09-11 all (package/lock still unchanged — deps frozen since 2026-08-05; no new CI workflows; 725 pass / 0 fail across 213 files; coverage 78.31 % stmts re-measured with inject/** newly in the include; tsc 0 / lint 0 re-run; build 3.84 MB; host_permissions gained *.hbo.com + *.delivery.mp.microsoft.com (MAX-39) and docs/PUBLISHING.md was realigned; coverage target lowered 80 % → 70 % by user decision; 73 archived / 0 active; Beads 1 open + 2 in progress) -->
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
| `zip:source` | `git archive -o source-code.zip HEAD` | Export source archive from HEAD |
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
- Production extension build (`.output/chrome-mv3`) is ≈ **3.84 MB** total (`du` 3.8 MB; WXT reports 3.84 MB) as of 2026-09-11; bridge is external

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

- Quality gates snapshot (2026-09-11): **725** Vitest TCs across **213** test files; the full default `vitest run` completed **725 pass / 0 failures** in 62 s. `tsc --noEmit` **0 errors** and **eslint 0 errors** (both re-run 2026-09-11 — no regression this window). Coverage re-measured with `inject/**` now inside `coverage.include`: **78.31 % statements / 75.76 % branches / 82.63 % functions** (`lib` ≈89 %, `inject` ≈82 %). Production build **3.84 MB** (WXT total; `du` 3.8 MB). `package.json` and `pnpm-lock.yaml` are unchanged since 2026-08-05 (5th consecutive window with no dependency drift). CI/CD unchanged — `pages.yml` (GitHub Pages guide deploy) and `bridge-image.yml` (GHCR scientific-pdf-bridge image) remain the only two workflows.
- Quality-gate policy change (2026-09-11, user decision): the test-coverage target is now **≥70 %** (was ≥80 %). The old target stopped being the governing rule the moment `inject/**` entered the coverage include — the full surface measured 78.31 %, so a floor of 70 % is the number new work is held to. `CONTRIBUTING.md` and `conductor/workflow.md` were updated in the same change.
- Source/tests added since 2026-09-10 (no new npm deps): `lib/subtitleTeardown.ts` (+ `lib/__tests__/subtitleTeardown.test.ts`), `inject/__tests__/maxVttPerformanceCapture.test.ts` (19 Max capture cases), `tests/unit/hbomaxHandler.test.ts`, `entrypoints/options/sections/subtitles/__tests__/SourceTrackCard.test.tsx`. Heavily modified: `content/subtitleCoordinator.ts` (+418 lines for Max lifecycle/language/tier work), `inject/maxVttPerformanceCapture.ts`, `inject/domCueSource.ts`, `inject/xhrInterceptor.ts`, `lib/maxMpdSubtitles.ts`, `lib/maxSubtitleLanguages.ts`, `lib/youtubeAsrResegment.ts`, `inject/subtitleHandlers/youtube.ts`.
- Config/tooling: `vitest.config.ts` coverage `include` gained `inject/**` (MAIN-world Max capture + handlers were previously invisible to coverage); `wxt.config.ts` `host_permissions` gained `*://*.hbo.com/*` and `*://*.delivery.mp.microsoft.com/*`, mirrored in `docs/PUBLISHING.md`; `MAX-39` added a host-permission pre-flight before offering the Max manifest tier.
- Docs added: `docs/hbomax-subtitle-risk-audit.md` (42 findings, per-finding status table, §8 live-verification backlog) and `docs/superpowers/plans/2026-09-11-hbomax-subtitle-fixes.md` (936-line eight-phase plan).
