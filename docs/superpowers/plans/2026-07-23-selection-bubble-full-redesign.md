# Selection Bubble Full Feature Redesign — Implementation Plan (Phase A)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the generic selection tooltip with a brand-coherent dialog bubble: modular shell, smart positioning, sentence/dictionary hierarchy, and full actions (Copy, Retry, Speak via browser TTS, Add to global glossary, Pin) while preserving dictionary/sentence translation behavior.

**Architecture:** Extract pure DOM modules under `content/selectionBubble/`. `textSelection.ts` stays a thin orchestrator (selection events, session id, `translateSelection` messages). CSS tokens and layout live in `styles/tooltip.css`. Phase B (multi-provider TTS Options) is **out of this plan** — Speak uses `speechSynthesis` only.

**Tech Stack:** TypeScript, Vitest + jsdom, content-script DOM (no React on host pages), existing `loadSettings` / `updateSettings`, Chrome extension messaging.

**Spec:** `docs/superpowers/specs/2026-07-23-selection-bubble-full-redesign-design.md`  
**Beads:** AnyLLMTranslate-cdj

## Global Constraints

- Phase A only — no `ExtensionSettings.tts`, no Options TTS section, no provider audio fetch.
- Preserve public API used by content entry: `initTextSelection`, `setTextSelectionEnabled`, `isTextSelectionEnabled`, `translateSelectedTextViaContextMenu`.
- Preserve dictionary exports needed by tests: `buildDictionaryTooltipContent`, `applySelectionResponse`, `TOOLTIP_CLASS` (may alias new dialog class), `removeTooltip`, `__setCurrentTooltipForTest`.
- Preserve `translateSelection` message contract (`dictionaryMode`, `contextText`, result `mode` / `dictionary`).
- Preserve `selectionSession` stale-response drop.
- Brand tokens: primary `#0ea5e9`, accent `#f59e0b`, success `#10b981`, danger `#f43f5e` — do **not** use `#1a73e8` as primary.
- Pin in **header only**; footer: Copy, Retry, Speak, Glossary.
- Sentence body: translation primary + collapsible original (default collapsed).
- Glossary: global `settings.glossary` via `updateSettings` + `findDuplicateSource`.
- Pin: stay open on outside click; Escape and Close always dismiss; new translate while pinned replaces content in place.
- Dialog: `role="dialog"`, real `<button>` elements, `:focus-visible` rings, `aria-live="polite"` on result region.
- Commits: if git user unset, use  
  `git -c user.name="AnyLLMTranslate Agent" -c user.email="agent@anyllmtranslate.local" commit ...`
- Prefer `pnpm exec vitest run <path>` (or `npm test -- <path>` if pnpm unavailable).

---

## File map

| File | Responsibility |
|------|----------------|
| Create: `content/selectionBubble/types.ts` | Shared types and class-name constants |
| Create: `content/selectionBubble/position.ts` | Pure placement math |
| Create: `content/selectionBubble/icons.ts` | Inline SVG helpers for actions |
| Create: `content/selectionBubble/chip.ts` | Floating translate chip |
| Create: `content/selectionBubble/contentLoading.ts` | Loading body |
| Create: `content/selectionBubble/contentSentence.ts` | Sentence body + collapsible original |
| Create: `content/selectionBubble/contentDictionary.ts` | Dictionary body (migrated + section labels) |
| Create: `content/selectionBubble/contentError.ts` | Error body |
| Create: `content/selectionBubble/actions.ts` | Footer toolbar + status line helpers |
| Create: `content/selectionBubble/speak.ts` | Browser `SpeakController` |
| Create: `content/selectionBubble/glossaryAdd.ts` | Global glossary append |
| Create: `content/selectionBubble/shell.ts` | Dialog lifecycle, pin, reposition, apply modes |
| Create: `content/selectionBubble/index.ts` | Barrel re-exports for orchestrator |
| Create: `content/__tests__/selectionBubble/position.test.ts` | Position unit tests |
| Create: `content/__tests__/selectionBubble/contentSentence.test.ts` | Sentence content tests |
| Create: `content/__tests__/selectionBubble/glossaryAdd.test.ts` | Glossary dedup/append |
| Create: `content/__tests__/selectionBubble/speak.test.ts` | SpeakController mocks |
| Create: `content/__tests__/selectionBubble/shell.pin.test.ts` | Pin dismiss matrix |
| Modify: `content/textSelection.ts` | Thin orchestration using selectionBubble modules |
| Modify: `styles/tooltip.css` | Full visual redesign + tokens |
| Modify: `content/__tests__/textSelection.dictionary.test.ts` | Point at new DOM classes / shell |
| Modify: `README.md` | Document new selection-bubble actions |

**Do not modify in Phase A:** background `translateSelection` handler logic, dictionary prompts, Options sections, `types/config` schema (no TTS keys yet).

---

### Task 1: Types + pure position helper (TDD)

**Files:**
- Create: `content/selectionBubble/types.ts`
- Create: `content/selectionBubble/position.ts`
- Create: `content/__tests__/selectionBubble/position.test.ts`

