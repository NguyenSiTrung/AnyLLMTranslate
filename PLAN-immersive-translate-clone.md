# 🌐 LinguaLens — Immersive Bilingual Translation Chrome Extension

## Full Implementation Plan

> A Chrome Extension (Manifest V3) that provides immersive bilingual web page translation and video subtitle translation for platforms like Udemy, Coursera, YouTube, and Netflix — with a focus on premium display UX.

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Architecture Overview](#2-architecture-overview)
3. [Tech Stack](#3-tech-stack)
4. [Project Structure](#4-project-structure)
5. [Module 1: Extension Skeleton & Manifest V3](#5-module-1-extension-skeleton--manifest-v3)
6. [Module 2: Content Script — DOM Translation Engine](#6-module-2-content-script--dom-translation-engine)
7. [Module 3: Bilingual Display UX System](#7-module-3-bilingual-display-ux-system)
8. [Module 4: Translation Service Layer](#8-module-4-translation-service-layer)
9. [Module 5: Translation Cache (IndexedDB)](#9-module-5-translation-cache-indexeddb)
10. [Module 6: Video Subtitle Translation Engine](#10-module-6-video-subtitle-translation-engine)
11. [Module 7: Site-Specific Rules System](#11-module-7-site-specific-rules-system)
12. [Module 8: Popup & Settings UI](#12-module-8-popup--settings-ui)
13. [Module 9: Side Panel & Advanced Features](#13-module-9-side-panel--advanced-features)
14. [Display UX Deep Dive](#14-display-ux-deep-dive)
15. [Data Flow Diagrams](#15-data-flow-diagrams)
16. [Phased Delivery Roadmap](#16-phased-delivery-roadmap)
17. [Testing Strategy](#17-testing-strategy)
18. [Security Considerations](#18-security-considerations)
19. [Performance Budget](#19-performance-budget)
20. [Risk Matrix & Mitigations](#20-risk-matrix--mitigations)

---

## 1. Executive Summary

### Goal
Build a Chrome extension that replicates the core value proposition of Immersive Translate:
- **Bilingual side-by-side translation** of web pages with minimal layout disruption
- **Video subtitle translation** on learning platforms (Udemy, Coursera) and streaming (YouTube, Netflix)
- **Premium display UX** with 10+ visual themes for translated text
- **Single universal translation engine**: any OpenAI-compatible API (OpenAI, DeepSeek, Groq, Ollama, LM Studio, vLLM, Gemini, Claude via proxy, etc.) — fully BYOK

### Why This Is Feasible
- ✅ Chrome MV3 fully supports content script injection at `document_start`
- ✅ XHR/fetch monkey-patching in `MAIN` world scripts enables subtitle interception
- ✅ `web_accessible_resources` allows injecting page-context scripts for video platforms
- ✅ Any OpenAI-compatible LLM can be used via BYOK (OpenAI, DeepSeek, Groq, Ollama, local models)
- ✅ The old Immersive Translate codebase (archived) reveals the full architecture pattern

### Key Differentiators We Can Build
| Feature | Immersive Translate | Our Extension |
|---------|-------------------|---------------|
| Source | Closed-source (since 2023) | Open-source |
| Pricing | Freemium ($9.99/mo Pro) | Self-hosted, BYOK (Bring Your Own Key) |
| LLM Support | Limited to their proxy | Any OpenAI-compatible endpoint (OpenAI, DeepSeek, Groq, Ollama, local LLMs) |
| Customization | Fixed themes | User-defined CSS themes |
| Learning Features | Basic | Vocabulary extraction, spaced repetition hooks |

---

## 2. Architecture Overview

```
┌──────────────────────────────────────────────────────────────────┐
│                        Chrome Browser                           │
│                                                                  │
│  ┌─────────────────┐  ┌────────────────┐  ┌──────────────────┐  │
│  │  Popup UI       │  │  Options Page   │  │  Side Panel      │  │
│  │  (React)        │  │  (React)        │  │  (React)         │  │
│  └────────┬────────┘  └───────┬────────┘  └────────┬─────────┘  │
│           │                   │                     │            │
│           └───────────────────┼─────────────────────┘            │
│                               │                                  │
│                    chrome.runtime.sendMessage                    │
│                               │                                  │
│  ┌────────────────────────────┼────────────────────────────────┐ │
│  │           Background Service Worker (background.ts)         │ │
│  │                                                             │ │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐  │ │
│  │  │ Translation  │  │ Language     │  │ Cache Manager    │  │ │
│  │  │ Router       │  │ Detector     │  │ (IndexedDB)      │  │ │
│  │  └──────┬───────┘  └──────────────┘  └──────────────────┘  │ │
│  │         │                                                   │ │
│  │  ┌──────┴───────────────────────────────────┐               │ │
│  │  │        Translation Engine Adapter          │               │ │
│  │  │  ┌──────────────────────────────────────┐ │               │ │
│  │  │  │ OpenAI-Compatible Custom Provider    │ │               │ │
│  │  │  │ (any /v1/chat/completions endpoint)  │ │               │ │
│  │  │  └──────────────────────────────────────┘ │               │ │
│  │  └──────────────────────────────────────────┘               │ │
│  └─────────────────────────────────────────────────────────────┘ │
│                               │                                  │
│                    chrome.tabs.sendMessage                       │
│                               │                                  │
│  ┌────────────────────────────┼────────────────────────────────┐ │
│  │      Content Script (content_script.ts) — ISOLATED world    │ │
│  │                                                             │ │
│  │  ┌───────────────┐  ┌──────────────┐  ┌─────────────────┐  │ │
│  │  │ DOM Walker    │  │ Bilingual    │  │ Mutation        │  │ │
│  │  │ & Paragraph   │  │ Display      │  │ Observer        │  │ │
│  │  │ Detector      │  │ Renderer     │  │ (SPA support)   │  │ │
│  │  └───────────────┘  └──────────────┘  └─────────────────┘  │ │
│  └─────────────────────────────────────────────────────────────┘ │
│                               │                                  │
│                    window.postMessage                            │
│                               │                                  │
│  ┌────────────────────────────┼────────────────────────────────┐ │
│  │   Injected Page Script (inject.ts) — MAIN world             │ │
│  │                                                             │ │
│  │  ┌───────────────┐  ┌──────────────────────────────────┐   │ │
│  │  │ XHR/Fetch     │  │ Platform Subtitle Handlers       │   │ │
│  │  │ Interceptor   │  │ ┌────────┐┌───────┐┌──────────┐ │   │ │
│  │  │               │  │ │ Udemy  ││Coursera││ YouTube  │ │   │ │
│  │  └───────────────┘  │ └────────┘└───────┘└──────────┘ │   │ │
│  │                     └──────────────────────────────────┘   │ │
│  └─────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────┘
```

---

## 3. Tech Stack

| Layer | Technology | Rationale |
|-------|-----------|-----------|
| **Language** | TypeScript 5.x | Type safety across all contexts |
| **Build** | Vite + CRXJS or WXT | Hot reload, MV3-native, multi-entry builds |
| **UI Framework** | React 18 + Tailwind CSS | Popup, options, side panel UIs |
| **State** | Zustand + chrome.storage.local | Reactive, synced across contexts |
| **CSS Injection** | CSS Custom Properties + inject.css | Theming without shadow DOM conflicts |
| **Cache** | IndexedDB (via idb-keyval) | Translation result caching |
| **Testing** | Vitest + Playwright | Unit tests + E2E extension testing |
| **Linting** | ESLint + Prettier | Code quality |
| **Packaging** | GitHub Actions → Chrome Web Store API | CI/CD |

---

## 4. Project Structure

```
lingua-lens/
├── manifest.json                    # MV3 manifest
├── vite.config.ts                   # Multi-entry build config
├── package.json
├── tsconfig.json
│
├── src/
│   ├── background/
│   │   ├── index.ts                 # Service worker entry
│   │   ├── translationRouter.ts     # Routes to correct engine
│   │   ├── languageDetector.ts      # Language detection logic
│   │   ├── cacheManager.ts          # IndexedDB cache
│   │   ├── contextMenus.ts          # Right-click translate
│   │   └── commandHandler.ts        # Keyboard shortcut handler
│   │
│   ├── content/
│   │   ├── index.ts                 # Content script entry
│   │   ├── domWalker.ts             # Paragraph detection algorithm
│   │   ├── translationDisplay.ts    # Bilingual DOM rendering
│   │   ├── viewportObserver.ts      # Lazy/progressive translation
│   │   ├── mutationWatcher.ts       # SPA/dynamic content
│   │   ├── selectionTranslate.ts    # Text selection popup
│   │   ├── hoverTranslate.ts        # Mouse hover translation
│   │   └── restoreManager.ts        # Undo/restore original
│   │
│   ├── inject/
│   │   ├── index.ts                 # Page-context script (MAIN world)
│   │   ├── xhrInterceptor.ts        # XHR monkey-patch
│   │   ├── fetchInterceptor.ts      # fetch() monkey-patch
│   │   ├── messageBridge.ts         # postMessage protocol
│   │   └── subtitleHandlers/
│   │       ├── base.ts              # Abstract subtitle handler
│   │       ├── udemy.ts             # Udemy subtitle interception
│   │       ├── coursera.ts          # Coursera subtitle interception
│   │       ├── youtube.ts           # YouTube subtitle interception
│   │       ├── netflix.ts           # Netflix subtitle interception
│   │       └── generic.ts           # Generic WebVTT handler
│   │
│   ├── services/
│   │   ├── base.ts                  # Translation service interface
│   │   └── openaiCompatible.ts      # OpenAI-compatible provider (single engine)
│   │                                # Works with: OpenAI, DeepSeek, Groq,
│   │                                # Ollama, LM Studio, vLLM, etc.
│   │
│   ├── ui/
│   │   ├── popup/
│   │   │   ├── App.tsx              # Popup React app
│   │   │   ├── components/
│   │   │   │   ├── QuickControls.tsx
│   │   │   │   ├── ServicePicker.tsx
│   │   │   │   ├── LanguagePicker.tsx
│   │   │   │   └── TranslationToggle.tsx
│   │   │   └── popup.html
│   │   │
│   │   ├── options/
│   │   │   ├── App.tsx              # Options page
│   │   │   ├── components/
│   │   │   │   ├── GeneralSettings.tsx
│   │   │   │   ├── TranslationRules.tsx
│   │   │   │   ├── ThemePreview.tsx
│   │   │   │   ├── APIKeyManager.tsx
│   │   │   │   └── SiteRulesEditor.tsx
│   │   │   └── options.html
│   │   │
│   │   └── sidePanel/
│   │       ├── App.tsx              # Side panel
│   │       └── sidePanel.html
│   │
│   ├── styles/
│   │   ├── inject.css               # Bilingual display themes
│   │   ├── subtitle.css             # Video subtitle overlay styles
│   │   ├── selection.css            # Text selection popup styles
│   │   └── themes/
│   │       ├── underline.css
│   │       ├── highlight.css
│   │       ├── blockquote.css
│   │       ├── paper.css
│   │       ├── mask.css
│   │       └── ...                  # 15+ theme files
│   │
│   ├── lib/
│   │   ├── config.ts                # Settings store (chrome.storage)
│   │   ├── siteRules.ts             # Per-site rule definitions
│   │   ├── languages.ts             # Language codes + names
│   │   ├── subtitleParser.ts        # WebVTT / SRT parser
│   │   ├── textSplitter.ts          # Text batching (≤800 chars)
│   │   └── constants.ts             # Shared constants
│   │
│   └── types/
│       ├── messages.ts              # Message type definitions
│       ├── config.ts                # Config type definitions
│       ├── translation.ts           # Translation result types
│       └── subtitle.ts              # Subtitle data types
│
├── public/
│   └── icons/
│       ├── icon-16.png
│       ├── icon-48.png
│       └── icon-128.png
│
└── tests/
    ├── unit/
    │   ├── domWalker.test.ts
    │   ├── subtitleParser.test.ts
    │   └── translationService.test.ts
    └── e2e/
        ├── pageTranslation.test.ts
        └── subtitleTranslation.test.ts
```

---

## 5. Module 1: Extension Skeleton & Manifest V3

### manifest.json

```jsonc
{
  "manifest_version": 3,
  "name": "LinguaLens — Immersive Bilingual Translator",
  "version": "1.0.0",
  "description": "Bilingual translation for web pages and video subtitles (Udemy, Coursera, YouTube)",

  "permissions": [
    "storage",
    "activeTab",
    "contextMenus",
    "sidePanel",
    "offscreen"
  ],

  "host_permissions": ["<all_urls>"],

  "background": {
    "service_worker": "src/background/index.ts",
    "type": "module"
  },

  "content_scripts": [
    {
      "matches": ["<all_urls>"],
      "js": ["src/content/index.ts"],
      "css": ["src/styles/inject.css"],
      "run_at": "document_start",
      "all_frames": true
    }
  ],

  "web_accessible_resources": [
    {
      "resources": [
        "src/inject/index.ts",
        "src/styles/inject.css",
        "src/styles/subtitle.css"
      ],
      "matches": ["<all_urls>"]
    }
  ],

  "action": {
    "default_popup": "src/ui/popup/popup.html",
    "default_icon": {
      "16": "public/icons/icon-16.png",
      "48": "public/icons/icon-48.png",
      "128": "public/icons/icon-128.png"
    }
  },

  "options_page": "src/ui/options/options.html",

  "side_panel": {
    "default_path": "src/ui/sidePanel/sidePanel.html"
  },

  "commands": {
    "toggle-translate": {
      "suggested_key": { "default": "Alt+A" },
      "description": "Toggle page translation"
    },
    "toggle-subtitle": {
      "suggested_key": { "default": "Alt+S" },
      "description": "Toggle subtitle translation"
    },
    "translate-selection": {
      "suggested_key": { "default": "Alt+T" },
      "description": "Translate selected text"
    }
  }
}
```

---

## 6. Module 2: Content Script — DOM Translation Engine

### 6.1 DOM Walker Algorithm (`domWalker.ts`)

The core algorithm that identifies translatable text segments on any web page.

**Key Design Decisions:**
- Paragraphs are the atomic unit of translation (not sentences, not words)
- Block elements split pieces; inline elements stay within
- Only visible/viewport content is translated (lazy loading)
- Max 1,000 characters per piece for optimal API batching

```typescript
// Core types
interface TranslationPiece {
  id: string;                    // unique ID for tracking
  parentElement: HTMLElement;    // block container
  textNodes: Text[];             // actual text nodes
  originalHTML: string;          // for restore
  isTranslated: boolean;
  translatedHTML?: string;
}

// Element classification
const BLOCK_ELEMENTS = new Set([
  'P', 'DIV', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6',
  'LI', 'OL', 'UL', 'TABLE', 'TR', 'BLOCKQUOTE',
  'PRE', 'ARTICLE', 'SECTION', 'ASIDE', 'HEADER',
  'FOOTER', 'MAIN', 'FIGURE', 'FIGCAPTION', 'DD', 'DT'
]);

const SKIP_ELEMENTS = new Set([
  'SCRIPT', 'STYLE', 'NOSCRIPT', 'SVG', 'MATH',
  'CODE', 'PRE', 'TEXTAREA', 'INPUT', 'SELECT',
  'CANVAS', 'VIDEO', 'AUDIO', 'IFRAME', 'OBJECT'
]);

const INLINE_ELEMENTS = new Set([
  '#text', 'A', 'ABBR', 'B', 'BDI', 'BDO', 'CITE',
  'DEL', 'DFN', 'EM', 'I', 'INS', 'KBD', 'MARK',
  'Q', 'S', 'SAMP', 'SMALL', 'SPAN', 'STRONG',
  'SUB', 'SUP', 'TIME', 'U', 'VAR', 'WBR', 'RUBY',
  'RT', 'RP', 'FONT', 'LABEL'
]);
```

**Algorithm Steps:**

1. **Pre-filter**: Check `translate="no"`, `class="notranslate"`, `contentEditable`
2. **TreeWalker**: Walk DOM tree starting from `document.body` (or site-specific container)
3. **Piece Collection**: Group consecutive text/inline nodes into pieces
4. **Split on Block**: When a block element is encountered, close the current piece and start a new one
5. **Size Cap**: If a piece exceeds 1,000 chars, split at sentence boundaries
6. **Language Filter**: Skip pieces already in the target language (via `Intl.Segmenter` or CLD3)

### 6.2 Viewport-Based Lazy Translation (`viewportObserver.ts`)

Uses `IntersectionObserver` (modern approach, better than Immersive Translate's `getBoundingClientRect` polling):

```typescript
// Instead of polling every 600ms, use IntersectionObserver
const observer = new IntersectionObserver(
  (entries) => {
    const visiblePieces = entries
      .filter(e => e.isIntersecting)
      .map(e => pieceMap.get(e.target));
    
    if (visiblePieces.length > 0) {
      batchTranslate(visiblePieces);
    }
  },
  { rootMargin: '200px' } // Pre-translate 200px ahead of viewport
);

// Observe each piece's parentElement
pieces.forEach(piece => observer.observe(piece.parentElement));
```

### 6.3 SPA / Dynamic Content Support (`mutationWatcher.ts`)

```typescript
const mutationObserver = new MutationObserver((mutations) => {
  const addedBlocks: HTMLElement[] = [];
  
  for (const mutation of mutations) {
    for (const node of mutation.addedNodes) {
      if (node instanceof HTMLElement && isBlockElement(node)) {
        // Skip our own injected translation nodes
        if (!node.hasAttribute('data-lingua-translated')) {
          addedBlocks.push(node);
        }
      }
    }
  }
  
  if (addedBlocks.length > 0) {
    // Debounce: process new nodes every 500ms
    scheduleTranslation(addedBlocks);
  }
});

mutationObserver.observe(document.body, {
  childList: true,
  subtree: true
});
```

---

## 7. Module 3: Bilingual Display UX System

> **This is the most critical differentiator. The display UX must feel native and non-intrusive.**

### 7.1 Core Display Mechanism

The bilingual display works by:
1. **Cloning** the original DOM node (marked `notranslate`, hidden initially)
2. **Translating** the original node in-place
3. **Wrapping** translated text in a `<font>` element with theme-specific CSS
4. **Showing** both nodes (original clone + translated) in the chosen layout

```typescript
function applyBilingualTranslation(
  piece: TranslationPiece,
  translatedHTML: string,
  displayMode: DisplayMode
): void {
  const parent = piece.parentElement;
  
  // 1. Clone original as backup
  const originalClone = parent.cloneNode(true) as HTMLElement;
  originalClone.setAttribute('data-lingua-role', 'original');
  originalClone.classList.add('notranslate');
  
  // 2. Create translation wrapper
  const translationWrapper = document.createElement('font');
  translationWrapper.setAttribute('data-lingua-role', 'translation');
  translationWrapper.innerHTML = translatedHTML;
  
  // 3. Apply layout based on display mode
  switch (displayMode) {
    case 'bilingual-below':
      parent.after(translationWrapper);
      break;
    case 'bilingual-above':
      parent.before(translationWrapper);
      break;
    case 'translation-only':
      parent.style.display = 'none';
      parent.after(translationWrapper);
      break;
    case 'bilingual-side':
      wrapInFlexContainer(parent, translationWrapper);
      break;
  }
}
```

### 7.2 Translation Visual Themes (15+ themes)

Each theme is defined via CSS custom properties applied to `[data-lingua-role="translation"]`:

| # | Theme Name | CSS Effect | Best For |
|---|-----------|-----------|---------|
| 1 | **Underline** | `border-bottom: 1px solid #72ECE9` | Subtle, daily use |
| 2 | **Native Underline** | `text-decoration: underline wavy #72ECE9` | Minimal |
| 3 | **Dashed** | `text-decoration: underline dashed` | Academic reading |
| 4 | **Dotted** | `text-decoration: underline dotted` | Light indication |
| 5 | **Highlight** | `background: linear-gradient(transparent 60%, #FFE066 60%)` | Yellow marker |
| 6 | **Marker** | `background: linear-gradient(104deg, ...)` | Pen-stroke effect |
| 7 | **Blockquote** | `border-left: 3px solid #72ECE9; padding-left: 12px` | Article reading |
| 8 | **Paper** | `background: #fff; box-shadow: 0 1px 4px rgba(0,0,0,.15); padding: 8px; border-radius: 4px` | Card-style |
| 9 | **Dashed Border** | `border: 1px dashed #999` | Clear separation |
| 10 | **Solid Border** | `border: 1px solid #ddd` | Formal |
| 11 | **Dividing Line** | `border-top: 1px solid #e2e2e2; margin-top: 4px; padding-top: 4px` | Clean separation |
| 12 | **Mask/Blur** | `filter: blur(5px)` → reveals on hover | Privacy/learning |
| 13 | **Opacity** | `opacity: 0.6` → `opacity: 1` on hover | Subtle presence |
| 14 | **Weakening** | `opacity: 0.618; font-size: 0.95em` | Focus on original |
| 15 | **Tinted Background** | `background: rgba(0, 150, 136, 0.08)` | Colored tint |
| 16 | **Grey Text** | `color: #888` | De-emphasized |

### 7.3 Root State Attribute

The page-level translation state is controlled via a data attribute on `<html>`:

```css
/* inject.css */
html[data-lingua-state="dual"] [data-lingua-role="original"] {
  display: block;
}

html[data-lingua-state="dual"] [data-lingua-role="translation"] {
  display: block;
}

html[data-lingua-state="translation-only"] [data-lingua-role="original"] {
  display: none !important;
}

html[data-lingua-state="off"] [data-lingua-role="translation"] {
  display: none !important;
}

/* Theme: Mask — reveals on hover */
[data-lingua-theme="mask"] [data-lingua-role="translation"] {
  filter: blur(5px);
  transition: filter 0.2s ease;
  cursor: pointer;
}

[data-lingua-theme="mask"] [data-lingua-role="translation"]:hover {
  filter: blur(0);
}

/* Theme: Paper card */
[data-lingua-theme="paper"] [data-lingua-role="translation"] {
  background: var(--lingua-bg, #ffffff);
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.12);
  border-radius: 6px;
  padding: 8px 12px;
  margin: 4px 0;
  font-size: 0.95em;
  color: var(--lingua-text, #333);
}

/* Dark mode support */
@media (prefers-color-scheme: dark) {
  [data-lingua-theme="paper"] [data-lingua-role="translation"] {
    background: var(--lingua-bg, #1e1e2e);
    color: var(--lingua-text, #cdd6f4);
    box-shadow: 0 1px 4px rgba(0, 0, 0, 0.4);
  }
}
```

### 7.4 Translation Position Control

Users can toggle where translations appear:

```
┌──────────────────────────────────────┐
│ Original English paragraph text      │  ← data-lingua-role="original"
│ that spans multiple lines.           │
├──────────────────────────────────────┤
│ 翻译后的中文段落文本，跨越多行。        │  ← data-lingua-role="translation"
│                                      │     theme: "dividing-line"
└──────────────────────────────────────┘

OR (bilingual-above):

┌──────────────────────────────────────┐
│ 翻译后的中文段落文本                    │  ← translation above
├──────────────────────────────────────┤
│ Original English paragraph text      │  ← original below
└──────────────────────────────────────┘

OR (bilingual-side for wide screens):

┌──────────────────────┬───────────────────────┐
│ Original English     │ 翻译后的中文段落文本     │
│ paragraph text       │                       │
└──────────────────────┴───────────────────────┘
```

---

## 8. Module 4: Translation Service Layer

### 8.1 Abstract Service Interface

```typescript
interface TranslationService {
  name: string;
  maxBatchChars: number;
  requiresAPIKey: boolean;
  
  translate(params: TranslationRequest): Promise<TranslationResult>;
  detectLanguage(text: string): Promise<string>;
  getSupportedLanguages(): LanguagePair[];
}

interface TranslationRequest {
  texts: string[];              // Batched text segments
  sourceLanguage: string;       // ISO 639-1 code or 'auto'
  targetLanguage: string;       // ISO 639-1 code
  context?: string;             // For LLM-based: surrounding context
  glossary?: Record<string, string>; // Custom term translations
}

interface TranslationResult {
  translations: string[];       // Translated texts (same order)
  detectedLanguage?: string;
  service: string;
  tokensUsed?: number;          // For LLM services
}
```

### 8.2 Service Implementations

We support a **single universal translation engine**: any OpenAI-compatible API endpoint (`/v1/chat/completions`). Users bring their own provider — OpenAI, DeepSeek, Groq, Ollama, LM Studio, vLLM, Together AI, Mistral, Azure OpenAI, OpenRouter, or any custom endpoint.

#### OpenAI-Compatible Custom Provider

A single, universal LLM translation service that works with **any** OpenAI-compatible API endpoint. Users configure 3 fields: `Base URL`, `API Key`, and `Model`.

**Preset configurations (dropdown in settings):**

| Preset | Base URL | Default Model |
|--------|---------|---------------|
| OpenAI | `https://api.openai.com/v1` | `gpt-4o-mini` |
| DeepSeek | `https://api.deepseek.com/v1` | `deepseek-chat` |
| Groq | `https://api.groq.com/openai/v1` | `llama-3.3-70b-versatile` |
| Ollama (local) | `http://localhost:11434/v1` | `qwen2.5:7b` |
| LM Studio (local) | `http://localhost:1234/v1` | `(auto-detect)` |
| Together AI | `https://api.together.xyz/v1` | `meta-llama/Llama-3.3-70B-Instruct-Turbo` |
| Mistral | `https://api.mistral.ai/v1` | `mistral-small-latest` |
| OpenRouter | `https://openrouter.ai/api/v1` | `openai/gpt-4o-mini` |
| Custom | `(user enters URL)` | `(user enters model)` |

```typescript
interface OpenAICompatibleConfig {
  baseUrl: string;       // e.g. "https://api.openai.com/v1"
  apiKey: string;        // e.g. "sk-..." (empty for local like Ollama)
  model: string;         // e.g. "gpt-4o-mini"
  maxTokens?: number;    // default: 4096
  temperature?: number;  // default: 0.3 (low for translation accuracy)
  systemPrompt?: string; // optional custom system prompt override
}

class OpenAICompatibleService implements TranslationService {
  name = 'openai-compatible';
  maxBatchChars = 4000;
  requiresAPIKey = true; // except for local providers (Ollama, LM Studio)
  
  constructor(private config: OpenAICompatibleConfig) {}
  
  async translate(params: TranslationRequest): Promise<TranslationResult> {
    const systemPrompt = this.config.systemPrompt ||
      `You are a professional translator. Translate the following JSON array of texts from ${params.sourceLanguage} to ${params.targetLanguage}. Maintain the original formatting and meaning. Preserve HTML tags if present. Return a JSON object with a "translations" array containing the translated texts in the same order. Do not include any explanation.`;
    
    const userMessage = JSON.stringify({
      texts: params.texts,
      ...(params.glossary && Object.keys(params.glossary).length > 0
        ? { glossary: params.glossary }
        : {})
    });
    
    const headers: Record<string, string> = {
      'Content-Type': 'application/json'
    };
    
    // Some local providers (Ollama, LM Studio) don't need auth
    if (this.config.apiKey) {
      headers['Authorization'] = `Bearer ${this.config.apiKey}`;
    }
    
    const response = await fetch(
      `${this.config.baseUrl.replace(/\/+$/, '')}/chat/completions`,
      {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model: this.config.model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userMessage }
          ],
          temperature: this.config.temperature ?? 0.3,
          max_tokens: this.config.maxTokens ?? 4096,
          response_format: { type: 'json_object' }
        })
      }
    );
    
    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Translation API error (${response.status}): ${error}`);
    }
    
    const data = await response.json();
    const content = data.choices[0]?.message?.content;
    
    // Parse the JSON response — handle both structured and raw formats
    const parsed = JSON.parse(content);
    const translations: string[] = parsed.translations || parsed.results || 
      (Array.isArray(parsed) ? parsed : [content]);
    
    return {
      translations,
      service: 'openai-compatible',
      tokensUsed: data.usage?.total_tokens
    };
  }
  
  // Validate connectivity (called from settings page "Test Connection" button)
  async testConnection(): Promise<{ success: boolean; error?: string; model?: string }> {
    try {
      const result = await this.translate({
        texts: ['Hello'],
        sourceLanguage: 'en',
        targetLanguage: 'es'
      });
      return { success: true, model: this.config.model };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  }
}
```

### 8.3 Request Batching & Deduplication

```typescript
class TranslationBatcher {
  private inFlight = new Map<string, Promise<string>>();
  
  async translateBatch(
    texts: string[],
    service: TranslationService,
    srcLang: string,
    tgtLang: string
  ): Promise<string[]> {
    // 1. Deduplicate
    const unique = [...new Set(texts)];
    
    // 2. Check in-flight requests
    const toTranslate: string[] = [];
    const resolved = new Map<string, string>();
    
    for (const text of unique) {
      const key = `${service.name}:${srcLang}:${tgtLang}:${text}`;
      if (this.inFlight.has(key)) {
        resolved.set(text, await this.inFlight.get(key)!);
      } else {
        toTranslate.push(text);
      }
    }
    
    // 3. Split into batches of maxBatchChars
    const batches = this.splitIntoBatches(toTranslate, service.maxBatchChars);
    
    // 4. Execute batches (with concurrency limit)
    const results = await Promise.all(
      batches.map(batch => service.translate({
        texts: batch,
        sourceLanguage: srcLang,
        targetLanguage: tgtLang
      }))
    );
    
    // 5. Map results back to original order
    return texts.map(t => resolved.get(t) ?? this.findResult(t, results));
  }
}
```

### 8.4 Custom Term Protection (Glossary Bypass)

```typescript
class GlossaryProtector {
  private placeholderMap = new Map<string, string>();
  
  // Before translation: replace terms with placeholders
  protect(text: string, glossary: Record<string, string>): string {
    let protected_ = text;
    let index = 0;
    
    for (const [term, replacement] of Object.entries(glossary)) {
      const placeholder = `⟦${index}⟧`; // Unicode brackets survive translation
      protected_ = protected_.replaceAll(term, placeholder);
      this.placeholderMap.set(placeholder, replacement);
      index++;
    }
    
    return protected_;
  }
  
  // After translation: restore placeholders with target terms
  restore(translatedText: string): string {
    let restored = translatedText;
    for (const [placeholder, replacement] of this.placeholderMap) {
      restored = restored.replaceAll(placeholder, replacement);
    }
    return restored;
  }
}
```

---

## 9. Module 5: Translation Cache (IndexedDB)

### 9.1 Cache Architecture

```
┌────────────────────────────────────────────────┐
│              IndexedDB                          │
│                                                 │
│  Database: "lingua-lens-cache"                  │
│  ┌──────────────────────────────────────────┐  │
│  │ Object Store: "translations"              │  │
│  │                                           │  │
│  │  Key: SHA-256(service + srcLang +          │  │
│  │       tgtLang + originalText)              │  │
│  │                                           │  │
│  │  Value: {                                 │  │
│  │    translatedText: string,                │  │
│  │    service: string,                       │  │
│  │    createdAt: number,                     │  │
│  │    accessCount: number                    │  │
│  │  }                                        │  │
│  └──────────────────────────────────────────┘  │
│                                                 │
│  Object Store: "subtitles"                      │
│  ┌──────────────────────────────────────────┐  │
│  │  Key: SHA-256(videoURL + lang pair)        │  │
│  │  Value: { subtitleData, timestamp }        │  │
│  └──────────────────────────────────────────┘  │
└────────────────────────────────────────────────┘
```

### 9.2 Cache Strategy

- **Write-through**: Results cached immediately after successful translation
- **TTL**: 30 days default (configurable)
- **LRU eviction**: When cache > 100MB, evict least recently accessed entries
- **Incognito bypass**: No cache writes in incognito mode
- **Cache key**: `SHA-256(service + ":" + srcLang + ":" + tgtLang + ":" + text)`
- **Cache invalidation**: Full clear on extension update (translation quality may change)

---

## 10. Module 6: Video Subtitle Translation Engine

### 10.1 Architecture: XHR/Fetch Interception

The video subtitle system uses a **MAIN world injected script** that monkey-patches `XMLHttpRequest` and `fetch` to intercept subtitle file requests before they reach the video player.

```
┌─────────────────────────────────────────────────────────────┐
│  Video Platform Page (e.g., Udemy)                          │
│                                                              │
│  ┌─────────────┐     ┌──────────────────────────────────┐   │
│  │ Video Player │────>│ inject.ts (MAIN world)            │   │
│  │ requests     │     │                                   │   │
│  │ subtitles    │     │  1. XHR.open() intercepted        │   │
│  │ via XHR      │     │  2. URL matches subtitle pattern? │   │
│  └─────────────┘     │  3. YES → send to content script  │   │
│                       │  4. Content script → background    │   │
│                       │  5. Background translates          │   │
│                       │  6. Returns bilingual subtitle     │   │
│                       │  7. Override xhr.responseText      │   │
│                       │  8. Player renders dual subtitles  │   │
│                       └──────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

### 10.2 Platform-Specific Subtitle Handlers

#### Udemy Handler

```typescript
class UdemySubtitleHandler extends BaseSubtitleHandler {
  platform = 'udemy';
  
  // Udemy serves subtitles via their API as JSON containing VTT URLs
  subtitleUrlPattern = /api-2\.0\/.*\/captions|\.vtt\?|udemy.*caption/i;
  
  // Method 1: Hook JSON.parse to intercept caption metadata
  hookCaptionMetadata(): void {
    const originalParse = JSON.parse;
    JSON.parse = function(text: string) {
      const result = originalParse.call(this, text);
      
      if (result?.asset?.captions || result?.results?.[0]?.title) {
        // Extract VTT URLs from Udemy's API response
        const captions = result.asset?.captions || result.results;
        self.postMessage({
          type: 'lingua-subtitle-metadata',
          platform: 'udemy',
          captions: captions.map((c: any) => ({
            language: c.locale_id || c.video_label,
            url: c.url,
            label: c.title
          }))
        });
      }
      
      return result;
    };
  }
  
  // Method 2: Intercept VTT file fetch
  isSubtitleRequest(url: string): boolean {
    return this.subtitleUrlPattern.test(url) &&
           (url.includes('.vtt') || url.includes('caption'));
  }
  
  // Transform: inject bilingual lines into VTT
  async transformSubtitle(
    originalVTT: string,
    targetLang: string
  ): Promise<string> {
    const cues = parseWebVTT(originalVTT);
    
    // Batch translate all cue texts
    const texts = cues.map(c => c.text);
    const translated = await this.translateTexts(texts, targetLang);
    
    // Build bilingual VTT
    return buildBilingualVTT(cues, translated);
  }
}
```

#### Coursera Handler

```typescript
class CourseraSubtitleHandler extends BaseSubtitleHandler {
  platform = 'coursera';
  
  // Coursera uses JSON API responses containing subtitle tracks
  subtitleUrlPattern = /coursera\.org.*subtitle|asset\.coursera\.org.*\.vtt/i;
  
  hookCaptionMetadata(): void {
    const originalParse = JSON.parse;
    JSON.parse = function(text: string) {
      const result = originalParse.call(this, text);
      
      // Coursera stores subtitles in onDemandVideoSubtitles
      if (result?.subtitles || result?.onDemandVideoSubtitles) {
        const subs = result.subtitles || result.onDemandVideoSubtitles;
        self.postMessage({
          type: 'lingua-subtitle-metadata',
          platform: 'coursera',
          captions: Object.entries(subs).map(([lang, data]: [string, any]) => ({
            language: lang,
            url: data.subtitlesVttUrl || data.url,
            label: data.label || lang
          }))
        });
      }
      
      return result;
    };
  }
  
  isSubtitleRequest(url: string): boolean {
    return this.subtitleUrlPattern.test(url);
  }
}
```

#### YouTube Handler

```typescript
class YouTubeSubtitleHandler extends BaseSubtitleHandler {
  platform = 'youtube';
  
  subtitleUrlPattern = /youtube\.com\/api\/timedtext|\.youtube\.com.*srv3/i;
  
  // YouTube uses srv3 (XML) format or json3 format
  isSubtitleRequest(url: string): boolean {
    return this.subtitleUrlPattern.test(url);
  }
  
  async transformSubtitle(
    original: string,
    targetLang: string
  ): Promise<string> {
    // Detect format (srv3 XML vs json3)
    if (original.trim().startsWith('<?xml') || original.trim().startsWith('<')) {
      return this.transformSrv3(original, targetLang);
    }
    return this.transformJson3(JSON.parse(original), targetLang);
  }
  
  private async transformSrv3(xml: string, targetLang: string): Promise<string> {
    const parser = new DOMParser();
    const doc = parser.parseFromString(xml, 'text/xml');
    const textNodes = doc.querySelectorAll('text');
    
    const texts = Array.from(textNodes).map(n => n.textContent || '');
    const translated = await this.translateTexts(texts, targetLang);
    
    // Append translation below each original subtitle line
    textNodes.forEach((node, i) => {
      node.textContent = `${texts[i]}\n${translated[i]}`;
    });
    
    return new XMLSerializer().serializeToString(doc);
  }
}
```

### 10.3 WebVTT Parser & Bilingual Builder

```typescript
interface SubtitleCue {
  index: number;
  startTime: string;     // "00:01:23.456"
  endTime: string;       // "00:01:26.789"
  text: string;          // Original text
  settings?: string;     // Position/alignment settings
}

function parseWebVTT(vttContent: string): SubtitleCue[] {
  const lines = vttContent.split('\n');
  const cues: SubtitleCue[] = [];
  let currentCue: Partial<SubtitleCue> | null = null;
  
  for (const line of lines) {
    if (line.includes('-->')) {
      const [start, rest] = line.split('-->');
      const [end, ...settings] = rest.trim().split(' ');
      currentCue = {
        startTime: start.trim(),
        endTime: end.trim(),
        settings: settings.join(' '),
        text: ''
      };
    } else if (currentCue && line.trim() === '') {
      if (currentCue.text) {
        cues.push(currentCue as SubtitleCue);
      }
      currentCue = null;
    } else if (currentCue) {
      currentCue.text += (currentCue.text ? '\n' : '') + line;
    }
  }
  
  if (currentCue?.text) {
    cues.push(currentCue as SubtitleCue);
  }
  
  return cues;
}

function buildBilingualVTT(
  cues: SubtitleCue[],
  translations: string[]
): string {
  let vtt = 'WEBVTT\n\n';
  
  cues.forEach((cue, i) => {
    vtt += `${cue.startTime} --> ${cue.endTime}`;
    if (cue.settings) vtt += ` ${cue.settings}`;
    vtt += '\n';
    
    // Original on top (smaller, dimmer)
    vtt += `<c.lingua-original>${cue.text}</c>\n`;
    // Translation below (larger, brighter)
    vtt += `<c.lingua-translated>${translations[i]}</c>\n`;
    vtt += '\n';
  });
  
  return vtt;
}
```

### 10.4 Custom Subtitle Overlay (Fallback)

When VTT injection isn't possible, we render a custom overlay:

```typescript
class SubtitleOverlay {
  private container: HTMLDivElement;
  private originalLine: HTMLDivElement;
  private translatedLine: HTMLDivElement;
  
  constructor(videoElement: HTMLVideoElement) {
    this.container = document.createElement('div');
    this.container.className = 'lingua-subtitle-overlay';
    
    this.originalLine = document.createElement('div');
    this.originalLine.className = 'lingua-sub-original';
    
    this.translatedLine = document.createElement('div');
    this.translatedLine.className = 'lingua-sub-translated';
    
    this.container.append(this.originalLine, this.translatedLine);
    videoElement.parentElement!.style.position = 'relative';
    videoElement.parentElement!.append(this.container);
  }
  
  update(original: string, translated: string): void {
    this.originalLine.textContent = original;
    this.translatedLine.textContent = translated;
  }
}
```

**Subtitle Overlay CSS:**

```css
.lingua-subtitle-overlay {
  position: absolute;
  bottom: 60px;
  left: 50%;
  transform: translateX(-50%);
  text-align: center;
  z-index: 9999;
  pointer-events: none;
  max-width: 80%;
  transition: opacity 0.15s ease;
}

.lingua-sub-original {
  font-size: 14px;
  color: rgba(255, 255, 255, 0.75);
  text-shadow: 0 1px 3px rgba(0, 0, 0, 0.8);
  margin-bottom: 4px;
  line-height: 1.4;
}

.lingua-sub-translated {
  font-size: 18px;
  color: #fff;
  text-shadow: 0 1px 4px rgba(0, 0, 0, 0.9);
  background: rgba(0, 0, 0, 0.5);
  padding: 4px 12px;
  border-radius: 4px;
  line-height: 1.4;
}
```

---

## 11. Module 7: Site-Specific Rules System

### 11.1 Rule Schema

```typescript
interface SiteRule {
  id: string;
  // Matching
  hostname?: string | string[];       // exact hostname match
  urlPattern?: string;                 // regex pattern for URL
  
  // Content targeting
  selectors?: string[];               // CSS selectors for translatable content
  containerSelector?: string;          // Main content container
  excludeSelectors?: string[];         // Elements to skip
  
  // Behavior
  blockElements?: string[];            // Additional block-level elements
  inlineElements?: string[];           // Additional inline elements
  detectLanguagePerNode?: boolean;     // Per-paragraph language detection
  waitForSelector?: string;            // Wait for element before translating (SPAs)
  
  // Subtitle
  subtitleHandler?: string;            // Platform subtitle handler name
  subtitleUrlRegExp?: string;          // Custom subtitle URL pattern
  
  // Display
  defaultTheme?: string;              // Override default theme
  translationPosition?: 'below' | 'above' | 'side';
}
```

### 11.2 Built-in Rules

```typescript
const BUILTIN_RULES: SiteRule[] = [
  // ---- Learning Platforms ----
  {
    id: 'udemy',
    hostname: ['www.udemy.com', 'udemy.com'],
    selectors: [
      '[data-purpose="safely-set-inner-html:description"]',
      '[data-purpose="course-description"]',
      '.ud-text-bold',
      '.curriculum-item-link--title',
    ],
    excludeSelectors: ['.ud-btn', '.ud-heading-serif'],
    subtitleHandler: 'udemy',
    subtitleUrlRegExp: 'api-2\\.0\\/.*\\/captions|\\.vtt',
  },
  {
    id: 'coursera',
    hostname: ['www.coursera.org', 'coursera.org'],
    selectors: [
      '[data-testid="description"]',
      '.content-inner',
      '.rc-CML',
    ],
    excludeSelectors: ['.rc-Rating', '.ratings-text'],
    subtitleHandler: 'coursera',
    subtitleUrlRegExp: 'asset\\.coursera\\.org.*\\.vtt|subtitles',
  },
  
  // ---- Video Platforms ----
  {
    id: 'youtube',
    hostname: ['www.youtube.com', 'youtube.com'],
    selectors: [
      '#content-text',              // Comments
      'yt-formatted-string.content', // Description
      'h1.ytd-video-primary-info-renderer',
    ],
    excludeSelectors: ['#subscribe-button', 'tp-yt-paper-button'],
    subtitleHandler: 'youtube',
    subtitleUrlRegExp: 'youtube\\.com\\/api\\/timedtext',
  },
  {
    id: 'netflix',
    hostname: ['www.netflix.com'],
    subtitleHandler: 'netflix',
    subtitleUrlRegExp: 'nflxvideo\\.net.*\\?o=',
  },
  
  // ---- Social / News ----
  {
    id: 'twitter',
    hostname: ['twitter.com', 'x.com'],
    selectors: ['[data-testid="tweetText"]'],
    excludeSelectors: ['[data-testid="User-Name"]'],
    detectLanguagePerNode: true,
  },
  {
    id: 'reddit',
    hostname: ['www.reddit.com', 'old.reddit.com'],
    selectors: [
      '[data-testid="comment"]',
      '.md',                       // Markdown content
      'h1',
    ],
    excludeSelectors: ['.flair', '.score'],
  },
  {
    id: 'github',
    hostname: ['github.com'],
    selectors: [
      '.markdown-body',
      '.comment-body',
      '.js-issue-title',
    ],
    excludeSelectors: [
      '.highlight',                // Code blocks
      'pre', 'code',
    ],
  },
  {
    id: 'hackernews',
    hostname: ['news.ycombinator.com'],
    selectors: ['.commtext', '.titleline a'],
  },
  {
    id: 'arxiv',
    hostname: ['arxiv.org'],
    selectors: ['.abstract', '.ltx_abstract', 'h1.title'],
    containerSelector: '#content',
  },
  {
    id: 'stackoverflow',
    hostname: ['stackoverflow.com'],
    selectors: ['.js-post-body', '.question-hyperlink', '.comment-copy'],
    excludeSelectors: ['pre', 'code', '.snippet-code'],
  },
  {
    id: 'medium',
    hostname: ['medium.com'],
    selectors: ['article p', 'article h1', 'article h2', 'article h3'],
    containerSelector: 'article',
  },
  {
    id: 'wikipedia',
    hostname: ['en.wikipedia.org', 'wikipedia.org'],
    containerSelector: '#mw-content-text',
    excludeSelectors: ['.reflist', '.navbox', '.infobox', '.toc'],
  },
];
```

---

## 12. Module 8: Popup & Settings UI

### 12.1 Popup Design (Quick Controls)

```
┌──────────────────────────────────────────┐
│  🌐 LinguaLens                    ⚙️ ✕  │
├──────────────────────────────────────────┤
│                                          │
│  ┌──────────────┐ ┌──────────────────┐   │
│  │ English  🔻  │ │  Vietnamese  🔻  │   │
│  │ (detected)   │ │  (target)        │   │
│  └──────────────┘ └──────────────────┘   │
│                                          │
│  Provider:                               │
│  ┌────────────────────────────────────┐  │
│  │ 🔹 OpenAI (gpt-4o-mini)      🔻  │  │
│  └────────────────────────────────────┘  │
│                                          │
│  ┌────────────────────────────────────┐  │
│  │   🔄 Translate This Page          │  │
│  └────────────────────────────────────┘  │
│                                          │
│  Display:  ◉ Bilingual  ○ Translation   │
│                                          │
│  Theme:    [  Blockquote  ▾  ]          │
│                                          │
│  Position: ◉ Below  ○ Above  ○ Side    │
│                                          │
│  ─────────────────────────────────────   │
│  Video Subtitles:                        │
│  ┌────────────────────────────────────┐  │
│  │   🎬 Translate Subtitles          │  │
│  └────────────────────────────────────┘  │
│                                          │
│  ─────────────────────────────────────   │
│  This site:                              │
│  ☐ Always translate                      │
│  ☐ Never translate                       │
│                                          │
│  Keyboard: Alt+A (page) Alt+S (subs)    │
└──────────────────────────────────────────┘
```

### 12.2 Options Page Sections

| Section | Contents |
|---------|---------|
| **General** | Target language, default service, display mode, theme |
| **Translation Provider** | OpenAI-compatible provider config: base URL, API key, model, presets dropdown (OpenAI/DeepSeek/Groq/Ollama/etc.), "Test Connection" button, custom system prompt |
| **Display Themes** | Live preview of all 15+ themes |
| **Site Rules** | Per-site settings, always/never translate lists |
| **Custom Dictionary** | Glossary entries (term → translation) |
| **Subtitles** | Default subtitle position, font size, opacity |
| **Keyboard Shortcuts** | Customizable keybindings |
| **Advanced** | Cache management, export/import settings, debug mode |

---

## 13. Module 9: Side Panel & Advanced Features

### 13.1 Side Panel Features

- **Full-page translation view**: Scrollable bilingual reading
- **Text selection translate**: Select text → see translation in side panel
- **Input box translation**: Type in one language, output in another
- **Translation history**: Recent translations with copy/share
- **Vocabulary collector**: Save words/phrases for review

### 13.2 Text Selection Translate

```typescript
document.addEventListener('mouseup', async (e) => {
  const selection = window.getSelection();
  if (!selection || selection.toString().trim().length < 2) return;
  
  const text = selection.toString().trim();
  const range = selection.getRangeAt(0);
  const rect = range.getBoundingClientRect();
  
  // Show floating translate button near selection
  showTranslateButton({
    x: rect.left + rect.width / 2,
    y: rect.top - 40,
    text
  });
});
```

### 13.3 Mouse Hover Translation

```typescript
let hoverTimer: number;

document.addEventListener('mouseover', (e) => {
  if (!config.hoverTranslateEnabled) return;
  
  const target = e.target as HTMLElement;
  const paragraph = target.closest('p, div, h1, h2, h3, h4, h5, h6, li, td');
  
  if (!paragraph || paragraph.hasAttribute('data-lingua-role')) return;
  
  hoverTimer = window.setTimeout(async () => {
    const text = paragraph.textContent?.trim();
    if (!text || text.length < 5) return;
    
    // Show inline translation below paragraph
    const translated = await translateText(text);
    showInlineTranslation(paragraph, translated);
  }, 300); // 300ms hover delay
});

document.addEventListener('mouseout', () => {
  clearTimeout(hoverTimer);
});
```

---

## 14. Display UX Deep Dive

### 14.1 Design Principles

1. **Non-intrusive**: Translation should never break page layout
2. **Scannable**: Users should be able to skim both languages quickly
3. **Contextual**: Translation appears next to the original, not in a separate panel
4. **Dismissable**: One click/key to toggle or remove translations
5. **Accessible**: Respect `prefers-reduced-motion`, `prefers-color-scheme`
6. **Performance**: CSS transitions, no layout thrashing, GPU-composited animations

### 14.2 Dark Mode Support

Every theme includes a `prefers-color-scheme: dark` variant:

```css
/* Auto dark mode */
@media (prefers-color-scheme: dark) {
  :root {
    --lingua-bg: #1e1e2e;
    --lingua-text: #cdd6f4;
    --lingua-accent: #89b4fa;
    --lingua-border: #45475a;
    --lingua-highlight: rgba(249, 226, 175, 0.15);
  }
}

/* Light mode */
:root {
  --lingua-bg: #ffffff;
  --lingua-text: #333333;
  --lingua-accent: #0077b6;
  --lingua-border: #e0e0e0;
  --lingua-highlight: rgba(255, 224, 102, 0.4);
}
```

### 14.3 Subtitle Display UX

```
┌──────────────────────────────────────────────────┐
│                                                   │
│                  VIDEO CONTENT                    │
│                                                   │
│                                                   │
│                                                   │
│                                                   │
│                                                   │
│     This is the original English subtitle         │  ← smaller, semi-transparent
│     Đây là phụ đề tiếng Việt đã dịch              │  ← larger, white on dark bg
│                                                   │
└──────────────────────────────────────────────────┘
```

**Subtitle font sizing options:**
- Small: Original 12px / Translation 14px
- Medium: Original 14px / Translation 18px (default)
- Large: Original 16px / Translation 22px

### 14.4 Loading State UX

While translation is in progress:

```css
[data-lingua-loading] {
  position: relative;
}

[data-lingua-loading]::after {
  content: '';
  position: absolute;
  bottom: 0;
  left: 0;
  width: 100%;
  height: 2px;
  background: linear-gradient(
    90deg,
    transparent,
    var(--lingua-accent),
    transparent
  );
  animation: lingua-loading 1.5s infinite;
}

@keyframes lingua-loading {
  0% { transform: translateX(-100%); }
  100% { transform: translateX(100%); }
}
```

### 14.5 Error State UX

```css
[data-lingua-error] {
  border-left: 3px solid #ef4444;
  padding-left: 8px;
  opacity: 0.7;
}

[data-lingua-error]::before {
  content: '⚠ Translation failed';
  display: block;
  font-size: 11px;
  color: #ef4444;
  margin-bottom: 2px;
}
```

---

## 15. Data Flow Diagrams

### 15.1 Page Translation Flow

```
User presses Alt+A (or clicks "Translate This Page")
         │
         ▼
┌─────────────────────┐
│ Content Script       │
│                      │
│ 1. Get site rules    │──── Check siteRules for hostname
│ 2. Walk DOM          │──── domWalker.getPieces(container)
│ 3. Viewport check    │──── IntersectionObserver
│ 4. Batch pieces      │──── textSplitter (≤800 chars/batch)
│ 5. Send to BG        │──── chrome.runtime.sendMessage
└──────────┬───────────┘
           │
           ▼
┌─────────────────────┐
│ Background Worker    │
│                      │
│ 1. Check cache       │──── IndexedDB lookup
│ 2. Deduplicate       │──── Skip in-flight duplicates
│ 3. Call API          │──── OpenAI-compatible provider
│ 4. Cache result      │──── Write to IndexedDB
│ 5. Return            │──── chrome.tabs.sendMessage
└──────────┬───────────┘
           │
           ▼
┌─────────────────────┐
│ Content Script       │
│                      │
│ 1. Clone original    │──── cloneNode(true) + notranslate
│ 2. Inject translation│──── createElement('font')
│ 3. Apply theme       │──── data-lingua-theme="paper"
│ 4. Set state         │──── html[data-lingua-state="dual"]
│ 5. Setup restore     │──── Track for undo
└─────────────────────┘
```

### 15.2 Subtitle Translation Flow

```
Video player requests subtitle file
         │
         ▼
┌─────────────────────┐
│ Inject Script (MAIN) │
│                      │
│ 1. XHR.open() hook  │──── Check if URL matches subtitle pattern
│ 2. Intercept request │──── Prevent original response
│ 3. postMessage       │──── Send to content script
└──────────┬───────────┘
           │ window.postMessage
           ▼
┌─────────────────────┐
│ Content Script       │
│                      │
│ 1. Fetch subtitle    │──── Download original VTT/SRT
│ 2. Parse cues        │──── parseWebVTT()
│ 3. Send to BG        │──── Batch translate cue texts
└──────────┬───────────┘
           │
           ▼
┌─────────────────────┐
│ Background Worker    │
│                      │
│ 1. Translate all cues│──── Using selected service
│ 2. Return results    │
└──────────┬───────────┘
           │
           ▼
┌─────────────────────┐
│ Content Script       │
│                      │
│ 1. Build bilingual   │──── buildBilingualVTT()
│ 2. postMessage back  │──── Return to inject script
└──────────┬───────────┘
           │ window.postMessage
           ▼
┌─────────────────────┐
│ Inject Script (MAIN) │
│                      │
│ 1. Override response │──── xhr.responseText = bilingual
│ 2. Player renders    │──── Dual subtitles shown!
└─────────────────────┘
```

---

## 16. Phased Delivery Roadmap

> **Last Audit:** 2026-04-10 | **Overall Progress: ~70%** (29 done, 2 partial, 11 not started / 42 total tasks)

### Phase 1: Foundation (Weeks 1-3) — ✅ 100% COMPLETE
**Goal: Basic page translation with bilingual display**
*Archived as Conductor track `phase1-foundation_20260409` on 2026-04-09.*

| Task | Priority | Effort | Status | Implementation |
|------|----------|--------|--------|----------------|
| Project setup (Vite + WXT + TypeScript) | P0 | 2 days | ✅ Done | `wxt.config.ts`, `package.json`, `vitest.config.ts` |
| Manifest V3 skeleton | P0 | 1 day | ✅ Done | WXT manifest w/ storage, activeTab, contextMenus, sidePanel |
| DOM walker / paragraph detection | P0 | 3 days | ✅ Done | `content/domWalker.ts` — TreeWalker + sentence splitting |
| OpenAI-compatible service + presets | P0 | 2 days | ✅ Done | `services/openaiCompatible.ts`, `services/base.ts`, 8 presets |
| Basic bilingual display (1 theme) | P0 | 2 days | ✅ Done | `content/translationDisplay.ts` + `styles/inject.css` (Dividing Line) |
| Simple popup UI (translate button) | P0 | 2 days | ✅ Done | `entrypoints/popup/App.tsx` — React w/ toggle, language pickers |
| Viewport-based lazy loading | P0 | 1 day | ✅ Done | `content/viewportObserver.ts` — IntersectionObserver + 200px margin |
| MutationObserver for SPAs | P1 | 1 day | ✅ Done | `content/mutationWatcher.ts` — debounced + dedup |
| Translation cache (IndexedDB) | P1 | 2 days | ✅ Done | `services/cacheManager.ts` — idb-keyval, SHA-256, TTL, LRU |
| Restore/undo translation | P1 | 1 day | ✅ Done | `removeAllTranslations()` + `stopTranslation()` |
| **Subtotal** | | **~17 days** | **10/10** | |

**Bonus deliverables:** Request batcher (`services/batcher.ts`), background message router (`services/background.ts`), 9 unit test files, 35+ languages, full type system (4 files in `types/`).

### Phase 2: Video Subtitles (Weeks 4-6) — ✅ 100% COMPLETE
**Goal: Subtitle translation on Udemy, Coursera, YouTube**
*Archived as Conductor track `phase2-subtitles_20260409` on 2026-04-09.*

| Task | Priority | Effort | Status | Implementation |
|------|----------|--------|--------|----------------|
| Page-context script injection (MAIN world) | P0 | 2 days | ✅ Done | `entrypoints/inject.content/index.ts` — WXT MAIN world injection |
| XHR/fetch interceptor | P0 | 3 days | ✅ Done | `inject/xhrInterceptor.ts`, `inject/fetchInterceptor.ts` |
| postMessage bridge (inject ↔ content) | P0 | 1 day | ✅ Done | `content/messageBridge.ts`, `inject/messageBridge.ts` |
| WebVTT parser | P0 | 1 day | ✅ Done | `lib/subtitleParser.ts` — parseWebVTT(), parseSRT(), auto-detect |
| Bilingual VTT builder | P0 | 1 day | ✅ Done | `lib/subtitleBuilder.ts` — buildBilingualVTT(), buildTranslationOnlyVTT() |
| YouTube subtitle handler | P0 | 2 days | ✅ Done | `inject/subtitleHandlers/youtube.ts` — srv3/JSON3 parsing |
| Udemy subtitle handler | P0 | 3 days | ✅ Done | `inject/subtitleHandlers/udemy.ts` — VTT pattern matching |
| Coursera subtitle handler | P0 | 3 days | ✅ Done | `inject/subtitleHandlers/coursera.ts` — subtitle URL matching |
| Custom subtitle overlay (fallback) | P1 | 2 days | ✅ Done | `content/subtitleOverlay.ts` — video sync, fullscreen support |
| Subtitle styling (font size, position) | P1 | 1 day | ✅ Done | `content/subtitleControls.ts`, `styles/subtitle.css` |
| **Subtotal** | | **~19 days** | **10/10** | |

**Bonus deliverables:** Handler registry (`inject/subtitleHandlers/registry.ts`), subtitle coordinator (`content/subtitleCoordinator.ts`), 10 unit test files for subtitle modules.

### Phase 3: UX Polish & LLM Provider (Weeks 7-9) — ✅ 100% COMPLETE
**Goal: Premium display, OpenAI-compatible provider, settings**
*Archived as Conductor track `phase3-ux-polish_20260410` on 2026-04-10.*

| Task | Priority | Effort | Status | Implementation |
|------|----------|--------|--------|----------------|
| All 15+ visual themes | P0 | 3 days | ✅ Done | `styles/inject.css` — 16 themes (dividing-line, highlight, underline, wavy, dotted, dashed, mask, thinMask, opacity, blur, paper, blockquote, neon, gradientBorder, fadein, sideBySide) |
| Dark mode support | P0 | 1 day | ✅ Done | `@media (prefers-color-scheme: dark)` + `.lingua-dark` class + `data-lingua-state` attribute |
| "Test Connection" button + provider validation | P0 | 0.5 day | ✅ Done | `services/providerTester.ts` — 3-step validation (ping → models → translation) with progress callback |
| Custom system prompt editor | P1 | 0.5 day | ✅ Done | Template variable injection (`{{targetLanguage}}`, `{{glossary}}`) via regex replace in `services/base.ts` |
| Full popup UI (React) | P0 | 3 days | ✅ Done | `entrypoints/popup/App.tsx` — enhanced with quick settings, theme/provider/position selectors, integration status |
| Options page (React) with provider config | P0 | 4 days | ✅ Done | `entrypoints/options/` — 8-tab vertical layout (General, Provider, Themes, Site Rules, Dictionary, Subtitles, Shortcuts, Advanced) |
| Site rules editor | P1 | 2 days | ✅ Done | Site rules section in Options page |
| Custom dictionary/glossary | P1 | 2 days | ✅ Done | Dictionary section in Options page |
| Loading/error state UX | P0 | 1 day | ✅ Done | CSS shimmer animation + error indicators via `data-lingua-loading` / `data-lingua-error` attributes |
| **Subtotal** | | **~17 days** | **9/9** | |

**Bonus deliverables:** Zustand settings store (`stores/settingsStore.ts`) with chrome.storage bidirectional sync, provider presets array, type system extensions (`types/config.ts`), 5 new test files.

### Phase 4: Advanced Features (Weeks 10-12) — 🟡 ~8% PARTIAL
**Goal: Power user features, polish, launch**

| Task | Priority | Effort | Status | Notes |
|------|----------|--------|--------|-------|
| Text selection translate popup | P1 | 2 days | ❌ | |
| Mouse hover translate | P1 | 2 days | ❌ | |
| Side panel reading view | P2 | 3 days | ❌ | `sidePanel` permission declared only in manifest |
| Keyboard shortcuts (all 10+) | P1 | 1 day | ❌ | |
| Context menu integration | P1 | 1 day | ❌ | `contextMenus` permission declared only in manifest |
| Netflix subtitle handler | P2 | 3 days | ❌ | |
| Input box translation (Alt+I) | P2 | 2 days | ❌ | |
| 50+ built-in site rules | P1 | 3 days | ❌ | |
| Performance optimization | P0 | 2 days | ❌ | |
| Unit tests (Vitest) | P0 | 3 days | 🟡 Partial | 24 test files covering Phase 1, 2, 3 modules (283 tests) |
| E2E tests (Playwright) | P1 | 3 days | ❌ | No Playwright setup |
| Chrome Web Store packaging | P0 | 1 day | 🟡 Partial | `npm run zip` script exists via WXT framework |
| Documentation | P1 | 2 days | ❌ | |
| **Subtotal** | | **~28 days** | **0+2🟡/13** | |

### Total Estimated Effort: ~81 working days (~16 weeks)

### Progress Summary

```
Phase 1 ██████████████████████████████ 100%  ← COMPLETE
Phase 2 ██████████████████████████████ 100%  ← COMPLETE
Phase 3 ██████████████████████████████ 100%  ← COMPLETE
Phase 4 ██░░░░░░░░░░░░░░░░░░░░░░░░░░░░   8%  ← partial foundations
Overall █████████████████████░░░░░░░░░  70%
```

---

## 17. Testing Strategy

### 17.1 Unit Tests

| Module | Test Focus |
|--------|-----------|
| `domWalker` | Paragraph detection on various HTML structures |
| `subtitleParser` | WebVTT/SRT parsing edge cases |
| `textSplitter` | Batching at character limits, sentence boundaries |
| `translationService` | API response parsing, error handling |
| `glossaryProtector` | Placeholder insertion/restoration |
| `cacheManager` | Cache hit/miss, TTL, eviction |
| `siteRules` | Rule matching by hostname/URL pattern |

### 17.2 E2E Tests (Playwright + Chrome Extension)

```typescript
// Example E2E test
test('translates Wikipedia article bilingually', async ({ page }) => {
  await page.goto('https://en.wikipedia.org/wiki/Machine_learning');
  
  // Trigger translation
  await page.keyboard.press('Alt+A');
  
  // Wait for translations to appear
  await page.waitForSelector('[data-lingua-role="translation"]');
  
  // Verify bilingual display
  const original = await page.$('[data-lingua-role="original"]');
  const translated = await page.$('[data-lingua-role="translation"]');
  
  expect(original).toBeTruthy();
  expect(translated).toBeTruthy();
  expect(await translated!.isVisible()).toBe(true);
});
```

### 17.3 Manual Testing Matrix

| Browser | Page Trans. | Subtitles | Popup | Options |
|---------|------------|-----------|-------|---------|
| Chrome Stable | ✓ | ✓ | ✓ | ✓ |
| Chrome Beta | ✓ | ✓ | ✓ | ✓ |
| Edge | ✓ | ✓ | ✓ | ✓ |
| Brave | ✓ | ✓ | ✓ | ✓ |

---

## 18. Security Considerations

| Concern | Mitigation |
|---------|-----------|
| **API keys exposure** | Stored in `chrome.storage.local` (encrypted at rest by Chrome), never in content scripts |
| **XSS via translation** | All translated text inserted via `textContent`, not `innerHTML`; HTML is sanitized with DOMPurify |
| **MAIN world script** | Minimal scope: only XHR/fetch hooks, no access to extension APIs |
| **CORS** | Translations routed through background worker (has host permissions) |
| **Incognito privacy** | Cache disabled in incognito; no telemetry |
| **Content Security Policy** | Extension pages: `script-src 'self'` only |
| **Third-party API data** | Only selected text sent to APIs; no full page content |

---

## 19. Performance Budget

| Metric | Target |
|--------|--------|
| Content script init time | < 50ms |
| First translation visible | < 1.5s (from trigger) |
| Memory overhead (idle) | < 5MB |
| Memory overhead (translating) | < 30MB |
| DOM mutations per translation | < 2 per paragraph |
| Cache lookup time | < 5ms |
| Subtitle translation latency | < 2s for full VTT file |
| CPU usage (idle) | < 0.1% |
| Extension package size | < 2MB |

**Optimization Techniques:**
- Viewport-based lazy loading (don't translate off-screen content)
- Request deduplication (same text = one API call)
- IndexedDB cache (avoid re-translating)
- CSS-only animations (no JS animation loops)
- `requestIdleCallback` for non-critical DOM updates
- Batch DOM writes in a single `requestAnimationFrame`

---

## 20. Risk Matrix & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| **LLM API rate limiting / costs** | Medium | Medium | Aggressive IndexedDB caching, request deduplication, user controls batch size |
| **Udemy/Coursera changing their API** | Medium | High | Abstract handlers, use generic WebVTT fallback, test weekly |
| **Chrome MV3 breaking changes** | Low | High | Follow Chrome release notes, use WXT framework for compatibility |
| **User misconfigures provider** | Medium | Low | "Test Connection" button, clear error messages, preset configs for common providers |
| **Large pages causing lag** | Medium | Medium | Viewport lazy loading, batch size limits, abort controller for navigation |
| **Shadow DOM (Web Components)** | Medium | Low | Traverse `shadowRoot` when available |
| **iframes** | Medium | Medium | `all_frames: true` in manifest; cross-origin iframes need separate injection |
| **CSP on certain pages** | Low | Medium | Inject via `web_accessible_resources` with dynamic URLs |
| **CORS restrictions for subtitle fetch** | Medium | High | Route through background worker; use `host_permissions` |

---

## Appendix A: Message Protocol Types

```typescript
// Content Script ↔ Background Messages
type Message =
  | { type: 'TRANSLATE_BATCH'; texts: string[]; srcLang: string; tgtLang: string; service: string }
  | { type: 'TRANSLATION_RESULT'; translations: string[]; cacheHits: number }
  | { type: 'DETECT_LANGUAGE'; text: string }
  | { type: 'LANGUAGE_DETECTED'; language: string }
  | { type: 'GET_CONFIG' }
  | { type: 'CONFIG_RESPONSE'; config: ExtensionConfig }
  | { type: 'UPDATE_CONFIG'; changes: Partial<ExtensionConfig> }
  | { type: 'TRANSLATE_SUBTITLE'; url: string; format: 'vtt' | 'srt' | 'srv3'; tgtLang: string }
  | { type: 'SUBTITLE_TRANSLATED'; bilingualContent: string }
  | { type: 'CLEAR_CACHE' }
  | { type: 'GET_CACHE_STATS'; stats: { entries: number; sizeBytes: number } };

// Inject Script ↔ Content Script Messages (postMessage)
type InjectMessage =
  | { channel: 'lingua-lens'; type: 'SUBTITLE_INTERCEPTED'; url: string; responseText: string; requestId: string }
  | { channel: 'lingua-lens'; type: 'SUBTITLE_TRANSLATED'; content: string; requestId: string }
  | { channel: 'lingua-lens'; type: 'SUBTITLE_METADATA'; platform: string; captions: CaptionInfo[] };
```

## Appendix B: Language Code Reference

Supporting 100+ language pairs. Priority languages:

| Code | Language | Notes |
|------|---------|-------|
| `en` | English | All LLMs |
| `vi` | Vietnamese | All LLMs |
| `zh-CN` | Chinese (Simplified) | All LLMs |
| `zh-TW` | Chinese (Traditional) | All LLMs |
| `ja` | Japanese | All LLMs |
| `ko` | Korean | All LLMs |
| `es` | Spanish | All LLMs |
| `fr` | French | All LLMs |
| `de` | German | All LLMs |
| `pt` | Portuguese | All LLMs |
| `ru` | Russian | All LLMs |
| `ar` | Arabic | All LLMs |
| `hi` | Hindi | All LLMs |
| `th` | Thai | All LLMs |

> **Note:** Language support depends entirely on the user's chosen LLM. Modern models (GPT-4o, DeepSeek, Llama 3, Qwen) support 100+ languages natively. The extension sends the target language name in the system prompt — no language-specific code is needed.

---

## Appendix C: Quick Start Development Commands

```bash
# Setup
git clone <repo>
cd lingua-lens
npm install

# Development (with hot reload)
npm run dev           # Builds + watches
# Load dist/ as unpacked extension in chrome://extensions

# Build for production
npm run build         # Output in dist/

# Run tests
npm run test          # Vitest unit tests
npm run test:e2e      # Playwright E2E tests

# Lint
npm run lint
npm run lint:fix

# Package for Chrome Web Store
npm run package       # Creates lingua-lens.zip
```

---

*Plan Version: 1.5 | Created: April 2026 | Updated: April 10, 2026 | Status: Phase 3 Complete — Phase 4 Next*
*Change: Conductor refresh — Phase 3 archived (16 themes, options page, provider tester), 283 tests, 346KB build.*
