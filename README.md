# 🌐 AnyLLMTranslate — Bilingual Web Translation Extension

> **Translate any webpage & video subtitles into your language using any OpenAI-compatible LLM.**

AnyLLMTranslate is a Chrome (Manifest V3) extension that provides seamless bilingual translation for web pages and video subtitles. Unlike traditional translation tools, it shows translations **inline alongside original text** — preserving context while enabling comprehension. Powered entirely by your own LLM endpoint: no data leaves your machine except to your configured API.

---

## ✨ Features

### 🔤 Web Page Translation
- **Full-page bilingual translation** — original + translated text displayed together
- **Smart DOM walker** — TreeWalker-based extraction groups text into semantic pieces at block boundaries, splitting long texts at sentence boundaries
- **Lazy viewport loading** — `IntersectionObserver` with 200px pre-load margin; batches pieces every 100ms
- **Zero-layout-shift progress indicators** — pure CSS spinners display per-paragraph translation status
- **17 visual themes** — Dividing Line, Blockquote, Paper, Underline, Dashed Underline, Highlight, Wavy Underline, Bubble, Side-by-side, Mask, Fade In, Italic, Dotted Border, Shadow Card, Minimal, Gradient Accent, **Custom** (user-defined)
- **Custom theme editor** — define your own theme with configurable text color, background, border style/color, font style, and size; live preview via CSS custom properties
- **Translation position control** — below / above / side via CSS data-attributes
- **Dark mode support** — auto (system `prefers-color-scheme`), light, or forced dark
- **SPA support** — MutationObserver-based dynamic content detection for single-page applications
- **Auto-translate** — per-site automatic translation on page load via hostname matching with wildcard support; dismissible notification bar

### 🎬 Video Subtitle Translation
- **Platform-specific handlers** with extensible registry pattern
  - **YouTube**: Supports `/api/timedtext` endpoint with srv3 XML and JSON3 formats
  - **Udemy**: Handles VTT from `udemycdn.com` with sprite metadata filtering
  - **Coursera**: Processes VTT from `coursera.org` with query/path language extraction
  - **Vimeo, Netflix, Amazon**: Subtitle fetch allowlist for CORS bypass
- **Proactive subtitle track discovery** via HTML5 TextTrack fallback with MutationObserver + `addtrack` events
- **XHR + Fetch interception** via MAIN world script (`inject.content` at `document_start`)
- **Dual-mode architecture**:
  - **Interception mode**: Hijacks subtitle requests, translates, and returns bilingual VTT
  - **Overlay fallback**: Auto-activates on timeout (30s) with custom subtitle renderer
- **Subtitle parser** supports WebVTT and SRT formats with auto-detection
- **Progressive chunked translation** with seek-aware priority queue for instant feedback
- **Bilingual builder** generates merged or translation-only VTT output
- **Custom overlay** with keyboard controls, resize, and position settings, including **Popover API Top Layer support** for native fullscreen
- **Interactive drag-and-drop repositioning** with session and fullscreen persistence
- **Subtitle coordinator** orchestrates parsing, translation, fallback, and cleanup
- **Preferred subtitle language** with auto-activation when matching tracks are available

### 🖱️ Interactive Translation
- **Text selection translate** — select any text, click the floating translate button; results appear in a tooltip with copy & close actions
- **Mouse hover translate** — hover over paragraph-level elements; configurable 200–500ms delay, element-level cache
- **Inline translate** — rapid key-gesture translation in editable fields (default: triple-space); includes native undo support, pulsing border feedback, and floating toast notifications; works with Google Search, ChatGPT, and other input fields via window-level capture phase listener
- **Section translate** — translate specific DOM sections without full-page commitment; multiple sections can be translated independently with dismiss buttons; visual section picker with highlight overlay
- **Keyboard shortcuts** (global via `chrome.commands` + page-level via event listeners)
- **Context menu integration** — right-click → Translate Page / Translate Selection / Translate Section / Translate Subtitles

