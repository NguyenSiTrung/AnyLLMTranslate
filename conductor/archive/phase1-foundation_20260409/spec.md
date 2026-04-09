# Spec: LinguaLens Phase 1 — Foundation

## Overview

Implement the foundational layer of the LinguaLens Chrome extension: a working end-to-end pipeline from DOM text detection → LLM translation → bilingual display. This phase delivers a functional extension that can translate any web page using any OpenAI-compatible API endpoint, with a simple popup UI to control translation.

## Functional Requirements

### FR-1: Project Scaffolding
- Initialize WXT project with TypeScript, React 18, Vite 6 in the repo root
- Configure Manifest V3 with required permissions: `storage`, `activeTab`, `contextMenus`, `sidePanel`
- Set up build tooling: pnpm, ESLint, Prettier, Vitest
- Add Tailwind CSS 4 for extension UI (popup), CSS custom properties for host-page injection
- Establish project structure per plan (src/background, src/content, src/services, src/ui, src/lib, src/types, src/styles)

### FR-2: DOM Walker & Paragraph Detection
- Implement `domWalker.ts` — TreeWalker-based algorithm that identifies translatable text segments
- Atomic unit: paragraph (block elements split pieces, inline elements stay within)
- Element classification: BLOCK_ELEMENTS, SKIP_ELEMENTS, INLINE_ELEMENTS sets
- Pre-filters: skip `translate="no"`, `.notranslate`, `contentEditable`, extension-injected nodes
- Size cap: split pieces exceeding 1,000 chars at sentence boundaries
- Return `TranslationPiece[]` with id, parentElement, textNodes, originalHTML

### FR-3: OpenAI-Compatible Translation Service
- Implement `openaiCompatible.ts` — single universal provider for any `/v1/chat/completions` endpoint
- Config: `baseUrl`, `apiKey`, `model`, `temperature` (default 0.3), `maxTokens` (default 4096)
- Built-in presets: OpenAI, DeepSeek, Groq, Ollama, LM Studio, Together AI, Mistral, OpenRouter, Custom
- JSON-mode response parsing with fallback handling
- Request batching via `TranslationBatcher` — deduplication, in-flight tracking, batch splitting by `maxBatchChars`
- `testConnection()` method for settings validation
- **All API calls routed through background service worker** (MV3 CORS compliance + API key security)

### FR-4: Background Service Worker
- Message router: receives translation requests from content script via `chrome.runtime.sendMessage`
- Routes to OpenAI-compatible service, returns results
- Manages translation state per tab (idle, translating, done, error)
- Settings persistence via `chrome.storage.local`

### FR-5: Bilingual Display (Dividing Line Theme)
- Implement `translationDisplay.ts` — DOM injection of translated content
- Default theme: **Dividing Line** (`border-top: 1px solid #e2e2e2; margin-top: 4px; padding-top: 4px`)
- Data attributes: `data-lingua-role="original"`, `data-lingua-role="translation"`
- Page-level state via `html[data-lingua-state]`: `dual`, `translation-only`, `off`
- Theme CSS via `inject.css` with CSS custom properties for future extensibility
- Display modes: bilingual-below (default), translation-only
- Dark mode support via `@media (prefers-color-scheme: dark)`

### FR-6: Simple Popup UI
- React-based popup with translate toggle button
- Language picker: source (auto-detect + manual) and target language selection
- Translation status indicator (idle / translating / done / error)
- Provider indicator showing active LLM provider name
- Quick settings link to options page (stub for Phase 1)

### FR-7: Viewport-Based Lazy Translation
- Implement `viewportObserver.ts` using `IntersectionObserver`
- Pre-translate 200px ahead of viewport (`rootMargin: '200px'`)
- Only translate pieces entering the viewport — no full-page translation upfront
- Batch visible pieces and send to translation service

### FR-8: SPA / Dynamic Content Support
- Implement `mutationWatcher.ts` using `MutationObserver`
- Watch `document.body` for `childList` + `subtree` mutations
- Filter: only process block elements, skip extension-injected nodes (`data-lingua-translated`)
- Debounce: process new nodes every 500ms via `scheduleTranslation()`

### FR-9: Translation Cache (IndexedDB)
- Implement `cacheManager.ts` using `idb-keyval` or raw IndexedDB
- Database: `lingua-lens-cache`, Object Store: `translations`
- Cache key: `SHA-256(service + ":" + srcLang + ":" + tgtLang + ":" + text)`
- Write-through caching — results cached immediately after successful translation
- TTL: 30 days default
- LRU eviction when cache exceeds 100MB
- Cache lookup integrated into translation pipeline (check cache → call API if miss → write cache)

### FR-10: Restore/Undo Translation
- Implement `restoreManager.ts`
- Store `originalHTML` in each `TranslationPiece` before translation
- Full page restore: remove all `[data-lingua-role="translation"]` nodes, restore originals
- Toggle support: dual → off → dual cycle via popup button or keyboard shortcut
- Clean up `data-lingua-state` attribute on restore

## Non-Functional Requirements

- **Performance**: Translation of visible content < 2s, DOM injection overhead < 50ms
- **Bundle size**: Extension < 5MB total
- **TypeScript strict mode**: No `any` leaks
- **Test coverage**: Unit tests for domWalker, translation service, cache manager (≥ 80%)
- **No host page pollution**: Extension CSS must not affect host page styles
- **MV3 compliance**: No `eval()`, no remote code, service worker only

## Acceptance Criteria

1. ✅ Extension loads in Chrome (`chrome://extensions` → Load unpacked)
2. ✅ Popup shows translate button, language pickers, status indicator
3. ✅ Clicking "Translate" on any text-heavy page (e.g., Wikipedia, Medium) produces bilingual display
4. ✅ Translation appears below original paragraphs with dividing line theme
5. ✅ Works with at least one provider: Ollama local (`localhost:11434`) or OpenAI API
6. ✅ Only visible content is translated initially; scrolling triggers more translations
7. ✅ SPA navigation (e.g., on Next.js or React sites) triggers translation of new content
8. ✅ Second visit to same page serves translations from IndexedDB cache (no API call)
9. ✅ "Restore" removes all translations and returns page to original state
10. ✅ All unit tests passing, lint clean

## Out of Scope

- Multiple visual themes (Phase 3 — only Dividing Line in Phase 1)
- Video subtitle translation (Phase 2)
- Options page / full settings UI (Phase 3)
- Text selection translate, hover translate (Phase 4)
- Side panel (Phase 4)
- Site-specific rules (Phase 3)
- Glossary/term protection (Phase 3)
- Context menu integration (Phase 4)
- Keyboard shortcuts beyond basic toggle (Phase 4)
