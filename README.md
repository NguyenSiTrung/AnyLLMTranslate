# 🌐 AnyLLMTranslate — Bilingual Web Translation Extension

> **Translate any webpage & video subtitles into your language using any OpenAI-compatible LLM.**

AnyLLMTranslate is a Chrome/Firefox browser extension that provides seamless bilingual translation for web pages, video subtitles, and PDFs. Unlike traditional translation tools, it shows translations **inline alongside original text** — preserving context while enabling comprehension. Powered entirely by your own LLM endpoint: no data leaves your machine except to your configured API.

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
- **Smart excludes** — automatically skip nav, TOC, footers, sidebars, pagination, and infoboxes (configurable)

### 🎬 Video Subtitle Translation

- **Platform-specific handlers** with extensible registry pattern
  - **YouTube**: Supports `/api/timedtext` endpoint with srv3 XML and JSON3 formats
  - **Udemy**: Handles VTT from `udemycdn.com` with sprite metadata filtering
  - **Coursera**: Processes VTT from `coursera.org` with query/path language extraction
  - **LinkedIn Learning**: Fetches VTT from `licdn.com` with param/path/filename language extraction and transcript API metadata parsing
  - **HBO Max / Max**: DOM cue scraping from `[data-testid="cueBoxRowTextCue"]` with aria-label-based language detection (no VTT URL interception)
  - **Vimeo, Netflix, Amazon**: Subtitle fetch allowlist for CORS bypass (overlay fallback)
- **Three interception strategies**:
  - **XHR interception** — YouTube, Udemy
  - **Fetch interception** — LinkedIn Learning
  - **DOM cue scraping** — HBO Max (for platforms without VTT URLs)
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

### 📄 PDF Translation

- **Bilingual PDF viewer** — opens PDFs in a bundled React app that renders each page on canvas and shows translations side-by-side; download a translated PDF with embedded text via `pdf-lib` + `@pdf-lib/fontkit`
- **PDF auto-detection** — detects when a tab is rendering a PDF via `document.contentType === 'application/pdf'`, which catches extensionless URLs (e.g. `https://arxiv.org/pdf/2606.20543`) that URL-only heuristics miss
- **Auto-open translator** — optional setting (`Options → Advanced → PDF Translator`) to open the translator automatically when a PDF tab loads. Off by default; supports per-site opt-out and new-tab vs same-tab open modes
- **Math/figure-aware extraction** — LLM classifies paragraphs as prose vs figure/table so equations and captions are preserved untranslated

### ⚙️ Settings & Advanced

- **Any OpenAI-compatible API** — OpenAI, Ollama, LM Studio, Groq, Together AI, Gemini, etc.
- **Provider catalog** — search and select from 8 popular providers (OpenRouter, NVIDIA NIM, Groq, Together AI, Fireworks AI, Mistral AI, Ollama, LM Studio) or configure a custom endpoint
- **Auto model listing** — fetches available models from providers that support model listing via the `/v1/models` endpoint
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
- **Subtitle settings** — position, font family, display mode (bilingual vs translation-only), background opacity, translation timeout, preferred language, auto-activation, per-platform disable
- **AES-GCM encryption** — API keys encrypted at rest via `lib/crypto.ts`
- **Rate limiting** — in-process semaphore limiting concurrent translation requests (max 3 for pages/subtitles, max 2 for PDFs)
- **React error boundaries** — graceful error handling for popup and options pages
- **Setup wizard** — 5-step first-run onboarding (welcome, provider selection, connection test, language, done) with compact provider catalog picker

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
2. If this is your first time, the **Setup Wizard** will guide you through:
   - Selecting a provider from the catalog (or entering a custom endpoint)
   - Testing the connection
   - Choosing your target language
3. Or click the **Settings** gear icon to open the full Options page
4. Go to the **Provider** tab and configure your LLM:
   - **Search or browse** the provider catalog (OpenRouter, Groq, Ollama, LM Studio, etc.)
   - **API Base URL**: e.g., `http://localhost:11434/v1` or `https://api.openai.com/v1`
   - **API Key**: Your API key (leave blank for local providers like Ollama)
   - **Model**: Select from the auto-fetched list or type a model name
5. Click **Test Connection** to verify
6. Go to **General** tab → set your **Target Language**
7. Return to any webpage → click **Translate Page**

---

## 🛠️ Development

### Tech Stack

