# Plan: Codebase Audit v2 - Deep Analysis Fixes & Improvements

## Phase 1: P0 Critical Crashes
<!-- execution: parallel -->

- [x] Task 1: Fix subtitleCoordinator translatedCues assignment <!-- commit: cc3ec54 -->
  <!-- files: content/subtitleCoordinator.ts, content/__tests__/subtitleCoordinator.test.ts -->
  Add `state.translatedCues = cues;` inside `updateTranslatedCues()` before calling `updateCues(cues)`. Write test verifying mergeTranslatedChunk receives non-null translatedCues.

- [x] Task 2: Fix LayoutOverlay Rules of Hooks violation <!-- commit: cc3ec54 -->
  <!-- files: entrypoints/pdf-viewer/components/PdfTranslationPane.tsx -->
  Move all hook declarations before the early return in LayoutOverlay, or split into a wrapper component that conditionally mounts/unmounts. Verify cached translation before page proxy load doesn't crash.

- [x] Task 3: Fix removeTranslation un-marking all elements <!-- commit: cc3ec54 -->
  <!-- files: content/translationDisplay.ts, content/__tests__/translationDisplay.test.ts -->
  Scope marker cleanup to only the parent element of the removed piece, and only if no other translation elements remain within it. Write test verifying other translations are not un-marked.

- [x] Task 4: Fix deduplicateAncestors logic bug <!-- commit: cc3ec54 -->
  <!-- files: lib/domUtils.ts, lib/__tests__/domUtils.test.ts -->
  Change containment check from `result[result.length - 1].contains(el)` to `result.some(r => r.contains(el))`. Write test with [A, B, C] where A contains C but B is a sibling.

## Phase 2: P1 High-Confidence Bugs
<!-- execution: parallel -->

- [x] Task 1: Fix semaphore bypass for subtitle chunks <!-- commit: pending -->
  <!-- files: services/background.ts, services/__tests__/background.subtitleSemaphore.test.ts -->
  Move acquireSemaphore/releaseSemaphore inside translateChunk so each chunk holds its own slot. Verify MAX_CONCURRENT limit holds across all chunks (new regression test using controllable fetch + semaphore state snapshot).

- [x] Task 2: Fix incomplete section translation cleanup <!-- commit: pending -->
  <!-- files: content/sectionTranslate.ts -->
  Add removal of `.anyllm-inline-bilingual` and `[data-anyllm-inline-clone-for]` elements in removeSectionTranslation. Removed dead selectors for [role=loading] and [role=error] (matched nothing real).

- [x] Task 3: Fix proactiveCategoryDetectionTimer leak on SPA nav <!-- commit: pending -->
  <!-- files: content/subtitleCoordinator.ts -->
  Clear proactiveCategoryDetectionTimer in the SPA navigation handler (handleNavigation), NOT in resetCoordinatorState (which runs in test beforeEach under fake timers and breaks proactive-detection tests).

- [x] Task 4: Fix undefined response crash in fetchViaBackground <!-- commit: pending -->
  <!-- files: content/subtitleCoordinator.ts -->
  Added `if (!response) { reject(new Error('No response from background')); return; }` before accessing response properties.

- [x] Task 5: Fix duplicate piece IDs on repetitive pages <!-- commit: pending -->
  <!-- files: content/hoverTranslate.ts -->
  Added monotonic hoverIdCounter suffix to generateHoverId. Reset in clearHoverCache().

- [x] Task 6: Fix stale closure and dead code in content.ts storage listener <!-- commit: pending -->
  <!-- files: entrypoints/content.ts -->
  Removed dead customTheme re-apply block that read stale closure `settings.theme` (frozen at init). The theme block above handles customTheme from newSettings.

- [x] Task 7: Fix untracked fade timeout in autoTranslateNotification <!-- commit: pending -->
  <!-- files: content/autoTranslateNotification.ts -->
  Track the 300ms fade setTimeout in a module-level `fadeTimeout` variable. Cleared in clearAutoDismiss() (called by removeNotification and at start of show).

