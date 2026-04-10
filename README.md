# 🌐 LinguaLens — Bilingual Web Translation Extension

> **Translate any webpage & video subtitles into your language using any OpenAI-compatible LLM.**

LinguaLens is a Chrome extension that provides seamless bilingual translation for web pages and video subtitles. Unlike traditional translation tools, it shows translations inline alongside original text — preserving context while enabling comprehension.

## ✨ Features

### 🔤 Web Page Translation
- **Full-page bilingual translation** — original + translated text side by side
- **Smart DOM extraction** — intelligent piece detection for paragraphs, headings, lists
- **Lazy viewport loading** — only translates content as you scroll to it
- **16+ visual themes** — Underline, Highlight, Wavy, Dotted, Dashed, Shadow, and more
- **Dark mode support** — auto-detects or manual toggle

### 🎬 Video Subtitle Translation
- **YouTube, Udemy, Coursera** subtitle interception and bilingual overlay
- **WebVTT/SRT parsing** with intelligent cue merging
- **Custom subtitle overlay** with drag-to-move and keyboard controls
- **Fallback overlay mode** for unsupported subtitle formats

### 🖱️ Interactive Translation
- **Text selection translate** — select any text, click the floating button to translate
- **Mouse hover translate** — hover over paragraphs for automatic translation (configurable delay)
- **Keyboard shortcuts** — Alt+A (translate page), Alt+S (subtitles), Alt+Z (toggle), Alt+X (restore)
- **Context menu integration** — right-click to translate page, selection, or subtitles

### ⚙️ Advanced Settings
- **Any OpenAI-compatible API** — works with OpenAI, Ollama, LM Studio, Groq, Together AI, etc.
- **Customizable system prompt** with variable injection (`{{SOURCE_LANG}}`, `{{TARGET_LANG}}`)
- **Provider connection testing** with latency measurement
- **Per-site translation rules** (auto-translate, skip, custom settings)
- **Translation caching** for instant re-display

## 🚀 Quick Start

### Installation (Developer Mode)

1. Clone the repository:
   ```bash
   git clone https://github.com/NguyenSiTrung/AnyLLMTranslate.git
   cd AnyLLMTranslate
   ```

2. Install dependencies:
   ```bash
   pnpm install
   ```

3. Build the extension:
   ```bash
   pnpm run build
   ```

4. Load in Chrome:
   - Navigate to `chrome://extensions/`
   - Enable "Developer mode" (top right)
   - Click "Load unpacked" and select the `.output/chrome-mv3` directory

### Configuration

1. Click the LinguaLens icon in the toolbar
2. Go to **Settings** (gear icon)
3. Set up your LLM provider:
   - **API Base URL**: Your OpenAI-compatible endpoint (e.g., `https://api.openai.com/v1`)
   - **API Key**: Your API key
   - **Model**: The model to use (e.g., `gpt-4o-mini`)
4. Click **Test Connection** to verify
5. Select your target language

## 🛠️ Development

### Tech Stack
- **WXT** — Web Extension framework (Manifest V3)
- **React** — UI components (Popup, Options page)
- **TypeScript** — Full type safety
- **Zustand** — State management with chrome.storage sync
- **Vitest** — Unit testing (339+ tests)

### Commands

| Command | Description |
|---------|-------------|
| `pnpm dev` | Start development server with hot reload |
| `pnpm build` | Production build to `.output/chrome-mv3` |
| `pnpm test` | Run all unit tests |
| `pnpm lint` | Lint and typecheck |
| `pnpm zip` | Create distributable ZIP for Chrome Web Store |

### Project Structure

```
├── entrypoints/          # WXT entry points
│   ├── background.ts     # Service worker (message routing, commands, menus)
│   ├── content.ts        # Content script (DOM translation orchestrator)
│   ├── popup/            # Popup React UI
│   └── options/          # Options page (settings management)
├── content/              # Content script modules
│   ├── domWalker.ts      # DOM piece extraction
│   ├── viewportObserver.ts  # Lazy viewport-based translation
│   ├── translationDisplay.ts # DOM injection with themes
│   ├── mutationWatcher.ts   # Dynamic content detection
│   ├── textSelection.ts  # Text selection translate popup
│   ├── hoverTranslate.ts # Mouse hover translate
│   ├── keyboardShortcuts.ts # Page-specific keyboard shortcuts
│   └── subtitle*/        # Subtitle interception & overlay
├── services/             # Background services
│   ├── background.ts     # Message handler & translation orchestrator
│   ├── base.ts           # Base translation service
│   └── openaiCompatible.ts # OpenAI-compatible API client
├── stores/               # Zustand state management
├── styles/               # CSS (themes, subtitles, tooltips)
├── types/                # TypeScript type definitions
└── lib/                  # Shared utilities
```

## ⌨️ Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| **Alt+A** | Translate current page |
| **Alt+S** | Translate video subtitles |
| **Alt+Z** | Toggle translation display |
| **Alt+X** | Restore original page |
| **Alt+H** | Toggle hover translate |
| **Alt+D** | Toggle text selection translate |
| **Escape** | Dismiss translation tooltip |

> Shortcuts can be customized in `chrome://extensions/shortcuts`

## 🎨 Themes

LinguaLens includes 16+ built-in themes:

**Light themes:** Underline, Highlight, Wavy, Dotted, Dashed, Shadow, Block, Mask, Float, Blur, Marker  
**Dark themes:** All themes adapt to dark mode automatically  
**Special:** Neon, Glassmorphism, Gradient, Minimal

## 📄 License

MIT License — see [LICENSE](LICENSE) for details.

## 🤝 Contributing

Contributions welcome! Please:

1. Fork the repository
2. Create a feature branch: `git checkout -b feat/your-feature`
3. Write tests for new functionality
4. Ensure all tests pass: `pnpm test`
5. Submit a pull request

---

**Built with ❤️ using WXT, React, and TypeScript**
