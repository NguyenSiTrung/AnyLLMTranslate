# PDF Viewer Reader / Compare Shell Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the PDF viewer a full-width reader by default, with split only for original vs bridge-result compare, bridge status as chrome (not a permanent half-pane), and explicit Open translated / Compare actions from the job modal.

**Architecture:** Introduce `PdfShellMode` (`reader` | `compare`) and session state for source URL, App-owned result blob URL, and `readerFocus`. `ViewerLayout` renders one pane (reader) or two scroll-synced panes (compare). Extract `PdfDocumentPane` so each URL gets its own `usePdfDocument` + visibility set. Refactor `BridgeStatusPanel` into offline-only `BridgeSetupCard`. Extend `ScientificJobModal` done actions; wire adoption in `App.tsx`.

**Tech Stack:** React 19, TypeScript, Vitest, Testing Library, pdf.js (existing), viewer CSS in `entrypoints/pdf-viewer/style.css`.

**Spec:** `docs/superpowers/specs/2026-07-20-pdf-viewer-reader-compare-design.md`

## Global Constraints

- Bridge-only product — no Fast / in-browser overlay path.
- No permanent right-pane status column when bridge is ready.
- Jobs always use `sourcePdfUrl` (never re-translate an opened result).
- Open-in-viewer must adopt via App-owned `URL.createObjectURL` (hook may revoke mono/dual on next job).
- No auto-download; no auto-enter compare without a click.
- Prefer mono on the compare right pane; dual only if mono missing.
- No user-facing copy about removed Fast translation.
- No bridge HTTP API / Docker script changes.
- Phase 1 only — no zoom, page scrubber, or full `ui/` migration.
- Commits: if git user unset, use  
  `git -c user.name="AnyLLMTranslate Agent" -c user.email="agent@anyllmtranslate.local" commit ...`

## File map

| File | Responsibility |
|------|----------------|
| Create: `entrypoints/pdf-viewer/lib/pdfShellMode.ts` | Pure helpers: shell mode type re-export helpers, open-action → next state, result label |
| Create: `entrypoints/pdf-viewer/lib/__tests__/pdfShellMode.test.ts` | Unit tests for pure helpers |
| Create: `entrypoints/pdf-viewer/components/PdfDocumentPane.tsx` | One URL → scroll container + page canvas stack |
| Create: `entrypoints/pdf-viewer/components/BridgeSetupCard.tsx` | Offline/not-configured setup card (no Translate CTA) |
| Create: `entrypoints/pdf-viewer/components/__tests__/BridgeSetupCard.test.tsx` | Setup card tests |
| Create: `entrypoints/pdf-viewer/components/__tests__/ViewerLayout.test.tsx` | Reader vs compare structure tests |
| Modify: `lib/constants.ts` | Replace `PdfViewMode` with `PdfShellMode` |
| Modify: `entrypoints/pdf-viewer/components/ViewerLayout.tsx` | `mode: 'reader' \| 'compare'` layout |
| Modify: `entrypoints/pdf-viewer/components/ScientificJobModal.tsx` | Open translated + Compare buttons |
| Modify: `entrypoints/pdf-viewer/components/scientificJobModalFormats.ts` | Optional: `compareResultPrefer` helper |
| Modify: `entrypoints/pdf-viewer/components/__tests__/ScientificJobModal.test.tsx` | Update open-action tests |
| Modify: `entrypoints/pdf-viewer/App.tsx` | Orchestration: dual docs, mode, banners, modal wiring |
| Modify: `entrypoints/pdf-viewer/style.css` | Setup overlay, mode toggle, result strip, remove dead right-panel-as-status assumption |
| Delete: `entrypoints/pdf-viewer/components/BridgeStatusPanel.tsx` | Replaced by BridgeSetupCard |
| Delete: `entrypoints/pdf-viewer/components/__tests__/BridgeStatusPanel.test.tsx` | Replaced |
| Modify: `docs/superpowers/specs/2026-06-18-pdf-translation-only-view-design.md` | One-line superseded note |
| No change: `useScientificPdfJob.ts`, `useSynchronizedScroll.ts`, `PdfCanvasRenderer.tsx` | Keep APIs |

---

### Task 1: Pure shell helpers + unit tests

**Files:**
- Create: `entrypoints/pdf-viewer/lib/pdfShellMode.ts`
- Create: `entrypoints/pdf-viewer/lib/__tests__/pdfShellMode.test.ts`
- Modify: `lib/constants.ts` (type only)

**Interfaces:**
- Consumes: nothing
- Produces:
  - `export type PdfShellMode = 'reader' | 'compare'` in `lib/constants.ts` (remove `PdfViewMode`)
  - `export type ReaderFocus = 'source' | 'result'`
  - `export type ResultArtifactKind = 'mono' | 'dual'`
  - `export interface PdfViewerSessionState { shellMode: PdfShellMode; readerFocus: ReaderFocus; resultKind: ResultArtifactKind | null }`
  - `export function initialSessionState(): PdfViewerSessionState`
  - `export function applyOpenTranslated(state: PdfViewerSessionState, kind: ResultArtifactKind): PdfViewerSessionState`
  - `export function applyOpenCompare(state: PdfViewerSessionState, kind: ResultArtifactKind): PdfViewerSessionState`
  - `export function applyShellMode(state: PdfViewerSessionState, mode: PdfShellMode): PdfViewerSessionState`
  - `export function compareRightLabel(kind: ResultArtifactKind | null): string`
  - `export function readerPaneLabel(focus: ReaderFocus, kind: ResultArtifactKind | null): string`

- [ ] **Step 1: Update constants type**

In `lib/constants.ts`, replace the `PdfViewMode` block with:

```ts
/**
 * PDF viewer shell mode (bridge-only): full-width reader, or original|result compare.
 */
export type PdfShellMode = 'reader' | 'compare';
```

Remove `PdfViewMode` entirely. Grep the repo for `PdfViewMode` and fix any imports in later tasks (only viewer uses it today).

- [ ] **Step 2: Write the failing unit tests**

```ts
// entrypoints/pdf-viewer/lib/__tests__/pdfShellMode.test.ts
import { describe, it, expect } from 'vitest';
import {
  initialSessionState,
  applyOpenTranslated,
  applyOpenCompare,
  applyShellMode,
  compareRightLabel,
  readerPaneLabel,
} from '../pdfShellMode';

describe('pdfShellMode', () => {
  it('starts in reader focused on source', () => {
    expect(initialSessionState()).toEqual({
      shellMode: 'reader',
      readerFocus: 'source',
      resultKind: null,
    });
  });

  it('open translated → reader + result focus', () => {
    const next = applyOpenTranslated(initialSessionState(), 'mono');
    expect(next).toEqual({
      shellMode: 'reader',
      readerFocus: 'result',
      resultKind: 'mono',
    });
  });

  it('open compare → compare mode + stores kind', () => {
    const next = applyOpenCompare(initialSessionState(), 'mono');
    expect(next.shellMode).toBe('compare');
    expect(next.resultKind).toBe('mono');
  });

  it('compare with dual uses bilingual label', () => {
    expect(compareRightLabel('dual')).toMatch(/bilingual/i);
    expect(compareRightLabel('mono')).toBe('Translated');
  });

  it('reader label follows focus', () => {
    expect(readerPaneLabel('source', null)).toBe('Original');
    expect(readerPaneLabel('result', 'mono')).toBe('Translated');
    expect(readerPaneLabel('result', 'dual')).toMatch(/bilingual/i);
  });

  it('switching to reader from compare keeps result focus if result exists', () => {
    const compared = applyOpenCompare(initialSessionState(), 'mono');
    const back = applyShellMode(compared, 'reader');
    expect(back.shellMode).toBe('reader');
    expect(back.readerFocus).toBe('result');
    expect(back.resultKind).toBe('mono');
  });
});
```

- [ ] **Step 3: Run tests — expect FAIL**

```bash
pnpm exec vitest run entrypoints/pdf-viewer/lib/__tests__/pdfShellMode.test.ts
```

Expected: fail (module not found).

- [ ] **Step 4: Implement helpers**

```ts
// entrypoints/pdf-viewer/lib/pdfShellMode.ts
import type { PdfShellMode } from '@/lib/constants';

export type ReaderFocus = 'source' | 'result';
export type ResultArtifactKind = 'mono' | 'dual';

export interface PdfViewerSessionState {
  shellMode: PdfShellMode;
  readerFocus: ReaderFocus;
  resultKind: ResultArtifactKind | null;
}

export function initialSessionState(): PdfViewerSessionState {
  return { shellMode: 'reader', readerFocus: 'source', resultKind: null };
}

export function applyOpenTranslated(
  _state: PdfViewerSessionState,
  kind: ResultArtifactKind,
): PdfViewerSessionState {
  return { shellMode: 'reader', readerFocus: 'result', resultKind: kind };
}

export function applyOpenCompare(
  _state: PdfViewerSessionState,
  kind: ResultArtifactKind,
): PdfViewerSessionState {
  return { shellMode: 'compare', readerFocus: 'result', resultKind: kind };
}

export function applyShellMode(
  state: PdfViewerSessionState,
  mode: PdfShellMode,
): PdfViewerSessionState {
  if (mode === 'compare' && state.resultKind == null) {
    return state; // cannot compare without a result
  }
  if (mode === 'reader') {
    return {
      ...state,
      shellMode: 'reader',
      readerFocus: state.resultKind ? 'result' : 'source',
    };
  }
  return { ...state, shellMode: 'compare' };
}

export function compareRightLabel(kind: ResultArtifactKind | null): string {
  if (kind === 'dual') return 'Bilingual result';
  return 'Translated';
}

export function readerPaneLabel(
  focus: ReaderFocus,
  kind: ResultArtifactKind | null,
): string {
  if (focus === 'source') return 'Original';
  return compareRightLabel(kind);
}
```

- [ ] **Step 5: Run tests — expect PASS**

```bash
pnpm exec vitest run entrypoints/pdf-viewer/lib/__tests__/pdfShellMode.test.ts
```

- [ ] **Step 6: Commit**

```bash
git add lib/constants.ts entrypoints/pdf-viewer/lib/pdfShellMode.ts entrypoints/pdf-viewer/lib/__tests__/pdfShellMode.test.ts
git commit -m "feat(pdf-viewer): add PdfShellMode session helpers"
```

---

### Task 2: BridgeSetupCard (offline-only, no Translate)

**Files:**
- Create: `entrypoints/pdf-viewer/components/BridgeSetupCard.tsx`
- Create: `entrypoints/pdf-viewer/components/__tests__/BridgeSetupCard.test.tsx`
- Delete (end of task or Task 6): `BridgeStatusPanel.tsx` + its test (keep until App migrates — delete in Task 6)

**Interfaces:**
- Consumes: `ScientificPdfStatus` from `@/lib/scientificPdf`
- Produces:
  ```ts
  export interface BridgeSetupCardProps {
    status: ScientificPdfStatus;
    /** When true, render as floating overlay card; when false, plain centered block */
    variant?: 'overlay' | 'inline';
    onRefresh: () => void;
    onOpenSetup: () => void;
    onDismiss?: () => void;
  }
  export function BridgeSetupCard(props: BridgeSetupCardProps): ReactElement;
  ```