- [x] Task 8: Fix unvalidated settings import <!-- commit: pending -->
  <!-- files: entrypoints/options/sections/AdvancedSection.tsx -->
  Strip `__proto__`/`constructor`/`prototype` keys before merging import. Validate object type. Warn user when exporting with an apiKey present (cleartext leak).

## Phase 3: P2 Security & Data Integrity
<!-- execution: parallel -->

- [x] Task 1: Fix SSRF - add 172.16/12 and IPv6 private ranges <!-- commit: pending -->
  <!-- files: services/background.ts -->
  Extracted isPrivateHost() helper covering 172.16/12, IPv6 ULA fc00::/7, link-local fe80::/10, CGNAT 100.64/10, 0/8. Replaced brittle startsWith checks.

- [x] Task 2: Block file:// from content-script OPEN_PDF_VIEWER <!-- commit: pending -->
  <!-- files: services/background.ts -->
  Reject file:// protocol when sender has a tab.id (content script); allow only from trusted extension senders (popup/options).

- [x] Task 3: Warn on HTTP baseUrl with API key <!-- commit: pending -->
  <!-- files: services/openaiCompatible.ts -->
  Console.warn when sending Authorization header over http:// (cleartext credential leak). Still send for local LLM providers.

- [x] Task 4: Mitigate prompt injection via pageContext <!-- commit: pending -->
  <!-- files: services/base.ts, services/__tests__/base.test.ts -->
  Wrap each pageContext field in XML delimiters (<page_title>…</page_title>), cap field length (300/200/100 chars), preamble instructs model to treat as untrusted data.

- [x] Task 5: Fix partial translations reported as success <!-- commit: pending -->
  <!-- files: services/openaiCompatible.ts, types/translation.ts, services/__tests__/openaiCompatible.test.ts -->
  Back-fill missing IDs with original text, flag result.partial=true. Added TranslationResult.partial field + regression test.

- [x] Task 6: Fix debug logging permanently broken in background SW <!-- commit: pending -->
  <!-- files: services/debugLog.ts, services/__tests__/debugLog.test.ts -->
  invalidateDebugCache() clears TTL only (no longer forces cachedEnabled=false); isDebugLoggingEnabled() triggers background refresh when stale. warmDebugCache already called at SW startup.

- [x] Task 7: Fix cache clear race condition <!-- commit: pending -->
  <!-- files: services/cacheManager.ts -->
  Added isClearing flag; getCachedTranslation skips LRU-update while clearing; clearCache resets flag in finally.

- [x] Task 8: Fix textTrackDiscovery module-level mutable state <!-- commit: pending -->
  <!-- files: inject/textTrackDiscovery.ts -->
  Moved reportedVideos, metadataListenedVideos, videoCleanupHandlers into startTextTrackDiscovery closure scope so each invocation has isolated state.

- [x] Task 9: Fix XHR interceptor readyState suppression <!-- commit: pending -->
  <!-- files: inject/xhrInterceptor.ts -->
  Wrap onreadystatechange so non-4 states (1/2/3) pass through immediately; only readyState 4 held back for translation replay.

- [x] Task 10: Fix XHR disable clobbering third-party patches <!-- commit: pending -->
  <!-- files: inject/xhrInterceptor.ts -->
  Track patchedOpen/AddEventListener/Send; disable() only restores when prototype method identity-equals our patch.

- [x] Task 11: Fix fetch interceptor pending translation leak <!-- commit: pending -->
  <!-- files: inject/fetchInterceptor.ts -->
  Track pendingHandlers + pendingTimeouts in instance Sets; disable() drains both (removeEventListener + clearTimeout).

- [x] Task 12: Fix shallow spread in onSettingsChange <!-- commit: pending -->
  <!-- files: lib/config.ts -->
  Replaced shallow {...DEFAULT, ...newVal} with deepMerge so nested objects (provider, subtitleSettings) survive partial storage updates.

