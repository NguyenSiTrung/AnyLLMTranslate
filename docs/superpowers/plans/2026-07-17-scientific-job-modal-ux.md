# Scientific Job Modal UX Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the full Scientific PDF job modal (running / done / error) for clearer hierarchy, collapsible activity log, download-first format cards with side-by-side default, and plain-language copy—without changing bridge APIs or toolbar chrome.

**Architecture:** Keep `useScientificPdfJob` orchestration and `App.tsx` callback wiring. Extract pure format-selection helpers for TDD. Refactor `ScientificJobModal` into state-specific sections (running / done / error) with local UI state for selected format, log open, and download feedback. Style via existing `pdf-sci-*` / `pdf-download-*` tokens in `style.css`.

**Tech Stack:** React 19, TypeScript, Vitest, Testing Library, existing PDF viewer CSS (no new UI library).

**Spec:** `docs/superpowers/specs/2026-07-17-scientific-job-modal-ux-design.md`  
**Issue:** AnyLLMTranslate-w5y

## Global Constraints

- No auto-download (manual only).
- No user-facing `pdf2zh` or `L|R` jargon in modal UI copy.
- Default format order: side-by-side (if mono) → bilingual/dual (if dual) → translated-only/mono.
- Hide unavailable formats entirely (no disabled dead cards).
- Download-first; Open in viewer secondary.
- Do not redesign toolbar Fast/Scientific toggle.
- Do not change scientific bridge protocol or download binary paths.
- Preserve `ScientificJobModalProps` callbacks (`onDownloadMono`, `onDownloadDual`, `onDownloadSideBySide`, `onOpenResult`, `onCancel`, `onClose`, `onRetry`, `onOpenSetup`).
- Respect `prefers-reduced-motion` for step pulse.
- Commits: use existing repo author pattern if git user unset: `git -c user.name="AnyLLMTranslate Agent" -c user.email="agent@anyllmtranslate.local" commit ...`

## File map

| File | Responsibility |
|------|----------------|
| Create: `entrypoints/pdf-viewer/components/scientificJobModalFormats.ts` | Pure helpers: format ids, availability, default selection, labels, open-prefer mapping, download dispatch key |
| Create: `entrypoints/pdf-viewer/components/__tests__/scientificJobModalFormats.test.ts` | Unit tests for pure helpers |
| Create: `entrypoints/pdf-viewer/components/__tests__/ScientificJobModal.test.tsx` | Component tests for done/running/error UI |
| Modify: `entrypoints/pdf-viewer/components/ScientificJobModal.tsx` | Full modal redesign |
| Modify: `entrypoints/pdf-viewer/style.css` | Cards, badge, collapsible log, CTA, a11y motion |
| Optional touch: `entrypoints/pdf-viewer/hooks/useScientificPdfJob.ts` | Soften stage *hints* if still shown in status line (no API change) |
| No change expected: `entrypoints/pdf-viewer/App.tsx` | Keep prop wiring unless a missing prop surfaces |

---

### Task 1: Pure format helpers + unit tests

**Files:**
- Create: `entrypoints/pdf-viewer/components/scientificJobModalFormats.ts`
- Test: `entrypoints/pdf-viewer/components/__tests__/scientificJobModalFormats.test.ts`

**Interfaces:**
- Consumes: nothing from other tasks
- Produces:
  - `export type ScientificDownloadFormat = 'mono' | 'dual' | 'side-by-side'`
  - `export function availableFormats(flags: { hasMono: boolean; hasDual: boolean }): ScientificDownloadFormat[]`
  - `export function defaultFormat(flags: { hasMono: boolean; hasDual: boolean }): ScientificDownloadFormat | null`
  - `export function formatCardCopy(format: ScientificDownloadFormat): { title: string; hint: string; downloadLabel: string }`
  - `export function openResultPrefer(selected: ScientificDownloadFormat | null, flags: { hasMono: boolean; hasDual: boolean }): 'dual' | 'mono' | null`
  - `export function isRecommended(format: ScientificDownloadFormat, flags: { hasMono: boolean; hasDual: boolean }): boolean`

- [ ] **Step 1: Write the failing unit tests**

