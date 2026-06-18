# PDF Translation-only View Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a View toggle (Split / Translation only) to the PDF viewer header that hides the original left pane and renders the translation full-width, orthogonal to the existing Layout/Text toggle, with the preference persisted in `chrome.storage.local`.

**Architecture:** A new `PdfViewMode` type and storage key in `lib/constants.ts` plus a small `pdfViewMode.ts` load/save helper. `App.tsx` gains `viewMode` state and renders a second segmented control in the header; when `translation-only`, it skips the left pane and points `useVisiblePages` at the right-pane container. `ViewerLayout.tsx` takes a `viewMode` prop and conditionally renders single-column via the existing `.pdf-viewer-main--single` class. `useSynchronizedScroll` needs no change (already no-ops when a pane ref is null).

**Tech Stack:** React 19, TypeScript 5.9, Vitest, @testing-library/react, jsdom, chrome.storage.local.

## Global Constraints

- New type `PdfViewMode = 'split' | 'translation-only'` lives in `lib/constants.ts` and is **distinct** from the web-page translator's `PageState = 'dual' | 'translation-only' | 'off'` — do not reuse or merge them.
- New storage key `STORAGE_KEYS.PDF_VIEW_MODE = 'anyllm-pdf-view-mode'`. It is **separate** from `ExtensionSettings` — do not add it to the encrypted-settings load/save path in `lib/config.ts`.
- Default value is `'split'` everywhere (absent/unknown/corrupted stored value → `'split'`).
- Reuse existing CSS classes: `.pdf-viewer-toggle-group`, `.pdf-viewer-toggle-btn`, `.pdf-viewer-toggle-btn--active`, `.pdf-viewer-main--single`. **No new CSS rules.**
- `useSynchronizedScroll` must stay called unconditionally (rules of hooks) — its effect already early-returns when `left` or `right` is null.
- Use non-interactive shell flags for any file ops (`cp -f`, `rm -f`).
- `npm test` is the test command. Tests live under `entrypoints/pdf-viewer/**/__tests__/`.

**Reference spec:** `docs/superpowers/specs/2026-06-18-pdf-translation-only-view-design.md`

---

## File Structure

| File | Responsibility |
| --- | --- |
| `lib/constants.ts` (modify) | Add `PdfViewMode` type + `STORAGE_KEYS.PDF_VIEW_MODE`. |
| `entrypoints/pdf-viewer/lib/pdfViewMode.ts` (create) | `loadPdfViewMode()` / `savePdfViewMode()` — thin chrome.storage.local wrapper with defensive fallback to `'split'`. |
| `entrypoints/pdf-viewer/lib/__tests__/pdfViewMode.test.ts` (create) | Tests for the helper. |
| `entrypoints/pdf-viewer/components/ViewerLayout.tsx` (modify) | Accept `viewMode` prop; render single-column (right pane only) when `translation-only`. |
| `entrypoints/pdf-viewer/components/__tests__/ViewerLayout.test.tsx` (create) | Layout assertions for both view modes. |
| `entrypoints/pdf-viewer/App.tsx` (modify) | `viewMode` state + load-on-mount + header control + conditional left pane + visibility-container switch. |
| `entrypoints/pdf-viewer/__tests__/App.test.tsx` (create) | Toggle wiring + persistence + pane mount/unmount. |

---

### Task 1: Add `PdfViewMode` type and storage key

**Files:**
- Modify: `lib/constants.ts` (the `PageState` type around line 57–58 and the `STORAGE_KEYS` object around line 61–68)

**Interfaces:**
- Produces: `PdfViewMode` (type export), `STORAGE_KEYS.PDF_VIEW_MODE` (string value `'anyllm-pdf-view-mode'`).

- [ ] **Step 1: Add the type**

In `lib/constants.ts`, immediately **after** the existing `PageState` type (around line 58), add:

```ts
/** PDF viewer view-mode preference: split (original + translation panes) vs translation-only. */
export type PdfViewMode = 'split' | 'translation-only';
```