### ⚙️ Settings & Advanced
- **Any OpenAI-compatible API** — OpenAI, Ollama, LM Studio, Groq, Together AI, Gemini, etc.
- **Provider presets** — Ollama (local, no key required) and Custom
- **Connection tester** — sends a round-trip ping and reports latency
- **Request timeout configuration** — configurable timeout for API requests (default: 60s)
- **Customizable system prompt** with `{{SOURCE_LANG}}` / `{{TARGET_LANG}}` variable injection
- **Context-aware translation** — injects page title, description, and domain into prompts for better context
- **Page category detection** — automatic page categorization with two-layer override system:
  - **Tab-scoped temporary override** — set via popup dropdown, cleared on tab close
  - **Persistent SiteRule override** — saved per-hostname with "Save as Rule" promotion pattern
  - **Three-level resolution**: tab override → site rule category → auto-detected
  - **21 predefined categories** covering software dev, news, academia, e-commerce, and more
- **Per-site translation rules** — include/exclude CSS selectors, always/never translate, auto-translate with dismissible notification
- **Custom glossary / dictionary** — term-protected translation via prompt injection, live mismatch validation preview; CSV & JSON import/export
- **Translation cache** — IndexedDB via `idb-keyval`, SHA-256 keyed, configurable TTL/size limits, LRU eviction via `chrome.alarms`, daily automatic eviction
- **Statistics tracking** — characters translated, API calls, cache hit/miss rate, pages translated, subtitle cues, daily activity bar chart (last 30 days, CSS-only)
- **Custom theme editor** — user-defined themes with configurable text color, background, border style/color, font style, and size; live preview via CSS custom properties
- **Subtitle settings** — position, font family, display mode (bilingual vs translation-only), background opacity, translation timeout, preferred language, auto-activation
- **AES-GCM encryption** — API keys encrypted at rest via `lib/crypto.ts`
- **Rate limiting** — in-process semaphore limiting concurrent translation requests (max 3)
- **React error boundaries** — graceful error handling for popup and options pages

---

## 🚀 Quick Start

### Installation (Developer Mode)

1. Clone the repository:
   ```bash
   git clone https://github.com/NguyenSiTrung/AnyLLMTranslate.git
   cd AnyLLMTranslate
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Build the extension:
   ```bash
   npm run build
   ```

4. Load in Chrome:
   - Navigate to `chrome://extensions/`
   - Enable **Developer mode** (top right)
   - Click **Load unpacked** and select the `.output/chrome-mv3` directory

### Configuration

1. Click the **AnyLLMTranslate** icon in the Chrome toolbar
2. Click the **Settings** gear icon to open the Options page
3. Go to the **Provider** tab and configure your LLM:
   - **Preset**: Choose `Ollama` (local, no key) or `Custom`
   - **API Base URL**: e.g., `http://localhost:11434/v1` or `https://api.openai.com/v1`
   - **API Key**: Your API key (leave blank for Ollama)
   - **Model**: e.g., `gemma3:4b`, `gpt-4o-mini`
4. Click **Test Connection** to verify
5. Go to **General** tab → set your **Target Language**
6. Return to any webpage → click **Translate Page**

---

## 🛠️ Development

### Tech Stack

| Layer | Technology |
|-------|------------|
| Extension framework | **WXT** v0.20 (Manifest V3) |
| UI | **React 19** + **TypeScript 5.9** (14-component shared UI library) |
| Styling | **Tailwind CSS v4** (options/popup) + Vanilla CSS (injected themes) |
| State management | **Zustand v5** with `chrome.storage.local` sync |
| Translation cache | **IndexedDB** via `idb-keyval` |
| Encryption | **AES-GCM** (Web Crypto API) for API key storage |
| Icons | **Lucide React** |
| Testing | **Vitest** + `@testing-library/react` + `jsdom` (697 tests, 55 files) |
| Linting | ESLint + `typescript-eslint` + Prettier |
| Service worker | Rate limiting (max 3 concurrent), keep-alive alarm, session tracking |

### Commands

| Command | Description |
|---------|-------------|
| `npm run dev` | Start development server (Chrome, hot reload) |
| `npm run dev:firefox` | Start development server (Firefox) |
| `npm run build` | Production build → `.output/chrome-mv3` |
| `npm run build:firefox` | Production build → `.output/firefox-mv2` |
| `npm test` | Run all tests |
| `npm run test:watch` | Vitest watch mode |
| `npm run test:coverage` | Coverage report |
| `npm run lint` | ESLint check |
| `npm run lint:fix` | ESLint auto-fix |
| `npm run format` | Prettier format |
| `npm run zip` | Create distributable ZIP for Chrome Web Store |

### Project Structure

