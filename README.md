# AnyLLMTranslate

> Read the web bilingually, translate video subtitles, and bring your own LLM.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

AnyLLMTranslate is an open-source, privacy-first browser extension for bilingual web reading, video subtitle translation, interactive translation tools, and optional scientific PDF translation. It connects to an OpenAI-compatible endpoint that **you** choose, including cloud providers and local runtimes such as Ollama or LM Studio.

Translation is BYOK (Bring Your Own Key): AnyLLMTranslate does not provide a hosted translation API, proxy your requests through developer infrastructure, or collect telemetry.

**Jump to:** [Features](#features) · [Subtitle support](#subtitle-support) · [Install](#install-for-development) · [Configure](#configure-your-provider) · [Scientific PDF](#scientific-pdf-translation) · [Development](#development) · [Privacy](#privacy-and-security) · [Contributing](#contributing)

## Features

### Bilingual web pages

- Show original and translated text inline with below, above, side-by-side, and translation-only display options.
- Translate visible content first with viewport-aware loading, batching, streaming, caching, and look-ahead prefetch.
- Handle single-page applications and dynamic content through mutation watching and lifecycle-safe resume/restore.
- Choose page-scope presets, smart excludes, site rules, custom glossaries, and context-aware category prompts.
- Personalize the reading experience with visual themes, custom themes, dark mode, compact inline display, and translation-position controls.
- Pause, retry, hide, or restore translations without losing the surrounding page.

### Video subtitle translation

- Translate subtitles progressively and display original plus translated cues in the native player or a resilient custom overlay.
- Discover tracks proactively and use platform-specific interception, manifest/TextTrack access, or DOM cue scraping where needed.
- Use the in-player mini studio for subtitle activation, language, display mode, position, font size, opacity, style presets, and glossary selection.
- Keep subtitle quality consistent with site profiles, register/faithfulness/brevity/profanity controls, named glossaries, reading-speed timing, line wrapping, and speaker-aware context.
- Optionally re-align fragmented YouTube auto-generated captions locally or with a BYOK model, with saved results cached for reuse.

### Interactive translation tools

- Select a word or sentence for dictionary-style definitions or a focused translation with copy, retry, speak, glossary, and pin actions.
- Translate paragraph-level content on hover with a configurable delay and local element cache.
- Translate text in inputs, textareas, and contenteditable fields with a configurable key gesture or the optional `Alt+I` command.
- Translate a selected page section without committing to a full-page translation.
- Use browser or provider text-to-speech, keyboard shortcuts, and context-menu actions for common workflows.

### PDF translation

- Open PDFs in a bundled reader-first viewer with original, translated, and compare workflows.
- Translate scientific PDFs through an optional local Docker bridge that preserves layout, math, figures, and document structure.
- Download mono, dual, or side-by-side results after a bridge job completes.
- Keep PDF translation separate from ordinary web translation: the Scientific PDF path is bridge-only and has no in-browser Fast fallback.

## Subtitle support

The extension includes dedicated handlers for the platforms below plus a last-resort generic handler for common subtitle formats and players.

| Platform            | Coverage            | Notes                                                          |
| ------------------- | ------------------- | -------------------------------------------------------------- |
| YouTube             | Dedicated handler   | Native track discovery and optional ASR re-alignment           |
| Udemy               | Dedicated handler   | Course captions                                                |
| Coursera            | Dedicated handler   | Lecture subtitles and transcript tracks                        |
| DeepLearning.AI     | Dedicated handler   | Lesson VTT via embedded metadata and subtitle CDN interception |
| LinkedIn Learning   | Dedicated handler   | VTT and transcript metadata paths                              |
| HBO Max / Max       | Dedicated handler   | VTT, manifest, and DOM fallback paths vary by player           |
| Youku               | Dedicated handler   | ASS, manifest, and DOM fallback paths                          |
| Netflix             | Dedicated handler   | Player metadata and timed-text paths                           |
| Disney+             | Dedicated handler   | Player metadata and VTT paths                                  |
| WeTV / iFlix        | Dedicated handler   | VTT interception                                               |
| Generic auto-detect | Last-resort handler | Common VTT, SRT, TTML, content-type, and DOM caption detection |

> Subtitle behavior depends on the site player, available tracks, account and region, and future platform changes. The Generic handler only runs when a dedicated handler does not own the current host.

## How it works

| Layer                                | Responsibility                                                                                |
| ------------------------------------ | --------------------------------------------------------------------------------------------- |
| Popup, Options, and Side panel       | Setup, language, display, provider, subtitle, glossary, and advanced controls                 |
| Isolated content script              | DOM translation, page lifecycle, selection, hover, inline tools, and subtitle coordination    |
| MAIN-world injectors                 | Subtitle request interception, player integration, TextTrack access, and DOM cue sources      |
| Background service worker            | Message routing, provider pool, retries, cache, rate limits, circuit breakers, and statistics |
| PDF viewer and Scientific PDF bridge | Reader UI plus optional local layout-preserving PDF jobs                                      |

### Translation and provider flow

1. You choose a target language and configure one or more providers in the setup wizard or Options.
2. The content script extracts page text or subtitle cues without sending page content to AnyLLMTranslate servers.
3. The background service worker routes translation requests through the active provider pool, cache, retry, and rate-limit layers.
4. Results return to the page, player overlay, selection bubble, or PDF viewer as bilingual content.

The provider pool supports multiple providers and API keys, round-robin distribution, per-key RPM/concurrency/interval limits, and circuit-breaker failover. Provider models can be listed from compatible `/models` endpoints when supported.

## Install for development

> This repository documents unpacked developer builds. It does not claim a Chrome Web Store or Firefox Add-ons release.

### Prerequisites

- Node.js `>=20.12.0`
- [pnpm](https://pnpm.io/) (recommended) or npm
- Chrome or Firefox for unpacked-extension testing
- Docker Desktop or Docker Engine, only if you want Scientific PDF translation

### Clone and build

```bash
git clone https://github.com/NguyenSiTrung/AnyLLMTranslate.git
cd AnyLLMTranslate

pnpm install
pnpm build
```

The npm equivalent is:

```bash
npm install
npm run build
```

### Load the extension in Chrome

1. Open `chrome://extensions/`.
2. Enable **Developer mode**.
3. Select **Load unpacked**.
4. Choose `.output/chrome-mv3`.
5. Pin AnyLLMTranslate to the toolbar for easy access.

After source changes, rebuild and use **Reload** on the extension card.

### Build for Firefox

```bash
pnpm build:firefox
```

Load the generated Firefox extension from the corresponding WXT output directory using `about:debugging` → **This Firefox** → **Load Temporary Add-on**. These are development builds, not store distribution instructions.

### First run

1. Open the AnyLLMTranslate popup and start the setup wizard.
2. Select a provider from the catalog or enter a custom endpoint.
3. Test the connection and select a target language.
4. Open a normal webpage and choose **Translate Page** or press `Alt+A`.

## Configure your provider

Open **Options → Providers** to manage endpoints, models, keys, rotation, connection tests, and per-key throttling.

| Provider type           | Examples                                                            |
| ----------------------- | ------------------------------------------------------------------- |
| Cloud OpenAI-compatible | OpenRouter, NVIDIA NIM, Groq, Together AI, Fireworks AI, Mistral AI |
| Google-compatible       | Google AI Studio / Gemini                                           |
| Additional gateways     | OpenCode Zen, OpenCode Go, DeepSeek Official, Nous Portal           |
| Local                   | Ollama or LM Studio, usually without an API key                     |
| Custom                  | Any endpoint exposing a compatible chat API                         |

Typical setup fields are:

- **API Base URL** — for example, `http://localhost:11434/v1` for Ollama or `https://api.openai.com/v1` for a compatible cloud endpoint.
- **API Key** — required by most hosted providers; leave it blank for keyless local runtimes.
- **Model** — select from the provider model list when available, or enter an ID manually.
- **Target language** — set in **Options → General** or during the setup wizard.

The provider pool lets you add multiple keys or providers and tune `maxRpm`, concurrency, and minimum request interval per key. Start with one tested provider, then add failover capacity if you need it.

## Scientific PDF translation

Scientific PDF translation is optional and requires the local Scientific PDF bridge. The bridge wraps [pdf2zh / PDFMathTranslate](https://github.com/PDFMathTranslate/PDFMathTranslate), listens on `http://127.0.0.1:17890` by default, and uses the active provider pool instead of a second API-key store.

**Recommended path:** [Open the Scientific PDF setup guide](https://nguyensitrung.github.io/AnyLLMTranslate/guide/). It covers the prebuilt GHCR image, Docker Compose, health checks, updates, and troubleshooting.

**From this repository:**

```bash
./scripts/scientific-pdf-docker.sh up
curl -sS http://127.0.0.1:17890/health
```

Then open **Options → Advanced → Scientific PDF**, complete the setup wizard, and translate from the bundled PDF viewer. Jobs produce mono, dual, or side-by-side downloads with progress and logs.

Scientific jobs send the full PDF and short-lived provider credentials to the bridge URL you configure. Keep the default loopback URL unless you intentionally run the bridge elsewhere. See the [local setup guide](docs/scientific-pdf-setup.md) and [bridge API reference](docs/scientific-pdf-bridge-api.md) for details.

## Development

The project uses WXT, React, TypeScript, Tailwind CSS, Zustand, IndexedDB, Web Crypto, and PDF.js.

### Commands

Run these from the repository root:

| Command              | Purpose                                   |
| -------------------- | ----------------------------------------- |
| `pnpm dev`           | Chrome development server with hot reload |
| `pnpm dev:firefox`   | Firefox development server                |
| `pnpm build`         | Production Chrome build                   |
| `pnpm build:firefox` | Production Firefox build                  |
| `pnpm test:fast`     | Fast library and unit-test subset         |
| `pnpm test`          | Full Vitest suite                         |
| `pnpm test:watch`    | Vitest watch mode                         |
| `pnpm test:coverage` | Generate a coverage report                |
| `pnpm compile`       | TypeScript type check                     |
| `pnpm lint`          | ESLint check                              |
| `pnpm format`        | Format source and Markdown files          |
| `pnpm zip`           | Chrome distributable package              |
| `pnpm zip:firefox`   | Firefox distributable package             |
| `pnpm zip:source`    | Git-tracked source archive                |

A typical contributor check is:

```bash
pnpm test
pnpm compile
pnpm lint
```

### Repository map

| Directory                          | Purpose                                                                    |
| ---------------------------------- | -------------------------------------------------------------------------- |
| `entrypoints/`                     | WXT entrypoints: background, content, popup, options, and PDF viewer       |
| `content/`                         | Page translation, selection, hover, inline input, subtitles, and player UI |
| `inject/`                          | MAIN-world subtitle interceptors, platform handlers, and cue discovery     |
| `services/`                        | Background translation, provider pool, cache, statistics, and PDF bridge   |
| `lib/`, `types/`, `stores/`, `ui/` | Shared logic, contracts, settings state, and reusable React components     |
| `styles/`                          | Host-page translation themes, subtitle overlay, and tooltip styles         |

## Keyboard shortcuts

### Global commands

| Shortcut | Action                          |
| -------- | ------------------------------- |
| `Alt+A`  | Translate the current page      |
| `Alt+S`  | Translate video subtitles       |
| `Alt+Z`  | Show or hide translations       |
| `Alt+X`  | Restore the original page       |
| `Alt+I`  | Translate the focused input box |

### Page controls

| Shortcut | Action                                           |
| -------- | ------------------------------------------------ |
| `Alt+H`  | Toggle hover translation                         |
| `Alt+D`  | Toggle text-selection translation                |
| `Alt+Q`  | Enter or exit section-picker mode                |
| `Escape` | Dismiss the selection tooltip or floating button |

Global commands can be changed at `chrome://extensions/shortcuts`. The inline-input command has no default suggested key; bind `Alt+I` or another key there. Inline input translation can also be triggered with its configured Space-based gesture.

## Privacy and security

- **No telemetry:** no developer analytics, advertising, crash reporting, or browsing-history collection.
- **Local storage:** settings, statistics, translation cache, and encrypted API keys remain in browser storage.
- **Direct provider requests:** page and subtitle text goes only to the endpoint you configure for translation.
- **Protected credentials:** API keys are encrypted at rest and are not exposed to page content or the selection UI.
- **Extension boundaries:** strict extension-page CSP, origin-checked message bridges, subtitle URL allowlists, and SSRF protections reduce unnecessary exposure.
- **PDF disclosure:** Scientific PDF jobs send the PDF and short-lived provider credentials to the configured bridge, defaulting to loopback.

Read the full [Privacy Policy](PRIVACY.md) before enabling a non-local provider or a non-loopback PDF bridge.

## Contributing

Contributions and bug reports are welcome. Start with [CONTRIBUTING.md](CONTRIBUTING.md) for the development setup, architecture, testing patterns, and pull-request expectations.

Before opening a pull request, run:

```bash
pnpm test
pnpm compile
pnpm lint
```

## License

AnyLLMTranslate is distributed under the [MIT License](LICENSE).

Built with WXT, React, TypeScript, Tailwind CSS, and the open-source LLM ecosystem.