- [ ] **Step 1: Write failing tests**

```ts
// entrypoints/pdf-viewer/components/__tests__/BridgeSetupCard.test.tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { BridgeSetupCard } from '../BridgeSetupCard';

describe('BridgeSetupCard', () => {
  it('shows setup steps and no Translate button when offline', () => {
    render(
      <BridgeSetupCard
        status="offline"
        onRefresh={vi.fn()}
        onOpenSetup={vi.fn()}
      />,
    );
    expect(screen.getByText(/not available/i)).toBeTruthy();
    expect(screen.getByText(/scientific-pdf-docker\.sh up/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /^Translate$/i })).toBeNull();
    expect(screen.queryByText(/fast translation/i)).toBeNull();
  });

  it('wires Set up and Check connection', () => {
    const onOpenSetup = vi.fn();
    const onRefresh = vi.fn();
    render(
      <BridgeSetupCard
        status="not_configured"
        onRefresh={onRefresh}
        onOpenSetup={onOpenSetup}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Set up/i }));
    expect(onOpenSetup).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: /Check connection/i }));
    expect(onRefresh).toHaveBeenCalledTimes(1);
  });

  it('calls onDismiss when Not now is clicked', () => {
    const onDismiss = vi.fn();
    render(
      <BridgeSetupCard
        status="offline"
        onRefresh={vi.fn()}
        onOpenSetup={vi.fn()}
        onDismiss={onDismiss}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Not now/i }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

```bash
pnpm exec vitest run entrypoints/pdf-viewer/components/__tests__/BridgeSetupCard.test.tsx
```

- [ ] **Step 3: Implement BridgeSetupCard**

Copy structure from `BridgeStatusPanel.tsx` with these changes:

- Remove `onTranslate`, `isRunning`, `healthOk` props.
- Remove ready-state branch that shows Translate (this card is only mounted when unavailable).
- Title: `PDF Translate not available`
- Body (offline): `The Docker bridge is offline or unreachable. Start the bridge, then check the connection.`
- Body (not_configured): `PDF translation needs the local Docker bridge. Set it up once in Options, then return here.`
- Steps list: keep the 4 Docker/Options steps from the old panel.
- Actions: primary `Set up / connect bridge`, secondary `Check connection`, tertiary text button `Not now` only if `onDismiss` provided.
- Hint: default URL line unchanged.
- Root class: `pdf-bridge-setup-card` (+ `pdf-bridge-setup-card--overlay` when `variant === 'overlay'`).
- `role="region"` aria-label `Bridge setup`.

Do **not** mention Fast translation.

- [ ] **Step 4: Run tests — PASS**

```bash
pnpm exec vitest run entrypoints/pdf-viewer/components/__tests__/BridgeSetupCard.test.tsx
```

- [ ] **Step 5: Add minimal CSS** (can refine in Task 5)

Append to `style.css`:

```css
.pdf-bridge-setup-card {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 12px;
  padding: 28px 24px;
  max-width: 420px;
  margin: 40px auto;
  color: #d4d4d8;
  border-radius: 14px;
  border: 1px solid #27272a;
  background: #18181b;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.45);
}

.pdf-bridge-setup-card--overlay {
  margin: 0;
  position: relative;
  z-index: 5;
}

.pdf-bridge-setup-overlay {
  position: absolute;
  inset: 0;
  z-index: 4;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: rgba(9, 9, 11, 0.72);
  pointer-events: auto;
}
```

Reuse existing `.pdf-bridge-panel-*` class names inside the card for icon/title/body/steps/actions **or** duplicate those rules under `.pdf-bridge-setup-card` — pick one and stay consistent (prefer reusing panel child class names to minimize CSS churn).

- [ ] **Step 6: Commit**

```bash
git add entrypoints/pdf-viewer/components/BridgeSetupCard.tsx \
  entrypoints/pdf-viewer/components/__tests__/BridgeSetupCard.test.tsx \
  entrypoints/pdf-viewer/style.css
git commit -m "feat(pdf-viewer): add BridgeSetupCard for offline setup"
```

---

### Task 3: ViewerLayout reader / compare

**Files:**
- Modify: `entrypoints/pdf-viewer/components/ViewerLayout.tsx`
- Create: `entrypoints/pdf-viewer/components/__tests__/ViewerLayout.test.tsx`

**Interfaces:**
- Consumes: `PdfShellMode` from `@/lib/constants`, `useSynchronizedScroll`
- Produces:
  ```ts
  export interface ViewerLayoutProps {
    title?: string;
    subtitle?: string;
    banner?: ReactNode;
    headerExtra?: ReactNode;
    mode: PdfShellMode;
    /** reader mode */
    reader?: ReactNode;
    readerPaneRef?: RefObject<HTMLDivElement | null>;
    readerLabel?: string;
    /** compare mode */
    left?: ReactNode;
    right?: ReactNode;
    leftPaneRef?: RefObject<HTMLDivElement | null>;
    rightPaneRef?: RefObject<HTMLDivElement | null>;
    leftLabel?: string;
    rightLabel?: string;
    /** Optional absolute overlay inside main (setup card) */
    mainOverlay?: ReactNode;
  }
  ```

- [ ] **Step 1: Write failing layout tests**

```ts
// entrypoints/pdf-viewer/components/__tests__/ViewerLayout.test.tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ViewerLayout } from '../ViewerLayout';

