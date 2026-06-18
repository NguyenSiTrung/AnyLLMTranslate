# PDF Viewer — Translation-only View Mode

**Date:** 2026-06-18
**Status:** Design (awaiting implementation plan)
**Surface:** `entrypoints/pdf-viewer/`

## Goal

Give users a choice in the PDF viewer between:

- **Split** (current behavior): original PDF on the left, translation on the right, scroll-synced.
- **Translation only**: the dedicated left pane is hidden; the translation pane renders full-width.

The new View mode is **orthogonal** to the existing Layout/Text toggle. Both sub-modes remain available in both view modes.

## User Experience

Header layout (left to right inside `.pdf-viewer-header-controls`):

```
[ Split | Translation ]   [ Layout | Text ]   [ 12 / 34 pages translated ]
```

- **View group** (new): `Split` / `Translation` segmented control, styled with the existing `.pdf-viewer-toggle-group` / `.pdf-viewer-toggle-btn` classes — no new CSS component.
- **Layout group** (existing, unchanged): `Layout` / `Text`.
- **Progress pill** (existing, unchanged).

Combinations:

| View mode         | Layout sub-mode | Result                                                                                      |
| ----------------- | --------------- | ------------------------------------------------------------------------------------------- |
| Split             | Layout          | Current: original canvas left, overlay (canvas + translated boxes) right, scroll-synced.    |
| Split             | Text            | Current: original canvas left, plain translated paragraphs right, scroll-synced.            |
| Translation only  | Text            | Clean full-width reading flow. No original canvas anywhere.                                 |
| Translation only  | Layout          | The overlay (original canvas background + translated boxes) rendered full-width.            |

**Note on Translation-only + Layout:** the original canvas remains visible *as the background behind the translated boxes*, because that is inherent to how the Layout overlay works (translated boxes sit atop a masked canvas). "Translation only" hides the **dedicated left pane**, not the overlay's background canvas. This is accepted behavior.

The View-mode preference **persists across sessions** in `chrome.storage.local`.

## Non-Goals

- Persisting the existing `layoutMode` (`'original' | 'text'`) preference — separate concern, out of scope.
- Any change to the web-page translator's `displayMode` / `PageState` system in `content/translationDisplay.ts`. That is a different feature surface (content script vs. the PDF viewer page) and the similarly-named `PageState` type is unrelated.
- Mobile/responsive refinements beyond what the existing CSS already provides.

## Design

### Types (`lib/constants.ts`)

Add a new type and storage key:

```ts
export type PdfViewMode = 'split' | 'translation-only';

export const STORAGE_KEYS = {
  // ...existing keys...
  /** PDF viewer view-mode preference: 'split' (default) | 'translation-only' */
  PDF_VIEW_MODE: 'anyllm-pdf-view-mode',
} as const;
```

`PdfViewMode` is intentionally **separate** from the web-page translator's `PageState = 'dual' | 'translation-only' | 'off'`. They govern different UI surfaces and must not be conflated.

### Storage helper (`entrypoints/pdf-viewer/lib/pdfViewMode.ts`)

A small wrapper module:

```ts
export async function loadPdfViewMode(): Promise<PdfViewMode>;  // defaults to 'split'
export async function savePdfViewMode(mode: PdfViewMode): Promise<void>;
```

- `loadPdfViewMode` reads `STORAGE_KEYS.PDF_VIEW_MODE`; returns `'split'` when absent, unknown, or corrupted (defensive `try/catch` + type check).
- `savePdfViewMode` writes the key.

**Why a dedicated storage key (not part of `ExtensionSettings`)?** The PDF viewer is a self-contained, unlisted extension page with viewer-local preferences. Its existing `layoutMode` is not part of `ExtensionSettings` either. Keeping the new preference in its own key respects that boundary and avoids touching the encrypted-settings (`lib/config.ts`) load/save path.

### `App.tsx`

- New state: `const [viewMode, setViewMode] = useState<PdfViewMode>('split');`
- On mount: `useEffect(() => { loadPdfViewMode().then(setPdfViewMode); }, [])` (fire-and-forget; default `'split'` until resolved).
- Add the **View** segmented control next to the existing Layout/Text control in `headerExtra`. Toggling calls `setViewMode` and `savePdfViewMode`.
- When `viewMode === 'translation-only'`, do not build or pass `leftPane`; pass a prop to `ViewerLayout` so it renders single-column.

### `ViewerLayout.tsx`

- New prop: `viewMode: 'split' | 'translation-only'`.
- When `viewMode === 'translation-only'`:
  - Render only the right `<section>`.
  - Apply the existing `pdf-viewer-main--single` class to `<main>` (already sets `grid-template-columns: 1fr`).
  - Do not render the "Original" left-pane label or section.
  - The left pane ref is left unattached.
