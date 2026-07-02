# Plan: Generic Subtitle Handler

## Phase 1: GenericSubtitleHandler Core + Tests
<!-- execution: sequential -->

- [ ] Task 1: Write unit tests for GenericSubtitleHandler URL pattern matching
  - Test .vtt/.webvtt extension patterns (with and without query params)
  - Test .srt extension patterns
  - Test .ttml/.ttml2 extension patterns
  - Test path-based patterns (/subtitle/, /caption/, /texttrack/)
  - Test negative cases (non-subtitle .vtt, .xml without ttml)
  - Test detect() returns true when video element exists, false otherwise
  <!-- files: inject/subtitleHandlers/__tests__/genericHandler.test.ts -->

- [ ] Task 2: Implement GenericSubtitleHandler class
  - Create inject/subtitleHandlers/generic.ts
  - Implement detect(): check for <video> element on page
  - Implement getPatterns(): return URL regex patterns for .vtt, .srt, .ttml, path-based
  - Implement transformResponse(): delegate to parseSubtitles() auto-detect
  - Implement isWatchPage(): return true when video element exists
  <!-- files: inject/subtitleHandlers/generic.ts -->

- [ ] Task 3: Implement content validation
  - Add validateSubtitleContent() helper: check for WEBVTT header, SRT timing lines, TTML root element
  - Reject non-subtitle VTT/XML (chapter markers, video descriptions)
  - Integrate validation into transformResponse() - return empty cues if validation fails
  <!-- files: inject/subtitleHandlers/generic.ts, lib/subtitleParser.ts -->

- [ ] Task 4: Implement getNativeCaptionHide() with common selectors
  - Return common caption container selectors: .vjs-text-track-display, .shaka-text-container, [data-testid*="caption"], .cue-text, .subtitle-text
  <!-- files: inject/subtitleHandlers/generic.ts -->

- [ ] Task 5: Write unit tests for content validation and native caption hide
  - Test validateSubtitleContent() accepts real VTT/SRT/TTML
  - Test validateSubtitleContent() rejects non-subtitle content
  - Test getNativeCaptionHide() returns expected selectors
  <!-- files: inject/subtitleHandlers/__tests__/genericHandler.test.ts -->

## Phase 2: Content-Type Detection Enhancement
<!-- execution: sequential -->
<!-- depends: phase1 -->

- [ ] Task 1: Write tests for Content-Type matching in InterceptorRegistry
  - Test matchContentType() for text/vtt, application/x-subtitle, application/ttml+xml
  - Test that URL pattern matching takes precedence over Content-Type
  <!-- files: inject/__tests__/interceptorRegistry.test.ts -->

