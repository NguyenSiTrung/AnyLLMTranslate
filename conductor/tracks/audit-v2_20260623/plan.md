# Plan: Codebase Audit v2 - Deep Analysis Fixes & Improvements

## Phase 1: P0 Critical Crashes
<!-- execution: parallel -->

- [x] Task 1: Fix subtitleCoordinator translatedCues assignment <!-- commit: pending -->
  <!-- files: content/subtitleCoordinator.ts, content/__tests__/subtitleCoordinator.test.ts -->
  Add `state.translatedCues = cues;` inside `updateTranslatedCues()` before calling `updateCues(cues)`. Write test verifying mergeTranslatedChunk receives non-null translatedCues.

- [x] Task 2: Fix LayoutOverlay Rules of Hooks violation <!-- commit: pending -->
  <!-- files: entrypoints/pdf-viewer/components/PdfTranslationPane.tsx -->
  Move all hook declarations before the early return in LayoutOverlay, or split into a wrapper component that conditionally mounts/unmounts. Verify cached translation before page proxy load doesn't crash.

- [x] Task 3: Fix removeTranslation un-marking all elements <!-- commit: pending -->
  <!-- files: content/translationDisplay.ts, content/__tests__/translationDisplay.test.ts -->
  Scope marker cleanup to only the parent element of the removed piece, and only if no other translation elements remain within it. Write test verifying other translations are not un-marked.

- [x] Task 4: Fix deduplicateAncestors logic bug <!-- commit: pending -->
  <!-- files: lib/domUtils.ts, lib/__tests__/domUtils.test.ts -->
  Change containment check from `result[result.length - 1].contains(el)` to `result.some(r => r.contains(el))`. Write test with [A, B, C] where A contains C but B is a sibling.

## Phase 2: P1 High-Confidence Bugs
<!-- execution: parallel -->

- [ ] Task 1: Fix semaphore bypass for subtitle chunks
  <!-- files: services/background.ts, services/__tests__/background.test.ts -->
  Move acquireSemaphore/releaseSemaphore inside the async IIFE for each chunk in handleTranslateSubtitle. Verify MAX_CONCURRENT limit holds across all chunks.

- [ ] Task 2: Fix incomplete section translation cleanup
  <!-- files: content/sectionTranslate.ts, content/__tests__/sectionTranslate.test.ts -->
  Add removal of `.anyllm-inline-bilingual` and `[INLINE_CLONE_ATTR]` elements in removeSectionTranslation. Also remove dead selectors for [role=loading] and [role=error].

- [ ] Task 3: Fix proactiveCategoryDetectionTimer leak on SPA nav
  <!-- files: content/subtitleCoordinator.ts -->
  Add `clearTimeout(proactiveCategoryDetectionTimer)` and null assignment to resetCoordinatorState(). Verify timer is cleared on SPA navigation.

- [ ] Task 4: Fix undefined response crash in fetchViaBackground
  <!-- files: content/subtitleCoordinator.ts -->
  Add `if (!response) { reject(new Error('No response from background')); return; }` before accessing response properties.

- [ ] Task 5: Fix duplicate piece IDs on repetitive pages
  <!-- files: content/hoverTranslate.ts -->
  Incorporate element DOM position (e.g. XPath index or monotonic counter) into generateHoverId to ensure uniqueness beyond first 50 chars of textContent.

- [ ] Task 6: Fix stale closure and dead code in content.ts storage listener
  <!-- files: entrypoints/content.ts -->
  Remove lines 436-438 (dead code block with stale settings.theme check). The block above (lines 426-432) already handles custom theme correctly using newSettings.

- [ ] Task 7: Fix untracked fade timeout in autoTranslateNotification
  <!-- files: content/autoTranslateNotification.ts -->
  Track the 300ms fade setTimeout in a module-level variable. Clear it in removeNotification() and at the start of showAutoTranslateNotification().

- [ ] Task 8: Fix unvalidated settings import
  <!-- files: entrypoints/options/sections/AdvancedSection.tsx -->
  Add per-field typeof validation on imported JSON. Strip `__proto__`/`constructor`/`prototype` keys before merging. Add warning when apiKey is present in export.

## Phase 3: P2 Security & Data Integrity
<!-- execution: parallel -->

- [ ] Task 1: Fix SSRF - add 172.16/12 and IPv6 private ranges
  <!-- files: services/background.ts -->
  Add 172.16.0.0/12 check, IPv6 ULA (fc00::/7), and IPv6 link-local (fe80::/10) to isAllowedSubtitleUrl private IP validation.

- [ ] Task 2: Block file:// from content-script OPEN_PDF_VIEWER
  <!-- files: services/background.ts -->
  Only allow file:// protocol from trusted senders (popup). Strip file:// support from content-script-originated messages.