**Interfaces:**
- Produces:
  - Constants: `DIALOG_CLASS = 'anyllm-selection-dialog'`, `CHIP_CLASS = 'anyllm-selection-btn'`, legacy alias note that `TOOLTIP_CLASS` in textSelection equals `DIALOG_CLASS` or includes both classes
  - `export type BubblePlacement = 'above' | 'below'`
  - `export interface AnchorRect { left: number; top: number; width: number; height: number }` (viewport coords)
  - `export interface Size { width: number; height: number }`
  - `export interface Viewport { width: number; height: number }`
  - `export interface PositionResult { left: number; top: number; placement: BubblePlacement }` (document coords)
  - `export function computeBubblePosition(args: { anchor: AnchorRect; size: Size; viewport: Viewport; scrollX: number; scrollY: number; gap?: number; margin?: number }): PositionResult`

- [ ] **Step 1: Write the failing unit test**

Create `content/__tests__/selectionBubble/position.test.ts`:

```ts
/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from 'vitest';
import { computeBubblePosition } from '@/content/selectionBubble/position';

describe('computeBubblePosition', () => {
  const viewport = { width: 1000, height: 800 };
  const size = { width: 320, height: 160 };

  it('places above when there is room', () => {
    const r = computeBubblePosition({
      anchor: { left: 400, top: 300, width: 100, height: 20 },
      size,
      viewport,
      scrollX: 0,
      scrollY: 0,
      gap: 8,
      margin: 8,
    });
    expect(r.placement).toBe('above');
    expect(r.top).toBeLessThan(300);
    expect(r.left).toBeGreaterThanOrEqual(8);
    expect(r.left + size.width).toBeLessThanOrEqual(viewport.width - 8);
  });

  it('places below when near the top edge', () => {
    const r = computeBubblePosition({
      anchor: { left: 400, top: 20, width: 100, height: 20 },
      size,
      viewport,
      scrollX: 0,
      scrollY: 0,
    });
    expect(r.placement).toBe('below');
    expect(r.top).toBeGreaterThan(20);
  });

  it('clamps horizontally near the right edge', () => {
    const r = computeBubblePosition({
      anchor: { left: 950, top: 400, width: 40, height: 20 },
      size,
      viewport,
      scrollX: 0,
      scrollY: 0,
      margin: 8,
    });
    expect(r.left + size.width).toBeLessThanOrEqual(viewport.width - 8);
  });

  it('adds scroll offsets to document coordinates', () => {
    const r = computeBubblePosition({
      anchor: { left: 100, top: 200, width: 50, height: 20 },
      size,
      viewport,
      scrollX: 50,
      scrollY: 100,
    });
    expect(r.left).toBeGreaterThanOrEqual(50);
    expect(r.top).toBeGreaterThanOrEqual(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run content/__tests__/selectionBubble/position.test.ts`  
Expected: FAIL (module not found)

- [ ] **Step 3: Implement types + position**

`content/selectionBubble/types.ts`:

```ts
export const DIALOG_CLASS = 'anyllm-selection-dialog';
/** Legacy class retained on the dialog root for any external CSS/tests during migration. */
export const DIALOG_LEGACY_CLASS = 'anyllm-selection-tooltip';
export const CHIP_CLASS = 'anyllm-selection-btn';

export type BubblePlacement = 'above' | 'below';
export type BubbleMode = 'loading' | 'sentence' | 'dictionary' | 'error';

export interface AnchorRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface Size {
  width: number;
  height: number;
}

export interface Viewport {
  width: number;
  height: number;
}

export interface PositionResult {
  left: number;
  top: number;
  placement: BubblePlacement;
}

export type SelectionActionId = 'copy' | 'retry' | 'speak' | 'glossary';

export interface BubbleActionHandlers {
  onCopy: () => void | Promise<void>;
  onRetry: () => void | Promise<void>;
  onSpeak: () => void | Promise<void>;
  onGlossary: () => void | Promise<void>;
  onPin: () => void;
  onClose: () => void;
  onToggleOriginal?: () => void;
}
```

`content/selectionBubble/position.ts`:

```ts
import type { AnchorRect, PositionResult, Size, Viewport } from './types';

export function computeBubblePosition(args: {
  anchor: AnchorRect;
  size: Size;
  viewport: Viewport;
  scrollX: number;
  scrollY: number;
  gap?: number;
  margin?: number;
}): PositionResult {
  const gap = args.gap ?? 8;
  const margin = args.margin ?? 8;
  const { anchor, size, viewport, scrollX, scrollY } = args;

  const spaceAbove = anchor.top - margin;
  const spaceBelow = viewport.height - (anchor.top + anchor.height) - margin;
  const need = size.height + gap;

  let placement: 'above' | 'below';
  if (spaceAbove >= need) {
    placement = 'above';
  } else if (spaceBelow >= need) {
    placement = 'below';
  } else {
    placement = spaceAbove >= spaceBelow ? 'above' : 'below';
  }

  let topViewport: number;
  if (placement === 'above') {
    topViewport = anchor.top - gap - size.height;
  } else {
    topViewport = anchor.top + anchor.height + gap;
  }
  topViewport = Math.max(
    margin,
    Math.min(topViewport, viewport.height - size.height - margin),
  );

  const anchorMidX = anchor.left + anchor.width / 2;
  let leftViewport = anchorMidX - size.width / 2;
  leftViewport = Math.max(
    margin,
    Math.min(leftViewport, viewport.width - size.width - margin),
  );

  return {
    left: leftViewport + scrollX,
    top: topViewport + scrollY,
    placement,
  };
}
```

- [ ] **Step 4: Run tests — expect PASS**

