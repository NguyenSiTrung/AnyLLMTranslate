# 🌐 AnyLLMTranslate — Bilingual Web Translation Extension

> **Translate any webpage & video subtitles into your language using any OpenAI-compatible LLM.**

AnyLLMTranslate is a Chrome (Manifest V3) extension that provides seamless bilingual translation for web pages and video subtitles. Unlike traditional translation tools, it shows translations **inline alongside original text** — preserving context while enabling comprehension. Powered entirely by your own LLM endpoint: no data leaves your machine except to your configured API.

---

## ✨ Features

### 🔤 Web Page Translation
- **Full-page bilingual translation** — original + translated text displayed together
- **Smart DOM walker** — TreeWalker-based extraction groups text into semantic pieces at block boundaries, splitting long texts at sentence boundaries
- **Lazy viewport loading** — `IntersectionObserver` with 200px pre-load margin; batches pieces every 100ms
- **16 visual themes** — Dividing Line, Blockquote, Paper, Underline, Dashed Underline, Highlight, Wavy Underline, Bubble, Side-by-side, Mask, Fade In, Italic, Dotted Border, Shadow Card, Minimal, Gradient Accent
- **Translation position control** — below / above / side via CSS data-attributes
- **Dark mode support** — auto (system `prefers-color-scheme`), light, or forced dark

### 🎬 Video Subtitle Translation
- **Platform handlers** for YouTube, Udemy, and Coursera
- **XHR + Fetch interception** via injected in-page script (`inject.content` entrypoint)
- **WebVTT parsing & bilingual builder** — merges original + translated cues
- **Custom subtitle overlay** with keyboard controls and resize
- **Subtitle coordinator** orchestrates all subtitle modules from the content script

### 🖱️ Interactive Translation
- **Text selection translate** — select any text, click the floating translate button; results appear in a tooltip with copy & close actions
- **Mouse hover translate** — hover over paragraph-level elements; configurable 200–500ms delay, element-level cache
- **Keyboard shortcuts** (global via `chrome.commands` + page-level via event listeners)
- **Context menu integration** — right-click → Translate Page / Translate Selection / Translate Subtitles

### ⚙️ Settings & Advanced
- **Any OpenAI-compatible API** — OpenAI, Ollama, LM Studio, Groq, Together AI, Gemini, etc.
- **Provider presets** — Ollama (default, local, no key required) and Custom
- **Connection tester** — sends a round-trip ping and reports latency
- **Customizable system prompt** with `{{SOURCE_LANG}}` / `{{TARGET_LANG}}` variable injection
- **Per-site translation rules** — include/exclude CSS selectors, always/never translate
- **Custom glossary / dictionary** — term-protected translation via prompt injection, live mismatch validation; CSV & JSON import/export
- **Translation cache** — IndexedDB via `idb-keyval`, SHA-256 keyed, TTL (default 30 days), LRU eviction (default 100 MB cap)
- **Subtitle settings** — position, font size, background opacity

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
| UI | **React 19** + **TypeScript 5.9** |
| Styling | **Tailwind CSS v4** (options/popup) + Vanilla CSS (injected themes) |
| State management | **Zustand v5** with `chrome.storage.local` sync |
| Translation cache | **IndexedDB** via `idb-keyval` |
| Icons | **Lucide React** |
| Testing | **Vitest** + `@testing-library/react` + `jsdom` |
| Linting | ESLint + `typescript-eslint` + Prettier |

### Commands

| Command | Description |
|---------|-------------|
| `npm run dev` | Start development server (Chrome, hot reload) |
| `npm run dev:firefox` | Start development server (Firefox) |
| `npm run build` | Production build → `.output/chrome-mv3` |
| `npm run build:firefox` | Production build → `.output/firefox-mv2` |
| `npm test` | Run all 408 unit tests |
| `npm run test:watch` | Vitest watch mode |
| `npm run test:coverage` | Coverage report |
| `npm run lint` | ESLint check |
| `npm run lint:fix` | ESLint auto-fix |
| `npm run format` | Prettier format |
| `npm run zip` | Create distributable ZIP for Chrome Web Store |

### Project Structure