- [ ] **Step 2: Add the storage key**

In the same file, add the key to the `STORAGE_KEYS` object (before the closing `} as const;`):

```ts
  /** PDF viewer view-mode preference: 'split' (default) | 'translation-only' */
  PDF_VIEW_MODE: 'anyllm-pdf-view-mode',
```

- [ ] **Step 3: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add lib/constants.ts
git commit -m "feat(pdf): add PdfViewMode type and storage key"
```

---

### Task 2: Create `pdfViewMode.ts` helper (TDD)

**Files:**
- Create: `entrypoints/pdf-viewer/lib/pdfViewMode.ts`
- Test: `entrypoints/pdf-viewer/lib/__tests__/pdfViewMode.test.ts`

**Interfaces:**
- Consumes: `PdfViewMode`, `STORAGE_KEYS` from `@/lib/constants`.
- Produces:
  - `loadPdfViewMode(): Promise<PdfViewMode>` — returns `'split'` when absent/unknown/corrupted/throwing.
  - `savePdfViewMode(mode: PdfViewMode): Promise<void>` — writes under `STORAGE_KEYS.PDF_VIEW_MODE`.

- [ ] **Step 1: Write the failing tests**

Create `entrypoints/pdf-viewer/lib/__tests__/pdfViewMode.test.ts`:

```ts
/**
 * Tests for the PDF view-mode storage helper.
 *
 * Verifies: default 'split' when absent; round-trip save/load; fallback to
 * 'split' for unknown strings, non-string values, and storage errors.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { loadPdfViewMode, savePdfViewMode } from '../pdfViewMode';
import { STORAGE_KEYS } from '@/lib/constants';

/** In-memory chrome.storage.local backing store. */
function installStorageMock(initial: Record<string, unknown> = {}): {
  store: Record<string, unknown>;
  get: ReturnType<typeof vi.fn>;
  set: ReturnType<typeof vi.fn>;
} {
  const store: Record<string, unknown> = { ...initial };
  const get = vi.fn(async (key: string) => ({ [key]: store[key] }));
  const set = vi.fn(async (items: Record<string, unknown>) => {
    Object.assign(store, items);
  });
  global.chrome = {
    storage: { local: { get, set } },
  } as unknown as typeof chrome;
  return { store, get, set };
}

describe('loadPdfViewMode', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('returns "split" when the key is absent', async () => {
    installStorageMock();
    expect(await loadPdfViewMode()).toBe('split');
  });

  it('returns the stored value when present', async () => {
    installStorageMock({ [STORAGE_KEYS.PDF_VIEW_MODE]: 'translation-only' });
    expect(await loadPdfViewMode()).toBe('translation-only');
  });

  it('falls back to "split" for an unknown string', async () => {
    installStorageMock({ [STORAGE_KEYS.PDF_VIEW_MODE]: 'banana' });
    expect(await loadPdfViewMode()).toBe('split');
  });

  it('falls back to "split" for a non-string value', async () => {
    installStorageMock({ [STORAGE_KEYS.PDF_VIEW_MODE]: 42 });
    expect(await loadPdfViewMode()).toBe('split');
  });

  it('falls back to "split" when storage throws', async () => {
    const store: Record<string, unknown> = {};
    global.chrome = {
      storage: {
        local: {
          get: vi.fn(async () => {
            throw new Error('storage unavailable');
          }),
          set: vi.fn(async (items: Record<string, unknown>) => {
            Object.assign(store, items);
          }),
        },
      },
    } as unknown as typeof chrome;
    expect(await loadPdfViewMode()).toBe('split');
  });
});

