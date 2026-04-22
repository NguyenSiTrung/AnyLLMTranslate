# Plan: Hardening & Fixes

## Phase A: Fix Build Blockers (TypeScript + ESLint)
<!-- execution: parallel -->
<!-- depends: -->

- [x] Task 1: Fix TypeScript compilation errors in test files
  <!-- files: content/__tests__/subtitleCoordinator.test.ts, content/__tests__/subtitleOverlay.test.ts, tests/unit/fetchInterceptor.test.ts, tests/ui-primitives.test.tsx, tests/unit/subtitleControls.test.ts, types/__tests__/config.test.ts -->
  - [x] Add `import { afterEach, afterAll } from 'vitest'` to test files using lifecycle hooks
  - [x] Fix spread argument tuple errors in subtitleCoordinator.test.ts mock calls
  - [x] Cast `HTMLElement` → `HTMLButtonElement` in ui-primitives.test.tsx for `disabled` property
  - [x] Fill all required `SubtitleSettings` fields in config.test.ts
  - [x] Add `fontFamily` and `displayMode` to `OverlayConfig` mock objects in subtitleControls.test.ts

- [x] Task 2: Fix TypeScript compilation errors in source files
  <!-- files: content/subtitleControls.ts, inject/messageBridge.ts, inject/xhrInterceptor.ts, entrypoints/options/App.tsx, vitest.setup.ts -->
  - [x] Add `fontFamily: 'system'` and `displayMode: 'bilingual'` to `DEFAULT_PREFS` in subtitleControls.ts
  - [x] Fix `resolve()` type in messageBridge.ts — change `resolve = ((value: unknown) => {...}) as typeof resolve` to properly typed wrapper
  - [x] Fix `unknown` → `boolean` in xhrInterceptor.ts — add explicit boolean cast after type guard
  - [x] Fix `useSettingsStore.subscribe(() => {})` in options/App.tsx — pass `(s) => s` or use `useSettingsStore.subscribe(console.log)` pattern per Zustand v5 API
  - [x] Add `declare global { function defineContentScript(...): void; }` or use `(globalThis as any)` in vitest.setup.ts

- [x] Task 3: Fix all ESLint errors
  <!-- files: content/__tests__/inlineTranslate.test.ts, entrypoints/options/sections/InlineTranslateSection.tsx, entrypoints/options/sections/SiteRulesSection.tsx -->
  - [x] Remove unused `isInlineTranslating` import from inlineTranslate.test.ts
  - [x] Replace 3 non-null assertions in inlineTranslate.test.ts with optional chaining or explicit null checks
  - [x] Remove unused `Globe` import from InlineTranslateSection.tsx
  - [x] Replace 2 `any` types in SiteRulesSection.tsx with proper `unknown` + type guards or specific union types
  - [x] Fix 2 non-null assertions in SiteRulesSection.tsx with optional chaining

- [x] Task 4: Verify clean build
  - [x] Run `npm run compile` — exit 0 ✅
  - [x] Run `npm run lint` — exit 0 ✅
  - [x] Run `npm test` — 573 tests pass ✅
  - [x] Run `npm run build` — successful production build ✅

## Phase B: Runtime Reliability
<!-- execution: parallel -->
<!-- depends: phasea -->

- [x] Task 1: Add fetch timeout to OpenAICompatibleService
  <!-- files: services/openaiCompatible.ts -->
  - [x] Create `AbortController` in `fetchCompletion()` before fetch call
  - [x] Set timeout (default 60000ms, configurable via `ProviderConfig.requestTimeoutMs`)
  - [x] Pass `signal` to fetch options
  - [x] On timeout, reject with clear error: `Translation request timed out after ${timeout}ms`
  - [x] Clean up timer/controller on success or error
  - [x] Add test: timeout fires correctly, success before timeout works

- [x] Task 2: MV3 service worker keep-alive during translation
  <!-- files: services/background.ts -->
  - [x] Create `chrome.alarms.create('sw-keepalive', { periodInMinutes: 0.33 })` when first translation session starts
  - [x] Add `chrome.alarms.onAlarm` listener for `'sw-keepalive'` that does nothing (alarm existence keeps SW alive)
  - [x] Clear alarm when `activeSessions` Map becomes empty (last session completes)
  - [x] Ensure alarm doesn't conflict with existing `'cache-evict'` alarm
  - [x] Add test: alarm created on session start, cleared on session end

