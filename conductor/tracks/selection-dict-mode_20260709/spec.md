# Spec: Selection Translate — Dictionary Mode

**Track ID:** `selection-dict-mode_20260709`  
**Type:** Feature  
**Priority:** High (learner-facing Immersive parity gap)

## Overview

Upgrade text-selection translate so short selections (especially single words) show an Immersive-style **dictionary popup** — phonetics, part of speech, definitions, examples, and contextual analysis — while longer phrases/sentences keep a **translation-only** result.

Today, `content/textSelection.ts` + `handleTranslateSelection` only return a plain string. This track adds structured selection prompts, JSON parsing, context extraction, dual UI layouts, caching separation, and a minimal settings toggle — all on the existing BYOK provider pool.

## Functional Requirements

### FR-1: Input classification (client heuristic)
- **FR-1.1**: Treat selection as **word-mode candidate** when it is short (default: ≤ 3 whitespace-separated tokens, or a single CJK/Latin token), trimmed, and does not end with sentence punctuation (`.?!。？！` and similar).
- **FR-1.2**: All other selections use **sentence-mode** (plain translation path).
- **FR-1.3**: Classification is pure and unit-tested; thresholds may live as named constants.

### FR-2: Selection prompts
- **FR-2.1**: Word-mode uses a dedicated **dictionary system prompt** (Immersive-aligned): single word → dictionary JSON; phrase/sentence → `{ "translation" }` only; explanations in target language; phonetics for source language; inject `{{from}}`, `{{to}}`, `{{text}}`, `{{context_text}}`.
- **FR-2.2**: Sentence-mode reuses the existing translation path (or a thin selection sentence prompt if needed) returning plain translation text.
- **FR-2.3**: Dictionary prompt must not replace the global page/subtitle system prompt for non-selection paths.

### FR-3: Context extraction
- **FR-3.1**: When word-mode runs, extract surrounding context from the selection’s DOM range (parent sentence/paragraph, capped length, e.g. ~200–400 chars).
- **FR-3.2**: Context is DOM-only (no extra network); empty context is allowed if extraction fails.

### FR-4: Structured response contract
Word-mode expects JSON (raw, no markdown fences preferred; sanitizer must strip fences if present):

```json
{
  "phonetic": "/həˈloʊ/",
  "definitions": [
    {
      "pos": "excl.",
      "meaning": "...",
      "example": { "source": "...", "target": "..." }
    }
  ],
  "translation": "...",
  "contextual_analysis": "..."
}
```

- **FR-4.1**: Parser is pure, tolerant of partial fields.
- **FR-4.2**: **Fail-open:** invalid/empty JSON or missing usable fields → treat as plain translation (raw model text or best-effort `translation` extract) so the popup is never empty solely due to schema failure.
- **FR-4.3**: Sentence-mode response remains a plain string (existing behavior).

### FR-5: Background / messaging
- **FR-5.1**: Extend selection translate API so word-mode can return structured data (e.g. `mode: 'dictionary' | 'sentence'`, optional `dictionary` payload, always a displayable `translatedText` fallback).
- **FR-5.2**: Use existing `initService()` / provider pool; no separate dictionary provider.
- **FR-5.3**: Glossary still applies where it does today for selection on the sentence path; dictionary path may omit glossary injection to avoid prompt noise (document in implementation).
- **FR-5.4**: **Shared-message safety:** `translateSelection` is also used by hover and inline translate. Dictionary behavior is **opt-in per request** only when the caller sets an explicit flag (e.g. `dictionaryMode: true`). Hover/inline must remain plain translation.

### FR-6: UI — dual layouts in selection tooltip
- **FR-6.1**: **Dictionary layout** when response has `phonetic` and/or non-empty `definitions`: original word, phonetic, POS + meanings, examples, primary translation, contextual analysis, copy (of translation or primary meaning), close.
- **FR-6.2**: **Sentence layout** when dictionary fields are absent: existing plain translation tooltip.
- **FR-6.3**: Loading and error states remain; session race protection (`selectionSession`) preserved.
- **FR-6.4**: Styles scoped under existing selection tooltip classes; no host-page CSS pollution; dark mode compatible.

### FR-7: Settings
- **FR-7.1**: Setting `selectionDictionaryEnabled` (name may match codebase conventions), default **`true`**.
- **FR-7.2**: When off, selection always uses plain translation (current behavior).
- **FR-7.3**: Minimal Options surface (e.g. General or Advanced — prefer near existing text-selection toggle if present; otherwise Advanced).

### FR-8: Caching
- **FR-8.1**: Dictionary results must not collide with plain translation cache entries (namespace prefix or key suffix including mode / prompt version).
- **FR-8.2**: Sentence path keeps existing cache behavior.

### FR-9: Tests
- Heuristic classification unit tests.
- JSON parse/sanitize + fail-open unit tests.
- Prompt builder unit tests (variables substituted; dictionary prompt isolated from page prompt).
- Background handler tests for both modes.
- UI/render tests for dictionary vs sentence branches (and invalid JSON fallback).

## Non-Functional Requirements

- **NFR-1**: Fail-open UX — never blank popup only because JSON parse failed.
- **NFR-2**: TypeScript strict; named exports; no `any` leaks.
- **NFR-3**: Selection latency should remain acceptable; dictionary responses may be larger — cap max tokens reasonably if we set generation params for this path.
- **NFR-4**: All new logic unit-tested (AAA); `pnpm test` + `pnpm lint` green at phase ends.
- **NFR-5**: MV3-safe messaging; no new host permissions for v1.

## Acceptance Criteria

1. Select a single English word → popup shows dictionary-style content (phonetic and/or definitions + translation) when the model returns valid structure.
2. Select a multi-sentence paragraph → popup shows translation only (no forced dictionary dump).
3. Short idiom/phrase that returns dictionary fields → dictionary UI; otherwise sentence UI.
4. Surrounding context is passed into the word-mode prompt when extractable.
5. Invalid model JSON → still shows a usable translation string.
6. Toggle off dictionary mode → plain selection translate as today.
7. Cache for dictionary and plain translation do not overwrite each other.
8. Existing selection button, positioning, copy/close, session race guard, and Alt+D toggle still work.
9. Hover and inline translate still receive plain translation only (no accidental dictionary mode).
10. Tests cover FR-1, FR-4, FR-5, FR-6 branches; suite + lint pass.

## Out of Scope

- TTS / auto-read / speak buttons
- External dictionary APIs (Youdao, Bing Dict, etc.)
- Offline / local word database
- Separate pro/free model routing for selection
- Immersive power-user long-reading panels
- Changing page bilingual translation or hover-translate into dictionary mode
- Redesign of non-selection tooltips

## Technical Notes (non-binding)

- Primary touchpoints: `content/textSelection.ts`, `styles/tooltip.css`, `services/background.ts` (`handleTranslateSelection`), `types/` message + settings types, `lib/config` defaults, pure helpers under `lib/` (e.g. `selectionDictionary.ts`, `selectionContext.ts`, `selectionClassify.ts`).
- Prefer pure parse/classify/prompt helpers for TDD; keep DOM rendering in content script.
- Reference: Immersive `generalRule.selectionTranslation.prompts` + `.word-dictionary*` UI patterns (extension dump under `ImmersiveTransalteExtensionCode/`).