describe('savePdfViewMode', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('writes the value under STORAGE_KEYS.PDF_VIEW_MODE', async () => {
    const { store, set } = installStorageMock();
    await savePdfViewMode('translation-only');
    expect(set).toHaveBeenCalledWith({ [STORAGE_KEYS.PDF_VIEW_MODE]: 'translation-only' });
    expect(store[STORAGE_KEYS.PDF_VIEW_MODE]).toBe('translation-only');
  });

  it('round-trips through loadPdfViewMode', async () => {
    installStorageMock();
    await savePdfViewMode('translation-only');
    expect(await loadPdfViewMode()).toBe('translation-only');
    await savePdfViewMode('split');
    expect(await loadPdfViewMode()).toBe('split');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run entrypoints/pdf-viewer/lib/__tests__/pdfViewMode.test.ts`
Expected: FAIL — `loadPdfViewMode` / `savePdfViewMode` are not exported (module not found).

- [ ] **Step 3: Write the implementation**

Create `entrypoints/pdf-viewer/lib/pdfViewMode.ts`:

```ts
/**
 * pdfViewMode — load/save the PDF viewer's Split vs Translation-only preference.
 *
 * Stored in chrome.storage.local under a dedicated key (separate from
 * ExtensionSettings). Defaults to 'split' when absent, unknown, corrupted,
 * or when chrome.storage is unavailable.
 */

import { STORAGE_KEYS, type PdfViewMode } from '@/lib/constants';

const VALID: readonly PdfViewMode[] = ['split', 'translation-only'];

/** Load the saved view mode, defaulting to 'split' for any abnormal state. */
export async function loadPdfViewMode(): Promise<PdfViewMode> {
  try {
    const result = await chrome.storage.local.get(STORAGE_KEYS.PDF_VIEW_MODE);
    const raw = result[STORAGE_KEYS.PDF_VIEW_MODE];
    if (typeof raw === 'string' && (VALID as readonly string[]).includes(raw)) {
      return raw as PdfViewMode;
    }
    return 'split';
  } catch {
    return 'split';
  }
}

/** Persist the view mode under its dedicated storage key. */
export async function savePdfViewMode(mode: PdfViewMode): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEYS.PDF_VIEW_MODE]: mode });
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run entrypoints/pdf-viewer/lib/__tests__/pdfViewMode.test.ts`
Expected: PASS (all 7 tests).

- [ ] **Step 5: Commit**

```bash
git add entrypoints/pdf-viewer/lib/pdfViewMode.ts entrypoints/pdf-viewer/lib/__tests__/pdfViewMode.test.ts
git commit -m "feat(pdf): add pdfViewMode storage helper"
```

---

### Task 3: Teach `ViewerLayout` to render single-pane (TDD)

**Files:**
- Modify: `entrypoints/pdf-viewer/components/ViewerLayout.tsx`
- Test: `entrypoints/pdf-viewer/components/__tests__/ViewerLayout.test.tsx` (create)

**Interfaces:**
- Consumes: `PdfViewMode` from `@/lib/constants`.
- Produces: `ViewerLayout` now accepts an optional `viewMode?: PdfViewMode` prop (defaults to `'split'`). In `translation-only`, it renders only the right `<section>`, applies `pdf-viewer-main--single` to `<main>`, and does not render the left section or the "Original" label.

**Existing signatures to preserve (do not break callers):**
- `ViewerLayout({ title?, subtitle?, banner?, left, right, leftPaneRef?, headerExtra? })` — all current props stay.

- [ ] **Step 1: Write the failing tests**

Create `entrypoints/pdf-viewer/components/__tests__/ViewerLayout.test.tsx`:

```tsx
/**
 * Tests for ViewerLayout — split vs translation-only rendering.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ViewerLayout } from '../ViewerLayout';

// useSynchronizedScroll is irrelevant to layout assertions; stub it so it
// never touches refs or adds listeners in jsdom.
vi.mock('../../hooks/useSynchronizedScroll', () => ({
  useSynchronizedScroll: vi.fn(),
}));

describe('ViewerLayout', () => {
  it('renders both panes in split mode (default)', () => {
    render(
      <ViewerLayout
        left={<div data-testid="left-content">L</div>}
        right={<div data-testid="right-content">R</div>}
      />,
    );
    // Both labels present
    expect(screen.getByText('Original')).toBeTruthy();
    expect(screen.getByText('Translation')).toBeTruthy();
    // Both panes' content present
    expect(screen.getByTestId('left-content')).toBeTruthy();
    expect(screen.getByTestId('right-content')).toBeTruthy();
  });

  it('hides the left pane and applies single-column layout in translation-only mode', () => {
    const { container } = render(
      <ViewerLayout
        viewMode="translation-only"
        left={<div data-testid="left-content">L</div>}
        right={<div data-testid="right-content">R</div>}
      />,
    );
    // Left pane content not rendered
    expect(screen.queryByTestId('left-content')).toBeNull();
    // Original label not rendered
    expect(screen.queryByText('Original')).toBeNull();
    // Right pane still present
    expect(screen.getByText('Translation')).toBeTruthy();
    expect(screen.getByTestId('right-content')).toBeTruthy();
    // Single-column class applied to <main>
    const main = container.querySelector('.pdf-viewer-main');
    expect(main?.className).toContain('pdf-viewer-main--single');
  });

  it('explicit viewMode="split" renders both panes', () => {
    render(
      <ViewerLayout
        viewMode="split"
        left={<div data-testid="left-content">L</div>}
        right={<div data-testid="right-content">R</div>}
      />,
    );
    expect(screen.getByTestId('left-content')).toBeTruthy();
    expect(screen.getByTestId('right-content')).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run entrypoints/pdf-viewer/components/__tests__/ViewerLayout.test.tsx`
Expected: FAIL — `viewMode` prop has no effect yet; the translation-only test finds the left content and "Original" label.

- [ ] **Step 3: Modify `ViewerLayout.tsx`**

In `entrypoints/pdf-viewer/components/ViewerLayout.tsx`:

3a. Add the import at the top (with the other imports):

```ts
import { type PdfViewMode } from '@/lib/constants';
```

3b. Add the prop to the interface (after `headerExtra?: ReactNode;`):

```ts
  /** Whether to render the split (two-pane) layout or translation-only (single column). Defaults to 'split'. */
  viewMode?: PdfViewMode;