- [x] Task 3: Harden postMessage bridge origin
  <!-- files: inject/messageBridge.ts -->
  - [x] Change `window.postMessage(message, '*')` to `window.postMessage(message, window.location.origin)`
  - [x] The `onMessage` listener already validates origin correctly — no change needed there
  - [x] Verify: interceptors and coordinator still communicate correctly (existing tests cover this)

- [x] Task 4: Cache LRU flush reliability
  <!-- files: services/cacheManager.ts, entrypoints/content.ts -->
  - [x] Reduce `lruFlushTimer` debounce from 500ms to 100ms
  - [x] Add `isFlushing` mutex flag in `flushLruUpdates` to prevent overlapping async calls
  - [x] In content.ts `stopTranslation()` or page unload, fire a synchronous flush attempt
  - [x] Add `chrome.runtime.onMessage` handler in background for `'FLUSH_LRU'` to support unload flushing
  - [x] Add test: overlapping flushes are properly serialized

- [x] Task 5: Inline translate event dedup fix
  <!-- files: content/inlineTranslate.ts -->
  - [x] Replace `processedEvents: WeakSet<Event>` with `processedEventIds: Map<string, number>`
  - [x] Key format: `${event.timeStamp}-${event.key}-${event.type}`
  - [x] On each event, check Map; if key exists and `Date.now() - timestamp < 50`, skip processing
  - [x] After processing, store `Map.set(key, Date.now())`
  - [x] Add test: same KeyboardEvent processed twice in capture+window listeners is deduped correctly

## Phase C: Security Hardening
<!-- execution: parallel -->
<!-- depends: phaseb -->

- [x] Task 1: API key encryption at rest
  <!-- files: lib/config.ts, stores/settingsStore.ts, types/config.ts -->
  - [x] Add `encryptApiKey(key: string): Promise<string>` helper using `crypto.subtle`
  - [x] Derive encryption key via PBKDF2 from static salt + `chrome.runtime.id`
  - [x] Use AES-GCM with IV prepended to ciphertext (base64 encode)
  - [x] Add `decryptApiKey(encrypted: string): Promise<string>` helper
  - [x] In `loadSettings()`: attempt decrypt; if fails (plaintext or missing salt), return as-is and re-encrypt on next save
  - [x] In `saveSettings()` / `updateSettings()`: encrypt `provider.apiKey` before storing
  - [x] Add test: round-trip encrypt/decrypt, backward compatibility with plaintext keys

- [x] Task 2: Content Security Policy in manifest
  <!-- files: wxt.config.ts -->
  - [x] Add `content_security_policy` to WXT manifest config
  - [x] `script-src: "'self'"`
  - [x] `connect-src: "'self' https:"` (permissive for user-configured LLM endpoints)
  - [x] `object-src: "'none'"`
  - [x] `style-src: "'self' 'unsafe-inline'"` (needed for dynamically injected translation styles)
  - [x] Verify build still succeeds and extension loads in Chrome

## Phase D: Data Integrity & Robustness
<!-- execution: parallel -->
<!-- depends: phaseb -->

- [x] Task 1: Deep-merge all nested settings
  <!-- files: lib/config.ts, stores/settingsStore.ts -->
  - [x] Update `loadSettings()` to deep-merge `subtitleSettings` same as `provider` and `inlineTranslate`
  - [x] Update `updateSettings()` in both `lib/config.ts` and `stores/settingsStore.ts` to deep-merge all nested objects
  - [x] Create a shared `deepMerge` utility if not already present
  - [x] Add test: partial update of `subtitleSettings.fontSize` does not drop `subtitleSettings.position`

- [x] Task 2: Rate limiting on translation requests
  <!-- files: services/background.ts -->
  - [x] Add semaphore: `maxConcurrent = 3`, `maxQueue = 10`
  - [x] In `handleTranslate()` and `handleTranslateSubtitle()`, acquire semaphore before processing
  - [x] Queue excess requests; reject with error if queue full
  - [x] Release semaphore in `finally` block
  - [x] Add test: 4th concurrent request queues, 14th request is rejected

- [x] Task 3: Tighten isOnWatchPage generic fallback
  <!-- files: content/subtitleCoordinator.ts -->
  - [x] Remove the generic fallback block:
    ```ts
    // REMOVE:
    const videos = document.querySelectorAll('video');
    return videos.length === 1 && !!(videos[0] as HTMLVideoElement).currentSrc;
    ```
  - [x] Replace with `return false;` for unknown platforms
  - [x] Add test: unknown platform with single video returns false