Run: `pnpm exec vitest run content/__tests__/selectionBubble/position.test.ts`

- [ ] **Step 5: Commit**

```bash
git add content/selectionBubble/types.ts content/selectionBubble/position.ts content/__tests__/selectionBubble/position.test.ts
git commit -m "feat(selection-bubble): add position helper and types"
```

---

### Task 2: Icons + content builders (loading, sentence, dictionary, error)

**Files:**
- Create: `content/selectionBubble/icons.ts`
- Create: `content/selectionBubble/contentLoading.ts`
- Create: `content/selectionBubble/contentSentence.ts`
- Create: `content/selectionBubble/contentDictionary.ts`
- Create: `content/selectionBubble/contentError.ts`
- Create: `content/__tests__/selectionBubble/contentSentence.test.ts`
- Create: `content/__tests__/selectionBubble/contentDictionary.test.ts`

**Interfaces:**
- Produces:
  - `createIcon(name: 'copy' | 'retry' | 'speak' | 'stop' | 'glossary' | 'pin' | 'close' | 'chevron'): SVGSVGElement`
  - `buildLoadingContent(originalPreview?: string): HTMLElement`
  - `buildSentenceContent(args: { translatedText: string; originalText: string; originalExpanded: boolean; onToggleOriginal: () => void }): HTMLElement`
  - `buildDictionaryContent(originalText: string, dict: SelectionDictionaryPayload, translatedText: string): HTMLElement` — class `anyllm-word-dictionary`; include section labels; **no** action row inside (footer owns actions)
  - `buildErrorContent(message: string): HTMLElement`
  - Re-export path: `buildDictionaryTooltipContent` in `textSelection.ts` should call `buildDictionaryContent` and optionally append actions for backward-compat tests **or** update tests to not require actions inside dictionary root (prefer update tests: actions live in footer)

- [ ] **Step 1: Write failing sentence content test**

```ts
/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { buildSentenceContent } from '@/content/selectionBubble/contentSentence';

describe('buildSentenceContent', () => {
  it('shows translation and collapsed original by default', () => {
    const onToggle = vi.fn();
    const el = buildSentenceContent({
      translatedText: 'Xin chào',
      originalText: 'Hello',
      originalExpanded: false,
      onToggleOriginal: onToggle,
    });
    expect(el.querySelector('[data-anyllm-role="selection-translation"]')?.textContent).toBe(
      'Xin chào',
    );
    expect(el.querySelector('[data-anyllm-role="selection-original"]')).toBeNull();
    const toggle = el.querySelector('[data-anyllm-role="selection-original-toggle"]') as HTMLButtonElement;
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    toggle.click();
    expect(onToggle).toHaveBeenCalledOnce();
  });

  it('shows original when expanded', () => {
    const el = buildSentenceContent({
      translatedText: 'Xin chào',
      originalText: 'Hello',
      originalExpanded: true,
      onToggleOriginal: () => {},
    });
    expect(el.querySelector('[data-anyllm-role="selection-original"]')?.textContent).toBe('Hello');
  });
});
```

- [ ] **Step 2: Write failing dictionary content test**

```ts
/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from 'vitest';
import { buildDictionaryContent } from '@/content/selectionBubble/contentDictionary';

describe('buildDictionaryContent', () => {
  it('renders section labels, word, phonetic, pos, translation, context', () => {
    const el = buildDictionaryContent(
      'hello',
      {
        phonetic: '/həˈloʊ/',
        definitions: [
          {
            pos: 'excl.',
            meaning: 'xin chào',
            example: { source: 'Hello!', target: 'Xin chào!' },
          },
        ],
        translation: 'xin chào',
        contextualAnalysis: 'A greeting.',
      },
      'xin chào',
    );
    expect(el.className).toContain('anyllm-word-dictionary');
    expect(el.querySelector('.anyllm-word-dictionary-word')?.textContent).toBe('hello');
    expect(el.querySelector('.anyllm-word-dictionary-phonetic')?.textContent).toBe('/həˈloʊ/');
    expect(el.querySelector('.anyllm-word-dictionary-pos')?.textContent).toBe('excl.');
    expect(el.querySelector('.anyllm-word-dictionary-translation')?.textContent).toBe('xin chào');
    expect(el.querySelector('.anyllm-word-dictionary-context')?.textContent).toContain('greeting');
    expect(el.textContent).toMatch(/Definitions/i);
    expect(el.textContent).toMatch(/In this context/i);
    // No embedded footer actions
    expect(el.querySelector('.anyllm-tooltip-actions')).toBeNull();
  });
});
```

- [ ] **Step 3: Run tests — expect FAIL**

Run: `pnpm exec vitest run content/__tests__/selectionBubble/contentSentence.test.ts content/__tests__/selectionBubble/contentDictionary.test.ts`

- [ ] **Step 4: Implement icons + content modules**

`icons.ts` — create 16×16 stroke SVGs (`currentColor`) for: copy (existing path from textSelection), retry (circular arrows path), speak (speaker), stop (square), glossary (book), pin, close (X), chevron-down.

`contentLoading.ts`:

