# Initial Concept

LinguaLens — an open-source Chrome extension that replicates and extends the core value proposition of Immersive Translate: bilingual side-by-side web page translation and video subtitle translation, powered by any OpenAI-compatible LLM endpoint (fully BYOK).

---

# Product Guide

## Vision

LinguaLens is an open-source, privacy-first Chrome extension for immersive bilingual translation. It enables users to read web pages in their native language alongside the original text, and translates video subtitles on learning platforms — all powered by any LLM the user brings.

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

### UI & Settings
- Popup UI (quick translate controls)
- Options page (provider config, theme selection, site rules)
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

### In Progress
- Phase 4: Advanced features (Netflix handler, side panel, keyboard shortcuts, text selection translate)

## Out of Scope (Initial Release)

- Built-in translation API (users must BYOK)
- Mobile browser support
- PDF translation
- Browser extensions other than Chrome (Firefox, Safari)