```
├── entrypoints/
│   ├── background.ts          # Service worker: message routing, context menus, chrome.commands, rate limiting
│   ├── content.ts             # Content script orchestrator: DOM translation pipeline, auto-translate
│   ├── inject.content/        # Injected in-page script: XHR/Fetch interception for subtitles
│   ├── popup/                 # Popup React UI (340px, dark theme)
│   │   ├── App.tsx            # Main popup component (language selector, translate button, theme/mode toggles, category override)
│   │   └── main.tsx
│   └── options/               # Options page React UI (full-screen, sidebar navigation)
│       ├── App.tsx            # Layout: sidebar navigation + tab content
│       ├── ThemePreview.tsx   # Live theme preview component
│       ├── CustomThemeEditor.tsx # User-defined custom theme editor
│       └── sections/          # 11 settings sections
│           ├── GeneralSection.tsx
│           ├── ProviderSection.tsx
│           ├── ThemesSection.tsx
│           ├── DictionarySection.tsx
│           ├── GlossaryTranslatePreview.tsx
│           ├── SiteRulesSection.tsx
│           ├── SubtitlesSection.tsx
│           ├── ShortcutsSection.tsx
│           ├── InlineTranslateSection.tsx
│           ├── StatisticsSection.tsx
│           └── AdvancedSection.tsx
├── content/                   # Content script modules
│   ├── domWalker.ts           # TreeWalker-based text piece extraction
│   ├── viewportObserver.ts    # IntersectionObserver lazy translation
│   ├── translationDisplay.ts  # DOM injection + theme/position/dark-mode application
│   ├── mutationWatcher.ts     # SPA / dynamic content detection
│   ├── textSelection.ts       # Floating translate button + tooltip
│   ├── hoverTranslate.ts      # Mouse hover translate (debounced, cached)
│   ├── inlineTranslate.ts     # Key-gesture translation in editable fields
│   ├── sectionTranslate.ts    # Translate specific DOM sections
│   ├── sectionPicker.ts       # Section picker UI for section translation
│   ├── keyboardShortcuts.ts   # Page-level keyboard shortcut handler
│   ├── messageBridge.ts       # Content ↔ background messaging abstraction
│   ├── autoTranslateNotification.ts # Auto-translate notification bar
│   ├── subtitleCoordinator.ts # Coordinates all subtitle modules
│   ├── subtitleControls.ts    # Subtitle control UI
│   ├── subtitleOverlay.ts     # Custom overlay renderer (fixed positioning, Popover API top layer)
│   ├── subtitleToast.ts       # Subtitle status notifications
│   └── utils/
│       └── pageContext.ts     # Page context extraction for context-aware translation
├── inject/                    # In-page injected script modules (MAIN world)
│   ├── fetchInterceptor.ts    # Fetch API interception
│   ├── xhrInterceptor.ts      # XHR interception
│   ├── interceptorRegistry.ts # URL pattern matching registry
│   ├── messageBridge.ts       # Inject ↔ content postMessage bridge
│   ├── textTrackDiscovery.ts  # HTML5 TextTrack subtitle discovery
│   └── subtitleHandlers/      # Platform-specific subtitle handlers
│       ├── youtube.ts         # YouTube /api/timedtext (srv3 XML, JSON3)
│       ├── udemy.ts           # Udemy VTT with sprite filtering
│       ├── coursera.ts        # Coursera VTT with language extraction
│       └── registry.ts        # Handler interface + registration system
├── services/                  # Background services
│   ├── background.ts          # Tab state machine + translation message handler, rate limiting
│   ├── base.ts                # Abstract TranslationService + prompt builder + response parser
│   ├── openaiCompatible.ts    # OpenAI-compatible API client
│   ├── batcher.ts             # Request batching, deduplication, char-limit splitting
│   ├── cacheManager.ts        # IndexedDB cache (TTL + LRU, daily eviction)
│   ├── categoryStore.ts       # Tab-scoped category override store (in-memory Map<tabId, category>)
│   ├── providerTester.ts      # Connection testing with latency measurement
│   └── statsCollector.ts      # Translation statistics tracking (daily charts)
├── stores/
│   └── settingsStore.ts       # Zustand store with chrome.storage.local sync
├── ui/                        # Reusable React component library (options page)
│   ├── Button.tsx, Input.tsx, Select.tsx, Toggle.tsx
│   ├── Slider.tsx, Badge.tsx, Card.tsx
│   ├── Modal.tsx, Toast.tsx, ToastProvider.tsx
│   ├── FieldGroup.tsx, EmptyState.tsx
│   ├── SegmentedControl.tsx   # Segmented control component
│   └── ErrorBoundary.tsx      # React error boundary
├── styles/
│   ├── inject.css             # 16 themes + custom theme + page states (data-anyllm-theme, data-anyllm-position)
│   ├── subtitle.css           # Subtitle overlay styles (fixed positioning, drag-and-drop)
│   └── tooltip.css            # Selection translate tooltip styles
├── types/                     # TypeScript type definitions
│   ├── index.ts               # Barrel re-export
│   ├── config.ts              # ExtensionSettings, ProviderConfig, ThemeName, SiteRule, CustomThemeConfig, InlineTranslateSettings, etc.
│   ├── translation.ts         # TranslationPiece, TranslationRequest, CacheEntry
│   ├── messages.ts            # Chrome message protocol types
│   ├── subtitle.ts            # Subtitle data types
│   └── stats.ts               # Statistics tracking types
├── lib/                       # Shared utilities
│   ├── constants.ts           # BLOCK_ELEMENTS, SKIP_ELEMENTS, DATA_ATTRS, STORAGE_KEYS
│   ├── config.ts              # loadSettings() helper
│   ├── languages.ts           # 30+ language codes with native names
│   ├── categories.ts          # 21 predefined page categories for context-aware translation
│   ├── glossary.ts            # Glossary formatting, mismatch detection, CSV/JSON import/export
│   ├── siteRules.ts           # Site rule matching utilities
│   ├── subtitleParser.ts      # WebVTT parser
│   ├── subtitleBuilder.ts     # Bilingual VTT builder
│   ├── crypto.ts              # SHA-256 hashing for cache keys + AES-GCM encryption for API keys
│   ├── performance.ts         # Performance measurement utilities
│   └── utils.ts               # General utility functions
└── wxt.config.ts              # WXT configuration (permissions, commands, Tailwind plugin, CSP)
```