```

3c. Destructure `viewMode = 'split'` in the function params. Replace the existing signature:

```ts
export function ViewerLayout({
  title = 'PDF Translator',
  subtitle,
  banner,
  left,
  right,
  leftPaneRef,
  headerExtra,
}: ViewerLayoutProps): React.ReactElement {
```

with:

```ts
export function ViewerLayout({
  title = 'PDF Translator',
  subtitle,
  banner,
  left,
  right,
  leftPaneRef,
  headerExtra,
  viewMode = 'split',
}: ViewerLayoutProps): React.ReactElement {
```

3d. Derive a boolean and conditionally render. Replace the `<main>` block (currently lines 57–70):

```tsx
      <main className="pdf-viewer-main">
        <section className="pdf-viewer-pane pdf-viewer-pane--left">
          <div className="pdf-viewer-pane-label">Original</div>
          <div ref={leftRef} className="pdf-viewer-pages pdf-viewer-pages--left" data-pane="left">
            {left}
          </div>
        </section>
        <section className="pdf-viewer-pane pdf-viewer-pane--right">
          <div className="pdf-viewer-pane-label">Translation</div>
          <div ref={rightRef} className="pdf-viewer-pages pdf-viewer-pages--right" data-pane="right">
            {right}
          </div>
        </section>
      </main>
```

with:

```tsx
      {viewMode === 'translation-only' ? (
        <main className="pdf-viewer-main pdf-viewer-main--single">
          <section className="pdf-viewer-pane pdf-viewer-pane--right">
            <div className="pdf-viewer-pane-label">Translation</div>
            <div ref={rightRef} className="pdf-viewer-pages pdf-viewer-pages--right" data-pane="right">
              {right}
            </div>
          </section>
        </main>
      ) : (
        <main className="pdf-viewer-main">
          <section className="pdf-viewer-pane pdf-viewer-pane--left">
            <div className="pdf-viewer-pane-label">Original</div>
            <div ref={leftRef} className="pdf-viewer-pages pdf-viewer-pages--left" data-pane="left">
              {left}
            </div>
          </section>
          <section className="pdf-viewer-pane pdf-viewer-pane--right">
            <div className="pdf-viewer-pane-label">Translation</div>
            <div ref={rightRef} className="pdf-viewer-pages pdf-viewer-pages--right" data-pane="right">
              {right}
            </div>
          </section>
        </main>
      )}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run entrypoints/pdf-viewer/components/__tests__/ViewerLayout.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 5: Run the full viewer test suite to confirm no regressions**

Run: `npx vitest run entrypoints/pdf-viewer`
Expected: all tests PASS.

- [ ] **Step 6: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add entrypoints/pdf-viewer/components/ViewerLayout.tsx entrypoints/pdf-viewer/components/__tests__/ViewerLayout.test.tsx
git commit -m "feat(pdf): ViewerLayout supports translation-only single-column mode"
```

---

### Task 4: Wire the View toggle into `App.tsx` (TDD)

**Files:**
- Modify: `entrypoints/pdf-viewer/App.tsx`
- Test: `entrypoints/pdf-viewer/__tests__/App.test.tsx` (create)

**Interfaces:**
- Consumes:
  - `PdfViewMode` from `@/lib/constants`
  - `loadPdfViewMode`, `savePdfViewMode` from `./lib/pdfViewMode`
  - `ViewerLayout` (now with `viewMode` prop — from Task 3)
- Produces: `App` renders the View segmented control, persists toggles, and switches `useVisiblePages`'s container between left/right based on `viewMode`.

**Existing `App.tsx` facts to preserve:**
- `layoutMode: 'original' | 'text'` state stays as-is (NOT persisted in this feature).
- `leftContainerRef` and `rightContainerRef` refs stay.
- The "loaded" branch returns a `<ViewerLayout>` with `left`, `right`, `leftPaneRef`, `headerExtra`.

- [ ] **Step 1: Write the failing tests**

Create `entrypoints/pdf-viewer/__tests__/App.test.tsx`:

```tsx
/**
 * Tests for App — View mode toggle wiring + persistence + pane mount/unmount.
 *
 * Mocks the PDF + translation hooks so we can assert layout behavior without
 * a real PDF.js document.
 */
import { describe, it, expect, beforeEach, beforeAll, afterAll, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import type { PDFPageProxy } from 'pdfjs-dist';

// --- Hoisted shared mock state ---------------------------------------------
const mockState = vi.hoisted(() => ({
  loadPdfViewModeResult: 'split' as 'split' | 'translation-only',
  saveCalls: [] as Array<'split' | 'translation-only'>,
}));

vi.mock('pdfjs-dist', () => ({
  TextLayer: class {
    async render() {}
    cancel() {}
  },
}));

vi.mock('../hooks/usePdfDocument', () => ({
  usePdfDocument: () => ({
    loadState: 'loaded',
    pages: [{ getViewport: () => ({ width: 720, height: 960 }) } as unknown as PDFPageProxy],
    numPages: 1,
    bytesLoaded: 100,
    bytesTotal: 100,
    error: null,
  }),
}));

vi.mock('../hooks/usePdfPageTranslations', () => ({
  usePdfPageTranslations: () => ({
    pages: new Map([
      [1, { paragraphs: new Map([['p1', 'Bonjour']]), state: 'translated' as const }],
    ]),
    translatedCount: 1,
    totalCount: 1,
    retryPage: vi.fn(),
  }),
}));

vi.mock('../hooks/useVisiblePages', () => ({
  useVisiblePages: () => ({ visiblePages: new Set<number>([1]) }),
}));

vi.mock('../lib/pdfViewMode', () => ({
  loadPdfViewMode: vi.fn(async () => mockState.loadPdfViewModeResult),
  savePdfViewMode: vi.fn(async (mode: 'split' | 'translation-only') => {
    mockState.saveCalls.push(mode);
    mockState.loadPdfViewModeResult = mode;
  }),
}));

// Stub the URL query param extraction so App goes straight to "loaded".
const originalLocation = window.location;
beforeAll(() => {
  Object.defineProperty(window, 'location', {
    writable: true,
    value: new URL('https://example.com/pdf-viewer.html?file=https://example.com/doc.pdf'),
  });
});
afterAll(() => {
  Object.defineProperty(window, 'location', { writable: true, value: originalLocation });
});

import App from '../App';
import { savePdfViewMode } from '../lib/pdfViewMode';

describe('App — View mode toggle', () => {
  beforeEach(() => {
    mockState.loadPdfViewModeResult = 'split';
    mockState.saveCalls = [];
    vi.clearAllMocks();
  });

  it('renders both "Original" and "Translation" labels by default (split)', async () => {
    render(<App />);
    await waitFor(() => {
      expect(screen.getByText('Original')).toBeTruthy();
      expect(screen.getByText('Translation')).toBeTruthy();
    });
  });

  it('shows a View toggle with Split and Translation buttons', async () => {
    render(<App />);
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Split/i })).toBeTruthy();
      expect(screen.getByRole('button', { name: /Translation/i })).toBeTruthy();
    });
  });

  it('hides the Original pane and persists when clicking Translation', async () => {
    render(<App />);
    await waitFor(() => expect(screen.getByText('Original')).toBeTruthy());

    fireEvent.click(screen.getByRole('button', { name: /^Translation$/i }));

    await waitFor(() => {
      expect(screen.queryByText('Original')).toBeNull();
      expect(screen.getByText('Translation')).toBeTruthy();
    });
    expect(savePdfViewMode).toHaveBeenCalledWith('translation-only');
  });

  it('re-shows the Original pane when clicking Split', async () => {
    mockState.loadPdfViewModeResult = 'translation-only';
    render(<App />);
    await waitFor(() => expect(screen.queryByText('Original')).toBeNull());

    fireEvent.click(screen.getByRole('button', { name: /^Split$/i }));

    await waitFor(() => {
      expect(screen.getByText('Original')).toBeTruthy();
    });
    expect(savePdfViewMode).toHaveBeenCalledWith('split');
  });

  it('the Layout/Text toggle still renders in both view modes', async () => {
    render(<App />);
    await waitFor(() => expect(screen.getByText('Original')).toBeTruthy());
    expect(screen.getByRole('button', { name: /^Layout$/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /^Text$/i })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /^Translation$/i }));
    await waitFor(() => expect(screen.queryByText('Original')).toBeNull());
    // Layout/Text still present after switching to translation-only
    expect(screen.getByRole('button', { name: /^Layout$/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /^Text$/i })).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run entrypoints/pdf-viewer/__tests__/App.test.tsx`
Expected: FAIL — no "Split" / "Translation" buttons exist yet; the Translation click has no effect.

- [ ] **Step 3: Implement the View toggle in `App.tsx`**

In `entrypoints/pdf-viewer/App.tsx`:

3a. Update imports. Replace:

```ts
import { useEffect, useMemo, useRef, useState, type ReactElement } from 'react';
import { Loader2, AlertCircle, FileWarning } from 'lucide-react';
import { ViewerLayout } from './components/ViewerLayout';
```

with:

```ts
import { useEffect, useMemo, useRef, useState, type ReactElement } from 'react';
import { Loader2, AlertCircle, FileWarning } from 'lucide-react';
import type { PdfViewMode } from '@/lib/constants';
import { loadPdfViewMode, savePdfViewMode } from './lib/pdfViewMode';
import { ViewerLayout } from './components/ViewerLayout';
```

3b. Add `viewMode` state and load-on-mount. Inside `App()`, immediately after the `const [layoutMode, setLayoutMode] = ...` line, add:

```ts
  const [viewMode, setViewMode] = useState<PdfViewMode>('split');

  useEffect(() => {
    void loadPdfViewMode().then((mode) => setViewMode(mode));
  }, []);

  const handleViewModeChange = (mode: PdfViewMode): void => {
    setViewMode(mode);
    void savePdfViewMode(mode);
  };
