# Spec: Custom Theme Builder & Context-Aware Translation

## Overview

Two features that enhance AnyLLMTranslate's customization and translation quality:

1. **Custom Theme Builder** — A 17th "Custom" theme option that lets users design their own translation visual style via color pickers and controls, with live preview using the existing `ThemePreview` component.
2. **Context-Aware Translation** — Injects page metadata (title, description, domain) into the LLM system prompt so translations maintain consistent terminology across chunks. Optionally auto-detects page category for richer context.

## Functional Requirements

### FR-1: Custom Theme Builder

#### FR-1.1: Custom Theme Card in Gallery
- Add a 17th entry to the `THEMES` array in `ThemesSection.tsx` with `id: 'custom'`
- Card displays a paintbrush/palette icon (🎨) with label "Custom" and description "Design your own"
- Card preview area shows a dynamic mini-preview reflecting current custom settings
- Selecting the "Custom" card sets `settings.theme = 'custom'` via `updateSettings()`

#### FR-1.2: Custom Theme Editor Panel
- When `theme === 'custom'`, a collapsible editor panel appears below the theme grid (above or replacing ThemePreview position)
- Editor controls (6 properties):
  - **Translation text color** — color picker input, default `#555555`
  - **Translation background color** — color picker input, default `transparent`
  - **Border style** — select dropdown: `none`, `solid`, `dashed`, `dotted`, default `solid`
  - **Border color** — color picker input, default `#3b82f6`
  - **Font style** — select dropdown: `normal`, `italic`, default `normal`
  - **Font size** — select dropdown: `smaller` (0.9em), `same` (inherit), `larger` (1.1em), default `same`
- All changes auto-save to `chrome.storage.local` under `customTheme` key in settings
- Changes reflect immediately in the `ThemePreview` component above

#### FR-1.3: Settings Data Model
- Add `customTheme` field to `ExtensionSettings` interface:
  ```typescript
  customTheme?: {
    textColor: string;
    backgroundColor: string;
    borderStyle: 'none' | 'solid' | 'dashed' | 'dotted';
    borderColor: string;
    fontStyle: 'normal' | 'italic';
    fontSize: 'smaller' | 'same' | 'larger';
  };
  ```
- Add `'custom'` to the `ThemeName` union type
- Add default values to `DEFAULT_SETTINGS`

#### FR-1.4: CSS Implementation
- Add a `[data-anyllm-theme="custom"]` rule block in `inject.css` that reads from CSS custom properties:
  ```css
  [data-anyllm-theme="custom"] .anyllm-translate-translation {
    color: var(--anyllm-custom-text-color, #555);
    background: var(--anyllm-custom-bg-color, transparent);
    border-left: 3px var(--anyllm-custom-border-style, solid) var(--anyllm-custom-border-color, #3b82f6);
    font-style: var(--anyllm-custom-font-style, normal);
    font-size: var(--anyllm-custom-font-size, inherit);
    padding-left: 12px;
    margin-top: 6px;
  }
  ```
- Content script sets CSS custom properties on `<html>` element when custom theme is active, reading values from `settings.customTheme`
- Dark mode variant: auto-adjusts opacity/lightness if needed, or uses same values (user controls both)

#### FR-1.5: ThemePreview Integration
- `ThemePreview` component already reads `settings.theme` and sets `data-anyllm-theme` attribute
- When `theme === 'custom'`, ThemePreview also applies the CSS custom properties from `settings.customTheme` to its preview container
- Preview updates reactively as user adjusts color pickers

#### FR-1.6: Reset to Default
- "Reset to defaults" button in the custom editor panel
- Resets `customTheme` to default values without changing `theme` away from `'custom'`

### FR-2: Context-Aware Translation (Page Topic Detection)

#### FR-2.1: Page Context Extraction
- New utility function `extractPageContext(document: Document): PageContext`:
  ```typescript
  interface PageContext {
    title: string;           // document.title, truncated to 100 chars
    description: string;     // meta[name="description"] content, truncated to 200 chars
    domain: string;          // window.location.hostname
    category?: string;       // optional auto-detected category
  }
  ```
- Extract in content script before starting translation
- Pass `PageContext` through the `TRANSLATE` message to background service worker

#### FR-2.2: System Prompt Enrichment
- Modify `buildSystemPrompt()` in `services/base.ts` to accept an optional `pageContext?: PageContext` parameter
- Append context block to system prompt after the main instruction:
  ```
  Page context for consistent terminology:
  - Title: {title}
  - Topic: {description}
  - Domain: {domain}
  ```
- Only include non-empty fields
- If all fields are empty, do not append context block
- Total context addition target: <100 tokens

#### FR-2.3: Category Auto-Detection (Optional)
- New setting `enablePageCategoryDetection: boolean` (default: `false`)
- When enabled, `extractPageContext()` also runs a lightweight heuristic:
  - Check URL patterns: `github.com` → "software development", `arxiv.org` → "academic research", `stackoverflow.com` → "programming Q&A"
  - Check `<meta>` keywords if available
  - Fallback: analyze first `<h1>` text
- Hardcoded category map for top 20-30 domains (no LLM call for detection)
- Category appended to context block: `- Category: {category}`

#### FR-2.4: Settings Toggle
- Add toggle in **Advanced section** of Options page:
  - Label: "Page Category Detection"
  - Description: "Auto-detect page topic for more consistent translations. Adds ~20 tokens per request."
  - Default: OFF

#### FR-2.5: Message Protocol Update
- Extend the `TRANSLATE` message payload to include optional `pageContext` field
- Background worker passes `pageContext` to `buildSystemPrompt()` when present
- No changes needed for subtitle translation (subtitles have their own context from video title)

## Non-Functional Requirements

- **NFR-1**: Custom theme CSS properties must not leak into host page styles (scoped via `[data-anyllm-theme="custom"]`)
- **NFR-2**: Page context extraction must complete in <10ms (DOM queries only, no network)
- **NFR-3**: System prompt enrichment must add <100 tokens total
- **NFR-4**: Custom theme editor must work with existing dark mode toggle in ThemePreview
- **NFR-5**: All new UI follows existing design system (Tailwind, Zinc/Blue palette, Lucide icons)
- **NFR-6**: Color picker inputs must be accessible (ARIA labels, keyboard navigable)

## Acceptance Criteria

- [ ] "Custom" appears as 17th option in theme gallery grid
- [ ] Selecting "Custom" reveals an editor panel with 6 controls (text color, bg color, border style, border color, font style, font size)
- [ ] ThemePreview updates in real-time as custom theme values change
- [ ] Custom theme persists across browser restart via `chrome.storage.local`
- [ ] Custom theme applies correctly on host pages (translated text styled per custom settings)
- [ ] Custom theme works in both light and dark mode pages
- [ ] "Reset to defaults" restores custom theme to initial values
- [ ] Translating a page on `docs.python.org` includes page title and domain in system prompt
- [ ] Pages without `<meta description>` gracefully omit that field from context
- [ ] Enabling "Page Category Detection" adds category to system prompt for known domains (e.g., github.com → "software development")
- [ ] Context-aware translation does not fire additional API calls
- [ ] All tests pass (`pnpm test`), no lint errors (`pnpm lint`)

## Out of Scope

- Custom CSS textarea / free-form CSS injection
- Opacity/transparency controls for custom theme
- Per-site custom theme overrides
- User-configurable per-site context notes
- LLM-based page category detection (uses heuristic only)
- Context injection for subtitle translations
- Sharing/exporting custom themes