| Layer               | Technology                                                              |
| ------------------- | ----------------------------------------------------------------------- |
| Extension framework | **WXT** v0.20.20 (Manifest V3 Chrome, Manifest V2 Firefox)               |
| UI                  | **React 19** + **TypeScript 5.9** (15-component shared UI library)      |
| Styling             | **Tailwind CSS v4** (options/popup) + Vanilla CSS (injected themes)     |
| State management    | **Zustand v5** with `chrome.storage.local` sync                          |
| Translation cache   | **IndexedDB** via `idb-keyval`                                           |
| Encryption          | **AES-GCM** (Web Crypto API) for API key storage                        |
| Icons               | **Lucide React**                                                        |
| Testing             | **Vitest** + `@testing-library/react` + `jsdom` (1240 tests, 98 files) |
| Linting             | ESLint + `typescript-eslint` + Prettier                                 |
| Service worker      | Rate limiting, keep-alive alarm, session tracking, retry with backoff   |

### Commands

| Command                  | Description                                              |
| ------------------------ | -------------------------------------------------------- |
| `npm run dev`            | Start development server (Chrome, hot reload)            |
| `npm run dev:firefox`    | Start development server (Firefox)                        |
| `npm run build`          | Production build → `.output/chrome-mv3`                   |
| `npm run build:firefox`  | Production build → `.output/firefox-mv2`                  |
| `npm test`               | Run all tests                                            |
| `npm run test:watch`     | Vitest watch mode                                        |
| `npm run test:coverage`  | Coverage report                                          |
| `npm run lint`           | ESLint check                                             |
| `npm run lint:fix`       | ESLint auto-fix                                          |
| `npm run format`         | Prettier format                                          |
| `npm run zip`            | Create distributable ZIP for Chrome Web Store             |
| `npm run zip:firefox`    | Create distributable ZIP for Firefox Add-ons             |
| `npm run zip:source`     | Create source code archive (git archive)                  |
| `npm run compile`        | TypeScript type check (`tsc --noEmit`)                    |

### Project Structure