```ts
// entrypoints/pdf-viewer/components/__tests__/scientificJobModalFormats.test.ts
import { describe, it, expect } from 'vitest';
import {
  availableFormats,
  defaultFormat,
  formatCardCopy,
  openResultPrefer,
  isRecommended,
} from '../scientificJobModalFormats';

describe('scientificJobModalFormats', () => {
  it('lists only available formats', () => {
    expect(availableFormats({ hasMono: true, hasDual: true })).toEqual([
      'side-by-side',
      'dual',
      'mono',
    ]);
    expect(availableFormats({ hasMono: true, hasDual: false })).toEqual([
      'side-by-side',
      'mono',
    ]);
    expect(availableFormats({ hasMono: false, hasDual: true })).toEqual(['dual']);
    expect(availableFormats({ hasMono: false, hasDual: false })).toEqual([]);
  });

  it('defaults to side-by-side when mono exists', () => {
    expect(defaultFormat({ hasMono: true, hasDual: true })).toBe('side-by-side');
    expect(defaultFormat({ hasMono: true, hasDual: false })).toBe('side-by-side');
  });

  it('falls back dual then mono', () => {
    expect(defaultFormat({ hasMono: false, hasDual: true })).toBe('dual');
    expect(defaultFormat({ hasMono: false, hasDual: false })).toBe(null);
  });

  it('uses plain-language copy without pdf2zh or L|R', () => {
    for (const f of ['mono', 'dual', 'side-by-side'] as const) {
      const c = formatCardCopy(f);
      const blob = `${c.title} ${c.hint} ${c.downloadLabel}`;
      expect(blob.toLowerCase()).not.toMatch(/pdf2zh/);
      expect(blob).not.toMatch(/L\|R/i);
    }
    expect(formatCardCopy('side-by-side').downloadLabel).toMatch(/side-by-side/i);
    expect(formatCardCopy('dual').title.toLowerCase()).toMatch(/bilingual|bridge/);
    expect(formatCardCopy('mono').title.toLowerCase()).toMatch(/translated/);
  });

  it('maps open prefer correctly', () => {
    expect(openResultPrefer('dual', { hasMono: true, hasDual: true })).toBe('dual');
    expect(openResultPrefer('side-by-side', { hasMono: true, hasDual: true })).toBe('mono');
    expect(openResultPrefer('mono', { hasMono: true, hasDual: false })).toBe('mono');
    expect(openResultPrefer('dual', { hasMono: false, hasDual: false })).toBe(null);
    expect(openResultPrefer(null, { hasMono: true, hasDual: true })).toBe('mono');
  });

  it('marks side-by-side recommended only when it is the default', () => {
    expect(isRecommended('side-by-side', { hasMono: true, hasDual: true })).toBe(true);
    expect(isRecommended('dual', { hasMono: true, hasDual: true })).toBe(false);
    expect(isRecommended('dual', { hasMono: false, hasDual: true })).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pnpm exec vitest run entrypoints/pdf-viewer/components/__tests__/scientificJobModalFormats.test.ts
```

Expected: FAIL (module not found / exports missing)

- [ ] **Step 3: Implement helpers**

```ts
// entrypoints/pdf-viewer/components/scientificJobModalFormats.ts
export type ScientificDownloadFormat = 'mono' | 'dual' | 'side-by-side';

export function availableFormats(flags: {
  hasMono: boolean;
  hasDual: boolean;
}): ScientificDownloadFormat[] {
  const out: ScientificDownloadFormat[] = [];
  // Side-by-side needs mono (+ original assembled in hook)
  if (flags.hasMono) out.push('side-by-side');
  if (flags.hasDual) out.push('dual');
  if (flags.hasMono) out.push('mono');
  return out;
}

export function defaultFormat(flags: {
  hasMono: boolean;
  hasDual: boolean;
}): ScientificDownloadFormat | null {
  const list = availableFormats(flags);
  return list[0] ?? null;
}

export function formatCardCopy(format: ScientificDownloadFormat): {
  title: string;
  hint: string;
  downloadLabel: string;
} {
  switch (format) {
    case 'side-by-side':
      return {
        title: 'Side-by-side',
        hint: 'Original on the left, translation on the right.',
        downloadLabel: 'Download side-by-side',
      };
    case 'dual':
      return {
        title: 'Bilingual (bridge)',
        hint: 'Original and translation paired by the layout engine.',
        downloadLabel: 'Download bilingual',
      };
    case 'mono':
      return {
        title: 'Translated only',
        hint: 'Layout-preserving pages in the target language.',
        downloadLabel: 'Download translated PDF',
      };
  }
}

export function openResultPrefer(
  selected: ScientificDownloadFormat | null,
  flags: { hasMono: boolean; hasDual: boolean },
): 'dual' | 'mono' | null {
  if (selected === 'dual' && flags.hasDual) return 'dual';
  if ((selected === 'side-by-side' || selected === 'mono') && flags.hasMono) return 'mono';
  if (flags.hasMono) return 'mono';
  if (flags.hasDual) return 'dual';
  return null;
}

export function isRecommended(
  format: ScientificDownloadFormat,
  flags: { hasMono: boolean; hasDual: boolean },
): boolean {
  return defaultFormat(flags) === format;
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pnpm exec vitest run entrypoints/pdf-viewer/components/__tests__/scientificJobModalFormats.test.ts
```