- When `viewMode === 'split'`: current behavior unchanged.

### Scroll synchronization

`useSynchronizedScroll` already guards `if (!left || !right) return;` at the top of its effect. In translation-only mode the left `<section>` is not rendered, so `leftRef.current` is `null` and the hook becomes a no-op — no errors, no feedback loops. **No change needed to the hook.** (The hook call itself stays unconditional, satisfying the rules of hooks.)

### Canvas virtualization (`useVisiblePages`)

`useVisiblePages` observes `[data-page-number]` slots inside its `containerRef`, which is `leftContainerRef`. Two cases in translation-only mode:

- **Translation only + Text:** no original canvases need to mount at all. The right pane's own observer (`usePdfPageTranslations`) already drives lazy translation. Canvas virtualization is irrelevant.
- **Translation only + Layout:** each page's overlay needs its original canvas. We switch the `containerRef` passed to `useVisiblePages` to the **right-pane** container when in translation-only mode, so canvases mount/unmount based on the right pane's scroll. The hook's selector (`[data-page-number]`) matches the overlay canvases in the right pane (which already carry `data-page-number`), so no selector change is needed.

Concretely in `App.tsx`:

```ts
const visibilityContainerRef =
  viewMode === 'translation-only' ? rightContainerRef : leftContainerRef;
const { visiblePages } = useVisiblePages({
  totalPages: numPages,
  containerRef: visibilityContainerRef,
});
```

### Edge cases

- **Mode switch mid-scroll:** switching Split → Translation-only keeps the right pane's scroll position (it becomes the sole scroll container). Switching back re-attaches the left pane; `useSynchronizedScroll` re-engages and re-aligns via the page-block interpolation algorithm on the next scroll event.
- **Per-page states unaffected:** loading skeleton, error + retry, empty (scanned image), and idle ("scroll to translate") render identically inside the translation pane in both view modes — only the surrounding layout changes.
- **Default:** users with no stored value get `'split'`, preserving current behavior.
- **Unknown/corrupted stored value:** `loadPdfViewMode` falls back to `'split'`.

## Testing

Follow the existing Vitest + Testing Library pattern used in `entrypoints/pdf-viewer/**/__tests__/`. Provide `chrome.storage.local` mocks as other viewer tests do.

- **`pdfViewMode.ts` (new test file):**
  - `loadPdfViewMode` returns `'split'` when the key is absent.
  - `loadPdfViewMode` returns the stored value when present.
  - `loadPdfViewMode` falls back to `'split'` for unknown strings and for non-string values.
  - `loadPdfViewMode` falls back to `'split'` when storage throws.
  - `savePdfViewMode` writes the value under `STORAGE_KEYS.PDF_VIEW_MODE`.
- **`ViewerLayout` (new test file `components/__tests__/ViewerLayout.test.tsx` — none exists today):**
  - In `viewMode === 'split'`: renders both panes, both labels.
  - In `viewMode === 'translation-only'`: left `<section>` is not rendered; `pdf-viewer-main--single` is applied; only the right ("Translation") label appears.
- **`App` (new test file `__tests__/App.test.tsx` — none exists today; mock `usePdfDocument`, `usePdfPageTranslations`, `useVisiblePages`, and `loadPdfViewMode`):**
  - Default render shows both panes (`split`).
  - Clicking "Translation" calls `savePdfViewMode('translation-only')` and the left pane unmounts.
  - Clicking "Split" re-mounts the left pane.
  - The Layout/Text toggle still works in both view modes (translation pane reflects the choice).

## Files Touched

- `lib/constants.ts` — add `PdfViewMode` type and `STORAGE_KEYS.PDF_VIEW_MODE`.
- `entrypoints/pdf-viewer/lib/pdfViewMode.ts` — new: load/save helper.
- `entrypoints/pdf-viewer/lib/__tests__/pdfViewMode.test.ts` — new: helper tests.
- `entrypoints/pdf-viewer/App.tsx` — view-mode state, header control, conditional left pane, visibility-container switch.
- `entrypoints/pdf-viewer/components/ViewerLayout.tsx` — `viewMode` prop, conditional single-column rendering.
- `entrypoints/pdf-viewer/components/__tests__/ViewerLayout.test.tsx` — new: layout assertions for both view modes.
- `entrypoints/pdf-viewer/__tests__/App.test.tsx` — new: toggle + persistence wiring.

No CSS file changes expected: the existing `.pdf-viewer-toggle-group`, `.pdf-viewer-toggle-btn`, and `.pdf-viewer-main--single` classes cover all needs.