```ts
export function buildLoadingContent(originalPreview?: string): HTMLElement {
  const root = document.createElement('div');
  root.className = 'anyllm-tooltip-loading';
  root.setAttribute('data-anyllm-role', 'selection-loading');

  const spinner = document.createElement('div');
  spinner.className = 'anyllm-tooltip-spinner';
  spinner.setAttribute('aria-hidden', 'true');

  const label = document.createElement('span');
  label.textContent = 'Translating…';

  root.appendChild(spinner);
  root.appendChild(label);

  if (originalPreview?.trim()) {
    const preview = document.createElement('div');
    preview.className = 'anyllm-selection-original-preview';
    preview.setAttribute('data-anyllm-role', 'selection-original-preview');
    const text = originalPreview.trim();
    preview.textContent = text.length > 80 ? `${text.slice(0, 80)}…` : text;
    root.appendChild(preview);
  }
  return root;
}
```

`contentSentence.ts`:

```ts
export function buildSentenceContent(args: {
  translatedText: string;
  originalText: string;
  originalExpanded: boolean;
  onToggleOriginal: () => void;
}): HTMLElement {
  const root = document.createElement('div');
  root.className = 'anyllm-selection-sentence';
  root.setAttribute('data-anyllm-role', 'selection-sentence');

  const translation = document.createElement('div');
  translation.className = 'anyllm-tooltip-text';
  translation.setAttribute('data-anyllm-role', 'selection-translation');
  translation.textContent = args.translatedText;
  root.appendChild(translation);

  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'anyllm-selection-original-toggle';
  toggle.setAttribute('data-anyllm-role', 'selection-original-toggle');
  toggle.setAttribute('aria-expanded', args.originalExpanded ? 'true' : 'false');
  toggle.textContent = args.originalExpanded ? 'Hide original' : 'Show original';
  toggle.addEventListener('click', (e) => {
    e.stopPropagation();
    args.onToggleOriginal();
  });
  root.appendChild(toggle);

  if (args.originalExpanded) {
    const original = document.createElement('div');
    original.className = 'anyllm-selection-original';
    original.setAttribute('data-anyllm-role', 'selection-original');
    original.textContent = args.originalText;
    root.appendChild(original);
  }
  return root;
}
```

`contentDictionary.ts` — migrate logic from current `buildDictionaryTooltipContent` in `textSelection.ts`:

- Same field rendering and class names for word/phonetic/defs/pos/meaning/example/translation/context
- Add small section label elements:
  - Before defs list: `anyllm-selection-section-label` text `Definitions` (only if defs present)
  - Before translation block: label `Translation`
  - Before context: label `In this context`
- **Do not** append `.anyllm-tooltip-actions`

`contentError.ts`:

```ts
export function buildErrorContent(message: string): HTMLElement {
  const root = document.createElement('div');
  root.className = 'anyllm-selection-error';
  root.setAttribute('data-anyllm-role', 'selection-error');
  root.setAttribute('role', 'alert');

  const title = document.createElement('div');
  title.className = 'anyllm-selection-error-title';
  title.textContent = 'Translation failed';

  const detail = document.createElement('div');
  detail.className = 'anyllm-selection-error-detail';
  detail.textContent = message || 'Something went wrong. Try again.';

  root.appendChild(title);
  root.appendChild(detail);
  return root;
}
```

- [ ] **Step 5: Run content tests — PASS**

Run: `pnpm exec vitest run content/__tests__/selectionBubble/contentSentence.test.ts content/__tests__/selectionBubble/contentDictionary.test.ts`

- [ ] **Step 6: Commit**

```bash
git add content/selectionBubble/icons.ts content/selectionBubble/content*.ts content/__tests__/selectionBubble/content*.test.ts
git commit -m "feat(selection-bubble): add content builders for loading sentence dictionary error"
```

---

### Task 3: glossaryAdd + SpeakController (TDD)

**Files:**
- Create: `content/selectionBubble/glossaryAdd.ts`
- Create: `content/selectionBubble/speak.ts`
- Create: `content/__tests__/selectionBubble/glossaryAdd.test.ts`
- Create: `content/__tests__/selectionBubble/speak.test.ts`

**Interfaces:**
- Produces:
  - `export type GlossaryAddResult = { status: 'added' } | { status: 'duplicate' } | { status: 'invalid'; reason: string } | { status: 'error'; reason: string }`
  - `export async function addToGlobalGlossary(source: string, target: string): Promise<GlossaryAddResult>`
  - `export class SpeakController { speak(text: string, lang?: string): void; stop(): void; isSpeaking(): boolean; }`

- [ ] **Step 1: Write glossary tests**

```ts
/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/config', () => ({
  loadSettings: vi.fn(),
  updateSettings: vi.fn(),
}));

import { loadSettings, updateSettings } from '@/lib/config';
import { addToGlobalGlossary } from '@/content/selectionBubble/glossaryAdd';

describe('addToGlobalGlossary', () => {
  beforeEach(() => {
    vi.mocked(loadSettings).mockReset();
    vi.mocked(updateSettings).mockReset();
  });

  it('returns invalid for empty source/target', async () => {
    await expect(addToGlobalGlossary('  ', 'x')).resolves.toEqual({
      status: 'invalid',
      reason: 'Missing source or translation',
    });
  });

  it('returns duplicate when source exists', async () => {
    vi.mocked(loadSettings).mockResolvedValue({
      glossary: [{ id: '1', source: 'Hello', target: 'Xin chào' }],
    } as never);
    await expect(addToGlobalGlossary('hello', 'xin chào')).resolves.toEqual({
      status: 'duplicate',
    });
    expect(updateSettings).not.toHaveBeenCalled();
  });

  it('appends new entry', async () => {
    vi.mocked(loadSettings).mockResolvedValue({ glossary: [] } as never);
    vi.mocked(updateSettings).mockImplementation(async (p) => p as never);
    const r = await addToGlobalGlossary('foo', 'bar');
    expect(r).toEqual({ status: 'added' });
    expect(updateSettings).toHaveBeenCalledOnce();
    const arg = vi.mocked(updateSettings).mock.calls[0][0];
    expect(arg.glossary).toHaveLength(1);
    expect(arg.glossary![0].source).toBe('foo');
    expect(arg.glossary![0].target).toBe('bar');
    expect(arg.glossary![0].id).toBeTruthy();
  });
});
```