- [ ] Task 3: Warn on HTTP baseUrl with API key
  <!-- files: services/openaiCompatible.ts -->
  Add protocol check - warn or strip API key for non-https URLs in fetchWithRetry.

- [ ] Task 4: Mitigate prompt injection via pageContext
  <!-- files: services/base.ts -->
  Wrap pageContext fields in delimiters (e.g. `<page_title>...</page_title>`) and add instruction to treat content as data not instructions. Limit field length.

- [ ] Task 5: Fix partial translations reported as success
  <!-- files: services/base.ts, services/__tests__/base.test.ts -->
  When LLM returns fewer IDs than expected, either return success=false or include missing IDs with empty/fallback translations. Add test for partial response.

- [ ] Task 6: Fix debug logging permanently broken in background SW
  <!-- files: services/debugLog.ts, services/background.ts -->
  Call warmDebugCache() at SW startup. Change invalidateDebugCache() to trigger async refresh instead of setting cachedEnabled=false.

- [ ] Task 7: Fix cache clear race condition
  <!-- files: services/cacheManager.ts -->
  Set a module-level `isClearing` flag that getCachedTranslation checks, or clear timer and pending map AFTER deleting all keys.

- [ ] Task 8: Fix textTrackDiscovery module-level mutable state
  <!-- files: inject/textTrackDiscovery.ts -->
  Move WeakSets and cleanup array into closure scope or add guard to prevent re-registration. Ensure cleanup doesn't clear shared state from other invocations.

- [ ] Task 9: Fix XHR interceptor readyState suppression
  <!-- files: inject/xhrInterceptor.ts -->
  Replay intermediate readyState callbacks (1/2/3) instead of suppressing them. Only delay the final readyState 4 callback until translation completes.

- [ ] Task 10: Fix XHR disable clobbering third-party patches
  <!-- files: inject/xhrInterceptor.ts -->
  Add identity check before restoring prototype methods (like fetchInterceptor does for window.fetch).

- [ ] Task 11: Fix fetch interceptor pending translation leak
  <!-- files: inject/fetchInterceptor.ts -->
  In disable(), clean up pending subtitle translations: remove message listeners and clear pending timeouts.

- [ ] Task 12: Fix shallow spread in onSettingsChange
  <!-- files: lib/config.ts -->
  Replace shallow spread with deepMerge for constructing callback arguments in onSettingsChange().

- [ ] Task 13: Fix broad "model" keyword matching
  <!-- files: lib/providerReadiness.ts -->
  Use specific patterns like 'model not found', 'model_not_found', 'does not exist' instead of just 'model'.

- [ ] Task 14: Fix DOM cue source no seek handling
  <!-- files: inject/domCueSource.ts -->
  Add video 'seeked' event listener to close/reset the open cue on seek. Prevents corrupted cue timeline.

- [ ] Task 15: Fix legacy decryptApiKey returning ciphertext on failure
  <!-- files: lib/crypto.ts -->
  Change decryptApiKey to return '' on failure instead of raw ciphertext. Keep decryptApiKeyResult as the primary API.

## Phase 4: P2 Performance, Timeouts & Resource Leaks
<!-- execution: parallel -->

- [ ] Task 1: Wire categoryStore.initTabCleanup in background
  <!-- files: services/background.ts, services/categoryStore.ts -->
  Call categoryStore.initTabCleanup() at SW startup or inside initSubtitleSessionCleanup. Add guard in categoryStore to prevent duplicate listener registration.

- [ ] Task 2: Add timeout to handleFetchSubtitle
  <!-- files: services/background.ts -->
  Add AbortController with 30s timeout to fetch() call in handleFetchSubtitle.

- [ ] Task 3: Fix subtitle stat overcounting
  <!-- files: services/background.ts -->
  Move incrementStats for totalSubtitlesCuesTranslated to per-chunk completion instead of counting all cues upfront.

- [ ] Task 4: Replace fragile HTTP status string matching with error class
  <!-- files: services/openaiCompatible.ts -->
  Create a custom ApiError class with statusCode property. Use it in fetchWithRetry instead of message.startsWith('HTTP 4').

- [ ] Task 5: Add batching to classifyPdfParagraphs
  <!-- files: services/openaiCompatible.ts -->
  Batch paragraphs (e.g. 50 at a time) and merge results to avoid exceeding model context window.

- [ ] Task 6: Add timeouts to providerTester (all 3 steps)
  <!-- files: services/providerTester.ts -->
  Add AbortController with 15-30s timeout to testPing, testModelListing, and testTranslation fetch calls.