- [x] Task 13: Fix broad "model" keyword matching <!-- commit: pending -->
  <!-- files: lib/providerReadiness.ts -->
  Replaced bare includes('model') with specific MODEL_ERROR_PATTERNS ('model not found', 'model_not_found', 'does not exist', etc.).

- [x] Task 14: Fix DOM cue source no seek handling <!-- commit: pending -->
  <!-- files: inject/domCueSource.ts -->
  Added 'seeked' event listener that closes the open cue (endTime=startTime) on seek to prevent timeline corruption.

- [x] Task 15: Fix legacy decryptApiKey returning ciphertext on failure <!-- commit: pending -->
  <!-- files: lib/crypto.ts, lib/__tests__/crypto.test.ts -->
  decryptApiKey returns '' on decrypt failure instead of raw ciphertext (was a credential-leak risk).

## Phase 4: P2 Performance, Timeouts & Resource Leaks
<!-- execution: parallel -->

- [x] Task 1: Wire categoryStore.initTabCleanup in background <!-- commit: pending -->
  <!-- files: services/background.ts, services/categoryStore.ts -->
  Call categoryStore.initTabCleanup() at SW startup or inside initSubtitleSessionCleanup. Add guard in categoryStore to prevent duplicate listener registration.

- [x] Task 2: Add timeout to handleFetchSubtitle <!-- commit: pending -->
  <!-- files: services/background.ts -->
  Add AbortController with 30s timeout to fetch() call in handleFetchSubtitle.

- [x] Task 3: Fix subtitle stat overcounting <!-- commit: pending -->
  <!-- files: services/background.ts -->
  Move incrementStats for totalSubtitlesCuesTranslated to per-chunk completion instead of counting all cues upfront.

- [x] Task 4: Replace fragile HTTP status string matching with error class <!-- commit: pending -->
  <!-- files: services/openaiCompatible.ts -->
  Create a custom ApiError class with statusCode property. Use it in fetchWithRetry instead of message.startsWith('HTTP 4').

- [x] Task 5: Add batching to classifyPdfParagraphs <!-- commit: pending -->
  <!-- files: services/openaiCompatible.ts -->
  Batch paragraphs (e.g. 50 at a time) and merge results to avoid exceeding model context window.

- [x] Task 6: Add timeouts to providerTester (all 3 steps) <!-- commit: pending -->
  <!-- files: services/providerTester.ts -->
  Add AbortController with 15-30s timeout to testPing, testModelListing, and testTranslation fetch calls.

- [x] Task 7: Fix hardcoded Vietnamese in providerTester <!-- commit: pending -->
  <!-- files: services/providerTester.ts -->
  Accept targetLanguage as parameter and use user's configured target language instead of hardcoding Vietnamese.

- [x] Task 8: Reduce forced reflows in translationDisplay <!-- commit: pending -->
  <!-- files: content/translationDisplay.ts -->
  Use requestAnimationFrame to defer animation restart instead of reading offsetHeight synchronously per piece.

- [x] Task 9: Fix O(N^2) inline translation sibling sync <!-- commit: pending -->
  <!-- files: content/translationDisplay.ts -->
  Route all syncInlineTranslationOnlySiblings calls through scheduleDomWrite debounce. Maintain a Set of clone elements for O(1) removal.

- [x] Task 10: Fix layout thrashing in sectionPicker <!-- commit: pending -->
  <!-- files: content/sectionPicker.ts -->
  Cache computed styles during picker mode. Use tagName + block-element set for initial filter, fall back to getComputedStyle only for custom elements.

- [x] Task 11: Narrow MutationObserver scope in subtitleCoordinator <!-- commit: pending -->
  <!-- files: content/subtitleCoordinator.ts -->
  Filter mutations to only process nodes that could contain `<video>` elements. Or narrow observation root once primary video is found.

- [x] Task 12: Fix new Map/object per render in PDF viewer <!-- commit: pending -->
  <!-- files: entrypoints/pdf-viewer/App.tsx -->
  Hoist a module-level stable IDLE sentinel object and reuse it for untranslated pages.