## Phase E: Robustness & Cleanup
<!-- execution: parallel -->
<!-- depends: phaseb, phased -->

- [x] Task 1: Fix unhandled promise rejections
  <!-- files: entrypoints/content.ts, content/subtitleCoordinator.ts, content/textSelection.ts -->
  - [x] `entrypoints/content.ts:146` — add `.catch(() => {})` to `chrome.runtime.sendMessage({ action: 'restore' })`
  - [x] `content/subtitleCoordinator.ts:554` — replace try/catch wrapper with `.catch(() => {})` on the sendMessage call
  - [x] `content/textSelection.ts:90` — await `navigator.clipboard.writeText(text)` and wrap in try/catch to show visual feedback on failure

- [x] Task 2: Add chrome.storage.onChanged listener cleanup
  <!-- files: entrypoints/content.ts -->
  - [x] In `initInteractionFeatures()`, store the listener function in a module-level variable
  - [x] Return a cleanup function from `initInteractionFeatures()` that calls `chrome.storage.onChanged.removeListener`
  - [x] In `stopTranslation()`, call the cleanup if the listener was added
  - [x] Add test: verify listener is removed on stopTranslation

- [x] Task 3: Content-script re-injection guard
  <!-- files: entrypoints/content.ts -->
  - [x] At top of `main()`, check `if ((window as any).__anyllmTranslateInitialized) return;`
  - [x] Set `(window as any).__anyllmTranslateInitialized = true;` before proceeding
  - [x] Add test: simulate second WXT load, verify modules are not re-registered

- [x] Task 4: Safe DOM construction in subtitleToast.ts
  <!-- files: content/subtitleToast.ts -->
  - [x] Replace `toastContainer.innerHTML = \`...\`` with `document.createElement` calls
  - [x] Set `textContent` on the message span instead of template interpolation
  - [x] Build the spinner, message, and close button as separate DOM nodes
  - [x] Verify existing toast tests still pass (styling/class assertions may need update)

- [x] Task 5: Restrict handleFetchSubtitle to allow-list
  <!-- files: services/background.ts -->
  - [x] Define an allow-list regex array matching known subtitle domains: `youtube\.com`, `udemycdn\.com`, `coursera\.org`
  - [x] In `handleFetchSubtitle()`, validate `message.url` against the allow-list before calling `fetch()`
  - [x] Return `{ success: false, error: 'URL not in subtitle allow-list' }` if validation fails
  - [x] Add test: allowed URL succeeds, disallowed URL is rejected

- [x] Task 6: React error boundaries for options/popop main entries
  <!-- files: entrypoints/options/main.tsx, entrypoints/popup/main.tsx, ui/ErrorBoundary.tsx -->
  - [x] Create `ui/ErrorBoundary.tsx` — minimal class component implementing `componentDidCatch`
  - [x] Show fallback UI with "Something went wrong" and a reload button
  - [x] Wrap `<App />` in `entrypoints/options/main.tsx` with `<ErrorBoundary>`
  - [x] Wrap `<App />` in `entrypoints/popup/main.tsx` with `<ErrorBoundary>`
  - [x] Add test: simulate throw in child, verify fallback UI renders

## Phase F: Verification
<!-- execution: sequential -->
<!-- depends: phasea, phaseb, phasec, phased, phasee -->

- [x] Task 1: Full verification run
  - [x] `npm run compile` — zero errors
  - [x] `npm run lint` — zero errors
  - [x] `npm test` — all 583 tests pass
  - [x] `npm run build` — production build succeeds
  - [x] Smoke test: load extension in Chrome, translate a page, verify no console errors

- [x] Task 2: Update learnings.md with patterns discovered during this track
  <!-- files: conductor/tracks/hardening-fixes_20260421/learnings.md -->
  - [x] Document Zustand v5 subscribe API change (requires selector function)
  - [x] Document WeakSet unreliability for KeyboardEvent dedup
  - [x] Document MV3 keep-alive via chrome.alarms pattern
  - [x] Document AES-GCM encryption key derivation pattern for extension storage
  - [x] Document content-script re-injection guard pattern for WXT SPAs
  - [x] Document safe DOM construction pattern (avoid innerHTML for dynamic text)
