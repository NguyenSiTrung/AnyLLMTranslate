# Plan: Hardening & Fixes

## Phase A: Fix Build Blockers (TypeScript + ESLint)
<!-- execution: parallel -->
<!-- depends: -->

- [ ] Task 1: Fix TypeScript compilation errors in test files
  <!-- files: content/__tests__/subtitleCoordinator.test.ts, content/__tests__/subtitleOverlay.test.ts, tests/unit/fetchInterceptor.test.ts, tests/ui-primitives.test.tsx, tests/unit/subtitleControls.test.ts, types/__tests__/config.test.ts -->
  - [ ] Add `import { afterEach, afterAll } from 'vitest'` to test files using lifecycle hooks
  - [ ] Fix spread argument tuple errors in subtitleCoordinator.test.ts mock calls
  - [ ] Cast `HTMLElement` → `HTMLButtonElement` in ui-primitives.test.tsx for `disabled` property
  - [ ] Fill all required `SubtitleSettings` fields in config.test.ts
  - [ ] Add `fontFamily` and `displayMode` to `OverlayConfig` mock objects in subtitleControls.test.ts

- [ ] Task 2: Fix TypeScript compilation errors in source files
  <!-- files: content/subtitleControls.ts, inject/messageBridge.ts, inject/xhrInterceptor.ts, entrypoints/options/App.tsx, vitest.setup.ts -->
  - [ ] Add `fontFamily: 'system'` and `displayMode: 'bilingual'` to `DEFAULT_PREFS` in subtitleControls.ts
  - [ ] Fix `resolve()` type in messageBridge.ts — change `resolve = ((value: unknown) => {...}) as typeof resolve` to properly typed wrapper
  - [ ] Fix `unknown` → `boolean` in xhrInterceptor.ts — add explicit boolean cast after type guard
  - [ ] Fix `useSettingsStore.subscribe(() => {})` in options/App.tsx — pass `(s) => s` or use `useSettingsStore.subscribe(console.log)` pattern per Zustand v5 API
  - [ ] Add `declare global { function defineContentScript(...): void; }` or use `(globalThis as any)` in vitest.setup.ts

- [ ] Task 3: Fix all ESLint errors
  <!-- files: content/__tests__/inlineTranslate.test.ts, entrypoints/options/sections/InlineTranslateSection.tsx, entrypoints/options/sections/SiteRulesSection.tsx -->
  - [ ] Remove unused `isInlineTranslating` import from inlineTranslate.test.ts
  - [ ] Replace 3 non-null assertions in inlineTranslate.test.ts with optional chaining or explicit null checks
  - [ ] Remove unused `Globe` import from InlineTranslateSection.tsx
  - [ ] Replace 2 `any` types in SiteRulesSection.tsx with proper `unknown` + type guards or specific union types
  - [ ] Fix 2 non-null assertions in SiteRulesSection.tsx with optional chaining

- [ ] Task 4: Verify clean build
  - [ ] Run `npm run compile` — expect exit 0
  - [ ] Run `npm run lint` — expect exit 0
  - [ ] Run `npm test` — expect all 569 tests pass
  - [ ] Run `npm run build` — expect successful production build

## Phase B: Runtime Reliability
<!-- execution: parallel -->
<!-- depends: phasea -->

- [ ] Task 1: Add fetch timeout to OpenAICompatibleService
  <!-- files: services/openaiCompatible.ts -->
  - [ ] Create `AbortController` in `fetchCompletion()` before fetch call
  - [ ] Set timeout (default 60000ms, configurable via `ProviderConfig.requestTimeoutMs`)
  - [ ] Pass `signal` to fetch options
  - [ ] On timeout, reject with clear error: `Translation request timed out after ${timeout}ms`
  - [ ] Clean up timer/controller on success or error
  - [ ] Add test: timeout fires correctly, success before timeout works

- [ ] Task 2: MV3 service worker keep-alive during translation
  <!-- files: services/background.ts -->
  - [ ] Create `chrome.alarms.create('sw-keepalive', { periodInMinutes: 0.33 })` when first translation session starts
  - [ ] Add `chrome.alarms.onAlarm` listener for `'sw-keepalive'` that does nothing (alarm existence keeps SW alive)
  - [ ] Clear alarm when `activeSessions` Map becomes empty (last session completes)
  - [ ] Ensure alarm doesn't conflict with existing `'cache-evict'` alarm
  - [ ] Add test: alarm created on session start, cleared on session end