- [ ] **Step 2: Write speak tests**

```ts
/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SpeakController } from '@/content/selectionBubble/speak';

describe('SpeakController', () => {
  let speakMock: ReturnType<typeof vi.fn>;
  let cancelMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    speakMock = vi.fn();
    cancelMock = vi.fn();
    vi.stubGlobal('speechSynthesis', {
      speak: speakMock,
      cancel: cancelMock,
      speaking: false,
    });
    vi.stubGlobal(
      'SpeechSynthesisUtterance',
      class {
        text: string;
        lang = '';
        onend: (() => void) | null = null;
        onerror: (() => void) | null = null;
        constructor(text: string) {
          this.text = text;
        }
      },
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('speaks text with lang', () => {
    const c = new SpeakController();
    c.speak('hello', 'en');
    expect(speakMock).toHaveBeenCalledOnce();
    const utt = speakMock.mock.calls[0][0];
    expect(utt.text).toBe('hello');
    expect(utt.lang).toBe('en');
  });

  it('stop cancels synthesis', () => {
    const c = new SpeakController();
    c.speak('hello', 'en');
    c.stop();
    expect(cancelMock).toHaveBeenCalled();
    expect(c.isSpeaking()).toBe(false);
  });
});
```

- [ ] **Step 3: Run — expect FAIL**

Run: `pnpm exec vitest run content/__tests__/selectionBubble/glossaryAdd.test.ts content/__tests__/selectionBubble/speak.test.ts`

- [ ] **Step 4: Implement**

`glossaryAdd.ts`:

```ts
import { loadSettings, updateSettings } from '@/lib/config';
import { findDuplicateSource } from '@/lib/glossary';

export type GlossaryAddResult =
  | { status: 'added' }
  | { status: 'duplicate' }
  | { status: 'invalid'; reason: string }
  | { status: 'error'; reason: string };

export async function addToGlobalGlossary(
  source: string,
  target: string,
): Promise<GlossaryAddResult> {
  const src = source.trim();
  const tgt = target.trim();
  if (!src || !tgt) {
    return { status: 'invalid', reason: 'Missing source or translation' };
  }
  try {
    const settings = await loadSettings();
    const glossary = settings.glossary ?? [];
    if (findDuplicateSource(glossary, src)) {
      return { status: 'duplicate' };
    }
    await updateSettings({
      glossary: [
        ...glossary,
        { id: crypto.randomUUID(), source: src, target: tgt },
      ],
    });
    return { status: 'added' };
  } catch (e) {
    return {
      status: 'error',
      reason: e instanceof Error ? e.message : 'Failed to update glossary',
    };
  }
}
```

`speak.ts`:

```ts
export class SpeakController {
  private speaking = false;

  isSpeaking(): boolean {
    return this.speaking;
  }

  speak(text: string, lang?: string): void {
    const trimmed = text.trim();
    if (!trimmed) return;
    if (typeof speechSynthesis === 'undefined' || typeof SpeechSynthesisUtterance === 'undefined') {
      throw new Error('Speech not supported in this browser');
    }
    this.stop();
    const utt = new SpeechSynthesisUtterance(trimmed);
    if (lang) utt.lang = lang;
    utt.onend = () => {
      this.speaking = false;
    };
    utt.onerror = () => {
      this.speaking = false;
    };
    this.speaking = true;
    speechSynthesis.speak(utt);
  }

  stop(): void {
    if (typeof speechSynthesis !== 'undefined') {
      speechSynthesis.cancel();
    }
    this.speaking = false;
  }
}
```

- [ ] **Step 5: Run — PASS**

Run: `pnpm exec vitest run content/__tests__/selectionBubble/glossaryAdd.test.ts content/__tests__/selectionBubble/speak.test.ts`

- [ ] **Step 6: Commit**

```bash
git add content/selectionBubble/glossaryAdd.ts content/selectionBubble/speak.ts content/__tests__/selectionBubble/glossaryAdd.test.ts content/__tests__/selectionBubble/speak.test.ts
git commit -m "feat(selection-bubble): add glossary append and browser SpeakController"
```

---

### Task 4: Actions bar helper

**Files:**
- Create: `content/selectionBubble/actions.ts`
- Create: `content/__tests__/selectionBubble/actions.test.ts`

**Interfaces:**
- Produces:
  - `export function buildFooterActions(args: { handlers: Pick<BubbleActionHandlers, 'onCopy' | 'onRetry' | 'onSpeak' | 'onGlossary'>; speaking?: boolean; disabled?: Partial<Record<SelectionActionId, boolean>> }): HTMLElement`
  - Footer root class `anyllm-selection-footer` / `data-anyllm-role="selection-footer"`
  - Each button: `data-anyllm-role="selection-action"` and `data-action="copy|retry|speak|glossary"`
  - `export function setStatusLine(footerRoot: HTMLElement, message: string, kind?: 'info' | 'success' | 'error'): void`
  - `export function clearStatusLine(footerRoot: HTMLElement): void`

