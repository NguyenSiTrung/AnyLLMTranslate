# Plan: LinguaLens Phase 1 — Foundation

> Implementation plan for basic page translation with bilingual display.
> Estimated effort: ~17 working days

---

## Phase 1: Project Setup & Scaffolding
<!-- execution: sequential -->

- [x] Task 1: Initialize WXT project with TypeScript & React
  - [x] Run `npx -y wxt@latest init ./` with TypeScript template
  - [x] Add React 18, React DOM, Tailwind CSS 4, Zustand 5
  - [x] Add dev dependencies: Vitest, Testing Library, ESLint, Prettier
  - [x] Add idb-keyval for IndexedDB convenience
  - [x] Add lucide-react for icons
  - [x] Verify `pnpm dev` launches extension in Chrome

- [x] Task 2: Configure build tooling & code quality
  - [x] Configure ESLint with TypeScript strict rules
  - [x] Configure Prettier
  - [x] Configure Vitest with jsdom environment
  - [x] Configure tsconfig.json with strict mode, path aliases
  - [x] Verify `pnpm lint` and `pnpm test` commands work

- [x] Task 3: Establish project directory structure & shared types
  - [x] Create directory skeleton: src/{background,content,services,ui,lib,styles,types}
  - [x] Create type definitions: messages.ts, config.ts, translation.ts
  - [x] Create constants.ts (BLOCK_ELEMENTS, SKIP_ELEMENTS, INLINE_ELEMENTS sets)
  - [x] Create languages.ts (ISO 639-1 language codes + display names)
  - [x] Create config.ts in lib/ (chrome.storage settings store with defaults)
  - [x] Write unit tests for language utility functions

- [ ] Task: Conductor - User Manual Verification 'Project Setup & Scaffolding' (Protocol in workflow.md)

## Phase 2: Translation Service & Background Worker
<!-- execution: sequential -->

- [x] Task 1: Implement TranslationService interface
  - [x] Define TranslationService interface in src/services/base.ts
  - [x] Define TranslationRequest, TranslationResult, OpenAICompatibleConfig types
  - [x] Define provider presets (OpenAI, DeepSeek, Groq, Ollama, LM Studio, etc.)
  - [x] Write unit tests for type validation helpers

- [x] Task 2: Implement OpenAI-compatible translation service
  - [x] Implement OpenAICompatibleService class in src/services/openaiCompatible.ts
  - [x] Implement translate() with JSON-mode response parsing
  - [x] Implement testConnection() method
  - [x] Handle auth header logic (skip for local providers like Ollama)
  - [x] Handle error responses with descriptive error messages
  - [x] Write unit tests with mocked fetch responses (success, error, malformed JSON)

- [x] Task 3: Implement request batching & deduplication
  - [x] Implement TranslationBatcher class in src/services/batcher.ts
  - [x] Implement deduplication via Set
  - [x] Implement in-flight request tracking via Map
  - [x] Implement batch splitting by maxBatchChars
  - [x] Write unit tests for batching logic (dedup, splitting, in-flight reuse)

- [x] Task 4: Implement background service worker
  - [x] Create src/background/index.ts as WXT background entrypoint
  - [x] Implement message router for translate/restore/getStatus actions
  - [x] Implement per-tab translation state management (idle/translating/done/error)
  - [x] Wire up OpenAICompatibleService with settings from chrome.storage
  - [x] Implement settings change listener (re-create service on config update)
  - [x] Write unit tests for message routing logic

- [ ] Task: Conductor - User Manual Verification 'Translation Service & Background Worker' (Protocol in workflow.md)

## Phase 3: DOM Translation Engine
<!-- execution: sequential -->

- [x] Task 1: Implement DOM walker / paragraph detection
  - [x] Create src/content/domWalker.ts
  - [x] Implement TreeWalker-based DOM traversal
  - [x] Implement piece collection: group text/inline nodes into TranslationPiece[]
  - [x] Implement block element splitting
  - [x] Implement pre-filters (translate="no", .notranslate, contentEditable)
  - [x] Implement size cap (1,000 chars) with sentence boundary splitting
  - [x] Write unit tests with mock DOM structures (jsdom)