```
├── entrypoints/
│   ├── background.ts          # Service worker: message routing, context menus, chrome.commands, rate limiting
│   ├── content.ts             # Content script orchestrator: DOM translation pipeline, auto-translate
│   ├── inject.content/        # Injected in-page script: XHR/Fetch interception for subtitles
│   ├── popup/                 # Popup React UI (340px, dark theme)
│   │   ├── App.tsx            # Main popup component (language selector, translate button, theme/mode toggles, category override)
│   │   └── main.tsx
│   ├── options/               # Options page React UI (full-screen, sidebar navigation)
│   │   ├── App.tsx            # Layout: sidebar navigation + tab content
│   │   ├── SetupWizard.tsx    # 5-step first-run onboarding wizard with provider catalog
│   │   ├── ThemePreview.tsx   # Live theme preview component
│   │   ├── CustomThemeEditor.tsx # User-defined custom theme editor
│   │   ├── components/        # Specialized options components
│   │   │   ├── ModelPicker.tsx            # Auto-fetch models from provider API
│   │   │   └── ProviderCatalogPicker.tsx    # Search/filter provider catalog
│   │   └── sections/          # 11 settings sections
│   │       ├── GeneralSection.tsx
│   │       ├── ProviderSection.tsx
│   │       ├── ThemesSection.tsx
│   │       ├── DictionarySection.tsx
│   │       ├── GlossaryTranslatePreview.tsx
│   │       ├── SiteRulesSection.tsx
│   │       ├── SubtitlesSection.tsx
│   │       ├── ShortcutsSection.tsx
│   │       ├── InlineTranslateSection.tsx
│   │       ├── StatisticsSection.tsx
│   │       └── AdvancedSection.tsx
│   └── pdf-viewer/            # Bundled PDF translation React app
│       ├── App.tsx
│       ├── components/        # PdfCanvasRenderer, PdfTranslationPane, DownloadProgressModal, FilePermissionGuide
│       ├── hooks/             # usePdfDocument, usePdfDownload, usePdfPageTranslations, useSynchronizedScroll
│       └── lib/               # PDF text extraction, font management, translated PDF generation
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
│   ├── pdfDetect.ts           # PDF content type detection
│   ├── categoryState.ts       # Category state management for content scripts
│   └── utils/
│       └── pageContext.ts     # Page context extraction for context-aware translation
├── inject/                    # In-page injected script modules (MAIN world)
│   ├── fetchInterceptor.ts    # Fetch API interception
│   ├── xhrInterceptor.ts      # XHR interception
│   ├── interceptorRegistry.ts # URL pattern matching registry
│   ├── messageBridge.ts       # Inject ↔ content postMessage bridge
│   ├── textTrackDiscovery.ts  # HTML5 TextTrack subtitle discovery
│   ├── domCueSource.ts        # DOM-based cue scraping for platforms without VTT URLs
│   └── subtitleHandlers/      # Platform-specific subtitle handlers
│       ├── youtube.ts         # YouTube /api/timedtext (srv3 XML, JSON3)
│       ├── udemy.ts           # Udemy VTT with sprite filtering
│       ├── coursera.ts        # Coursera VTT with language extraction
│       ├── linkedin.ts        # LinkedIn Learning VTT with param/path/filename language extraction
│       ├── hbomax.ts          # HBO Max / Max DOM cue scraping
│       └── registry.ts        # Handler interface + registration system
├── services/                  # Background services
│   ├── background.ts          # Tab state machine + translation message handler, rate limiting
│   ├── base.ts                # Abstract TranslationService + prompt builder + response parser
│   ├── openaiCompatible.ts    # OpenAI-compatible API client (retry with exponential backoff)
│   ├── batcher.ts             # Request batching, deduplication, char-limit splitting
│   ├── cacheManager.ts        # IndexedDB cache (TTL + LRU, daily eviction)
│   ├── categoryStore.ts       # Tab-scoped category override store (in-memory Map<tabId, category>)
│   ├── providerTester.ts      # Connection testing with latency measurement
│   ├── statsCollector.ts      # Translation statistics tracking (daily charts)
│   ├── pdfAutoOpen.ts         # Pure decision logic for PDF auto-open
│   ├── providerReadiness.ts   # Provider readiness state machine
│   └── debugLog.ts            # Debug logging with cached settings check
├── stores/
│   └── settingsStore.ts       # Zustand store with chrome.storage.local sync
├── ui/                        # Reusable React component library (options page)
│   ├── Button.tsx, Input.tsx, Select.tsx, Toggle.tsx
│   ├── Slider.tsx, Badge.tsx, Card.tsx
│   ├── Modal.tsx, Toast.tsx, ToastProvider.tsx
│   ├── FieldGroup.tsx, EmptyState.tsx
│   ├── SegmentedControl.tsx, SectionHeader.tsx
│   └── ErrorBoundary.tsx      # React error boundary
├── styles/
│   ├── inject.css             # 17 themes + custom theme + page states (data-anyllm-theme, data-anyllm-position)
│   ├── subtitle.css           # Subtitle overlay styles (fixed positioning, drag-and-drop)
│   └── tooltip.css            # Selection translate tooltip styles
├── types/                     # TypeScript type definitions
│   ├── index.ts               # Barrel re-export
│   ├── config.ts              # ExtensionSettings, ProviderConfig, ThemeName, SiteRule, CustomThemeConfig, InlineTranslateSettings, etc.
│   ├── translation.ts         # TranslationPiece, TranslationRequest, CacheEntry
│   ├── messages.ts            # Chrome message protocol types (23 message types)
│   ├── subtitle.ts            # SubtitleCue, AvailableSubtitleTrack, DomCueSource, SubtitleUrlPattern
│   └── stats.ts               # Statistics tracking types
├── lib/                       # Shared utilities
│   ├── constants.ts           # BLOCK_ELEMENTS, SKIP_ELEMENTS, DATA_ATTRS, STORAGE_KEYS
│   ├── config.ts              # loadSettings() helper with migration
│   ├── languages.ts           # 35 languages (ISO 639-1 codes with native names) + Auto-Detect
│   ├── categories.ts          # 21 predefined page categories for context-aware translation
│   ├── glossary.ts            # Glossary formatting, mismatch detection, CSV/JSON import/export
│   ├── siteRules.ts           # Site rule matching utilities + built-in rules
│   ├── subtitleParser.ts      # WebVTT parser
│   ├── subtitleBuilder.ts     # Bilingual VTT builder
│   ├── subtitleSites.ts       # Subtitle platform metadata (5 supported platforms)
│   ├── openAiCompatibleCatalog.ts # Static catalog of 9 LLM providers (8 popular + custom)
│   ├── providerReadiness.ts   # Provider readiness state machine
│   ├── findPrimaryVideo.ts    # Video element detection
│   ├── crypto.ts              # SHA-256 hashing for cache keys + AES-GCM encryption for API keys
│   ├── performance.ts         # Performance measurement utilities
│   ├── domUtils.ts            # DOM utility functions
│   ├── styleUtils.ts          # Style utilities
│   └── utils.ts               # General utility functions
└── wxt.config.ts              # WXT configuration (permissions, commands, Tailwind plugin, CSP)
```