```

3c. Switch `useVisiblePages`'s container based on `viewMode`. Replace:

```ts
  const { visiblePages } = useVisiblePages({
    totalPages: numPages,
    containerRef: leftContainerRef,
  });
```

with:

```ts
  // In translation-only mode there is no left pane; observe the right pane so
  // overlay canvases (Layout sub-mode) still mount/unmount near the viewport.
  const visibilityContainerRef = viewMode === 'translation-only' ? rightContainerRef : leftContainerRef;
  const { visiblePages } = useVisiblePages({
    totalPages: numPages,
    containerRef: visibilityContainerRef,
  });
```

3d. Skip the left pane content in translation-only mode. Replace the `const leftPane = (...)` block's opening so it becomes conditional. Replace:

```ts
    const leftPane = (
      <>
        {Array.from({ length: numPages }, (_, idx) => {
```

with:

```ts
    const leftPane = viewMode === 'translation-only' ? null : (
      <>
        {Array.from({ length: numPages }, (_, idx) => {
```

3e. Render the View toggle in `headerExtra`. Add a new toggle group **before** the existing Layout/Text `.pdf-viewer-toggle-group`. Replace:

```tsx
          <div className="pdf-viewer-header-controls">
            <div className="pdf-viewer-toggle-group" role="group" aria-label="Translation view mode">
              <button
                type="button"
                className={`pdf-viewer-toggle-btn ${layoutMode === 'original' ? 'pdf-viewer-toggle-btn--active' : ''}`}
                onClick={() => setLayoutMode('original')}
                aria-pressed={layoutMode === 'original'}
                title="Layout (visual reference): translated text keeps the original page's horizontal structure and reading order, reflowing vertically. Best for matching translated text to the original layout."
              >
                Layout
              </button>
```

with:

```tsx
          <div className="pdf-viewer-header-controls">
            <div className="pdf-viewer-toggle-group" role="group" aria-label="PDF view mode (split vs translation only)">
              <button
                type="button"
                className={`pdf-viewer-toggle-btn ${viewMode === 'split' ? 'pdf-viewer-toggle-btn--active' : ''}`}
                onClick={() => handleViewModeChange('split')}
                aria-pressed={viewMode === 'split'}
                title="Split: show the original PDF on the left and the translation on the right, scroll-synced."
              >
                Split
              </button>
              <button
                type="button"
                className={`pdf-viewer-toggle-btn ${viewMode === 'translation-only' ? 'pdf-viewer-toggle-btn--active' : ''}`}
                onClick={() => handleViewModeChange('translation-only')}
                aria-pressed={viewMode === 'translation-only'}
                title="Translation only: hide the original PDF pane and show the translation full-width."
              >
                Translation
              </button>
            </div>
            <div className="pdf-viewer-toggle-group" role="group" aria-label="Translation layout mode">
              <button
                type="button"
                className={`pdf-viewer-toggle-btn ${layoutMode === 'original' ? 'pdf-viewer-toggle-btn--active' : ''}`}
                onClick={() => setLayoutMode('original')}
                aria-pressed={layoutMode === 'original'}
                title="Layout (visual reference): translated text keeps the original page's horizontal structure and reading order, reflowing vertically. Best for matching translated text to the original layout."
              >
                Layout
              </button>
```

3f. Pass `viewMode` to `ViewerLayout`. In the `<ViewerLayout ...>` JSX, add the prop. Replace:

```tsx
      <ViewerLayout
        title="PDF Translator"
        subtitle={fileName}
```

with:

```tsx
      <ViewerLayout
        title="PDF Translator"
        subtitle={fileName}
        viewMode={viewMode}
```

- [ ] **Step 4: Run the App tests to verify they pass**

Run: `npx vitest run entrypoints/pdf-viewer/__tests__/App.test.tsx`
Expected: PASS (5 tests).

- [ ] **Step 5: Run the full PDF-viewer test suite**

Run: `npx vitest run entrypoints/pdf-viewer`
Expected: all tests PASS (no regressions in PdfTranslationPane / useSynchronizedScroll / useVisiblePages / usePdfPageTranslations / ViewerLayout / pdfViewMode / App).

- [ ] **Step 6: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add entrypoints/pdf-viewer/App.tsx entrypoints/pdf-viewer/__tests__/App.test.tsx
git commit -m "feat(pdf): add Split/Translation view toggle with persistence"
```

---

### Task 5: Lint, full test run, and manual build verification

**Files:** none (verification only)

- [ ] **Step 1: Lint the changed files**

Run: `npx eslint entrypoints/pdf-viewer/App.tsx entrypoints/pdf-viewer/components/ViewerLayout.tsx entrypoints/pdf-viewer/lib/pdfViewMode.ts entrypoints/pdf-viewer/__tests__/App.test.tsx entrypoints/pdf-viewer/components/__tests__/ViewerLayout.test.tsx entrypoints/pdf-viewer/lib/__tests__/pdfViewMode.test.ts lib/constants.ts`
Expected: no errors.

- [ ] **Step 2: Run the entire test suite**

Run: `npm test`
Expected: all tests PASS.

- [ ] **Step 3: Run a production build**

Run: `npm run build`
Expected: build succeeds, `.output/chrome-mv3` updated.

- [ ] **Step 4: Commit if lint/format touched anything**

```bash
git add -A
git diff --cached --quiet || git commit -m "chore(pdf): format/lint after translation-only view feature"
```

- [ ] **Step 5: Manual smoke check (optional but recommended)**

Load `.output/chrome-mv3` in Chrome, open the PDF viewer with `?file=<some-pdf-url>`:
- Default shows Split (two panes).
- Click "Translation" → left pane disappears, translation full-width; reload → still translation-only (persisted).
- Click "Split" → left pane returns, scroll-sync works.
- In translation-only, toggle Layout → overlay canvas renders full-width; toggle Text → clean reading flow.
- In split, both Layout and Text still work as before.

---

## Self-Review Notes

**Spec coverage:**
- Types + storage key (spec §Types, §Storage) → Task 1.
- `loadPdfViewMode`/`savePdfViewMode` with defensive fallback (spec §Storage) → Task 2.
- `ViewerLayout` single-column rendering, `.pdf-viewer-main--single`, hide "Original" label (spec §ViewerLayout) → Task 3.
- `App` state, load-on-mount, header View control, conditional left pane, visibility-container switch, persistence (spec §App, §Canvas virtualization) → Task 4.
- `useSynchronizedScroll` no-op in single-pane (spec §Scroll synchronization) → covered by existing hook guard; no task needed (asserted indirectly by App tests passing without a left ref attached).
- Edge cases: mid-scroll switch, per-page states unaffected, default `'split'`, corrupted value fallback (spec §Edge cases) → covered by default-value and fallback tests in Task 2 + behavioral tests in Task 4.
- Layout sub-mode still works in both view modes (spec §UX) → Task 4 test `the Layout/Text toggle still renders in both view modes`.

**Placeholder scan:** none — every code step contains complete code.

**Type consistency:** `PdfViewMode` used consistently across all tasks. `handleViewModeChange(mode: PdfViewMode)` matches `savePdfViewMode(mode: PdfViewMode)`. `ViewerLayout` prop name `viewMode` matches the prop passed in App step 3f. `loadPdfViewMode` / `savePdfViewMode` signatures match between Task 2 (definition) and Task 4 (mock + call).