- [x] Task 13: Fix IntersectionObserver churn in usePdfPageTranslations <!-- commit: pending -->
  <!-- files: entrypoints/pdf-viewer/hooks/usePdfPageTranslations.ts -->
  Depend on a stable signal (e.g. pdfPages.length) instead of the array reference. Re-query slots inside the effect.

## Phase 5: P3 Services, Background & Lib
<!-- execution: parallel -->

- [x] Task 1: Fix tabId || sender.tab?.id to use nullish coalescing <!-- commit: pending -->
  <!-- files: services/background.ts -->
  Replace `||` with `??` for tabId checks in setCategoryOverride and getCategoryOverride handlers.

- [x] Task 2: Extract CHUNK_SIZE to module-level constant <!-- commit: pending -->
  <!-- files: services/background.ts -->
  Move hardcoded 25 to a module-level CHUNK_SIZE constant. Reference in both handleTranslateSubtitle and PRIORITIZE_SUBTITLE_CHUNK handler.

- [x] Task 3: Move clearKeepaliveAlarm to finally block <!-- commit: pending -->
  <!-- files: services/background.ts -->
  Remove redundant clearKeepaliveAlarm calls in success/failure/catch paths. Add single call in finally block.

- [x] Task 4: Fix ensureKeepaliveAlarm race <!-- commit: pending -->
  <!-- files: services/background.ts -->
  Track alarm existence with a module-level boolean flag to prevent redundant create calls.

- [x] Task 5: Add .catch() to updateSettings handler <!-- commit: pending -->
  <!-- files: services/background.ts -->
  Add `.catch(() => ({ success: false, error: '...' }))` to initService().then() chain.

- [x] Task 6: Fix unclosed think-block regex <!-- commit: pending -->
  <!-- files: services/base.ts -->
  Add fallback regex `/think:[\s\S]*$/` to handle unclosed think blocks after the primary regex.

- [x] Task 7: Add protocol check in validateProviderConfig <!-- commit: pending -->
  <!-- files: services/base.ts -->
  Verify baseUrl protocol is http: or https: in validateProviderConfig.

- [x] Task 8: Pass glossary and custom prompt through batcher <!-- commit: pending -->
  <!-- files: services/batcher.ts -->
  Accept glossaryBlock and customSystemPrompt in constructor or add() options and forward to service.translate().

- [x] Task 9: Add no-op catch to batcher add() promise <!-- commit: pending -->
  <!-- files: services/batcher.ts -->
  Attach a no-op .catch() to the original promise before returning to prevent unhandled rejections.

- [x] Task 10: Use idb-keyval clear() in cacheManager <!-- commit: pending -->
  <!-- files: services/cacheManager.ts -->
  Replace sequential del() loop with clear() from idb-keyval for bulk cache clearing.

- [x] Task 11: Fix flushLruUpdates silent failure <!-- commit: pending -->
  <!-- files: services/cacheManager.ts -->
  On set() failure, re-add failed entries to pendingLruUpdates for retry on next flush.

- [x] Task 12: Fix neverAutoOpenSites subdomain matching <!-- commit: pending -->
  <!-- files: services/pdfAutoOpen.ts -->
  Use hostname suffix matching: `hostname === site || hostname.endsWith('.' + site)`.

- [x] Task 13: Fix UTC date in statsCollector <!-- commit: pending -->
  <!-- files: services/statsCollector.ts -->
  Use local date formatting (e.g. `new Date().toLocaleDateString('en-CA')`) instead of UTC.

- [x] Task 14: Guard categoryStore initTabCleanup against duplicate registration <!-- commit: done in Phase 4 -->
  <!-- files: services/categoryStore.ts -->
  Add module-level boolean flag to ensure chrome.tabs.onRemoved listener is registered only once. (Completed in Phase 4 Task 1)

## Phase 6: P3 Content, Inject, UI & Config
<!-- execution: parallel -->