- [x] Task 2: Implement bilingual display engine (Dividing Line theme)
  - [x] Create src/content/translationDisplay.ts
  - [x] Implement applyBilingualTranslation() — DOM injection with data attributes
  - [x] Create src/styles/inject.css — Dividing Line theme CSS
  - [x] Implement state management via html[data-lingua-state] attribute
  - [x] Support display modes: bilingual-below (default), translation-only
  - [x] Implement dark mode support via @media (prefers-color-scheme: dark)
  - [x] Write unit tests for DOM injection and state toggling

- [x] Task 3: Implement viewport-based lazy translation
  - [x] Create src/content/viewportObserver.ts
  - [x] Implement IntersectionObserver with rootMargin: '200px'
  - [x] Implement piece-to-observer binding (observe parentElement of each piece)
  - [x] Implement batch collection of visible pieces → send to translation
  - [x] Write unit tests with IntersectionObserver mock

- [x] Task 4: Wire content script entry point
  - [x] Create src/content/index.ts as WXT content script entrypoint
  - [x] Wire: domWalker → viewportObserver → message to background → translationDisplay
  - [x] Implement translation orchestration flow (detect pieces → observe → translate → display)
  - [x] Handle translation state from background messages
  - [x] Register inject.css via WXT content script CSS config
  - [ ] Manual integration test: translate a Wikipedia article end-to-end

- [ ] Task: Conductor - User Manual Verification 'DOM Translation Engine' (Protocol in workflow.md)

## Phase 4: Dynamic Content, Cache & Restore
<!-- execution: sequential -->

- [ ] Task 1: Implement MutationObserver for SPA support
  - [ ] Create src/content/mutationWatcher.ts
  - [ ] Implement MutationObserver watching document.body (childList + subtree)
  - [ ] Filter: only block elements, skip data-lingua-* nodes
  - [ ] Implement 500ms debounced scheduleTranslation()
  - [ ] Wire into content script orchestration
  - [ ] Write unit tests with mock mutations

- [ ] Task 2: Implement IndexedDB translation cache
  - [ ] Create src/background/cacheManager.ts
  - [ ] Implement cache with idb-keyval or raw IndexedDB
  - [ ] Implement SHA-256 cache key generation
  - [ ] Implement write-through caching on successful translation
  - [ ] Implement TTL-based expiry (30 days default)
  - [ ] Implement LRU eviction when cache > 100MB
  - [ ] Integrate cache into background translation pipeline (check → API → store)
  - [ ] Write unit tests for cache operations (hit, miss, expire, evict)

- [ ] Task 3: Implement restore/undo translation
  - [ ] Create src/content/restoreManager.ts
  - [ ] Implement restorePage() — remove all [data-lingua-role="translation"] nodes
  - [ ] Implement state toggle cycle: dual → off → dual
  - [ ] Clean up data-lingua-state attribute on restore
  - [ ] Wire restore into popup toggle and background messages
  - [ ] Write unit tests for restore logic

- [ ] Task: Conductor - User Manual Verification 'Dynamic Content, Cache & Restore' (Protocol in workflow.md)

## Phase 5: Popup UI & End-to-End Integration
<!-- execution: sequential -->

- [ ] Task 1: Create popup UI with React + Tailwind
  - [ ] Set up popup entrypoint via WXT (src/entrypoints/popup/)
  - [ ] Create App.tsx with translate toggle button
  - [ ] Create LanguagePicker component (source + target)
  - [ ] Create StatusIndicator component (idle/translating/done/error)
  - [ ] Create ProviderIndicator showing active LLM provider name
  - [ ] Style with Tailwind CSS — clean, compact popup design
  - [ ] Wire popup to background via chrome.runtime.sendMessage

- [ ] Task 2: End-to-end integration & manual testing
  - [ ] Test full flow: open popup → click translate → see bilingual display on page
  - [ ] Test with Ollama local provider (localhost:11434)
  - [ ] Test viewport lazy loading (scroll → new translations appear)
  - [ ] Test SPA support (navigate within React/Next.js site)
  - [ ] Test cache hit (revisit page → instant display, no API call)
  - [ ] Test restore (toggle off → translations removed → toggle on → re-translate)
  - [ ] Fix any integration issues discovered

- [ ] Task 3: Unit test coverage & lint cleanup
  - [ ] Ensure ≥ 80% coverage for domWalker, translation service, cache manager
  - [ ] Run full lint pass, fix all errors
  - [ ] Run full test suite, ensure all passing
  - [ ] Verify TypeScript strict mode — no `any` leaks

- [ ] Task: Conductor - User Manual Verification 'Popup UI & End-to-End Integration' (Protocol in workflow.md)