- [ ] **Step 1: Write test**

```ts
/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { buildFooterActions, setStatusLine } from '@/content/selectionBubble/actions';

describe('buildFooterActions', () => {
  it('renders four action buttons and wires click', () => {
    const handlers = {
      onCopy: vi.fn(),
      onRetry: vi.fn(),
      onSpeak: vi.fn(),
      onGlossary: vi.fn(),
    };
    const el = buildFooterActions({ handlers });
    expect(el.querySelectorAll('[data-anyllm-role="selection-action"]')).toHaveLength(4);
    (el.querySelector('[data-action="copy"]') as HTMLButtonElement).click();
    expect(handlers.onCopy).toHaveBeenCalledOnce();
  });

  it('shows status line', () => {
    const el = buildFooterActions({
      handlers: { onCopy: () => {}, onRetry: () => {}, onSpeak: () => {}, onGlossary: () => {} },
    });
    setStatusLine(el, 'Added to glossary', 'success');
    expect(el.querySelector('[data-anyllm-role="selection-status"]')?.textContent).toBe(
      'Added to glossary',
    );
  });
});
```

- [ ] **Step 2: Implement `actions.ts`** — buttons with `type="button"`, `aria-label`, SVG from icons, class `anyllm-selection-action-btn`. Speak label toggles to Stop when `speaking`. Disabled buttons use `disabled` attribute.

- [ ] **Step 3: Tests PASS + commit**

```bash
git add content/selectionBubble/actions.ts content/__tests__/selectionBubble/actions.test.ts
git commit -m "feat(selection-bubble): add footer action bar"
```

---

### Task 5: Shell — dialog lifecycle, pin matrix, apply modes

**Files:**
- Create: `content/selectionBubble/shell.ts`
- Create: `content/selectionBubble/chip.ts`
- Create: `content/selectionBubble/index.ts`
- Create: `content/__tests__/selectionBubble/shell.pin.test.ts`

**Interfaces:**
- Produces:
  - `export interface ShellShowLoadingArgs { anchor: AnchorRect; originalText: string; sourceLanguage: string; targetLanguage: string; handlers: BubbleActionHandlers }`
  - `export function getDialogEl(): HTMLElement | null`
  - `export function isPinned(): boolean`
  - `export function setPinned(pinned: boolean): void`
  - `export function showLoading(args: ShellShowLoadingArgs): HTMLElement`
  - `export function applySentence(args: { translatedText: string; originalText: string }): void`
  - `export function applyDictionary(args: { originalText: string; dict: SelectionDictionaryPayload; translatedText: string }): void`
  - `export function applyError(message: string): void`
  - `export function removeDialog(): void`
  - `export function reposition(): void` — measures dialog, uses `computeBubblePosition`, sets `left`/`top` and `data-placement`
  - `export function shouldDismissOnOutsideClick(): boolean` — `!isPinned()`
  - `createTranslateChip(xDoc: number, yDoc: number): HTMLButtonElement` in `chip.ts`
  - `removeTranslateChip(): void`
  - Header: lang chips via `getLanguageNativeName` or short code; pin button `aria-pressed`; close button
  - Result live region: body wrapper `aria-live="polite"`
  - Internal: `originalExpanded` state; toggle rebuilds sentence body + `reposition()`
  - Internal: keep references to current handlers and last content for rebuilds
  - `__setDialogForTest(el: HTMLElement | null)` if needed for applySelectionResponse tests

**Shell DOM structure:**

```html
<div class="anyllm-selection-dialog anyllm-selection-tooltip" role="dialog" data-anyllm-role="selection-dialog" data-placement="above|below">
  <div class="anyllm-selection-caret" data-anyllm-role="selection-caret" aria-hidden="true"></div>
  <div class="anyllm-selection-header" data-anyllm-role="selection-header">
    <div class="anyllm-selection-lang" data-anyllm-role="selection-lang">Auto → Tiếng Việt</div>
    <div class="anyllm-selection-header-actions">
      <button type="button" data-action="pin" aria-pressed="false" aria-label="Pin">…</button>
      <button type="button" data-action="close" aria-label="Close">…</button>
    </div>
  </div>
  <div class="anyllm-selection-body" data-anyllm-role="selection-body" aria-live="polite">…</div>
  <div class="anyllm-selection-footer" data-anyllm-role="selection-footer">…</div>
</div>
```

- [ ] **Step 1: Pin matrix test**