- [ ] Task 1: Remove dead pendingRequests Map in subtitleCoordinator
  <!-- files: content/subtitleCoordinator.ts -->
  Remove the pendingRequests Map and all related code (iteration, clear, clearPendingRequest) since .set() is never called.

- [ ] Task 2: Fix beforeunload cleanup in content.ts
  <!-- files: entrypoints/content.ts -->
  Call all cleanup functions (_textSelectionCleanup, _hoverTranslateCleanup, _keyboardShortcutsCleanup, _inlineTranslateCleanup) and remove _storageChangeListener in beforeunload handler.

- [ ] Task 3: Track fullscreen reposition timeouts in subtitleOverlay
  <!-- files: content/subtitleOverlay.ts -->
  Store setTimeout IDs and clear them in cleanup().

- [ ] Task 4: Fix inlineTranslate dedup key collision
  <!-- files: content/inlineTranslate.ts -->
  Use a simpler single-event dedup (e.g. lastProcessedEvent reference check) instead of composite key.

- [ ] Task 5: Add execCommand fallback in inlineTranslate
  <!-- files: content/inlineTranslate.ts -->
  Check return value of execCommand('insertText'). Fall back to direct assignment if it returns false.

- [ ] Task 6: Guard PRIORITIZE_SUBTITLE_CHUNK on seek
  <!-- files: content/subtitleOverlay.ts -->
  Add guard for overlayState.cues.length > 0 before sending PRIORITIZE_SUBTITLE_CHUNK.

- [ ] Task 7: Remove dead createControlsUI in subtitleControls
  <!-- files: content/subtitleControls.ts -->
  Remove exported createControlsUI() that is never imported or called.

- [ ] Task 8: Fix settingsStore shallow set replacing nested objects
  <!-- files: stores/settingsStore.ts -->
  Use deepMerge for the set() call in updateSettings/updateSetting, or remove in favor of storage event-driven update.

- [ ] Task 9: Fix initStorageSync apiKey flash
  <!-- files: stores/settingsStore.ts -->
  Use a sentinel value like '***' instead of empty string when stripping encrypted apiKey.

- [ ] Task 10: Fix performance.ts flushDomWrites try-catch
  <!-- files: lib/performance.ts -->
  Wrap each write in try-catch to ensure all writes execute even if one fails.

- [ ] Task 11: Fix debounce/throttle type constraint
  <!-- files: lib/performance.ts -->
  Change type constraint from `(...args: unknown[]) => void` to `(...args: any[]) => void`.

- [ ] Task 12: Fix parseTimestamp returning 0 on failure
  <!-- files: lib/subtitleParser.ts -->
  Return NaN instead of 0 on regex match failure so callers can skip invalid cues.

- [ ] Task 13: Fix parseWebVTT headerless fallback
  <!-- files: lib/subtitleParser.ts -->
  Fall back to stripping only the 'WEBVTT' line if no double-newline is found.

- [ ] Task 14: Fix glossary word boundary matching
  <!-- files: lib/glossary.ts -->
  Use word-boundary aware matching or require minimum term length to avoid false positive mismatch flags.

- [ ] Task 15: Fix deepMerge for special object types
  <!-- files: lib/utils.ts -->
  Add checks for Date, RegExp, Map, Set before treating objects as mergeable plain objects.

- [ ] Task 16: Fix crypto.ts bytesToBase64 for large arrays
  <!-- files: lib/crypto.ts -->
  Use chunked approach for String.fromCharCode to avoid stack overflow on large arrays.

- [ ] Task 17: Fix domCueSource emit shallow copy
  <!-- files: inject/domCueSource.ts -->
  Deep-copy cue objects in emit() or use immutable cue objects to prevent buffer corruption.

- [ ] Task 18: Fix fetchInterceptor responseClone.text try-catch
  <!-- files: inject/fetchInterceptor.ts -->
  Wrap responseClone.text() in try-catch, fall back to original response on read failure.

- [ ] Task 19: Fix interceptorRegistry relative URL base
  <!-- files: inject/interceptorRegistry.ts -->
  Use window.location.origin as base for relative URL resolution instead of example.com.