Expected: all PASS

- [ ] **Step 5: Commit**

```bash
git add entrypoints/pdf-viewer/components/scientificJobModalFormats.ts \
  entrypoints/pdf-viewer/components/__tests__/scientificJobModalFormats.test.ts
git -c user.name="AnyLLMTranslate Agent" -c user.email="agent@anyllmtranslate.local" \
  commit -m "feat(pdf-viewer): pure helpers for scientific download formats"
```

---

### Task 2: Component tests for modal states (failing first)

**Files:**
- Create: `entrypoints/pdf-viewer/components/__tests__/ScientificJobModal.test.tsx`
- Modify (later in Task 3): `entrypoints/pdf-viewer/components/ScientificJobModal.tsx`

**Interfaces:**
- Consumes: helpers from Task 1; current `ScientificJobModal` props
- Produces: behavioral contract tests that Task 3 must satisfy

- [ ] **Step 1: Write failing component tests**

```tsx
// entrypoints/pdf-viewer/components/__tests__/ScientificJobModal.test.tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { ScientificJobModal } from '../ScientificJobModal';
import type { ScientificJobProgress } from '../../hooks/useScientificPdfJob';

function baseProgress(over: Partial<ScientificJobProgress> = {}): ScientificJobProgress {
  return {
    stage: 'done',
    progress: 1,
    message: 'Complete',
    logs: ['18:00:00 Job succeeded'],
    hasMono: true,
    hasDual: true,
    jobId: 'job_test',
    ...over,
  };
}

const noop = () => {};

describe('ScientificJobModal', () => {
  it('done: defaults to side-by-side and shows recommended badge', () => {
    render(
      <ScientificJobModal
        progress={baseProgress()}
        onCancel={noop}
        onClose={noop}
        onRetry={noop}
        onOpenResult={noop}
        onDownloadMono={noop}
        onDownloadDual={noop}
        onDownloadSideBySide={noop}
      />,
    );
    expect(screen.getByRole('heading', { name: /translation ready/i })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /side-by-side/i })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    expect(screen.getByText(/recommended/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /download side-by-side/i })).toBeInTheDocument();
    // No jargon
    expect(screen.queryByText(/pdf2zh/i)).not.toBeInTheDocument();
  });

  it('done: hides dual card when hasDual is false', () => {
    render(
      <ScientificJobModal
        progress={baseProgress({ hasDual: false })}
        onCancel={noop}
        onClose={noop}
        onRetry={noop}
        onOpenResult={noop}
        onDownloadMono={noop}
        onDownloadSideBySide={noop}
      />,
    );
    expect(screen.queryByRole('radio', { name: /bilingual/i })).not.toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /translated only/i })).toBeInTheDocument();
  });

  it('done: selecting mono updates download CTA and downloadMono is called', () => {
    const onDownloadMono = vi.fn();
    render(
      <ScientificJobModal
        progress={baseProgress()}
        onCancel={noop}
        onClose={noop}
        onRetry={noop}
        onOpenResult={noop}
        onDownloadMono={onDownloadMono}
        onDownloadDual={noop}
        onDownloadSideBySide={noop}
      />,
    );
    fireEvent.click(screen.getByRole('radio', { name: /translated only/i }));
    fireEvent.click(screen.getByRole('button', { name: /download translated pdf/i }));
    expect(onDownloadMono).toHaveBeenCalledTimes(1);
  });

  it('done: open in viewer uses mono prefer for side-by-side selection', () => {
    const onOpenResult = vi.fn();
    render(
      <ScientificJobModal
        progress={baseProgress()}
        onCancel={noop}
        onClose={noop}
        onRetry={noop}
        onOpenResult={onOpenResult}
        onDownloadMono={noop}
        onDownloadDual={noop}
        onDownloadSideBySide={noop}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /open in viewer/i }));
    expect(onOpenResult).toHaveBeenCalledWith('mono');
  });

  it('running: activity log is collapsed by default', () => {
    render(
      <ScientificJobModal
        progress={baseProgress({
          stage: 'running',
          progress: 0.4,
          message: 'Translating…',
          logs: ['line 1', 'line 2'],
          hasMono: false,
          hasDual: false,
        })}
        onCancel={noop}
        onClose={noop}
        onRetry={noop}
        onOpenResult={noop}
      />,
    );
    // Log content not visible until expanded
    const details = screen.getByText(/activity/i).closest('details');
    expect(details).toBeTruthy();
    expect(details).not.toHaveAttribute('open');
  });

  it('error offline: primary is open setup', () => {
    const onOpenSetup = vi.fn();
    render(
      <ScientificJobModal
        progress={baseProgress({
          stage: 'error',
          progress: 0,
          hasMono: false,
          hasDual: false,
          error: 'Bridge offline',
          errorCode: 'offline',
          logs: ['offline'],
        })}
        onCancel={noop}
        onClose={noop}
        onRetry={noop}
        onOpenResult={noop}
        onOpenSetup={onOpenSetup}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /set up|open setup|start server/i }));
    expect(onOpenSetup).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run tests — expect FAIL**

```bash
pnpm exec vitest run entrypoints/pdf-viewer/components/__tests__/ScientificJobModal.test.tsx
```

Expected: FAIL (old titles/copy/structure, log always open, etc.)

- [ ] **Step 3: Commit tests only**

```bash
git add entrypoints/pdf-viewer/components/__tests__/ScientificJobModal.test.tsx
git -c user.name="AnyLLMTranslate Agent" -c user.email="agent@anyllmtranslate.local" \
  commit -m "test(pdf-viewer): scientific job modal UX contract tests"