```ts
/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  showLoading,
  setPinned,
  isPinned,
  shouldDismissOnOutsideClick,
  removeDialog,
  applySentence,
} from '@/content/selectionBubble/shell';

const handlers = {
  onCopy: () => {},
  onRetry: () => {},
  onSpeak: () => {},
  onGlossary: () => {},
  onPin: () => setPinned(!isPinned()),
  onClose: () => removeDialog(),
};

describe('shell pin', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    removeDialog();
  });
  afterEach(() => {
    removeDialog();
  });

  it('dismisses on outside click when unpinned', () => {
    showLoading({
      anchor: { left: 100, top: 100, width: 40, height: 20 },
      originalText: 'hi',
      sourceLanguage: 'en',
      targetLanguage: 'vi',
      handlers,
    });
    expect(shouldDismissOnOutsideClick()).toBe(true);
  });

  it('does not dismiss on outside click when pinned', () => {
    showLoading({
      anchor: { left: 100, top: 100, width: 40, height: 20 },
      originalText: 'hi',
      sourceLanguage: 'en',
      targetLanguage: 'vi',
      handlers,
    });
    setPinned(true);
    expect(shouldDismissOnOutsideClick()).toBe(false);
    expect(isPinned()).toBe(true);
  });

  it('applySentence fills body with translation', () => {
    showLoading({
      anchor: { left: 100, top: 100, width: 40, height: 20 },
      originalText: 'Hello',
      sourceLanguage: 'en',
      targetLanguage: 'vi',
      handlers,
    });
    applySentence({ translatedText: 'Xin chào', originalText: 'Hello' });
    expect(document.querySelector('[data-anyllm-role="selection-translation"]')?.textContent).toBe(
      'Xin chào',
    );
  });
});
```

- [ ] **Step 2: Implement shell + chip + index barrel**

Implementation notes:

- Module-level `dialogEl`, `pinned`, `currentAnchor`, `currentHandlers`, `currentLangs`, `originalExpanded`, `lastMode`, `lastPayload`
- `showLoading` removes previous dialog (unless you preserve pin flag across replace: **when replacing while pinned, keep `pinned === true`**)
- Spec: new translate while pinned replaces content and keeps pin — implement `showLoading` to accept optional preserve pin (default: keep current pin if already pinned)
- `setPinned` updates pin button `aria-pressed` and class `is-pinned`
- `reposition`: `const rect = dialog.getBoundingClientRect()`; `computeBubblePosition({ anchor: currentAnchor, size: { width: rect.width, height: rect.height }, viewport: { width: innerWidth, height: innerHeight }, scrollX, scrollY })`; apply styles; set `data-placement`
- Chip: `<button type="button" class="anyllm-selection-btn">` + brand img via `chrome.runtime.getURL('icon/128.png')` — guard in tests if chrome missing
- `index.ts` re-exports public shell/chip/content/glossary/speak symbols

- [ ] **Step 3: Tests PASS + commit**

```bash
git add content/selectionBubble/shell.ts content/selectionBubble/chip.ts content/selectionBubble/index.ts content/__tests__/selectionBubble/shell.pin.test.ts
git commit -m "feat(selection-bubble): dialog shell with pin and content modes"
```

---

### Task 6: Wire `textSelection.ts` orchestration

**Files:**
- Modify: `content/textSelection.ts` (major thin rewrite)
- Modify: `content/__tests__/textSelection.dictionary.test.ts`

**Interfaces (preserve):**
- `initTextSelection(): () => void`
- `setTextSelectionEnabled(enabled: boolean): void`
- `isTextSelectionEnabled(): boolean`
- `translateSelectedTextViaContextMenu(text: string): Promise<void>`
- `buildDictionaryTooltipContent` → re-export wrapper around `buildDictionaryContent` (for external imports)
- `applySelectionResponse(originalText, response)` → maps to shell `applyDictionary` / `applySentence` / `applyError`
- `TOOLTIP_CLASS` → export `DIALOG_CLASS` value **and** include legacy class on element (`anyllm-selection-dialog anyllm-selection-tooltip`)
- `removeTooltip` → `removeDialog` + speak stop
- `removeTranslateButton` → chip remove
- `__setCurrentTooltipForTest` → set shell dialog for tests

**Orchestration logic:**

```ts
// Pseudocode for runSelectionTranslation
selectionSession++;
const requestSession = selectionSession;
const settings = await loadSettings();
const handlers = {
  onClose: () => { speak.stop(); removeDialog(); removeChip(); },
  onPin: () => setPinned(!isPinned()),
  onCopy: async () => { /* clipboard last primary text; setStatusLine */ },
  onRetry: async () => { await runSelectionTranslation(lastText, lastAnchor, lastRange); },
  onSpeak: () => { /* toggle SpeakController with targetLanguage */ },
  onGlossary: async () => { /* addToGlobalGlossary(original, primary); status */ },
};
showLoading({ anchor, originalText: selectedText, sourceLanguage, targetLanguage, handlers });
// sendMessage translateSelection …
// stale guard
applySelectionResponse(selectedText, response);
reposition();
```

**Dismiss handlers:**

```ts
function onClickOutside(e: MouseEvent) {
  if (target inside dialog or chip) return;
  if (!shouldDismissOnOutsideClick()) {
    // still remove chip if outside? Spec: unpinned removes both; pinned keeps bubble.
    // When pinned, remove chip only if click not on chip — chip can stay for new selection flow via mouseup.
    removeChip(); // optional: only when not clicking chip
    return;
  }
  speak.stop();
  removeDialog();
  removeChip();
}
```

**mouseup:** same as today — show chip with real button; mousedown/click starts translation.

**Escape:** stop speak; remove dialog + chip always (even if pinned).

**applySelectionResponse:** if no dialog, return; on failure `applyError`; on dictionary mode with fields `applyDictionary`; else `applySentence`. Store last primary text for copy/speak/glossary on module state.

- [ ] **Step 1: Update dictionary tests**