---

## ⌨️ Keyboard Shortcuts

| Shortcut   | Action                                       |
| ---------- | -------------------------------------------- |
| **Alt+A**  | Translate current page                       |
| **Alt+S**  | Translate video subtitles                    |
| **Alt+Z**  | Toggle translation display (show/hide)       |
| **Alt+X**  | Restore original page (remove translations)  |
| **Alt+H**  | Toggle hover translate (page-level)          |
| **Alt+D**  | Toggle text selection translate (page-level) |
| **Alt+Q**  | Translate selected section                   |
| **Escape** | Dismiss translation tooltip                  |

> Global shortcuts (Alt+A/S/Z/X) can be reconfigured at `chrome://extensions/shortcuts`

---

## 🎨 Visual Themes

AnyLLMTranslate includes **16 built-in themes + 1 custom theme** that apply via CSS data-attributes on `<html>`:

| Theme            | Key = `data-anyllm-theme` |
| ---------------- | ------------------------: |
| Dividing Line    |           `dividing-line` |
| Blockquote       |  `blockquote` _(default)_ |
| Paper            |                   `paper` |
| Underline        |               `underline` |
| Dashed Underline |        `dashed-underline` |
| Highlight        |               `highlight` |
| Wavy Underline   |          `wavy-underline` |
| Bubble           |                  `bubble` |
| Side by Side     |            `side-by-side` |
| Mask             |                    `mask` |
| Fade In          |                 `fade-in` |
| Italic           |                  `italic` |
| Dotted Border    |           `dotted-border` |
| Shadow Card      |             `shadow-card` |
| Minimal          |                 `minimal` |
| Gradient Accent  |         `gradient-accent` |
| **Custom**       |                  `custom` |

All themes include dark mode variants (CSS `@media (prefers-color-scheme: dark)` + `.anyllm-dark` class).

The **Custom** theme allows user-defined styling via the theme editor in Options → Themes, with live preview powered by CSS custom properties (`--anyllm-custom-*`).

---

## 📄 PDF Translation

PDF translation runs in a bundled React page at `chrome-extension://<id>/pdf-viewer.html?file=<url>`. The viewer renders each page to canvas (left pane) and shows translations side-by-side (right pane); translated text can be downloaded as a new PDF with embedded text.

### Opening the translator

There are three ways to open the translator for a PDF, all of which funnel through one shared background helper:

1. **Popup button** — click the extension icon on a PDF tab and press **Open current PDF**. The popup queries the content script for `document.contentType`, so this works even for extensionless URLs like `https://arxiv.org/pdf/2606.20543`.
2. **Context menu** — right-click a `.pdf` link or a PDF page → **Open in PDF Translator**.
3. **Auto-open** — see below.

### Auto-opening the translator

Enable **Options → Advanced → PDF Translator → Auto-open mode** to detect PDF tabs automatically and open the translator without a click. This also lights up the popup button for extensionless PDF URLs the URL-only heuristic misses.

- **Off** — manual only (default).
- **Prompt** — *(planned)* shows an in-page banner button on the native viewer.
- **Auto** — opens the translator immediately when a PDF tab loads.

Safeguards:

- **Infinite-loop guard** — the bundled viewer loads a PDF too; detection is suppressed on `chrome-extension://` origins.
- **Provider readiness gate** — nothing auto-opens if the LLM provider is not configured and tested.
- **Per-tab dedupe** — each tab+document auto-opens at most once per browser session (state in `chrome.storage.session`, survives service-worker eviction).
- **Per-site opt-out** — **Never auto-open these sites** (comma-separated hostnames) overrides the global setting.
- **Open mode** — **New tab** keeps the native viewer; **Same tab** replaces it in place.

### Limitations

- `file://` PDFs require **Allow access to file URLs** toggled on in `chrome://extensions` (content scripts cannot run on `file://` otherwise).
- Embedded PDFs (`<embed type="application/pdf">` inside an HTML host page) are not detected — only standalone PDF tabs.

---