describe('ViewerLayout', () => {
  it('reader mode: one pane, no compare right label', () => {
    render(
      <ViewerLayout
        mode="reader"
        readerLabel="Original"
        reader={<div>reader-body</div>}
      />,
    );
    expect(screen.getByText('Original')).toBeTruthy();
    expect(screen.getByText('reader-body')).toBeTruthy();
    expect(screen.queryByText('Translated')).toBeNull();
    expect(document.querySelectorAll('[data-pane]').length).toBe(1);
  });

  it('compare mode: two panes with labels', () => {
    render(
      <ViewerLayout
        mode="compare"
        leftLabel="Original"
        rightLabel="Translated"
        left={<div>left-body</div>}
        right={<div>right-body</div>}
      />,
    );
    expect(screen.getByText('left-body')).toBeTruthy();
    expect(screen.getByText('right-body')).toBeTruthy();
    expect(document.querySelectorAll('[data-pane]').length).toBe(2);
  });
});
```

- [ ] **Step 2: Run — expect FAIL** (props API mismatch)

```bash
pnpm exec vitest run entrypoints/pdf-viewer/components/__tests__/ViewerLayout.test.tsx
```

- [ ] **Step 3: Rewrite ViewerLayout**

Replace `viewMode` / `left`+`right` always-on with the new contract:

```tsx
// Key structure (full file rewrite OK)
export function ViewerLayout({
  title = 'PDF Translator',
  subtitle,
  banner,
  headerExtra,
  mode,
  reader,
  readerPaneRef,
  readerLabel = 'Original',
  left,
  right,
  leftPaneRef,
  rightPaneRef,
  leftLabel = 'Original',
  rightLabel = 'Translated',
  mainOverlay,
}: ViewerLayoutProps): React.ReactElement {
  const [leftEl, setLeftEl] = useState<HTMLDivElement | null>(null);
  const [rightEl, setRightEl] = useState<HTMLDivElement | null>(null);

  const bindRef =
    (setEl: (el: HTMLDivElement | null) => void, external?: RefObject<HTMLDivElement | null>) =>
    (el: HTMLDivElement | null) => {
      setEl(el);
      if (external) (external as { current: HTMLDivElement | null }).current = el;
    };

  useSynchronizedScroll({
    leftEl: mode === 'compare' ? leftEl : null,
    rightEl: mode === 'compare' ? rightEl : null,
  });

  return (
    <div className="pdf-viewer-root">
      <header className="pdf-viewer-header">
        <div className="pdf-viewer-header-left">
          <h1>{title}</h1>
          {subtitle && <p className="pdf-viewer-subtitle">{subtitle}</p>}
        </div>
        {headerExtra && <div className="pdf-viewer-header-right">{headerExtra}</div>}
      </header>
      {banner && <div className="pdf-viewer-banner-wrap">{banner}</div>}
      <main
        className={
          mode === 'compare'
            ? 'pdf-viewer-main'
            : 'pdf-viewer-main pdf-viewer-main--single'
        }
        style={{ position: 'relative' }}
      >
        {mode === 'reader' ? (
          <section className="pdf-viewer-pane pdf-viewer-pane--reader">
            <div className="pdf-viewer-pane-label">{readerLabel}</div>
            <div
              ref={bindRef(setLeftEl, readerPaneRef)}
              className="pdf-viewer-pages"
              data-pane="reader"
              aria-label={`${readerLabel} PDF`}
            >
              {reader}
            </div>
          </section>
        ) : (
          <>
            <section className="pdf-viewer-pane pdf-viewer-pane--left">
              <div className="pdf-viewer-pane-label">{leftLabel}</div>
              <div
                ref={bindRef(setLeftEl, leftPaneRef)}
                className="pdf-viewer-pages pdf-viewer-pages--left"
                data-pane="left"
                aria-label="Original PDF"
              >
                {left}
              </div>
            </section>
            <section className="pdf-viewer-pane pdf-viewer-pane--right">
              <div className="pdf-viewer-pane-label">{rightLabel}</div>
              <div
                ref={bindRef(setRightEl, rightPaneRef)}
                className="pdf-viewer-pages pdf-viewer-pages--right"
                data-pane="right"
                aria-label={`${rightLabel} PDF`}
              >
                {right}
              </div>
            </section>
          </>
        )}
        {mainOverlay}
      </main>
    </div>
  );
}
```

Note: In reader mode the internal `leftEl` is only for the reader scroll parent; sync is disabled. External `readerPaneRef` must still be set for `useVisiblePages`.

- [ ] **Step 4: Run layout tests — PASS**

```bash
pnpm exec vitest run entrypoints/pdf-viewer/components/__tests__/ViewerLayout.test.tsx
```

- [ ] **Step 5: Commit**

```bash
git add entrypoints/pdf-viewer/components/ViewerLayout.tsx \
  entrypoints/pdf-viewer/components/__tests__/ViewerLayout.test.tsx
git commit -m "feat(pdf-viewer): ViewerLayout reader and compare modes"
```

---

### Task 4: PdfDocumentPane

**Files:**
- Create: `entrypoints/pdf-viewer/components/PdfDocumentPane.tsx`

**Interfaces:**
- Consumes: `usePdfDocument`, `useVisiblePages`, `PdfCanvasRenderer`
- Produces:
  ```ts
  export interface PdfDocumentPaneProps {
    url: string | null;
    /** Called with the scroll element via callback/ref from parent layout — parent owns the scroll div.
     *  Simpler approach: PdfDocumentPane owns nothing external; parent passes containerRef that
     *  layout already bound. Pane only renders page list given pages from hooks internal to pane.
     */
  }
  ```

**Preferred design (self-contained):** Parent passes `url` + `scrollRef` that is already attached to the layout scroll container. Hooks run inside the pane:

```ts
export interface PdfDocumentPaneProps {
  url: string | null;
  /** Scroll container already mounted by ViewerLayout */
  containerRef: RefObject<HTMLDivElement | null>;
  /** Optional max canvas width */
  maxWidth?: number;
}

