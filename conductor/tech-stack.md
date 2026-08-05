<!-- conductor-refresh: 2026-08-05 all (package/lock unchanged; 509 serial-gated / 509 pass across 196 files; default parallel 507 pass / 2 load-timeout failures in background.test.ts; isolated affected file passes; lint 0; tsc 0; build 3.77 MB; 73 archived / 0 active; Beads 7bw+wat open) -->
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
| **host_permissions** | YouTube watch/timedtext access for embedded-caption fallback and link pre-align (`*://*.youtube.com/*`) |
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
- Production extension build (`.output/chrome-mv3`) is ≈ **3.5 MB** total (`du`); bridge is external

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

- Quality gates snapshot (2026-08-05, after assertion-preserving test-suite consolidation): **509** Vitest TCs across **196** test files; the serial gate had **509 pass / 0 failures**; the latest default parallel diagnostic had **507 pass / 2 timeout failures** in `services/__tests__/background.test.ts`, while the affected file passes in isolation; **eslint 0** errors; `tsc --noEmit` **0** errors; production build **3.77 MB**. No `package.json` or `pnpm-lock.yaml` dependency changes were detected since the previous refresh.