- `seedTooltip` must create dialog via shell or minimal structure with `data-anyllm-role="selection-body"` that `applySelectionResponse` fills — easiest: call `showLoading` then `applySelectionResponse`, or implement `__setCurrentTooltipForTest` to inject shell state.
- Sentence assertions: look for `[data-anyllm-role="selection-translation"]` or `.anyllm-tooltip-text` (keep class on translation node).
- Dictionary: still `.anyllm-word-dictionary`.
- Remove expectation of actions inside dictionary root if present.

- [ ] **Step 2: Implement orchestration rewrite**

Keep `MIN_SELECTION_CHARS = 2`, dictionary candidate + `extractSelectionContext` logic unchanged.

- [ ] **Step 3: Run tests**

```bash
pnpm exec vitest run content/__tests__/textSelection.dictionary.test.ts content/__tests__/selectionBubble/
```

Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add content/textSelection.ts content/__tests__/textSelection.dictionary.test.ts
git commit -m "feat(selection-bubble): wire orchestrator to modular shell"
```

---

### Task 7: CSS visual redesign

**Files:**
- Modify: `styles/tooltip.css` (rewrite sections for dialog, header, footer, caret, tokens, dark, reduced motion)

**Requirements (implement fully in file):**

1. CSS variables on `.anyllm-selection-dialog` per spec §6.1.
2. Layout: flex column; header/footer flex-shrink 0; body `overflow-y: auto; max-height: min(360px, 50vh)`.
3. Caret: CSS triangle; flip with `[data-placement="below"]` / `above`.
4. Primary color `#0ea5e9` for spinner border-top, POS pills, focus rings, lang accent — **remove `#1a73e8`**.
5. Action buttons 32×32, hover bg soft; pin `.is-active` uses accent amber.
6. Error title uses danger color.
7. Dark mode: both `@media (prefers-color-scheme: dark)` and `.anyllm-dark` covering all new classes.
8. `@media (prefers-reduced-motion: reduce)` — disable transform animations.
9. Keep `.anyllm-selection-btn` styles; ensure chip is `button` reset (border none, padding 0).
10. Optional glass with solid fallback.

- [ ] **Step 1: Rewrite `styles/tooltip.css`** to match above (full file rewrite is OK if structure preserved for dictionary class names).

- [ ] **Step 2: Commit**

```bash
git add styles/tooltip.css
git commit -m "style(selection-bubble): brand tokens header body footer caret"
```

---

### Task 8: README + full regression

**Files:**
- Modify: `README.md` (selection translate bullet)
- Run full related tests + compile

- [ ] **Step 1: Update README** selection bullet to mention: dictionary mode, copy, retry, speak, add to glossary, pin.

Example:

```markdown
- **Text selection translate** — select text, click the floating icon; results open in a branded dialog with copy, retry, speak, add to glossary, and pin. Short selections use **dictionary mode** (phonetic, POS, definitions, examples, context) when enabled; longer text uses translation with collapsible original.
```

- [ ] **Step 2: Run regression**

```bash
pnpm exec vitest run content/__tests__/textSelection.dictionary.test.ts content/__tests__/selectionBubble/ content/__tests__/keyboardShortcuts.test.ts
pnpm exec tsc --noEmit
```

Expected: all PASS / no errors related to selection bubble.

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs: selection bubble actions and redesign notes"
```

- [ ] **Step 4: Update beads**

```bash
bd update AnyLLMTranslate-cdj --notes="Phase A implementation complete per plan 2026-07-23-selection-bubble-full-redesign.md"
# Do NOT close until Phase B decision or explicit Phase A done acceptance
```

---

## Phase B (not in this plan)

Create a **separate** plan later: `docs/superpowers/plans/YYYY-MM-DD-selection-tts-providers.md` covering:

- `ExtensionSettings.tts` schema + defaults + migration
- Options TTS section
- Background message for provider audio
- `SpeakController` backend resolution with browser fallback

---

## Spec coverage checklist

| Spec item | Task |
|-----------|------|
| Position pure math + clamp | Task 1 |
| Brand tokens / no Google blue | Task 7 |
| Header / body / sticky footer / caret | Tasks 5, 7 |
| Loading + original preview | Tasks 2, 5 |
| Sentence collapsible original | Tasks 2, 5, 6 |
| Dictionary section labels | Task 2 |
| Error body | Tasks 2, 5, 6 |
| Copy / Retry / Speak / Glossary | Tasks 3, 4, 6 |
| Pin header + dismiss matrix | Tasks 5, 6 |
| Dialog a11y roles/focus | Tasks 5, 7 |
| Stale session + translateSelection | Task 6 |
| Global glossary | Task 3 |
| Browser TTS only Phase A | Task 3 |
| README | Task 8 |
| Modular files | Tasks 1–6 |
| Phase B multi-provider TTS | Deferred separate plan |

---

## Type consistency notes

- Dialog classes: `DIALOG_CLASS` + `DIALOG_LEGACY_CLASS` both on root.
- `TOOLTIP_CLASS` export remains for tests — set to a selector-friendly string; tests using `.${TOOLTIP_CLASS}` should still find the dialog (include legacy class `anyllm-selection-tooltip` on root).
- `buildDictionaryTooltipContent` remains exported; implementation delegates to `buildDictionaryContent` (actions no longer inside — update tests).
- `SpeakController` Phase A only; no provider types yet.