export function PdfDocumentPane({
  url,
  containerRef,
  maxWidth = 720,
}: PdfDocumentPaneProps): ReactElement {
  const numPagesRef = useRef(0);
  const { visiblePages } = useVisiblePages({
    totalPages: numPagesRef.current,
    containerRef,
  });
  const { loadState, pages, numPages, error } = usePdfDocument(url, { visiblePages });
  numPagesRef.current = numPages;

  const pageDimensions = useMemo(() => {
    const dims = new Map<number, { width: number; height: number }>();
    for (let i = 0; i < pages.length; i++) {
      const page = pages[i];
      if (!page) continue;
      const viewport = page.getViewport({ scale: 1 });
      const scale = maxWidth / viewport.width;
      dims.set(i + 1, {
        width: Math.floor(viewport.width * scale),
        height: Math.floor(viewport.height * scale),
      });
    }
    return dims;
  }, [pages, maxWidth]);

  if (!url) {
    return <div className="pdf-viewer-empty-state"><p>No document</p></div>;
  }
  if (loadState === 'error') {
    return (
      <div className="pdf-viewer-empty-state pdf-viewer-empty-state--error">
        <p>{error ?? 'Failed to load PDF'}</p>
      </div>
    );
  }
  if (loadState !== 'loaded') {
    return (
      <div className="pdf-viewer-empty-state">
        <p>Loading…</p>
      </div>
    );
  }

  return (
    <>
      {Array.from({ length: numPages }, (_, idx) => {
        const pageNumber = idx + 1;
        return (
          <PdfCanvasRenderer
            key={`page-${pageNumber}`}
            page={pages[idx] ?? null}
            pageNumber={pageNumber}
            visible={visiblePages.has(pageNumber)}
            dims={pageDimensions.get(pageNumber)}
            maxWidth={maxWidth}
          />
        );
      })}
    </>
  );
}
```

- [ ] **Step 1: Implement `PdfDocumentPane.tsx` as above**

- [ ] **Step 2: Smoke-check TypeScript**

```bash
pnpm exec tsc --noEmit -p tsconfig.json 2>&1 | head -40
```

Fix any import path issues. (App may still fail compile until Task 6 — that is OK if errors are only in App.)

- [ ] **Step 3: Commit**

```bash
git add entrypoints/pdf-viewer/components/PdfDocumentPane.tsx
git commit -m "feat(pdf-viewer): add PdfDocumentPane for per-URL rendering"
```

---

### Task 5: ScientificJobModal — Open translated + Compare

**Files:**
- Modify: `entrypoints/pdf-viewer/components/scientificJobModalFormats.ts`
- Modify: `entrypoints/pdf-viewer/components/__tests__/scientificJobModalFormats.test.ts`
- Modify: `entrypoints/pdf-viewer/components/ScientificJobModal.tsx`
- Modify: `entrypoints/pdf-viewer/components/__tests__/ScientificJobModal.test.tsx`

**Interfaces:**
- Consumes: existing progress flags
- Produces (formats helper additions):
  ```ts
  export function openArtifactKind(
    prefer: 'dual' | 'mono' | null,
    flags: { hasMono: boolean; hasDual: boolean },
  ): 'mono' | 'dual' | null

  /** Prefer mono for compare right pane */
  export function compareArtifactKind(flags: {
    hasMono: boolean;
    hasDual: boolean;
  }): 'mono' | 'dual' | null
  ```
- Modal props change:
  ```ts
  // Replace single onOpenResult with:
  onOpenTranslated: () => void;
  onOpenCompare?: () => void; // omit/hide when source unavailable
  // Keep onOpenResult as deprecated optional bridge during migration? Prefer clean break:
  // Remove onOpenResult; update App in Task 6 in same or immediate next commit.
  ```

**Clean break (recommended):** Change props in this task and update App in Task 6 immediately after (do not leave master broken — implement Task 5+6 before considering the branch green, or temporarily keep both callbacks).

**Safer sequence:** Keep `onOpenResult` working AND add `onOpenCompare` / rename secondary buttons that call:

```ts
onOpenTranslated={() => onOpenResult(openResultPrefer(selected, flags))}
onOpenCompare={() => onOpenResult(compare prefer)}
```

Plan uses **explicit new props** and updates App in Task 6 in the same working tree before the final test run.

- [ ] **Step 1: Add helper tests**

```ts
// append to scientificJobModalFormats.test.ts
import { compareArtifactKind } from '../scientificJobModalFormats';

