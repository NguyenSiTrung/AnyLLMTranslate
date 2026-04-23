# Initial Concept

AnyLLMTranslate — an open-source Chrome extension that replicates and extends the core value proposition of Immersive Translate: bilingual side-by-side web page translation and video subtitle translation, powered by any OpenAI-compatible LLM endpoint (fully BYOK).

---

# Product Guide

## Vision

AnyLLMTranslate is an open-source, privacy-first Chrome extension for immersive bilingual translation. It enables users to read web pages in their native language alongside the original text, and translates video subtitles on learning platforms — all powered by any LLM the user brings.

## Target Users

- **Language learners** who want bilingual reading to improve comprehension
- **International professionals** reading foreign-language articles, documentation, and reports
- **Online course students** on platforms like Udemy, Coursera, and YouTube who need subtitle translation
- **Privacy-conscious users** who prefer self-hosted or local LLM backends (Ollama, LM Studio, vLLM)
- **Developers/power users** who want full control over their translation pipeline

## Core Value Propositions

1. **Bilingual Side-by-Side Display** — Translated text appears below/beside original paragraphs with minimal layout disruption, supporting 15+ visual themes
2. **Video Subtitle Translation** — Real-time bilingual subtitles on Udemy, Coursera, YouTube, and Netflix via XHR/fetch interception
3. **Universal LLM Backend (BYOK)** — Connect to any OpenAI-compatible API: OpenAI, DeepSeek, Groq, Ollama, LM Studio, vLLM, Gemini, Claude via proxy
4. **Premium Display UX** — Multiple translation themes (underline, highlight, bubble, mask, fade-in), dark mode, loading/error states
5. **Smart DOM Translation** — Viewport-based lazy translation, SPA support via MutationObserver, intelligent paragraph detection

## Key Features

### Page Translation
- DOM walker with intelligent paragraph detection
- Viewport-based lazy translation (IntersectionObserver)
- SPA / dynamic content support (MutationObserver)
- Translation cache via IndexedDB
- Restore/undo translation

### Video Subtitle Translation
- XHR/Fetch interception via MAIN world script injection
- Platform handlers: YouTube, Udemy, Coursera, Netflix
- WebVTT parser and bilingual builder
- Custom subtitle overlay (fallback renderer)
- Drag-and-drop subtitle repositioning with session persistence
- Proactive subtitle track discovery (HTML5 TextTrack + platform handlers)

### UI & Settings
- Popup UI (redesigned dropdown with permanent quick settings)
- Options page (provider config, theme selection, site rules)
- Shared component library (12 reusable components: Button, Card, Input, Modal, Select, Slider, Toggle, Toast, Badge, EmptyState, FieldGroup, ToastProvider)
- Side panel (reading view)
- Text selection translate popup
- Mouse hover translation
- Keyboard shortcuts (10+)
- Context menu integration

### Translation Engine
- Single universal OpenAI-compatible provider
- Request batching & deduplication
- Custom glossary/term protection
- Configurable system prompts

## Success Metrics

- Translation latency < 2s for visible content
- < 50ms DOM injection overhead
- < 5MB extension bundle size
- Theme switching < 100ms
- Support 50+ built-in site rules
- 80%+ test coverage

## Implementation Status