## 🎬 Subtitle Handler Architecture

The extension uses a modular, extensible subtitle handler system with three interception strategies:

### Handler Interface

All platform handlers implement the `SubtitleHandler` interface:

- `platform`: Unique identifier (e.g., `'youtube'`, `'udemy'`, `'coursera'`, `'linkedin'`, `'hbomax'`)
- `detect()`: Returns `true` if the handler applies to the current page
- `getPatterns()`: Returns URL patterns for interception with optional language extractors
- `transformResponse()`: Transforms raw subtitle content into normalized `SubtitleCue[]`
- `getMetadataPatterns()`: *(optional)* Returns URL patterns for metadata API responses that list available tracks
- `extractAvailableTracks()`: *(optional)* Extracts available subtitle tracks from a metadata API response
- `getDomCueSource()`: *(optional)* Returns cue-scraping contract for DOM-sourced platforms (e.g. Max)
- `isWatchPage()`: *(optional)* Returns `true` if the current page is a video watch page (vs. listing/search)

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
- **Interception**: XHR

#### Udemy

- **Endpoint**: `*.udemycdn.com/*.vtt`
- **Format**: Standard WebVTT
- **Detection**: `udemy.com` hostname
- **Language**: Extracted from path segments (e.g., `/subtitle-en/`, `/en/`) with locale normalization
- **Special**: Filters sprite metadata cues (image file references with `#xywh=` coordinates) using length heuristic (>100 chars)
- **Interception**: XHR

#### Coursera

- **Endpoints**: `coursera.org/*subtitle`, `coursera.org/*.vtt`
- **Format**: Standard WebVTT
- **Detection**: `coursera.org` hostname
- **Language**: Extracted from `lang` query param or path segment (e.g., `/en/`)
- **Interception**: XHR

#### LinkedIn Learning

- **Endpoint**: `licdn.com/*.vtt` (and `linkedin.com` CDN domains)
- **Format**: Standard WebVTT
- **Detection**: `linkedin.com` hostname + `/learning/` path for watch pages
- **Language**: Extracted from query params (`lang`, `locale`), path segments, or filename suffix
- **Metadata**: Parses transcript/caption/subtitle API responses for track discovery
- **Interception**: Fetch

#### HBO Max / Max

- **Format**: DOM cue scraping (no VTT URL)
- **Detection**: `max.com`, `play.hbomax.com` hostnames + `/video/watch/` path for watch pages
- **Language**: aria-label-based from `[data-testid="player-ux-text-track-button"]` with 40+ label-to-language mappings
- **Cue source**: Reads `[data-testid="cueBoxRowTextCue"]` with MutationObserver for cue changes
- **Interception**: DOM scraping (no URL interception)

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
- **SSRF protection** — private/loopback/host blocking for subtitle CORS-bypass fetch
- **Prompt injection mitigation** — page context fields capped, wrapped in XML delimiters, marked as untrusted data
- **No telemetry.** No analytics. No crash reporting.
- **All data is local** — stored in `chrome.storage.local` (settings, statistics) and `IndexedDB` (translation cache).
- **API calls go only to your configured endpoint.** The extension never phones home.
- **Minimal permissions**: `storage`, `activeTab`, `contextMenus`, `sidePanel`, `alarms` (for cache eviction and service worker keep-alive).

---

## 🧪 Testing

The project maintains comprehensive test coverage (**1240 tests across 98 files**):

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
- PDF content type detection and auto-open decision logic
- OpenAI-compatible API client (request/response, retry)
- Request batcher (deduplication, char-limit splitting)
- IndexedDB cache manager (TTL, LRU eviction)
- Category store (tab-scoped overrides)
- Provider readiness state machine
- Subtitle parser, builder, handler (YouTube, Udemy, Coursera, LinkedIn, HBO Max)
- Subtitle sites metadata
- DOM cue source scraping
- Glossary CSV/JSON import/export
- Site rules matching (wildcards)
- Language code utilities
- Settings store (Zustand + chrome.storage sync)
- Statistics collection and daily tracking
- Provider catalog search/filter
- Theme CSS coverage (all 17 themes + custom, dark mode, states)
- UI component library (Button, Input, Toggle, Modal, Toast, SegmentedControl, SectionHeader, etc.)
- Options page components (ThemePreview, CustomThemeEditor, StatisticsSection)
- PDF viewer components (PdfCanvasRenderer, hooks, translation, download)
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