it('compare prefers mono then dual', () => {
  expect(compareArtifactKind({ hasMono: true, hasDual: true })).toBe('mono');
  expect(compareArtifactKind({ hasMono: false, hasDual: true })).toBe('dual');
  expect(compareArtifactKind({ hasMono: false, hasDual: false })).toBe(null);
});
```

- [ ] **Step 2: Implement helper**

```ts
export function compareArtifactKind(flags: {
  hasMono: boolean;
  hasDual: boolean;
}): 'mono' | 'dual' | null {
  if (flags.hasMono) return 'mono';
  if (flags.hasDual) return 'dual';
  return null;
}
```

- [ ] **Step 3: Update modal props and done secondary row**

```ts
export interface ScientificJobModalProps {
  progress: ScientificJobProgress;
  onCancel: () => void;
  onClose: () => void;
  onRetry: () => void;
  /** Open translated-only in reader */
  onOpenTranslated: () => void;
  /** Open original|result compare; hide button if undefined */
  onOpenCompare?: () => void;
  onOpenSetup?: () => void;
  onDownloadMono?: () => void;
  onDownloadDual?: () => void;
  onDownloadSideBySide?: () => void | Promise<void>;
}
```

In done secondary actions replace single “Open in viewer” with:

```tsx
{(progress.hasDual || progress.hasMono) && (
  <button
    type="button"
    className="pdf-download-btn pdf-download-btn--secondary"
    onClick={onOpenTranslated}
  >
    Open translated
  </button>
)}
{onOpenCompare && (progress.hasDual || progress.hasMono) && (
  <button
    type="button"
    className="pdf-download-btn pdf-download-btn--secondary"
    onClick={onOpenCompare}
  >
    Compare side-by-side
  </button>
)}
```

Remove internal `handleOpen` / `onOpenResult` usage.

- [ ] **Step 4: Update modal tests**

Replace the test `done: open in viewer uses mono prefer...` with:

```ts
it('done: Open translated and Compare call respective handlers', () => {
  const onOpenTranslated = vi.fn();
  const onOpenCompare = vi.fn();
  render(
    <ScientificJobModal
      progress={baseProgress()}
      onCancel={noop}
      onClose={noop}
      onRetry={noop}
      onOpenTranslated={onOpenTranslated}
      onOpenCompare={onOpenCompare}
      onDownloadMono={noop}
      onDownloadDual={noop}
      onDownloadSideBySide={noop}
    />,
  );
  fireEvent.click(screen.getByRole('button', { name: /open translated/i }));
  expect(onOpenTranslated).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole('button', { name: /compare side-by-side/i }));
  expect(onOpenCompare).toHaveBeenCalledTimes(1);
});

it('done: hides Compare when onOpenCompare omitted', () => {
  render(
    <ScientificJobModal
      progress={baseProgress()}
      onCancel={noop}
      onClose={noop}
      onRetry={noop}
      onOpenTranslated={noop}
      onDownloadMono={noop}
      onDownloadDual={noop}
      onDownloadSideBySide={noop}
    />,
  );
  expect(screen.queryByRole('button', { name: /compare side-by-side/i })).toBeNull();
});
```

Update every modal test render to pass `onOpenTranslated` instead of `onOpenResult`.

- [ ] **Step 5: Run modal + format tests**

```bash
pnpm exec vitest run entrypoints/pdf-viewer/components/__tests__/scientificJobModalFormats.test.ts entrypoints/pdf-viewer/components/__tests__/ScientificJobModal.test.tsx
```

Expected: PASS

- [ ] **Step 6: Commit** (App still broken until Task 6 — either skip commit until Task 6 done, or commit with known App type errors only if CI does not typecheck App alone. **Prefer one commit spanning end of Task 5+6.** If committing here, message: `feat(pdf-viewer): split modal open into translated and compare` and immediately continue Task 6.)

---

### Task 6: App.tsx orchestration (main integration)

**Files:**
- Modify: `entrypoints/pdf-viewer/App.tsx`
- Delete: `entrypoints/pdf-viewer/components/BridgeStatusPanel.tsx`
- Delete: `entrypoints/pdf-viewer/components/__tests__/BridgeStatusPanel.test.tsx`
- Modify: `entrypoints/pdf-viewer/style.css` (mode toggle, result strip)
- Modify: `docs/superpowers/specs/2026-06-18-pdf-translation-only-view-design.md` (superseded note)

**Interfaces:**
- Consumes: all previous tasks + `useScientificPdfJob`, `compareArtifactKind`, session helpers

- [ ] **Step 1: Rewrite App state model**

Replace single `pdfUrl` display state with:

```ts
const [sourcePdfUrl, setSourcePdfUrl] = useState<string | null>(null);
const [resultPdfUrl, setResultPdfUrl] = useState<string | null>(null);
const [session, setSession] = useState(initialSessionState);
const [showScientificModal, setShowScientificModal] = useState(false);
const [setupCardDismissed, setSetupCardDismissed] = useState(false);