### Completed
- **Phase 1 — Foundation** (Archived 2026-04-09): Page translation pipeline, DOM walker, viewport observer, mutation watcher, translation display, background service worker, cache manager, batcher, OpenAI-compatible provider. 94 tests passing.
- **Phase 2 — Subtitles** (Archived 2026-04-09): Video subtitle translation engine with XHR/fetch interception, MAIN world injection, postMessage bridge, WebVTT/SRT parsers, bilingual VTT builder, YouTube/Udemy/Coursera handlers, custom subtitle overlay with controls.
- **Phase 3 — UX Polish & LLM Provider** (Archived 2026-04-10): 16 CSS themes system, Zustand settings store with chrome.storage sync, provider connection tester, template-based system prompt, full Options page with 8-tab vertical layout, enhanced popup with quick settings. 283 tests passing across 24 files.
- **Phase 4 — Launch-Ready Advanced Features** (Archived 2026-04-10): Text selection translate popup, mouse hover translate, keyboard shortcuts (hybrid global + page-specific), context menu integration, performance optimizations (requestIdleCallback, DOM batching), Chrome Web Store packaging (119KB zip), project documentation (README, CONTRIBUTING, PRIVACY). 370 tests passing across 30 files.
- **Phase 5 — Settings UI/UX Overhaul** (Archived 2026-04-10): 12-component shared UI library (Button, Card, Input, Modal, Select, Slider, Toggle, Toast, Badge, EmptyState, FieldGroup, ToastProvider), sidebar navigation redesign, CSS-only animations, accessibility compliance.
- **Provider Simplification** (Archived 2026-04-10): Consolidated multi-provider system into single OpenAI-compatible endpoint.
- **Theme Preview** (Archived 2026-04-10): Live theme preview component with light/dark mode toggle, integrated into Options page.
- **Display Theme Fix** (Archived 2026-04-10): Fixed cssInjectionMode to 'manifest', corrected inline layout element translation placement.
- **Paragraph Translation Progress Indicators** (Archived 2026-04-10): Pure CSS border-trick spinner via `::before` pseudo-element, in-place placeholder update system (no layout shift), batch spinner pattern (show all before `await`), error state on translation element itself.
- **Cache Integration Hardening** (Archived 2026-04-16): Cache read/write in page translation pipeline, cache read in text selection translate, daily LRU eviction via chrome.alarms, batch LRU writes with 500ms debounce. 16 new cache tests added.
- **Cache Configuration UI** (Archived 2026-04-16): Configurable cache settings (TTL days, max size MB, max batch chars) in Options → Advanced section. Validation on blur, auto-save to chrome.storage. 13 new unit tests.
- **Fix Display Mode** (Archived 2026-04-16): Wire displayMode setting to translation-only page state correctly, implement shortcut toggle handling for display mode, and clean up test mock types.
- **Subtitle Translation Refinements** (2026-04-17, incremental): Fixed subtitle language preference (use user setting over extracted language), fixed requestId propagation in SUBTITLE_TRANSLATED envelope, resolved subtitle mirroring-to-English bug, corrected overlay opacity blocking video playback, added loading toast notification during local LLM subtitle interception. XHR/coordinator timeout extended from 5s to 30s for slow local LLM support.
- **Custom Extension Icon** (2026-04-17, incremental): Replaced default extension icons with custom transparent neon design.
- **Inline Input Translation via Key Gesture** (Archived 2026-04-18): Alt+T key gesture to translate text in any input/textarea/contenteditable element inline. Supports Google Search, ChatGPT, and other input fields. Window-level capture phase listener to intercept before page autocomplete handlers.
- **Hardening & Fixes — Build Blockers, Runtime Reliability, Security** (Archived 2026-04-22): AES-GCM encryption for API keys via `lib/crypto.ts`, deep merge for nested settings, in-process semaphore rate limiting (max 3 concurrent), subtitle fetch URL allow-list, content-script re-injection guard, React error boundaries for popup/options, `chrome.storage.onChanged` listener cleanup.
- **UX Power Features — Auto-Translate, Statistics, Section Translation** (Archived 2026-04-22): Auto-translate on page load via hostname matching with wildcard support and notification bar. Translation statistics dashboard with CSS-only daily bar chart. Section picker with visual highlight and per-section translation via Alt+Q shortcut. Fire-and-forget stats collection pattern.
- **Custom Theme Builder & Context-Aware Translation** (Archived 2026-04-22): Custom theme editor with live preview via CSS custom properties (`--anyllm-custom-*`). Context-aware translation with page context extraction (<10ms, DOM-only) and domain-to-category heuristic map for ~30 top domains. Parent toggle gates child sub-toggles pattern.
- **Two-Layer Page Category Override System** (Archived 2026-04-23): Tab-scoped temporary override via popup dropdown + persistent SiteRule-based override. Three-level resolution: tab override → site rule category → auto-detected. "Save as Rule" promotion pattern. Category field added to SiteRule editor with auto-suggest from domain map.
- **Settings UI/UX Improvements** (2026-04-17, incremental): Refactored settings tabs for UI/UX consistency with general tab, added SegmentedControl component, improved Card styling, added subtitle translation toggle to popup menu, added close button to subtitle toast.
- **Settings UI/UX Enhancement & Subtitle Configuration** (Archived 2026-04-17): Extended SubtitleSettings type with fontFamily, displayMode, translationTimeout. Enhanced SubtitlesSection with mini video preview, font family selector, display mode toggle. Wired settings to runtime overlay. Visual polish with icon-and-card consistency and hover micro-animations. 35 new tests added.
- **Fullscreen Overlay Fix** (Archived 2026-04-17): Refactored subtitle overlay from absolute to fixed positioning for fullscreen visibility. Implemented dynamic reparenting and Popover API fallback for Top Layer support. 7 new overlay tests added.
- **Progressive Chunked Subtitle Translation** (Archived 2026-04-17): Implemented a progressive subtitle priority queue to respond to video seek events. Replaced batch processing with a progressive, chunked delivery system to reduce latency. Added context-aware processing with cue overlaps.
- **Subtitle Drag-and-Drop Repositioning** (2026-04-17, incremental): Interactive drag-and-drop for subtitle overlay via pointer events, persistent position across sessions via chrome.storage, fullscreen-aware repositioning. CSS `cursor: grab/grabbing` and `user-select: none` for drag UX.
- **Proactive Subtitle Discovery & Auto-Activation** (2026-04-17, incremental): Universal HTML5 TextTrack fallback discovery via MutationObserver + `addtrack` events (`inject/textTrackDiscovery.ts`). Extended YouTube, Udemy, and Coursera handlers to emit `SUBTITLE_TRACKS_DISCOVERED` messages. Auto-activation UI in Options → Subtitles section with language preference and toggle. New `subtitleAutoActivate` config option. 4 new tests added.
- **Settings UI/UX Polish & Bug Fixes** (Archived 2026-04-18): Fixed scroll position leak on tab switch, misleading cache usage bar, icon duplication. Added delete confirmation for Dictionary entries, selector fields to SiteRules. Restructured AdvancedSection (5→3 cards), added SubtitlesSection sub-groups. Section-specific accent colors, live ThemePreview integration, Card hover lift, kbd press animations. 2 new tests added.

### Current State
- 697 tests passing across 55 files. Build passing (`wxt build` ✅, 639.81 KB). 0 lint errors.
- **No active tracks.** All 27 tracks completed and archived.

## Out of Scope (Initial Release)

- Built-in translation API (users must BYOK)
- Mobile browser support
- PDF translation
- Browser extensions other than Chrome (Firefox, Safari)