```

---

### Task 3: Implement redesigned `ScientificJobModal`

**Files:**
- Modify: `entrypoints/pdf-viewer/components/ScientificJobModal.tsx` (full rewrite of render structure; keep exported props)
- Modify: `entrypoints/pdf-viewer/style.css` (add/adjust `pdf-sci-*` rules from Step 3)

**Interfaces:**
- Consumes: `scientificJobModalFormats` helpers; existing `ScientificJobProgress` / `SCIENTIFIC_STAGE_META`
- Produces: modal satisfying Task 2 tests; props API unchanged for `App.tsx`

- [ ] **Step 1: Replace modal implementation**

Key structure (implement fully in the file — not a partial sketch):

```tsx
/**
 * Progress / result modal for Scientific PDF bridge jobs.
 * State-focused UX: calm running, clear error recovery, download-first done cards.
 */

import { useEffect, useMemo, useRef, useState, type ReactElement } from 'react';
import {
  SCIENTIFIC_STAGE_META,
  type ScientificJobProgress,
  type ScientificJobStage,
} from '../hooks/useScientificPdfJob';
import {
  availableFormats,
  defaultFormat,
  formatCardCopy,
  isRecommended,
  openResultPrefer,
  type ScientificDownloadFormat,
} from './scientificJobModalFormats';

// ... keep ScientificJobModalProps identical to current file ...

// PIPELINE_STEPS + stepState helpers (keep from current file)