- [ ] Task 3: Harden postMessage bridge origin
  <!-- files: inject/messageBridge.ts -->
  - [ ] Change `window.postMessage(message, '*')` to `window.postMessage(message, window.location.origin)`
  - [ ] The `onMessage` listener already validates origin correctly — no change needed there
  - [ ] Verify: interceptors and coordinator still communicate correctly (existing tests cover this)

- [ ] Task 4: Cache LRU flush reliability
  <!-- files: services/cacheManager.ts, entrypoints/content.ts -->
  - [ ] Reduce `lruFlushTimer` debounce from 500ms to 100ms
  - [ ] Add `isFlushing` mutex flag in `flushLruUpdates` to prevent overlapping async calls
  - [ ] In content.ts `stopTranslation()` or page unload, fire a synchronous flush attempt
  - [ ] Add `chrome.runtime.onMessage` handler in background for `'FLUSH_LRU'` to support unload flushing
  - [ ] Add test: overlapping flushes are properly serialized

- [ ] Task 5: Inline translate event dedup fix
  <!-- files: content/inlineTranslate.ts -->
  - [ ] Replace `processedEvents: WeakSet<Event>` with `processedEventIds: Map<string, number>`
  - [ ] Key format: `${event.timeStamp}-${event.key}-${event.type}`
  - [ ] On each event, check Map; if key exists and `Date.now() - timestamp < 50`, skip processing
  - [ ] After processing, store `Map.set(key, Date.now())`
  - [ ] Add test: same KeyboardEvent processed twice in capture+window listeners is deduped correctly

## Phase C: Security Hardening
<!-- execution: parallel -->
<!-- depends: phaseb -->

- [ ] Task 1: API key encryption at rest
  <!-- files: lib/config.ts, stores/settingsStore.ts, types/config.ts -->
  - [ ] Add `encryptApiKey(key: string): Promise<string>` helper using `crypto.subtle`
  - [ ] Derive encryption key via PBKDF2 from static salt + `chrome.runtime.id`
  - [ ] Use AES-GCM with IV prepended to ciphertext (base64 encode)
  - [ ] Add `decryptApiKey(encrypted: string): Promise<string>` helper
  - [ ] In `loadSettings()`: attempt decrypt; if fails (plaintext or missing salt), return as-is and re-encrypt on next save
  - [ ] In `saveSettings()` / `updateSettings()`: encrypt `provider.apiKey` before storing
  - [ ] Add test: round-trip encrypt/decrypt, backward compatibility with plaintext keys

- [ ] Task 2: Content Security Policy in manifest
  <!-- files: wxt.config.ts -->
  - [ ] Add `content_security_policy` to WXT manifest config
  - [ ] `script-src: "'self'"`
  - [ ] `connect-src: "'self' https:"` (permissive for user-configured LLM endpoints)
  - [ ] `object-src: "'none'"`
  - [ ] `style-src: "'self' 'unsafe-inline'"` (needed for dynamically injected translation styles)
  - [ ] Verify build still succeeds and extension loads in Chrome

## Phase D: Data Integrity & Robustness
<!-- execution: parallel -->
<!-- depends: phaseb -->

- [ ] Task 1: Deep-merge all nested settings
  <!-- files: lib/config.ts, stores/settingsStore.ts -->
  - [ ] Update `loadSettings()` to deep-merge `subtitleSettings` same as `provider` and `inlineTranslate`
  - [ ] Update `updateSettings()` in both `lib/config.ts` and `stores/settingsStore.ts` to deep-merge all nested objects
  - [ ] Create a shared `deepMerge` utility if not already present
  - [ ] Add test: partial update of `subtitleSettings.fontSize` does not drop `subtitleSettings.position`

- [ ] Task 2: Rate limiting on translation requests
  <!-- files: services/background.ts -->
  - [ ] Add semaphore: `maxConcurrent = 3`, `maxQueue = 10`
  - [ ] In `handleTranslate()` and `handleTranslateSubtitle()`, acquire semaphore before processing
  - [ ] Queue excess requests; reject with error if queue full
  - [ ] Release semaphore in `finally` block
  - [ ] Add test: 4th concurrent request queues, 14th request is rejected

- [ ] Task 3: Tighten isOnWatchPage generic fallback
  <!-- files: content/subtitleCoordinator.ts -->
  - [ ] Remove the generic fallback block:
    ```ts
    // REMOVE:
    const videos = document.querySelectorAll('video');
    return videos.length === 1 && !!(videos[0] as HTMLVideoElement).currentSrc;
    ```
  - [ ] Replace with `return false;` for unknown platforms
  - [ ] Add test: unknown platform with single video returns false