```
├── entrypoints/
│   ├── background.ts          # Service worker: message routing, context menus, chrome.commands
│   ├── content.ts             # Content script orchestrator: DOM translation pipeline
│   ├── inject.content/        # Injected in-page script: XHR/Fetch interception for subtitles
│   ├── popup/                 # Popup React UI (340px, dark theme)
│   │   ├── App.tsx            # Main popup component (language selector, translate button, theme/mode toggles)
│   │   └── main.tsx
│   └── options/               # Options page React UI (full-screen, sidebar navigation)
│       ├── App.tsx            # Layout: sidebar navigation + tab content
│       ├── ThemePreview.tsx   # Live theme preview component
│       └── sections/          # 8 settings sections
│           ├── GeneralSection.tsx
│           ├── ProviderSection.tsx
│           ├── ThemesSection.tsx
│           ├── DictionarySection.tsx
│           ├── GlossaryTranslatePreview.tsx
│           ├── SiteRulesSection.tsx
│           ├── SubtitlesSection.tsx
│           ├── ShortcutsSection.tsx
│           └── AdvancedSection.tsx
├── content/                   # Content script modules
│   ├── domWalker.ts           # TreeWalker-based text piece extraction
│   ├── viewportObserver.ts    # IntersectionObserver lazy translation
│   ├── translationDisplay.ts  # DOM injection + theme/position/dark-mode application
│   ├── mutationWatcher.ts     # SPA / dynamic content detection
│   ├── textSelection.ts       # Floating translate button + tooltip
│   ├── hoverTranslate.ts      # Mouse hover translate (debounced, cached)
│   ├── keyboardShortcuts.ts   # Page-level keyboard shortcut handler
│   ├── messageBridge.ts       # Content ↔ background messaging abstraction
│   ├── subtitleCoordinator.ts # Coordinates all subtitle modules
│   ├── subtitleControls.ts    # Subtitle control UI
│   └── subtitleOverlay.ts     # Custom overlay renderer
├── inject/                    # In-page injected script modules
│   ├── fetchInterceptor.ts    # Fetch API interception
│   ├── xhrInterceptor.ts      # XHR interception
│   ├── interceptorRegistry.ts # Handler registry
│   ├── messageBridge.ts       # Inject ↔ content messaging
│   └── subtitleHandlers/      # Platform-specific handlers
│       ├── youtube.ts
│       ├── udemy.ts
│       ├── coursera.ts
│       └── registry.ts
├── services/                  # Background services
│   ├── background.ts          # Tab state machine + translation message handler
│   ├── base.ts                # Abstract TranslationService + prompt builder + response parser
│   ├── openaiCompatible.ts    # OpenAI-compatible API client
│   ├── batcher.ts             # Request batching, deduplication, char-limit splitting
│   ├── cacheManager.ts        # IndexedDB cache (TTL + LRU)
│   └── providerTester.ts      # Connection testing with latency measurement
├── stores/
│   └── settingsStore.ts       # Zustand store with chrome.storage.local sync
├── ui/                        # Reusable React component library (options page)
│   ├── Button.tsx, Input.tsx, Select.tsx, Toggle.tsx
│   ├── Slider.tsx, Badge.tsx, Card.tsx
│   ├── Modal.tsx, Toast.tsx, ToastProvider.tsx
│   ├── FieldGroup.tsx, EmptyState.tsx
├── styles/
│   ├── inject.css             # 16 themes + page states (data-anyllm-theme, data-anyllm-position)
│   ├── subtitle.css           # Subtitle overlay styles
│   └── tooltip.css            # Selection translate tooltip styles
├── types/                     # TypeScript type definitions
│   ├── config.ts              # ExtensionSettings, ProviderConfig, ThemeName, SiteRule, etc.
│   ├── translation.ts         # TranslationPiece, TranslationRequest, CacheEntry
│   ├── messages.ts            # Chrome message protocol types
│   └── subtitle.ts            # Subtitle data types
├── lib/                       # Shared utilities
│   ├── constants.ts           # BLOCK_ELEMENTS, SKIP_ELEMENTS, DATA_ATTRS, STORAGE_KEYS
│   ├── config.ts              # loadSettings() helper
│   ├── languages.ts           # 30+ language codes with native names
│   ├── glossary.ts            # Glossary formatting, mismatch detection, CSV/JSON import/export
│   ├── subtitleParser.ts      # WebVTT parser
│   ├── subtitleBuilder.ts     # Bilingual VTT builder
│   └── performance.ts         # Performance measurement utilities
└── wxt.config.ts              # WXT configuration (permissions, commands, Tailwind plugin)
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
| **Escape** | Dismiss translation tooltip |

> Global shortcuts (Alt+A/S/Z/X) can be reconfigured at `chrome://extensions/shortcuts`

---

## 🎨 Visual Themes

AnyLLMTranslate includes **16 built-in themes** that apply via CSS data-attributes on `<html>`:

| Theme | Key = `data-anyllm-theme` |
|-------|--------------------------|
| Dividing Line | `dividing-line` *(default)* |
| Blockquote | `blockquote` |
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

All themes include dark mode variants (CSS `@media (prefers-color-scheme: dark)` + `.anyllm-dark` class).

---

## 🧪 Testing

The project maintains **408 tests across 32 test files**:

```bash
npm test             # Run all 408 tests
npm run test:watch   # Watch mode
npm run test:coverage # Coverage report
```

Coverage areas:
- DOM walker piece extraction and chunking
- Viewport observer lazy batching
- Translation display injection and cleanup
- Text selection and hover translate logic
- Keyboard shortcut handling
- Mutation watcher SPA detection
- OpenAI-compatible API client (request/response)
- Request batcher (deduplication, char-limit splitting)
- IndexedDB cache manager (TTL, LRU eviction)
- Subtitle parser, builder, handler (YouTube, Udemy, Coursera)
- Glossary CSV/JSON import/export
- Language code utilities
- Settings store (Zustand + chrome.storage sync)
- Theme CSS coverage (all 16 themes, dark mode, states)
- UI component library (Button, Input, Toggle, Modal, Toast, etc.)
- Options page ThemePreview component

---

## 🔒 Privacy

- **No telemetry.** No analytics. No crash reporting.
- **All data is local** — stored in `chrome.storage.local` (settings) and `IndexedDB` (translation cache).
- **API calls go only to your configured endpoint.** The extension never phones home.
- **Minimal permissions**: `storage`, `activeTab`, `contextMenus`, `sidePanel`.

---

## 📄 License

MIT License — see [LICENSE](LICENSE) for details.

## 🤝 Contributing

Contributions welcome! Please:

1. Fork the repository
2. Create a feature branch: `git checkout -b feat/your-feature`
3. Write tests for new functionality
4. Ensure all 408 tests pass: `npm test`
5. Submit a pull request

---

**Built with ❤️ using WXT, React 19, TypeScript, and Tailwind CSS v4**