export function ScientificJobModal(props: ScientificJobModalProps): ReactElement {
  const { progress, onCancel, onClose, onRetry, onOpenResult, onOpenSetup,
    onDownloadMono, onDownloadDual, onDownloadSideBySide } = props;

  const isDone = progress.stage === 'done';
  const isError = progress.stage === 'error';
  const isActive = !isDone && !isError && progress.stage !== 'idle';

  const flags = useMemo(
    () => ({ hasMono: progress.hasMono, hasDual: progress.hasDual }),
    [progress.hasMono, progress.hasDual],
  );
  const formats = useMemo(() => availableFormats(flags), [flags]);

  const [selected, setSelected] = useState<ScientificDownloadFormat | null>(null);
  // Sync default when entering done or flags change
  useEffect(() => {
    if (!isDone) {
      setSelected(null);
      return;
    }
    setSelected((prev) => {
      if (prev && formats.includes(prev)) return prev;
      return defaultFormat(flags);
    });
  }, [isDone, flags.hasMono, flags.hasDual, formats.join('|')]);

  const [logOpen, setLogOpen] = useState(false);
  useEffect(() => {
    if (isError) setLogOpen(true);
    if (isDone) setLogOpen(false);
    if (isActive) setLogOpen(false);
  }, [isError, isDone, isActive, progress.stage]);

  const [downloadPhase, setDownloadPhase] = useState<'idle' | 'busy' | 'saved'>('idle');
  useEffect(() => {
    if (!isDone) setDownloadPhase('idle');
  }, [isDone]);

  const logRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!logOpen) return;
    const el = logRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [progress.logs.length, logOpen]);

  const title = isError
    ? 'Translation failed'
    : isDone
      ? 'Translation ready'
      : 'Translating with Scientific layout…';

  async function handlePrimaryDownload() {
    if (!selected) return;
    setDownloadPhase('busy');
    try {
      if (selected === 'mono') onDownloadMono?.();
      else if (selected === 'dual') onDownloadDual?.();
      else await Promise.resolve(onDownloadSideBySide?.());
      setDownloadPhase('saved');
      window.setTimeout(() => setDownloadPhase('idle'), 2000);
    } catch {
      setDownloadPhase('idle');
    }
  }

  function handleOpen() {
    const prefer = openResultPrefer(selected, flags);
    if (prefer) onOpenResult(prefer);
  }

  // Render:
  // - dialog with aria-labelledby="pdf-sci-title"
  // - header title + muted job id
  // - if isActive || isDone: step rail (on done all steps done)
  // - if isActive || isDone: progress bar
  // - status line (running) OR done subcopy OR error box
  // - if isDone: radiogroup of format cards + primary download + secondary open
  // - collapsible log when logs.length > 0
  // - footer actions: cancel / retry / setup / close
}
```

**Format card markup requirements:**

```tsx
<div className="pdf-sci-format-cards" role="radiogroup" aria-label="Download format">
  {formats.map((f) => {
    const copy = formatCardCopy(f);
    const checked = selected === f;
    return (
      <button
        key={f}
        type="button"
        role="radio"
        aria-checked={checked}
        className={`pdf-sci-format-card${checked ? ' pdf-sci-format-card--selected' : ''}`}
        onClick={() => setSelected(f)}
      >
        <span className={`pdf-sci-format-glyph pdf-sci-format-glyph--${f}`} aria-hidden />
        <span className="pdf-sci-format-card-text">
          <span className="pdf-sci-format-card-title">
            {copy.title}
            {isRecommended(f, flags) && (
              <span className="pdf-sci-recommended">Recommended</span>
            )}
          </span>
          <span className="pdf-sci-format-card-hint">{copy.hint}</span>
        </span>
      </button>
    );
  })}
</div>
```

**Collapsible log:**

```tsx
{progress.logs.length > 0 && (
  <details
    className="pdf-sci-log-wrap"
    open={logOpen}
    onToggle={(e) => setLogOpen((e.target as HTMLDetailsElement).open)}
  >
    <summary className="pdf-sci-log-header">Activity</summary>
    <div ref={logRef} className="pdf-sci-log" role="log" aria-label="Scientific job activity log">
      {progress.logs.map((line, i) => (
        <div key={`${i}-${line.slice(0, 24)}`} className="pdf-sci-log-line">{line}</div>
      ))}
    </div>
  </details>
)}
```

**Done subcopy:**

```tsx
<p className="pdf-download-modal-message">
  Choose a format, then download. Nothing downloads automatically.
</p>
```

**Primary download busy labels:**

- side-by-side + busy → `Assembling…`
- other + busy → `Downloading…`
- saved → keep button label but show helper text `Saved` / `Download started`

- [ ] **Step 2: Add CSS** in `entrypoints/pdf-viewer/style.css` after existing `.pdf-sci-*` block (~line 670+)

```css
/* Scientific modal — format cards + collapsible log refinements */
.pdf-sci-modal {
  min-width: min(560px, 92vw);
  max-width: min(600px, 94vw);
}