- [ ] Task 7: Fix hardcoded Vietnamese in providerTester
  <!-- files: services/providerTester.ts -->
  Accept targetLanguage as parameter and use user's configured target language instead of hardcoding Vietnamese.

- [ ] Task 8: Reduce forced reflows in translationDisplay
  <!-- files: content/translationDisplay.ts -->
  Use requestAnimationFrame to defer animation restart instead of reading offsetHeight synchronously per piece.

- [ ] Task 9: Fix O(N^2) inline translation sibling sync
  <!-- files: content/translationDisplay.ts -->
  Route all syncInlineTranslationOnlySiblings calls through scheduleDomWrite debounce. Maintain a Set of clone elements for O(1) removal.

- [ ] Task 10: Fix layout thrashing in sectionPicker
  <!-- files: content/sectionPicker.ts -->
  Cache computed styles during picker mode. Use tagName + block-element set for initial filter, fall back to getComputedStyle only for custom elements.

- [ ] Task 11: Narrow MutationObserver scope in subtitleCoordinator
  <!-- files: content/subtitleCoordinator.ts -->
  Filter mutations to only process nodes that could contain `<video>` elements. Or narrow observation root once primary video is found.

- [ ] Task 12: Fix new Map/object per render in PDF viewer
  <!-- files: entrypoints/pdf-viewer/App.tsx -->
  Hoist a module-level stable IDLE sentinel object and reuse it for untranslated pages.

- [ ] Task 13: Fix IntersectionObserver churn in usePdfPageTranslations
  <!-- files: entrypoints/pdf-viewer/hooks/usePdfPageTranslations.ts -->
  Depend on a stable signal (e.g. pdfPages.length) instead of the array reference. Re-query slots inside the effect.

## Phase 5: P3 Services, Background & Lib
<!-- execution: parallel -->

- [ ] Task 1: Fix tabId || sender.tab?.id to use nullish coalescing
  <!-- files: services/background.ts -->
  Replace `||` with `??` for tabId checks in setCategoryOverride and getCategoryOverride handlers.

- [ ] Task 2: Extract CHUNK_SIZE to module-level constant
  <!-- files: services/background.ts -->
  Move hardcoded 25 to a module-level CHUNK_SIZE constant. Reference in both handleTranslateSubtitle and PRIORITIZE_SUBTITLE_CHUNK handler.

- [ ] Task 3: Move clearKeepaliveAlarm to finally block
  <!-- files: services/background.ts -->
  Remove redundant clearKeepaliveAlarm calls in success/failure/catch paths. Add single call in finally block.

- [ ] Task 4: Fix ensureKeepaliveAlarm race
  <!-- files: services/background.ts -->
  Track alarm existence with a module-level boolean flag to prevent redundant create calls.

- [ ] Task 5: Add .catch() to updateSettings handler
  <!-- files: services/background.ts -->
  Add `.catch(() => ({ success: false, error: '...' }))` to initService().then() chain.

- [ ] Task 6: Fix unclosed think-block regex
  <!-- files: services/base.ts -->
  Add fallback regex `/think:[\s\S]*$/` to handle unclosed think blocks after the primary regex.

- [ ] Task 7: Add protocol check in validateProviderConfig
  <!-- files: services/base.ts -->
  Verify baseUrl protocol is http: or https: in validateProviderConfig.

- [ ] Task 8: Pass glossary and custom prompt through batcher
  <!-- files: services/batcher.ts -->
  Accept glossaryBlock and customSystemPrompt in constructor or add() options and forward to service.translate().

- [ ] Task 9: Add no-op catch to batcher add() promise
  <!-- files: services/batcher.ts -->
  Attach a no-op .catch() to the original promise before returning to prevent unhandled rejections.

- [ ] Task 10: Use idb-keyval clear() in cacheManager
  <!-- files: services/cacheManager.ts -->
  Replace sequential del() loop with clear() from idb-keyval for bulk cache clearing.

- [ ] Task 11: Fix flushLruUpdates silent failure
  <!-- files: services/cacheManager.ts -->
  On set() failure, re-add failed entries to pendingLruUpdates for retry on next flush.

- [ ] Task 12: Fix neverAutoOpenSites subdomain matching
  <!-- files: services/pdfAutoOpen.ts -->
  Use hostname suffix matching: `hostname === site || hostname.endsWith('.' + site)`.

- [ ] Task 13: Fix UTC date in statsCollector
  <!-- files: services/statsCollector.ts -->
  Use local date formatting (e.g. `new Date().toLocaleDateString('en-CA')`) instead of UTC.

- [ ] Task 14: Guard categoryStore initTabCleanup against duplicate registration
  <!-- files: services/categoryStore.ts -->
  Add module-level boolean flag to ensure chrome.tabs.onRemoved listener is registered only once.

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