- [ ] Task 2: Extend InterceptorRegistry with Content-Type matching
  - Add SubtitleContentTypePattern type (contentType string -> platform)
  - Add registerContentTypePattern() and matchContentType() methods
  - Content-Type matching is secondary (checked only when URL patterns don't match)
  <!-- files: inject/interceptorRegistry.ts, types/subtitle.ts -->

- [ ] Task 3: Wire Content-Type detection into XhrInterceptor
  - After response is received, if URL pattern didn't match, check Content-Type header
  - If Content-Type matches subtitle patterns, intercept and translate
  <!-- files: inject/xhrInterceptor.ts -->

- [ ] Task 4: Wire Content-Type detection into FetchInterceptor
  - After response is received, if URL pattern didn't match, check Content-Type header
  - If Content-Type matches subtitle patterns, intercept and translate
  <!-- files: inject/fetchInterceptor.ts -->

- [ ] Task 5: Add Content-Type patterns to GenericSubtitleHandler
  - Implement getContentTypePatterns() returning text/vtt, application/x-subtitle, application/ttml+xml
  - Register content-type patterns via registry
  <!-- files: inject/subtitleHandlers/generic.ts -->

## Phase 3: DOM Cue-Scraping Fallback
<!-- execution: sequential -->
<!-- depends: phase1 -->

- [ ] Task 1: Write tests for generic DOM cue source selectors
  - Test getDomCueSource() returns common caption container selectors
  - Test that existing domCueSource.ts infrastructure works with generic selectors
  <!-- files: inject/subtitleHandlers/__tests__/genericHandler.test.ts -->

- [ ] Task 2: Implement getDomCueSource() on GenericSubtitleHandler
  - Define common caption container selectors: .vjs-text-track-display, .shaka-text-container, [data-testid*="caption"], .cue-text, .subtitle-text, #caption-window
  - Define cue text selector within containers
  - Define activation attribute (presence of text in caption container)
  <!-- files: inject/subtitleHandlers/generic.ts -->

- [ ] Task 3: Wire generic DOM cue source into coordinator
  - Verify existing domCueSource.ts handles generic selectors
  - Ensure fallback timeout mechanism works (URL interception fails -> DOM scraping activates)
  - Test with simulated DOM caption elements
  <!-- files: content/subtitleCoordinator.ts -->

## Phase 4: Handler Registration & Priority
<!-- execution: sequential -->
<!-- depends: phase1, phase2, phase3 -->

- [ ] Task 1: Write tests for handler priority (specific > generic)
  - Test detectCurrentHandler() returns YouTube handler on youtube.com, not generic
  - Test detectCurrentHandler() returns generic on unknown site with video
  - Test getPatternsForCurrentHost() only includes generic patterns on unknown sites
  <!-- files: inject/subtitleHandlers/__tests__/genericHandler.test.ts -->

- [ ] Task 2: Register GenericSubtitleHandler in content.ts
  - Import GenericSubtitleHandler
  - Register LAST in the registerSubtitleHandlers() array
  - Conditional on enableGenericSubtitleHandler setting
  <!-- files: entrypoints/content.ts -->

- [ ] Task 3: Register GenericSubtitleHandler in inject.content/index.ts
  - Import GenericSubtitleHandler
  - Register LAST in the registerSubtitleHandlers() array
  <!-- files: entrypoints/inject.content/index.ts -->

- [ ] Task 4: Verify detect() priority logic
  - Ensure generic handler detect() checks for video element
  - Ensure specific handlers always detect first (registration order)
  - Run existing test suite to verify no regressions
  <!-- files: inject/subtitleHandlers/generic.ts -->

## Phase 5: Settings & UI
<!-- execution: sequential -->
<!-- depends: phase4 -->

- [ ] Task 1: Add enableGenericSubtitleHandler to SubtitleSettings type
  - Add field to SubtitleSettings interface in types/config.ts
  - Add to DEFAULT_SETTINGS with default: true
  - Update extractSettings() in settings store
  <!-- files: types/config.ts, services/settingsStore.ts -->

- [ ] Task 2: Write tests for settings toggle behavior
  - Test handler not registered when enableGenericSubtitleHandler is false
  - Test handler registered when true
  - Test toggle independent from disabledSubtitleSites
  <!-- files: inject/subtitleHandlers/__tests__/genericHandler.test.ts -->

- [ ] Task 3: Wire settings to handler registration
  - In content.ts, check settings.enableGenericSubtitleHandler before registering
  - In inject.content/index.ts, always register (MAIN world doesn't have settings access - coordinator gates)
  - Coordinator checks setting before activating generic handler
  <!-- files: entrypoints/content.ts, content/subtitleCoordinator.ts -->

- [ ] Task 4: Add toggle UI in Options -> Subtitles section
  - Add "Generic subtitle detection" toggle in SubtitlesSection component
  - Place near the supported sites card
  - Add description text explaining auto-detect behavior
  <!-- files: entrypoints/options/components/SubtitlesSection.tsx -->

- [ ] Task 5: Update SUPPORTED_SUBTITLE_SITES in lib/subtitleSites.ts
  - Add "Generic" entry with platform: 'generic', name: 'Generic (Auto-detect)', methodHint: 'Auto-detect (any site with video)'
  - Ensure it appears last in the list
  <!-- files: lib/subtitleSites.ts -->

- [ ] Task 6: Update Settings UI tests
  - Test toggle renders and responds to clicks
  - Test setting persists to chrome.storage
  <!-- files: entrypoints/options/components/__tests__/SubtitlesSection.test.tsx -->

## Phase 6: Integration & Final Verification
<!-- execution: sequential -->
<!-- depends: phase5 -->

- [ ] Task 1: Run full test suite (pnpm test)
  - Verify all existing tests pass
  - Verify new tests pass
  - Fix any regressions

- [ ] Task 2: Run lint (pnpm lint)
  - Fix any new lint errors

- [ ] Task 3: Run typecheck (tsc --noEmit)
  - Fix any type errors

- [ ] Task 4: Run build (wxt build)
  - Verify build succeeds
  - Check bundle size impact

- [ ] Task 5: Capture learnings
  - Update track learnings.md with patterns discovered
  - Elevate reusable patterns to conductor/patterns.md