.pdf-sci-format-cards {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin: 0 0 14px;
}

.pdf-sci-format-card {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  width: 100%;
  text-align: left;
  padding: 12px 14px;
  border-radius: 10px;
  border: 1px solid #27272a;
  background: rgba(24, 24, 27, 0.6);
  cursor: pointer;
  color: inherit;
  transition: border-color 150ms ease, background 150ms ease;
}

.pdf-sci-format-card:hover {
  border-color: #3f3f46;
  background: rgba(39, 39, 42, 0.5);
}

.pdf-sci-format-card--selected {
  border-color: #3b82f6;
  background: rgba(59, 130, 246, 0.12);
}

.pdf-sci-format-card-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  font-weight: 600;
  color: #e4e4e7;
}

.pdf-sci-format-card-hint {
  display: block;
  margin-top: 2px;
  font-size: 11px;
  color: #a1a1aa;
  line-height: 1.45;
}

.pdf-sci-recommended {
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.02em;
  text-transform: uppercase;
  color: #86efac;
  background: rgba(34, 197, 94, 0.12);
  border: 1px solid rgba(34, 197, 94, 0.35);
  border-radius: 999px;
  padding: 2px 7px;
}

/* Abstract glyphs */
.pdf-sci-format-glyph {
  flex-shrink: 0;
  width: 36px;
  height: 28px;
  border-radius: 4px;
  border: 1px solid #3f3f46;
  background: #09090b;
  position: relative;
}
.pdf-sci-format-glyph--mono::after {
  content: '';
  position: absolute;
  inset: 4px 10px;
  border-radius: 2px;
  background: #3b82f6;
  opacity: 0.55;
}
.pdf-sci-format-glyph--dual::before,
.pdf-sci-format-glyph--dual::after {
  content: '';
  position: absolute;
  left: 6px;
  right: 6px;
  height: 8px;
  border-radius: 2px;
  background: #60a5fa;
  opacity: 0.5;
}
.pdf-sci-format-glyph--dual::before { top: 5px; }
.pdf-sci-format-glyph--dual::after { bottom: 5px; background: #86efac; }
.pdf-sci-format-glyph--side-by-side::before,
.pdf-sci-format-glyph--side-by-side::after {
  content: '';
  position: absolute;
  top: 4px;
  bottom: 4px;
  width: 12px;
  border-radius: 2px;
}
.pdf-sci-format-glyph--side-by-side::before {
  left: 5px;
  background: #71717a;
  opacity: 0.7;
}
.pdf-sci-format-glyph--side-by-side::after {
  right: 5px;
  background: #3b82f6;
  opacity: 0.65;
}

.pdf-sci-download-primary {
  width: 100%;
  margin-bottom: 8px;
  padding: 10px 16px;
  font-size: 13px;
}

.pdf-sci-feedback {
  margin: 0 0 10px;
  font-size: 11px;
  color: #86efac;
  min-height: 1em;
}

.pdf-sci-log-wrap {
  margin: 0 0 14px;
  border: 1px solid #27272a;
  border-radius: 10px;
  overflow: hidden;
  background: #09090b;
}

.pdf-sci-log-wrap > summary.pdf-sci-log-header {
  cursor: pointer;
  list-style: none;
  user-select: none;
}
.pdf-sci-log-wrap > summary.pdf-sci-log-header::-webkit-details-marker {
  display: none;
}
.pdf-sci-log-wrap > summary.pdf-sci-log-header::after {
  content: 'Show details';
  float: right;
  font-weight: 600;
  text-transform: none;
  letter-spacing: 0;
  color: #a1a1aa;
}
.pdf-sci-log-wrap[open] > summary.pdf-sci-log-header::after {
  content: 'Hide';
}

@media (prefers-reduced-motion: reduce) {
  .pdf-sci-step--active .pdf-sci-step-dot {
    box-shadow: none;
  }
  .pdf-download-modal,
  .pdf-download-modal-backdrop {
    animation: none;
  }
}
```

Remove obsolete styles that only served the bullet list (`.pdf-sci-format-list`, old result panel density) or leave unused selectors if safer—prefer deleting unused `.pdf-sci-format-list` / rewrite `.pdf-sci-result-panel` to wrap cards lightly.

- [ ] **Step 3: Run component + unit tests**

```bash
pnpm exec vitest run entrypoints/pdf-viewer/components/__tests__/scientificJobModalFormats.test.ts \
  entrypoints/pdf-viewer/components/__tests__/ScientificJobModal.test.tsx
```

Expected: all PASS. Fix any selector/a11y name mismatches in implementation (prefer fixing component accessible names to match tests).

- [ ] **Step 4: Soften stage meta hints shown in status (optional, small)**

In `useScientificPdfJob.ts` `SCIENTIFIC_STAGE_META`:

- `running.hint`: change to `Layout-preserving translation. This can take several minutes.`
- `done.hint`: change to `Choose a format, then download.`

No other hook logic changes.

- [ ] **Step 5: Typecheck**

```bash
pnpm run compile
```

Expected: no errors in touched files.

- [ ] **Step 6: Commit**

```bash
git add entrypoints/pdf-viewer/components/ScientificJobModal.tsx \
  entrypoints/pdf-viewer/style.css \
  entrypoints/pdf-viewer/hooks/useScientificPdfJob.ts
git -c user.name="AnyLLMTranslate Agent" -c user.email="agent@anyllmtranslate.local" \
  commit -m "feat(pdf-viewer): redesign scientific job modal UX"
```

---

### Task 4: Regression + quality gates

**Files:** none new (verify only)

- [ ] **Step 1: Run scientific + nearby PDF tests**

```bash
pnpm exec vitest run entrypoints/pdf-viewer \
  lib/__tests__/scientificPdf.test.ts \
  lib/__tests__/scientificPdfClient.test.ts \
  lib/__tests__/scientificPdfWizard.test.ts
```

Expected: PASS (or pre-existing failures unrelated to modal — do not “fix” unrelated suites; only fix regressions caused by this work).

- [ ] **Step 2: Lint touched files**

```bash
pnpm exec eslint entrypoints/pdf-viewer/components/ScientificJobModal.tsx \
  entrypoints/pdf-viewer/components/scientificJobModalFormats.ts \
  entrypoints/pdf-viewer/components/__tests__/ScientificJobModal.test.tsx \
  entrypoints/pdf-viewer/components/__tests__/scientificJobModalFormats.test.ts
```

Expected: clean (or only pre-existing config noise).

- [ ] **Step 3: Manual checklist (document in commit/PR notes if no browser)**

1. Start Scientific translate → log collapsed, steps + progress visible.  
2. Expand Activity → lines scroll.  
3. On success → “Translation ready”, side-by-side selected + Recommended, primary Download.  
4. Switch to Bilingual → CTA label updates → download fires dual.  
5. Open in viewer → mono for side-by-side/translated-only.  
6. Force offline error → Setup primary.  
7. Close resets; second run shows running layout again.

- [ ] **Step 4: Close bead when verified**

```bash
bd close AnyLLMTranslate-w5y --reason="Scientific job modal UX redesigned per 2026-07-17 spec"
```

- [ ] **Step 5: Final commit only if Step 3 left fixes**

```bash
git -c user.name="AnyLLMTranslate Agent" -c user.email="agent@anyllmtranslate.local" \
  commit -m "fix(pdf-viewer): polish scientific modal after verification"
```

---

## Spec coverage checklist

| Spec requirement | Task |
|------------------|------|
| Full modal (running/done/error) | 3 |
| Collapsible log; expand on error | 2, 3 |
| Format cards + plain copy | 1, 3 |
| Default side-by-side | 1, 2, 3 |
| Download-first + open mapping | 1, 2, 3 |
| Hide unavailable formats | 1, 2 |
| Download feedback / assemble busy | 3 |
| Reduced motion | 3 CSS |
| No toolbar redesign / no API change | Global constraints |
| Tests | 1, 2, 4 |

## Plan self-review

- **Placeholders:** none (concrete code, commands, paths).  
- **Type consistency:** `ScientificDownloadFormat` = `'mono' | 'dual' | 'side-by-side'` everywhere; open prefer `'dual' | 'mono' | null`.  
- **TDD order:** helpers → failing component tests → implementation → verify.  
- **App.tsx:** intentionally unchanged unless props break (they should not).