---

## ⌨️ Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| **Alt+A** | Translate current page |
| **Alt+S** | Translate video subtitles |
| **Alt+Z** | Toggle translation display (show/hide) |
| **Alt+X** | Restore original page (remove translations) |
| **Alt+H** | Toggle hover translate (page-level) |
| **Alt+D** | Toggle text selection translate (page-level) |
| **Alt+Q** | Translate selected section |
| **Escape** | Dismiss translation tooltip |

> Global shortcuts (Alt+A/S/Z/X) can be reconfigured at `chrome://extensions/shortcuts`

---

## 🎨 Visual Themes

AnyLLMTranslate includes **16 built-in themes + 1 custom theme** that apply via CSS data-attributes on `<html>`:

| Theme | Key = `data-anyllm-theme` |
|-------|--------------------------:|
| Dividing Line | `dividing-line` |
| Blockquote | `blockquote` *(default)* |
| Paper | `paper` |
| Underline | `underline` |
| Dashed Underline | `dashed-underline` |
| Highlight | `highlight` |
| Wavy Underline | `wavy-underline` |
| Bubble | `bubble` |
| Side by Side | `side-by-side` |
| Mask | `mask` |
| Fade In | `fade-in` |
| Italic | `italic` |
| Dotted Border | `dotted-border` |
| Shadow Card | `shadow-card` |
| Minimal | `minimal` |
| Gradient Accent | `gradient-accent` |
| **Custom** | `custom` |

All themes include dark mode variants (CSS `@media (prefers-color-scheme: dark)` + `.anyllm-dark` class).

The **Custom** theme allows user-defined styling via the theme editor in Options → Themes, with live preview powered by CSS custom properties (`--anyllm-custom-*`).

---

## 🎬 Subtitle Handler Architecture

The extension uses a modular, extensible subtitle handler system:

### Handler Interface
All platform handlers implement the `SubtitleHandler` interface:
- `platform`: Unique identifier (e.g., `'youtube'`, `'udemy'`, `'coursera'`)
- `detect()`: Returns `true` if the handler applies to the current page
- `getPatterns()`: Returns URL patterns for interception with optional language extractors
- `transformResponse()`: Transforms raw subtitle content into normalized `SubtitleCue[]`