const readerScrollRef = useRef<HTMLDivElement | null>(null);
const compareLeftRef = useRef<HTMLDivElement | null>(null);
const compareRightRef = useRef<HTMLDivElement | null>(null);
const resultUrlRef = useRef<string | null>(null); // for revoke
```

On mount: `setSourcePdfUrl(getPdfUrlFromQuery())`.

Revoke `resultUrlRef` on unmount and before adopting a new result.

```ts
function adoptResultBlob(blob: Blob, kind: ResultArtifactKind, next: 'translated' | 'compare'): void {
  if (resultUrlRef.current) URL.revokeObjectURL(resultUrlRef.current);
  const url = URL.createObjectURL(blob);
  resultUrlRef.current = url;
  setResultPdfUrl(url);
  setSession((s) =>
    next === 'compare' ? applyOpenCompare(s, kind) : applyOpenTranslated(s, kind),
  );
}
```

- [ ] **Step 2: Header controls**

```tsx
const bridgeReady = scientific.healthOk === true;
const headerExtra = (
  <div className="pdf-viewer-header-controls">
    {resultPdfUrl && (
      <div className="pdf-viewer-mode-toggle" role="radiogroup" aria-label="View mode">
        <button
          type="button"
          role="radio"
          aria-checked={session.shellMode === 'reader'}
          className={`pdf-viewer-mode-btn${session.shellMode === 'reader' ? ' pdf-viewer-mode-btn--active' : ''}`}
          onClick={() => setSession((s) => applyShellMode(s, 'reader'))}
        >
          Reader
        </button>
        <button
          type="button"
          role="radio"
          aria-checked={session.shellMode === 'compare'}
          className={`pdf-viewer-mode-btn${session.shellMode === 'compare' ? ' pdf-viewer-mode-btn--active' : ''}`}
          onClick={() => setSession((s) => applyShellMode(s, 'compare'))}
        >
          Compare
        </button>
      </div>
    )}
    <div
      className={`pdf-viewer-progress-pill${
        bridgeReady
          ? ' pdf-viewer-progress-pill--ok'
          : scientific.healthOk === false
            ? ' pdf-viewer-progress-pill--warn'
            : ''
      }`}
      title="Local Docker bridge status for PDF translation"
    >
      {bridgeStatusLabel}
    </div>
    {bridgeReady ? (
      <button
        type="button"
        className="pdf-download-btn-header"
        onClick={() => {
          setShowScientificModal(true);
          void scientific.startJob();
        }}
        disabled={scientific.isRunning || !sourcePdfUrl}
      >
        <FlaskConical size={14} />
        Translate
      </button>
    ) : (
      <button
        type="button"
        className="pdf-download-btn-header pdf-download-btn-header--muted"
        onClick={openOptionsPage}
        disabled={scientific.healthOk === null}
      >
        <Settings2 size={14} />
        Set up bridge
      </button>
    )}
  </div>
);
```

`startTranslate` when `!bridgeReady`: do **not** open error modal by default — set `setupCardDismissed(false)` and/or `openOptionsPage`. Only open modal when ready (or keep offline modal if user opened it previously — prefer setup card).

- [ ] **Step 3: Banners**

```tsx
const banner = (
  <>
    <FilePermissionGuide visible={sourcePdfUrl ? isFileScheme(sourcePdfUrl) : false} />
    {!bridgeReady && scientific.healthOk !== null && (
      <div className="pdf-viewer-scan-banner" role="status">
        PDF Translate needs the Docker bridge.{' '}
        <button type="button" className="pdf-viewer-banner-link" onClick={openOptionsPage}>
          Set up bridge
        </button>
        {' · '}
        <button
          type="button"
          className="pdf-viewer-banner-link"
          onClick={() => void scientific.refreshHealth()}
        >
          Check connection
        </button>
      </div>
    )}
    {session.shellMode === 'reader' &&
      session.readerFocus === 'result' &&
      resultPdfUrl && (
        <div className="pdf-viewer-scan-banner pdf-viewer-scan-banner--info" role="status">
          Viewing translated result.{' '}
          <button
            type="button"
            className="pdf-viewer-banner-link"
            onClick={() =>
              setSession((s) => ({ ...s, readerFocus: 'source', shellMode: 'reader' }))
            }
          >
            Show original
          </button>
          {' · '}
          <button
            type="button"
            className="pdf-viewer-banner-link"
            onClick={() => setSession((s) => applyShellMode(s, 'compare'))}
          >
            Compare side-by-side
          </button>
        </div>
      )}
  </>
);
```

- [ ] **Step 4: Main loaded render**

Gate the full viewer on **source** load for initial open. Use a lightweight approach:

- Always require `sourcePdfUrl`.
- For empty/loading/error of the **active reader document**, `PdfDocumentPane` handles in-pane errors.
- Top-level empty states (no URL): keep current single-column empty shell when `!sourcePdfUrl`.
- When `sourcePdfUrl` is set, always render `ViewerLayout` (even while source still loading inside pane).

```tsx
if (!sourcePdfUrl) {
  // existing empty "No PDF URL" shell
}

const readerUrl =
  session.readerFocus === 'result' && resultPdfUrl ? resultPdfUrl : sourcePdfUrl;

const showSetupOverlay =
  scientific.healthOk === false && !setupCardDismissed && !scientific.isRunning;

return (
  <>
    <ViewerLayout
      title="PDF Translator"
      subtitle={fileName}
      mode={session.shellMode === 'compare' && resultPdfUrl ? 'compare' : 'reader'}
      banner={banner}
      headerExtra={headerExtra}
      readerLabel={readerPaneLabel(session.readerFocus, session.resultKind)}
      readerPaneRef={readerScrollRef}
      reader={
        <PdfDocumentPane url={readerUrl} containerRef={readerScrollRef} />
      }
      leftPaneRef={compareLeftRef}
      rightPaneRef={compareRightRef}
      leftLabel="Original"
      rightLabel={compareRightLabel(session.resultKind)}
      left={<PdfDocumentPane url={sourcePdfUrl} containerRef={compareLeftRef} />}
      right={
        resultPdfUrl ? (
          <PdfDocumentPane url={resultPdfUrl} containerRef={compareRightRef} />
        ) : null
      }
      mainOverlay={
        showSetupOverlay ? (
          <div className="pdf-bridge-setup-overlay">
            <BridgeSetupCard
              variant="overlay"
              status={scientific.bridgeStatus}
              onRefresh={() => void scientific.refreshHealth()}
              onOpenSetup={openOptionsPage}
              onDismiss={() => setSetupCardDismissed(true)}
            />
          </div>
        ) : null
      }
    />
    {/* modal: only when showScientificModal || running || done || error — same gate as today */}
    <ScientificJobModal
      ...
      onOpenTranslated={() => {
        const kind = compareArtifactKind({
          hasMono: scientific.progress.hasMono,
          hasDual: scientific.progress.hasDual,
        });
        // Prefer openResultPrefer(selected) — but selected lives in modal.
        // Use mono-first for translated open:
        const prefer = scientific.progress.hasMono
          ? 'mono'
          : scientific.progress.hasDual
            ? 'dual'
            : null;
        if (!prefer) return;
        const blob = scientific.resolveResultBlob(prefer);
        if (!blob) return;
        adoptResultBlob(blob, prefer, 'translated');
        setShowScientificModal(false);
        scientific.dismissProgress();
      }}
      onOpenCompare={
        sourcePdfUrl
          ? () => {
              const prefer = compareArtifactKind({
                hasMono: scientific.progress.hasMono,
                hasDual: scientific.progress.hasDual,
              });
              if (!prefer) return;
              const blob = scientific.resolveResultBlob(prefer);
              if (!blob) return;
              adoptResultBlob(blob, prefer, 'compare');
              setShowScientificModal(false);
              scientific.dismissProgress();
            }
          : undefined
      }
    />
  </>
);
```

**Important:** `useScientificPdfJob({ pdfUrl: sourcePdfUrl ?? '', fileName })` — always source.

**Hooks rule:** `PdfDocumentPane` calls hooks internally. In compare mode, reader pane content may unmount — that is OK. Do **not** call `usePdfDocument` in App anymore.

**Compare mode fallback:** If `session.shellMode === 'compare' && !resultPdfUrl`, force reader via derived mode (shown above).

- [ ] **Step 5: Mode toggle CSS**

```css
.pdf-viewer-mode-toggle {
  display: inline-flex;
  padding: 2px;
  border-radius: 8px;
  border: 1px solid #27272a;
  background: rgba(24, 24, 27, 0.8);
  gap: 2px;
}