## Phase E: Robustness & Cleanup
<!-- execution: parallel -->
<!-- depends: phaseb, phased -->

- [ ] Task 1: Fix unhandled promise rejections
  <!-- files: entrypoints/content.ts, content/subtitleCoordinator.ts, content/textSelection.ts -->
  - [ ] `entrypoints/content.ts:146` — add `.catch(() => {})` to `chrome.runtime.sendMessage({ action: 'restore' })`
  - [ ] `content/subtitleCoordinator.ts:554` — replace try/catch wrapper with `.catch(() => {})` on the sendMessage call
  - [ ] `content/textSelection.ts:90` — await `navigator.clipboard.writeText(text)` and wrap in try/catch to show visual feedback on failure

- [ ] Task 2: Add chrome.storage.onChanged listener cleanup
  <!-- files: entrypoints/content.ts -->
  - [ ] In `initInteractionFeatures()`, store the listener function in a module-level variable
  - [ ] Return a cleanup function from `initInteractionFeatures()` that calls `chrome.storage.onChanged.removeListener`
  - [ ] In `stopTranslation()`, call the cleanup if the listener was added
  - [ ] Add test: verify listener is removed on stopTranslation

- [ ] Task 3: Content-script re-injection guard
  <!-- files: entrypoints/content.ts -->
  - [ ] At top of `main()`, check `if ((window as any).__anyllmTranslateInitialized) return;`
  - [ ] Set `(window as any).__anyllmTranslateInitialized = true;` before proceeding
  - [ ] Add test: simulate second WXT load, verify modules are not re-registered

- [ ] Task 4: Safe DOM construction in subtitleToast.ts
  <!-- files: content/subtitleToast.ts -->
  - [ ] Replace `toastContainer.innerHTML = \`...\`` with `document.createElement` calls
  - [ ] Set `textContent` on the message span instead of template interpolation
  - [ ] Build the spinner, message, and close button as separate DOM nodes
  - [ ] Verify existing toast tests still pass (styling/class assertions may need update)

- [ ] Task 5: Restrict handleFetchSubtitle to allow-list
  <!-- files: services/background.ts -->
  - [ ] Define an allow-list regex array matching known subtitle domains: `youtube\.com`, `udemycdn\.com`, `coursera\.org`
  - [ ] In `handleFetchSubtitle()`, validate `message.url` against the allow-list before calling `fetch()`
  - [ ] Return `{ success: false, error: 'URL not in subtitle allow-list' }` if validation fails
  - [ ] Add test: allowed URL succeeds, disallowed URL is rejected

- [ ] Task 6: React error boundaries for options/popop main entries
  <!-- files: entrypoints/options/main.tsx, entrypoints/popup/main.tsx, ui/ErrorBoundary.tsx -->
  - [ ] Create `ui/ErrorBoundary.tsx` — minimal class component implementing `componentDidCatch`
  - [ ] Show fallback UI with "Something went wrong" and a reload button
  - [ ] Wrap `<App />` in `entrypoints/options/main.tsx` with `<ErrorBoundary>`
  - [ ] Wrap `<App />` in `entrypoints/popup/main.tsx` with `<ErrorBoundary>`
  - [ ] Add test: simulate throw in child, verify fallback UI renders

## Phase F: Verification
<!-- execution: sequential -->
<!-- depends: phasea, phaseb, phasec, phased, phasee -->

- [ ] Task 1: Full verification run
  - [ ] `npm run compile` — zero errors
  - [ ] `npm run lint` — zero errors
  - [ ] `npm test` — all 569+ tests pass
  - [ ] `npm run build` — production build succeeds
  - [ ] Smoke test: load extension in Chrome, translate a page, verify no console errors

- [ ] Task 2: Update learnings.md with patterns discovered during this track
  <!-- files: conductor/tracks/hardening-fixes_20260421/learnings.md -->
  - [ ] Document Zustand v5 subscribe API change (requires selector function)
  - [ ] Document WeakSet unreliability for KeyboardEvent dedup
  - [ ] Document MV3 keep-alive via chrome.alarms pattern
  - [ ] Document AES-GCM encryption key derivation pattern for extension storage
  - [ ] Document content-script re-injection guard pattern for WXT SPAs
  - [ ] Document safe DOM construction pattern (avoid innerHTML for dynamic text)