- [ ] Task 20: Fix xhrInterceptor JSON responseType
  <!-- files: inject/xhrInterceptor.ts -->
  Check responseType === 'json' and parse accordingly, or document that JSON is unsupported for intercepted subtitles.

- [ ] Task 21: Fix domCueSource hardcoded HBO Max URL pattern
  <!-- files: inject/domCueSource.ts -->
  Move extractVideoId to handler's getDomCueSource() configuration instead of hardcoding in generic module.

- [ ] Task 22: Remove dead paragraphCount prop in PDF viewer
  <!-- files: entrypoints/pdf-viewer/App.tsx -->
  Compute real paragraph count from translation.originalParagraphs?.length or remove the prop.

- [ ] Task 23: Wire or remove dead onTranslateCurrentPage in SetupWizard
  <!-- files: entrypoints/options/SetupWizard.tsx, entrypoints/options/App.tsx -->
  Wire onTranslateCurrentPage prop in App or remove the dead prop/button.

- [ ] Task 24: Fix popup triple tab query
  <!-- files: entrypoints/popup/App.tsx -->
  Combine three separate chrome.tabs.query calls into a single query on popup mount.

- [ ] Task 25: Consolidate popup Toggle with shared ui/Toggle
  <!-- files: entrypoints/popup/App.tsx -->
  Replace local Toggle component with shared ui/Toggle.tsx to fix incompatible onChange signatures.

- [ ] Task 26: Fix PDF download cancellation support
  <!-- files: entrypoints/pdf-viewer/lib/translatedPdfGenerator.ts -->
  Thread AbortSignal through generateTranslatedPdf per-page loop and break on abort.

- [ ] Task 27: Fix pdfFontManager hardcoded font URL
  <!-- files: entrypoints/pdf-viewer/lib/pdfFontManager.ts -->
  Use Google Fonts CSS API URL to resolve current TTF, or bundle the font locally.

- [ ] Task 28: Fix ModelPicker unmount setState warning
  <!-- files: entrypoints/options/components/ModelPicker.tsx -->
  Add AbortController or mountedRef guard and bail on cleanup.

- [ ] Task 29: Fix SubtitlesSection AnimatedCue timer leak
  <!-- files: entrypoints/options/sections/SubtitlesSection.tsx -->
  Clear current fadeTimer at start of each interval tick, or track all pending timers in a ref.

- [ ] Task 30: Fix Toast inner timer not cleared on manual dismiss
  <!-- files: entrypoints/ui/Toast.tsx -->
  Track inner 200ms setTimeout in a ref and clear it in effect cleanup.

- [ ] Task 31: Fix ProviderSection custom prompt jitter
  <!-- files: entrypoints/options/sections/ProviderSection.tsx -->
  Use local draft state and only commit null on explicit 'Reset' action.

- [ ] Task 32: Fix usePdfDownload untracked timeout
  <!-- files: entrypoints/pdf-viewer/hooks/usePdfDownload.ts -->
  Store the setTimeout ID and clear it on unmount, or guard with a.parentNode check.

- [ ] Task 33: Fix useVisiblePages containerRef.current in deps
  <!-- files: entrypoints/pdf-viewer/hooks/useVisiblePages.ts -->
  Use a callback ref or state to track the container element instead of listing ref.current in deps.

- [ ] Task 34: Fix PdfCanvasRenderer callback deps
  <!-- files: entrypoints/pdf-viewer/components/PdfCanvasRenderer.tsx -->
  Wrap onRendered and onError in useRef or use a ref-based latest-callback pattern.

- [ ] Task 35: Fix content.ts hoverTranslate cache not cleared on stop
  <!-- files: entrypoints/content.ts -->
  Call clearHoverCache() in stopTranslation() in content.ts.

- [ ] Task 36: Fix content.ts sectionTranslate not cleared on SPA nav
  <!-- files: content/sectionTranslate.ts -->
  Clear translatedSections array on SPA navigation or beforeunload.