.pdf-viewer-mode-btn {
  border: none;
  background: transparent;
  color: #a1a1aa;
  font-size: 11px;
  font-weight: 600;
  padding: 4px 10px;
  border-radius: 6px;
  cursor: pointer;
}

.pdf-viewer-mode-btn--active {
  background: rgba(14, 165, 233, 0.18);
  color: #e0f2fe;
}

.pdf-viewer-mode-btn:focus-visible {
  outline: 2px solid #0ea5e9;
  outline-offset: 1px;
}
```

Optional: set header Translate border/background toward `#0EA5E9` tints.

- [ ] **Step 6: Delete BridgeStatusPanel files**; fix any remaining imports.

- [ ] **Step 7: Supersede old spec**

At top of `docs/superpowers/specs/2026-06-18-pdf-translation-only-view-design.md` add:

```markdown
> **Status:** Superseded for the live bridge-only viewer by [2026-07-20-pdf-viewer-reader-compare-design.md](./2026-07-20-pdf-viewer-reader-compare-design.md). Kept for historical Fast-path context only.
```

- [ ] **Step 8: Run full pdf-viewer tests**

```bash
pnpm exec vitest run entrypoints/pdf-viewer
```

Expected: all PASS. Fix failures.

- [ ] **Step 9: Typecheck**

```bash
pnpm exec tsc --noEmit -p tsconfig.json 2>&1 | head -50
```

Expected: no errors in pdf-viewer files.

- [ ] **Step 10: Commit**

```bash
git add entrypoints/pdf-viewer lib/constants.ts docs/superpowers/specs/2026-06-18-pdf-translation-only-view-design.md
git status # ensure BridgeStatusPanel deleted
git commit -m "feat(pdf-viewer): reader-first shell with original|result compare"
```

---

### Task 7: Manual verification checklist + polish

**Files:** only if bugs found during manual pass

- [ ] **Step 1: Dev build**

```bash
pnpm run dev
# or project-equivalent WXT dev command from package.json
```

- [ ] **Step 2: Manual checklist** (from spec §13.3)

1. Bridge ready, remote PDF → full-width original; only one Translate (header).
2. No permanent right status column.
3. Offline → banner + overlay setup card; Not now dismisses card, banner remains.
4. Translate → modal → Download still works.
5. Open translated → full-width result + strip (Show original / Compare).
6. Compare side-by-side → two panes, scroll roughly tracks; Reader toggle exits.
7. file:// permission banner still works when access denied.
8. Second job open replaces previous result without blank canvas.
9. No “Fast translation” copy anywhere in UI.

- [ ] **Step 3: Fix any P0 bugs found; re-run**

```bash
pnpm exec vitest run entrypoints/pdf-viewer
```

- [ ] **Step 4: Final commit if needed**

```bash
git add -A entrypoints/pdf-viewer
git commit -m "fix(pdf-viewer): polish reader/compare shell after manual pass"
```

- [ ] **Step 5: Mark design status**

In `docs/superpowers/specs/2026-07-20-pdf-viewer-reader-compare-design.md`, set Status to `Implemented` (or leave until user confirms). Commit docs if changed.

---

## Self-review (plan vs spec)

| Spec requirement | Task |
|------------------|------|
| Full-width reader default | 3, 6 |
| Compare original \| result | 1, 4, 6 |
| No permanent BridgeStatusPanel column | 2, 6 |
| CTA dedupe (header primary only) | 6 |
| Offline banner + dismissible setup card | 2, 6 |
| Modal Open translated + Compare | 5, 6 |
| Prefer mono on compare right | 5 (`compareArtifactKind`) |
| Jobs use sourcePdfUrl | 6 |
| App-owned result blob URL | 6 |
| Mode segmented control when result held | 6 |
| Copy: no Fast removed | 2 |
| Supersede 2026-06-18 spec | 6 |
| Phase 1 only (no zoom) | respected |
| Tests | 1–6 |

**Placeholder scan:** none intentional.

**Type consistency:** `PdfShellMode`, `ResultArtifactKind`, `applyOpen*`, `compareArtifactKind`, `BridgeSetupCardProps`, `ViewerLayoutProps.mode`, modal `onOpenTranslated` / `onOpenCompare` — used consistently across tasks.

---

## Execution notes

- Implement Task 5 and Task 6 in one continuous stretch so `App.tsx` is never left calling removed `onOpenResult` on a green CI run.
- `PdfDocumentPane` mounts hooks per pane: compare = 2 PDF.js documents (known cost; accepted in spec).
- Do not reintroduce `viewMode="split"` or right-pane Translate.