### Handler Registry
- Centralized registration system for platform handlers
- Auto-detects current platform by hostname
- Aggregates URL patterns for XHR/Fetch interceptors
- Pattern matching with optional `languageExtractor` functions

### Supported Platforms

#### YouTube
- **Endpoint**: `/api/timedtext`
- **Formats**: srv3 XML (default), JSON3
- **Detection**: `youtube.com` hostname
- **Language**: Extracted from `lang` query parameter
- **Parser**: Custom XML DOM parser + JSON3 event parser

#### Udemy
- **Endpoint**: `*.udemycdn.com/*.vtt`
- **Format**: Standard WebVTT
- **Detection**: `udemy.com` hostname
- **Language**: Extracted from path segments (e.g., `/subtitle-en/`, `/en/`)
- **Special**: Filters sprite metadata cues (image file references with `#xywh=` coordinates) using length heuristic (>100 chars)

#### Coursera
- **Endpoints**: `coursera.org/*subtitle`, `coursera.org/*.vtt`
- **Format**: Standard WebVTT
- **Detection**: `coursera.org` hostname
- **Language**: Extracted from `lang` query param or path segment (e.g., `/en/`)

### Dual-Mode Architecture

**Interception Mode** (primary):
- MAIN world script intercepts XHR/Fetch requests at `document_start`
- Platform handler transforms response to `SubtitleCue[]`
- Coordinator translates cues via background service
- Bilingual or translation-only VTT built and returned to page
- Native player displays translated subtitles

**Overlay Fallback** (backup):
- Auto-activates if interception times out (30s default for local LLMs)
- Fetches subtitle content via background worker (CORS bypass)
- Parses, translates, and renders in custom overlay
- Includes keyboard controls, resize, and position settings
- Fixed positioning with Popover API top layer for fullscreen support

---

## 🔒 Security & Privacy

- **AES-GCM encryption** — API keys stored encrypted at rest via Web Crypto API
- **Content Security Policy** — strict CSP on extension pages (`script-src 'self'; connect-src 'self' https:`)
- **Subtitle URL allowlist** — only whitelisted domains for subtitle fetch CORS bypass
- **No telemetry.** No analytics. No crash reporting.
- **All data is local** — stored in `chrome.storage.local` (settings, statistics) and `IndexedDB` (translation cache).
- **API calls go only to your configured endpoint.** The extension never phones home.
- **Minimal permissions**: `storage`, `activeTab`, `contextMenus`, `sidePanel`, `alarms` (for cache eviction and service worker keep-alive).

---

## 🧪 Testing

The project maintains comprehensive test coverage (**697 tests across 55 files**):

```bash
npm test             # Run all tests
npm run test:watch   # Watch mode
npm run test:coverage # Coverage report
```

Coverage areas:
- DOM walker piece extraction and chunking
- Viewport observer lazy batching
- Translation display injection and cleanup
- Text selection and hover translate logic
- Inline translate gesture detection and text replacement
- Section translation and picker mode
- Keyboard shortcut handling
- Mutation watcher SPA detection
- Auto-translate notification
- OpenAI-compatible API client (request/response)
- Request batcher (deduplication, char-limit splitting)
- IndexedDB cache manager (TTL, LRU eviction)
- Category store (tab-scoped overrides)
- Subtitle parser, builder, handler (YouTube, Udemy, Coursera)
- Glossary CSV/JSON import/export
- Site rules matching (wildcards)
- Language code utilities
- Settings store (Zustand + chrome.storage sync)
- Statistics collection and daily tracking
- Theme CSS coverage (all 16 themes + custom, dark mode, states)
- UI component library (Button, Input, Toggle, Modal, Toast, SegmentedControl, etc.)
- Options page components (ThemePreview, CustomThemeEditor, StatisticsSection)
- AES-GCM crypto utilities

---

## 📄 License

MIT License — see [LICENSE](LICENSE) for details.

## 🤝 Contributing

Contributions welcome! Please:

1. Fork the repository
2. Create a feature branch: `git checkout -b feat/your-feature`
3. Write tests for new functionality
4. Ensure all tests pass: `npm test`
5. Submit a pull request

See [CONTRIBUTING.md](CONTRIBUTING.md) for detailed guidelines.

---

**Built with ❤️ using WXT, React 19, TypeScript, and Tailwind CSS v4**
