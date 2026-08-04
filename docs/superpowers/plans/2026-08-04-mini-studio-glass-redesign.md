# Mini Studio Glass Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Redesign the in-player subtitle mini studio panel and anchor button with a glassmorphism, sectioned UI and live preview, without changing any settings write paths.

**Architecture:** Presentation-layer refactor of `content/playerChrome/`. Widget builders (`widgets.ts`) produce native-input-backed custom controls; a view module (`miniStudioView.ts`) composes the panel DOM and owns the glass stylesheet (`miniStudioCss.ts`); `miniStudio.ts` keeps its `attachMiniStudio` contract and re-binds to the new view; `button.ts` gains an SVG icon + state handle, surfaced through `ChromeShell.setButtonState`.

**Tech Stack:** TypeScript, WXT content scripts, shadow DOM, Vitest + jsdom.

**Spec:** `docs/superpowers/specs/2026-08-04-mini-studio-glass-redesign-design.md`

## Global Constraints

- Do NOT change `content/playerChrome/prefs.ts` or any settings/storage schema — all writes keep flowing through `setSubtitlesEnabled`, `setAppearance`, `setTabKnob`, `setActiveGlossaryList`.
- Preserve every existing `data-action` value: `enable`, `displayMode`, `fontSize`, `position`, `opacity`, `glossary`, `knob`, `open-options`. New: `close`.
- Preserve the `attachMiniStudio` export signature (extend args with optional `setButtonState` only) and the `MiniStudioControllers` interface — `index.ts` must need no behavioral changes.
- No React / no frameworks in the shadow DOM. No new npm dependencies.
- All widgets wrap native inputs (`checkbox`, `radio`, `range`, `select`) — no custom-built listboxes.
- Respect `prefers-reduced-motion` for every animation added.
- Test env: Vitest + jsdom; tests live in `content/__tests__/playerChrome/`. Run tests with `npx vitest run <path>`.
- Non-interactive shell flags per AGENTS.md (`rm -f`, etc.).

---

### Task 1: Widget builders (`widgets.ts`)

**Files:**
- Create: `content/playerChrome/widgets.ts`
- Test: `content/__tests__/playerChrome/widgets.test.ts`

**Interfaces:**
- Consumes: nothing (pure DOM builders).
- Produces (used by Tasks 2 and 4):
  - `buildToggle(args: { id: string; action: string }): ToggleWidget` where `ToggleWidget = { root: HTMLElement; input: HTMLInputElement }`
  - `buildSegmented(args: { name: string; action: string; options: SegmentedOption[] }): SegmentedWidget` where `SegmentedOption = { value: string; label: string }` and `SegmentedWidget = { root: HTMLElement; inputs: HTMLInputElement[]; setValue(value: string): void; value(): string }`
  - `buildSlider(args: { id: string; action: string; min: number; max: number; step: number }): SliderWidget` where `SliderWidget = { root: HTMLElement; input: HTMLInputElement; setValue(v: number): void }`
  - `buildSelect(args: { id: string; action: string; knob?: string }): SelectWidget` where `SelectWidget = { root: HTMLElement; select: HTMLSelectElement }`

- [x] **Step 1: Write the failing test**

Create `content/__tests__/playerChrome/widgets.test.ts`:

```ts
/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from 'vitest';
import {
  buildToggle,
  buildSegmented,
  buildSlider,
  buildSelect,
} from '@/content/playerChrome/widgets';

describe('buildToggle', () => {
  it('creates a checkbox with data-action inside a toggle root', () => {
    const w = buildToggle({ id: 't1', action: 'enable' });
    expect(w.root.className).toBe('toggle');
    expect(w.input.type).toBe('checkbox');
    expect(w.input.id).toBe('t1');
    expect(w.input.dataset.action).toBe('enable');
    expect(w.root.contains(w.input)).toBe(true);
    expect(w.root.querySelector('.track')).toBeTruthy();
    expect(w.root.querySelector('.thumb')).toBeTruthy();
  });
});

describe('buildSegmented', () => {
  const opts = [
    { value: 'bilingual', label: 'Bilingual' },
    { value: 'translation-only', label: 'Translation only' },
  ];

  it('creates one radio per option with shared name and data-action', () => {
    const w = buildSegmented({ name: 'display', action: 'displayMode', options: opts });
    expect(w.root.getAttribute('role')).toBe('radiogroup');
    expect(w.inputs).toHaveLength(2);
    expect(w.inputs[0].type).toBe('radio');
    expect(w.inputs[0].name).toBe('display');
    expect(w.inputs[0].dataset.action).toBe('displayMode');
    expect(w.root.textContent).toContain('Bilingual');
    expect(w.root.textContent).toContain('Translation only');
  });

  it('setValue checks the matching radio and value() returns it', () => {
    const w = buildSegmented({ name: 'display', action: 'displayMode', options: opts });
    w.setValue('translation-only');
    expect(w.inputs[1].checked).toBe(true);
    expect(w.value()).toBe('translation-only');
  });

  it('setValue falls back to the first option for unknown values', () => {
    const w = buildSegmented({ name: 'display', action: 'displayMode', options: opts });
    w.setValue('nope');
    expect(w.inputs[0].checked).toBe(true);
    expect(w.value()).toBe('bilingual');
  });
});

describe('buildSlider', () => {
  it('creates a range input with min/max/step and data-action', () => {
    const w = buildSlider({ id: 's1', action: 'fontSize', min: 12, max: 36, step: 1 });
    expect(w.input.type).toBe('range');
    expect(w.input.min).toBe('12');
    expect(w.input.max).toBe('36');
    expect(w.input.step).toBe('1');
    expect(w.input.dataset.action).toBe('fontSize');
    expect(w.input.className).toBe('glass-range');
  });

  it('setValue sets value and --fill percentage', () => {
    const w = buildSlider({ id: 's1', action: 'fontSize', min: 12, max: 36, step: 1 });
    w.setValue(24);
    expect(w.input.value).toBe('24');
    expect(w.input.style.getPropertyValue('--fill')).toBe('50%');
  });

  it('updates --fill on input events', () => {
    const w = buildSlider({ id: 's1', action: 'opacity', min: 0, max: 100, step: 5 });
    w.input.value = '25';
    w.input.dispatchEvent(new Event('input', { bubbles: true }));
    expect(w.input.style.getPropertyValue('--fill')).toBe('25%');
  });
});

describe('buildSelect', () => {
  it('wraps a select in a chevron container with data-action', () => {
    const w = buildSelect({ id: 'g1', action: 'glossary' });
    expect(w.root.className).toBe('select-wrap');
    expect(w.select.id).toBe('g1');
    expect(w.select.dataset.action).toBe('glossary');
    expect(w.root.contains(w.select)).toBe(true);
  });

  it('sets data-knob when provided', () => {
    const w = buildSelect({ id: 'k1', action: 'knob', knob: 'brevity' });
    expect(w.select.dataset.knob).toBe('brevity');
  });
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `npx vitest run content/__tests__/playerChrome/widgets.test.ts`
Expected: FAIL — module `@/content/playerChrome/widgets` not found.

- [x] **Step 3: Implement `widgets.ts`**

Create `content/playerChrome/widgets.ts`:

```ts
/**
 * Widget builders — native-input-backed custom controls for the mini studio.
 * Styling lives in miniStudioCss.ts; these builders own structure only.
 */

export interface ToggleWidget {
  root: HTMLElement;
  input: HTMLInputElement;
}

export function buildToggle(args: { id: string; action: string }): ToggleWidget {
  const root = document.createElement('span');
  root.className = 'toggle';
  const input = document.createElement('input');
  input.type = 'checkbox';
  input.id = args.id;
  input.dataset.action = args.action;
  const track = document.createElement('span');
  track.className = 'track';
  const thumb = document.createElement('span');
  thumb.className = 'thumb';
  root.append(input, track, thumb);
  return { root, input };
}

export interface SegmentedOption {
  value: string;
  label: string;
}

export interface SegmentedWidget {
  root: HTMLElement;
  inputs: HTMLInputElement[];
  setValue(value: string): void;
  value(): string;
}

export function buildSegmented(args: {
  name: string;
  action: string;
  options: SegmentedOption[];
}): SegmentedWidget {
  const root = document.createElement('div');
  root.className = 'seg';
  root.setAttribute('role', 'radiogroup');
  const inputs: HTMLInputElement[] = [];
  for (const opt of args.options) {
    const item = document.createElement('label');
    item.className = 'seg-item';
    const input = document.createElement('input');
    input.type = 'radio';
    input.name = args.name;
    input.value = opt.value;
    input.dataset.action = args.action;
    const text = document.createElement('span');
    text.textContent = opt.label;
    item.append(input, text);
    root.appendChild(item);
    inputs.push(input);
  }
  return {
    root,
    inputs,
    setValue(value: string): void {
      const match = inputs.find((i) => i.value === value) ?? inputs[0];
      if (match) match.checked = true;
    },
    value(): string {
      return inputs.find((i) => i.checked)?.value ?? args.options[0]?.value ?? '';
    },
  };
}

export interface SliderWidget {
  root: HTMLElement;
  input: HTMLInputElement;
  setValue(v: number): void;
}

export function buildSlider(args: {
  id: string;
  action: string;
  min: number;
  max: number;
  step: number;
}): SliderWidget {
  const root = document.createElement('div');
  root.className = 'slider-wrap';
  const input = document.createElement('input');
  input.type = 'range';
  input.id = args.id;
  input.className = 'glass-range';
  input.dataset.action = args.action;
  input.min = String(args.min);
  input.max = String(args.max);
  input.step = String(args.step);

  const syncFill = (): void => {
    const v = Number(input.value);
    const pct = ((v - args.min) / (args.max - args.min)) * 100;
    input.style.setProperty('--fill', `${Math.max(0, Math.min(100, pct))}%`);
  };
  input.addEventListener('input', syncFill);
  root.appendChild(input);

  return {
    root,
    input,
    setValue(v: number): void {
      input.value = String(v);
      syncFill();
    },
  };
}

export interface SelectWidget {
  root: HTMLElement;
  select: HTMLSelectElement;
}

export function buildSelect(args: { id: string; action: string; knob?: string }): SelectWidget {
  const root = document.createElement('div');
  root.className = 'select-wrap';
  const select = document.createElement('select');
  select.id = args.id;
  select.dataset.action = args.action;
  if (args.knob) select.dataset.knob = args.knob;
  root.appendChild(select);
  return { root, select };
}
```

- [x] **Step 4: Run test to verify it passes**

Run: `npx vitest run content/__tests__/playerChrome/widgets.test.ts`
Expected: PASS (7 tests).

- [x] **Step 5: Commit**

```bash
git add content/playerChrome/widgets.ts content/__tests__/playerChrome/widgets.test.ts
git commit -m "feat(playerChrome): add native-backed widget builders for mini studio"
```

---

### Task 2: Glass stylesheet + view builder (`miniStudioCss.ts`, `miniStudioView.ts`)

**Files:**
- Create: `content/playerChrome/miniStudioCss.ts`
- Create: `content/playerChrome/miniStudioView.ts`
- Test: `content/__tests__/playerChrome/miniStudioView.test.ts`

**Interfaces:**
- Consumes: `buildToggle`, `buildSegmented`, `buildSlider`, `buildSelect` from Task 1; `PLAYER_CHROME_PANEL_CLASS` and `ChromeStatus` from `./types`.
- Produces (used by Task 4):
  - `buildMiniStudioView(): MiniStudioView`
  - `setStatusPill(pill: HTMLElement, label: HTMLElement, status: ChromeStatus): void`
  - `updatePreview(preview: PreviewElements, args: { fontSize: number; backgroundOpacity: number; position: 'top' | 'bottom'; displayMode: string }): void`
  - `fillSelect(select: HTMLSelectElement, values: string[], current: string): void` (capitalizes option text)
  - `PreviewElements = { root: HTMLElement; cue: HTMLElement; original: HTMLElement; translated: HTMLElement }`
  - `MiniStudioView = { style, panel, enable: ToggleWidget, displayMode: SegmentedWidget, fontSize: SliderWidget, fontValue: HTMLElement, position: SegmentedWidget, opacity: SliderWidget, opacityValue: HTMLElement, knobSelects: HTMLSelectElement[], glossary: HTMLSelectElement, statusPill: HTMLElement, statusLabel: HTMLElement, preview: PreviewElements, closeBtn: HTMLButtonElement, optionsBtn: HTMLButtonElement }`
  - `PREVIEW_FONT_SCALE = 0.6`

- [x] **Step 1: Write the failing test**

Create `content/__tests__/playerChrome/miniStudioView.test.ts`:

```ts
/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from 'vitest';
import {
  buildMiniStudioView,
  setStatusPill,
  updatePreview,
  fillSelect,
  PREVIEW_FONT_SCALE,
} from '@/content/playerChrome/miniStudioView';
import { PLAYER_CHROME_PANEL_CLASS } from '@/content/playerChrome/types';

describe('buildMiniStudioView', () => {
  it('builds the panel skeleton with header, preview, sections, and footer', () => {
    const v = buildMiniStudioView();
    expect(v.panel.className).toBe(PLAYER_CHROME_PANEL_CLASS);
    expect(v.panel.hidden).toBe(true);
    expect(v.panel.getAttribute('role')).toBe('dialog');
    expect(v.panel.querySelector('.panel-header h2')?.textContent).toBe('Subtitles');
    expect(v.closeBtn.dataset.action).toBe('close');
    expect(v.closeBtn.getAttribute('aria-label')).toBe('Close');
    expect(v.optionsBtn.dataset.action).toBe('open-options');
    expect(v.enable.input.dataset.action).toBe('enable');
    expect(v.fontSize.input.dataset.action).toBe('fontSize');
    expect(v.opacity.input.dataset.action).toBe('opacity');
    expect(v.displayMode.inputs[0].dataset.action).toBe('displayMode');
    expect(v.position.inputs[0].dataset.action).toBe('position');
    expect(v.knobSelects).toHaveLength(4);
    expect(v.knobSelects.map((s) => s.dataset.knob)).toEqual([
      'faithfulness',
      'brevity',
      'register',
      'profanity',
    ]);
    expect(v.glossary.dataset.action).toBe('glossary');
    expect(v.style.textContent).toContain('backdrop-filter');
  });

  it('labels knobs and knob options with human-friendly capitalized text', () => {
    const v = buildMiniStudioView();
    const labels = v.knobSelects.map(
      (s) => v.panel.querySelector(`label[for="${s.id}"]`)?.textContent,
    );
    expect(labels).toEqual(['Faithfulness', 'Brevity', 'Register', 'Profanity']);
    expect(v.knobSelects[0].options[0].textContent).toBe('Auto');
    expect(v.knobSelects[0].options[1].textContent).toBe('Literal');
  });

  it('renders section titles', () => {
    const v = buildMiniStudioView();
    const titles = [...v.panel.querySelectorAll('.section-title')].map((el) => el.textContent);
    expect(titles).toEqual(['Appearance', 'Translation style', 'Glossary']);
  });
});

describe('setStatusPill', () => {
  it('maps status to data-status and label text', () => {
    const v = buildMiniStudioView();
    setStatusPill(v.statusPill, v.statusLabel, 'translating');
    expect(v.statusPill.dataset.status).toBe('translating');
    expect(v.statusLabel.textContent).toBe('Translating');
    setStatusPill(v.statusPill, v.statusLabel, 'disabled');
    expect(v.statusPill.dataset.status).toBe('disabled');
    expect(v.statusLabel.textContent).toBe('Off');
    setStatusPill(v.statusPill, v.statusLabel, 'waiting');
    expect(v.statusLabel.textContent).toBe('Waiting for captions');
  });
});

describe('updatePreview', () => {
  it('reflects font size, opacity, position, and display mode', () => {
    const v = buildMiniStudioView();
    updatePreview(v.preview, {
      fontSize: 20,
      backgroundOpacity: 0.5,
      position: 'top',
      displayMode: 'translation-only',
    });
    expect(v.preview.cue.style.fontSize).toBe(`${Math.round(20 * PREVIEW_FONT_SCALE)}px`);
    expect(v.preview.cue.style.getPropertyValue('--preview-bg')).toBe('0.5');
    expect(v.preview.root.dataset.position).toBe('top');
    expect(v.preview.root.dataset.display).toBe('translation-only');
  });
});

describe('fillSelect', () => {
  it('fills capitalized options, selects current, falls back to first', () => {
    const v = buildMiniStudioView();
    fillSelect(v.glossary, ['auto', 'literal'], 'literal');
    expect(v.glossary.options).toHaveLength(2);
    expect(v.glossary.options[0].textContent).toBe('Auto');
    expect(v.glossary.value).toBe('literal');
    fillSelect(v.glossary, ['auto', 'literal'], 'missing');
    expect(v.glossary.value).toBe('auto');
  });
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `npx vitest run content/__tests__/playerChrome/miniStudioView.test.ts`
Expected: FAIL — module `@/content/playerChrome/miniStudioView` not found.

- [x] **Step 3: Implement `miniStudioCss.ts`**

Create `content/playerChrome/miniStudioCss.ts`:

```ts
/**
 * Glass stylesheet for the mini studio panel — injected into the chrome shadow root.
 */

import { PLAYER_CHROME_PANEL_CLASS } from './types';

export const MINI_STUDIO_CSS = `
.${PLAYER_CHROME_PANEL_CLASS} {
  pointer-events: auto;
  width: 288px;
  max-height: min(72vh, 480px);
  overflow-y: auto;
  box-sizing: border-box;
  padding: 14px;
  border-radius: 16px;
  border: 1px solid rgba(255,255,255,0.08);
  background: rgba(12,12,16,0.72);
  backdrop-filter: blur(16px) saturate(1.4);
  -webkit-backdrop-filter: blur(16px) saturate(1.4);
  color: #e4e4e7;
  box-shadow: 0 16px 48px rgba(0,0,0,0.5);
  font: 12px/1.45 system-ui, -apple-system, sans-serif;
  opacity: 0;
  transform: translateY(6px);
  transition: opacity 160ms ease-out, transform 160ms ease-out;
}
.${PLAYER_CHROME_PANEL_CLASS}.open {
  opacity: 1;
  transform: translateY(0);
}
.${PLAYER_CHROME_PANEL_CLASS}[hidden] { display: none !important; }
@supports not ((backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px))) {
  .${PLAYER_CHROME_PANEL_CLASS} { background: rgba(12,12,16,0.97); }
}
@media (prefers-reduced-motion: reduce) {
  .${PLAYER_CHROME_PANEL_CLASS} { transition: none; }
}
.${PLAYER_CHROME_PANEL_CLASS}::-webkit-scrollbar { width: 8px; }
.${PLAYER_CHROME_PANEL_CLASS}::-webkit-scrollbar-thumb {
  background: rgba(255,255,255,0.12);
  border-radius: 4px;
}

/* Header */
.${PLAYER_CHROME_PANEL_CLASS} .panel-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
}
.${PLAYER_CHROME_PANEL_CLASS} .panel-header h2 {
  margin: 0;
  flex: 1;
  font-size: 13px;
  font-weight: 600;
  color: #fafafa;
}
.${PLAYER_CHROME_PANEL_CLASS} .close-btn {
  width: 24px;
  height: 24px;
  flex: none;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: #a1a1aa;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0;
}
.${PLAYER_CHROME_PANEL_CLASS} .close-btn:hover {
  background: rgba(255,255,255,0.08);
  color: #fafafa;
}
.${PLAYER_CHROME_PANEL_CLASS} .close-btn:focus-visible {
  outline: 2px solid #0ea5e9;
  outline-offset: 1px;
}

/* Status pill */
.${PLAYER_CHROME_PANEL_CLASS} .status-pill {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  flex: none;
  padding: 3px 8px;
  border-radius: 999px;
  background: rgba(255,255,255,0.06);
  border: 1px solid rgba(255,255,255,0.08);
  font-size: 10px;
  font-weight: 500;
  color: #d4d4d8;
}
.${PLAYER_CHROME_PANEL_CLASS} .status-dot {
  width: 6px;
  height: 6px;
  border-radius: 999px;
  background: #71717a;
}
.${PLAYER_CHROME_PANEL_CLASS} .status-pill[data-status="idle"] .status-dot { background: #22d3ee; }
.${PLAYER_CHROME_PANEL_CLASS} .status-pill[data-status="waiting"] .status-dot { background: #fbbf24; }
.${PLAYER_CHROME_PANEL_CLASS} .status-pill[data-status="translating"] .status-dot {
  background: #22d3ee;
  animation: anyllmMsPulse 1.6s ease-in-out infinite;
}
.${PLAYER_CHROME_PANEL_CLASS} .status-pill[data-status="error"] .status-dot { background: #f87171; }
@keyframes anyllmMsPulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.35; }
}
@media (prefers-reduced-motion: reduce) {
  .${PLAYER_CHROME_PANEL_CLASS} .status-pill[data-status="translating"] .status-dot {
    animation: none;
  }
}

/* Live preview */
.${PLAYER_CHROME_PANEL_CLASS} .preview {
  position: relative;
  height: 120px;
  border-radius: 10px;
  overflow: hidden;
  border: 1px solid rgba(255,255,255,0.08);
  background: linear-gradient(135deg, #1e293b 0%, #0f172a 55%, #1e1b4b 100%);
  display: flex;
  justify-content: center;
  padding: 10px;
  box-sizing: border-box;
  margin-bottom: 12px;
}
.${PLAYER_CHROME_PANEL_CLASS} .preview[data-position="bottom"] { align-items: flex-end; }
.${PLAYER_CHROME_PANEL_CLASS} .preview[data-position="top"] { align-items: flex-start; }
.${PLAYER_CHROME_PANEL_CLASS} .preview-cue {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  gap: 2px;
  max-width: 85%;
  background: rgba(0,0,0,var(--preview-bg,0.7));
  padding: 5px 10px;
  border-radius: 6px;
}
.${PLAYER_CHROME_PANEL_CLASS} .preview-original {
  font-size: 0.8em;
  color: rgba(255,255,255,0.6);
  line-height: 1.4;
}
.${PLAYER_CHROME_PANEL_CLASS} .preview-translated {
  font-size: 1em;
  color: #fff;
  font-weight: 500;
  line-height: 1.4;
}
.${PLAYER_CHROME_PANEL_CLASS} .preview[data-display="translation-only"] .preview-original {
  display: none;
}

/* Rows, labels, sections */
.${PLAYER_CHROME_PANEL_CLASS} .row {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-bottom: 10px;
}
.${PLAYER_CHROME_PANEL_CLASS} .row:last-child { margin-bottom: 0; }
.${PLAYER_CHROME_PANEL_CLASS} .row-inline {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.${PLAYER_CHROME_PANEL_CLASS} .enable-row { margin-bottom: 4px; }
.${PLAYER_CHROME_PANEL_CLASS} label,
.${PLAYER_CHROME_PANEL_CLASS} .row-label {
  color: #d4d4d8;
  font-size: 12px;
  font-weight: 500;
  display: block;
}
.${PLAYER_CHROME_PANEL_CLASS} label span[data-role] { color: #67e8f9; }
.${PLAYER_CHROME_PANEL_CLASS} .section {
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid rgba(255,255,255,0.06);
}
.${PLAYER_CHROME_PANEL_CLASS} .section-title {
  margin: 0 0 10px;
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: #71717a;
}

/* Toggle switch */
.${PLAYER_CHROME_PANEL_CLASS} .toggle {
  position: relative;
  width: 36px;
  height: 20px;
  flex: none;
  display: inline-block;
}
.${PLAYER_CHROME_PANEL_CLASS} .toggle input {
  position: absolute;
  inset: 0;
  margin: 0;
  opacity: 0;
  cursor: pointer;
  z-index: 1;
}
.${PLAYER_CHROME_PANEL_CLASS} .toggle .track {
  position: absolute;
  inset: 0;
  border-radius: 999px;
  background: rgba(255,255,255,0.12);
  transition: background 140ms ease;
  pointer-events: none;
}
.${PLAYER_CHROME_PANEL_CLASS} .toggle .thumb {
  position: absolute;
  top: 2px;
  left: 2px;
  width: 16px;
  height: 16px;
  border-radius: 999px;
  background: #fafafa;
  transition: transform 140ms ease;
  pointer-events: none;
}
.${PLAYER_CHROME_PANEL_CLASS} .toggle input:checked ~ .track { background: #0ea5e9; }
.${PLAYER_CHROME_PANEL_CLASS} .toggle input:checked ~ .thumb { transform: translateX(16px); }
.${PLAYER_CHROME_PANEL_CLASS} .toggle input:focus-visible ~ .track {
  outline: 2px solid #22d3ee;
  outline-offset: 2px;
}
@media (prefers-reduced-motion: reduce) {
  .${PLAYER_CHROME_PANEL_CLASS} .toggle .track,
  .${PLAYER_CHROME_PANEL_CLASS} .toggle .thumb { transition: none; }
}

/* Segmented control */
.${PLAYER_CHROME_PANEL_CLASS} .seg {
  display: flex;
  gap: 2px;
  padding: 2px;
  border-radius: 10px;
  background: rgba(255,255,255,0.06);
  border: 1px solid rgba(255,255,255,0.08);
}
.${PLAYER_CHROME_PANEL_CLASS} .seg-item { flex: 1; position: relative; }
.${PLAYER_CHROME_PANEL_CLASS} .seg-item input {
  position: absolute;
  opacity: 0;
  pointer-events: none;
}
.${PLAYER_CHROME_PANEL_CLASS} .seg-item span {
  display: block;
  text-align: center;
  padding: 6px 8px;
  border-radius: 8px;
  color: #a1a1aa;
  font-size: 11px;
  font-weight: 500;
  cursor: pointer;
  transition: background 120ms ease, color 120ms ease;
}
.${PLAYER_CHROME_PANEL_CLASS} .seg-item:hover span { color: #e4e4e7; }
.${PLAYER_CHROME_PANEL_CLASS} .seg-item input:checked + span {
  background: rgba(34,211,238,0.16);
  color: #67e8f9;
}
.${PLAYER_CHROME_PANEL_CLASS} .seg-item input:focus-visible + span {
  outline: 2px solid #0ea5e9;
  outline-offset: 1px;
}

/* Sliders */
.${PLAYER_CHROME_PANEL_CLASS} .glass-range {
  -webkit-appearance: none;
  appearance: none;
  width: 100%;
  height: 20px;
  background: transparent;
  cursor: pointer;
  margin: 0;
}
.${PLAYER_CHROME_PANEL_CLASS} .glass-range::-webkit-slider-runnable-track {
  height: 4px;
  border-radius: 2px;
  background: linear-gradient(
    to right,
    #0ea5e9 var(--fill, 50%),
    rgba(255,255,255,0.12) var(--fill, 50%)
  );
}
.${PLAYER_CHROME_PANEL_CLASS} .glass-range::-webkit-slider-thumb {
  -webkit-appearance: none;
  width: 14px;
  height: 14px;
  margin-top: -5px;
  border-radius: 999px;
  background: #fafafa;
  box-shadow: 0 1px 4px rgba(0,0,0,0.4);
}
.${PLAYER_CHROME_PANEL_CLASS} .glass-range::-moz-range-track {
  height: 4px;
  border-radius: 2px;
  background: rgba(255,255,255,0.12);
}
.${PLAYER_CHROME_PANEL_CLASS} .glass-range::-moz-range-progress {
  height: 4px;
  border-radius: 2px;
  background: #0ea5e9;
}
.${PLAYER_CHROME_PANEL_CLASS} .glass-range::-moz-range-thumb {
  width: 14px;
  height: 14px;
  border: none;
  border-radius: 999px;
  background: #fafafa;
}
.${PLAYER_CHROME_PANEL_CLASS} .glass-range:focus-visible {
  outline: 2px solid #0ea5e9;
  outline-offset: 2px;
  border-radius: 4px;
}

/* Styled selects */
.${PLAYER_CHROME_PANEL_CLASS} .select-wrap { position: relative; }
.${PLAYER_CHROME_PANEL_CLASS} .select-wrap select {
  width: 100%;
  box-sizing: border-box;
  -webkit-appearance: none;
  appearance: none;
  background-color: rgba(255,255,255,0.06);
  background-image: url("data:image/svg+xml;charset=utf-8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6' fill='none'%3E%3Cpath d='M1 1l4 4 4-4' stroke='%23a1a1aa' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 10px center;
  color: #e4e4e7;
  border: 1px solid rgba(255,255,255,0.1);
  border-radius: 10px;
  padding: 7px 28px 7px 10px;
  font: 12px system-ui, -apple-system, sans-serif;
  text-overflow: ellipsis;
  overflow: hidden;
  cursor: pointer;
}
.${PLAYER_CHROME_PANEL_CLASS} .select-wrap select:hover { border-color: rgba(255,255,255,0.2); }
.${PLAYER_CHROME_PANEL_CLASS} .select-wrap select:focus-visible {
  outline: 2px solid #0ea5e9;
  outline-offset: 1px;
}
.${PLAYER_CHROME_PANEL_CLASS} .select-wrap option {
  background: #18181b;
  color: #e4e4e7;
}

/* Knobs grid */
.${PLAYER_CHROME_PANEL_CLASS} .knobs {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}

/* Footer */
.${PLAYER_CHROME_PANEL_CLASS} .footer-btn {
  width: 100%;
  margin-top: 12px;
  pointer-events: auto;
  border: 1px solid rgba(255,255,255,0.1);
  background: rgba(255,255,255,0.06);
  color: #d4d4d8;
  border-radius: 10px;
  padding: 8px 10px;
  cursor: pointer;
  font: 500 11px/1 system-ui, -apple-system, sans-serif;
  transition: border-color 120ms ease, color 120ms ease, background 120ms ease;
}
.${PLAYER_CHROME_PANEL_CLASS} .footer-btn:hover {
  border-color: rgba(34,211,238,0.55);
  color: #67e8f9;
  background: rgba(34,211,238,0.08);
}
.${PLAYER_CHROME_PANEL_CLASS} .footer-btn:focus-visible {
  outline: 2px solid #0ea5e9;
  outline-offset: 1px;
}
`;
```

- [x] **Step 4: Implement `miniStudioView.ts`**

Create `content/playerChrome/miniStudioView.ts`:

```ts
/**
 * Mini studio view — panel DOM composition, status pill, and live preview.
 * Pure presentation: no settings reads/writes happen here.
 */

import type { ChromeStatus } from './types';
import { PLAYER_CHROME_PANEL_CLASS } from './types';
import { MINI_STUDIO_CSS } from './miniStudioCss';
import {
  buildToggle,
  buildSegmented,
  buildSlider,
  buildSelect,
  type ToggleWidget,
  type SegmentedWidget,
  type SliderWidget,
} from './widgets';

/** Preview cue renders at a reduced scale of the real overlay font size. */
export const PREVIEW_FONT_SCALE = 0.6;

const KNOB_OPTIONS: { knob: string; opts: string[] }[] = [
  { knob: 'faithfulness', opts: ['auto', 'literal', 'balanced', 'idiomatic'] },
  { knob: 'brevity', opts: ['auto', 'relaxed', 'moderate', 'terse'] },
  { knob: 'register', opts: ['auto', 'formal', 'neutral', 'casual'] },
  { knob: 'profanity', opts: ['auto', 'preserve', 'soften', 'remove'] },
];

const STATUS_LABEL: Record<ChromeStatus, string> = {
  idle: 'Ready',
  waiting: 'Waiting for captions',
  translating: 'Translating',
  error: 'Translation error',
  disabled: 'Off',
};

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export function fillSelect(select: HTMLSelectElement, values: string[], current: string): void {
  select.innerHTML = '';
  for (const value of values) {
    const opt = document.createElement('option');
    opt.value = value;
    opt.textContent = capitalize(value);
    select.appendChild(opt);
  }
  select.value = values.includes(current) ? current : values[0] ?? '';
}

export interface PreviewElements {
  root: HTMLElement;
  cue: HTMLElement;
  original: HTMLElement;
  translated: HTMLElement;
}

export interface MiniStudioView {
  style: HTMLStyleElement;
  panel: HTMLElement;
  enable: ToggleWidget;
  displayMode: SegmentedWidget;
  fontSize: SliderWidget;
  fontValue: HTMLElement;
  position: SegmentedWidget;
  opacity: SliderWidget;
  opacityValue: HTMLElement;
  knobSelects: HTMLSelectElement[];
  glossary: HTMLSelectElement;
  statusPill: HTMLElement;
  statusLabel: HTMLElement;
  preview: PreviewElements;
  closeBtn: HTMLButtonElement;
  optionsBtn: HTMLButtonElement;
}

const CLOSE_SVG = `<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>`;

export function buildMiniStudioView(): MiniStudioView {
  const style = document.createElement('style');
  style.setAttribute('data-anyllm-mini-studio', '1');
  style.textContent = MINI_STUDIO_CSS;

  const panel = document.createElement('div');
  panel.className = PLAYER_CHROME_PANEL_CLASS;
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-label', 'Subtitle mini studio');
  panel.hidden = true;
  panel.innerHTML = `
    <div class="panel-header">
      <h2>Subtitles</h2>
      <span class="status-pill" data-role="status" data-status="idle" aria-live="polite">
        <span class="status-dot"></span>
        <span class="status-label" data-role="statusLabel">Ready</span>
      </span>
      <button type="button" class="close-btn" data-action="close" aria-label="Close">${CLOSE_SVG}</button>
    </div>
    <div class="preview" data-role="preview" data-position="bottom" data-display="bilingual">
      <div class="preview-cue" data-role="previewCue">
        <div class="preview-original">Hello, world.</div>
        <div class="preview-translated">Bonjour le monde.</div>
      </div>
    </div>
    <div class="row-inline enable-row">
      <label for="anyllm-ms-enable">Enable subtitles</label>
    </div>
    <div class="section">
      <h3 class="section-title">Appearance</h3>
      <div class="row"><span class="row-label">Display</span></div>
      <div class="row">
        <label for="anyllm-ms-font">Font size <span data-role="fontValue">18</span>px</label>
      </div>
      <div class="row"><span class="row-label">Position</span></div>
      <div class="row">
        <label for="anyllm-ms-opacity">Background <span data-role="opacityValue">70</span>%</label>
      </div>
    </div>
    <div class="section">
      <h3 class="section-title">Translation style</h3>
      <div class="knobs" data-role="knobs"></div>
    </div>
    <div class="section">
      <h3 class="section-title">Glossary</h3>
      <div class="row">
        <label for="anyllm-ms-list">Glossary list</label>
      </div>
    </div>
    <button type="button" class="footer-btn" data-action="open-options">Open Subtitle Studio ↗</button>
  `;

  // Widgets appended into their labeled rows (order in panel.innerHTML above).
  const enable = buildToggle({ id: 'anyllm-ms-enable', action: 'enable' });
  panel.querySelector('.enable-row')?.appendChild(enable.root);

  const displayMode = buildSegmented({
    name: 'anyllm-ms-display',
    action: 'displayMode',
    options: [
      { value: 'bilingual', label: 'Bilingual' },
      { value: 'translation-only', label: 'Translation only' },
    ],
  });
  const rows = panel.querySelectorAll('.section .row');
  // rows: 0=Display, 1=Font size, 2=Position, 3=Background, 4=Glossary list
  rows[0]?.appendChild(displayMode.root);

  const fontSize = buildSlider({ id: 'anyllm-ms-font', action: 'fontSize', min: 12, max: 36, step: 1 });
  rows[1]?.appendChild(fontSize.root);

  const position = buildSegmented({
    name: 'anyllm-ms-position',
    action: 'position',
    options: [
      { value: 'bottom', label: 'Bottom' },
      { value: 'top', label: 'Top' },
    ],
  });
  rows[2]?.appendChild(position.root);

  const opacity = buildSlider({ id: 'anyllm-ms-opacity', action: 'opacity', min: 0, max: 100, step: 5 });
  rows[3]?.appendChild(opacity.root);

  const glossary = buildSelect({ id: 'anyllm-ms-list', action: 'glossary' });
  rows[4]?.appendChild(glossary.root);

  const knobSelects: HTMLSelectElement[] = [];
  const knobsRoot = panel.querySelector('[data-role="knobs"]') as HTMLElement;
  for (const { knob, opts } of KNOB_OPTIONS) {
    const row = document.createElement('div');
    row.className = 'row';
    const label = document.createElement('label');
    label.textContent = capitalize(knob);
    label.htmlFor = `anyllm-ms-knob-${knob}`;
    const widget = buildSelect({ id: `anyllm-ms-knob-${knob}`, action: 'knob', knob });
    fillSelect(widget.select, opts, 'auto');
    row.append(label, widget.root);
    knobsRoot.appendChild(row);
    knobSelects.push(widget.select);
  }

  return {
    style,
    panel,
    enable,
    displayMode,
    fontSize,
    fontValue: panel.querySelector('[data-role="fontValue"]') as HTMLElement,
    position,
    opacity,
    opacityValue: panel.querySelector('[data-role="opacityValue"]') as HTMLElement,
    knobSelects,
    glossary: glossary.select,
    statusPill: panel.querySelector('[data-role="status"]') as HTMLElement,
    statusLabel: panel.querySelector('[data-role="statusLabel"]') as HTMLElement,
    preview: {
      root: panel.querySelector('[data-role="preview"]') as HTMLElement,
      cue: panel.querySelector('[data-role="previewCue"]') as HTMLElement,
      original: panel.querySelector('.preview-original') as HTMLElement,
      translated: panel.querySelector('.preview-translated') as HTMLElement,
    },
    closeBtn: panel.querySelector('[data-action="close"]') as HTMLButtonElement,
    optionsBtn: panel.querySelector('[data-action="open-options"]') as HTMLButtonElement,
  };
}

export function setStatusPill(
  pill: HTMLElement,
  label: HTMLElement,
  status: ChromeStatus,
): void {
  pill.dataset.status = status;
  label.textContent = STATUS_LABEL[status] ?? status;
}

export function updatePreview(
  preview: PreviewElements,
  args: {
    fontSize: number;
    backgroundOpacity: number;
    position: 'top' | 'bottom';
    displayMode: string;
  },
): void {
  preview.cue.style.fontSize = `${Math.round(args.fontSize * PREVIEW_FONT_SCALE)}px`;
  preview.cue.style.setProperty('--preview-bg', String(args.backgroundOpacity));
  preview.root.dataset.position = args.position;
  preview.root.dataset.display = args.displayMode;
}
```

- [x] **Step 5: Run test to verify it passes**

Run: `npx vitest run content/__tests__/playerChrome/miniStudioView.test.ts`
Expected: PASS (7 tests).

- [x] **Step 6: Commit**

```bash
git add content/playerChrome/miniStudioCss.ts content/playerChrome/miniStudioView.ts content/__tests__/playerChrome/miniStudioView.test.ts
git commit -m "feat(playerChrome): add glass mini studio view, stylesheet, and live preview"
```

---

### Task 3: SVG state-aware anchor button (`button.ts`, `mountFloating.ts`, `index.ts`)

**Files:**
- Modify: `content/playerChrome/button.ts` (full rewrite of the module body)
- Modify: `content/playerChrome/mountFloating.ts` (CSS additions + plumb `setButtonState`)
- Modify: `content/playerChrome/index.ts:106-112` (pass `setButtonState` into `attachMiniStudio`)
- Test: `content/__tests__/playerChrome/button.test.ts`

**Interfaces:**
- Consumes: `PLAYER_CHROME_BUTTON_CLASS` from `./types`.
- Produces:
  - `ChromeButtonState = 'off' | 'enabled' | 'translating'` (exported from `button.ts`)
  - `createChromeButton(onToggle: () => void): ChromeButtonHandle` where `ChromeButtonHandle = { button: HTMLButtonElement; setState(state: ChromeButtonState): void }` — **return type changes** from `HTMLButtonElement`; only `mountFloating.ts` consumes it.
  - `ChromeShell` gains `setButtonState(state: ChromeButtonState): void` (consumed by Task 4 via `attachMiniStudio` args).

- [x] **Step 1: Write the failing test**

Create `content/__tests__/playerChrome/button.test.ts`:

```ts
/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { createChromeButton } from '@/content/playerChrome/button';
import { PLAYER_CHROME_BUTTON_CLASS } from '@/content/playerChrome/types';

describe('createChromeButton', () => {
  it('renders an SVG icon with a11y attributes and default off state', () => {
    const { button } = createChromeButton(vi.fn());
    expect(button.className).toBe(PLAYER_CHROME_BUTTON_CLASS);
    expect(button.getAttribute('aria-label')).toBe('Subtitle translation settings');
    expect(button.getAttribute('aria-expanded')).toBe('false');
    expect(button.title).toBe('AnyLLMTranslate subtitles');
    expect(button.dataset.state).toBe('off');
    expect(button.querySelector('svg')).toBeTruthy();
  });

  it('setState updates data-state', () => {
    const { button, setState } = createChromeButton(vi.fn());
    setState('enabled');
    expect(button.dataset.state).toBe('enabled');
    setState('translating');
    expect(button.dataset.state).toBe('translating');
    setState('off');
    expect(button.dataset.state).toBe('off');
  });

  it('click invokes onToggle', () => {
    const onToggle = vi.fn();
    const { button } = createChromeButton(onToggle);
    button.click();
    expect(onToggle).toHaveBeenCalledTimes(1);
  });
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `npx vitest run content/__tests__/playerChrome/button.test.ts`
Expected: FAIL — `setState` is not a function / `dataset.state` undefined (current `createChromeButton` returns a bare button).

- [x] **Step 3: Rewrite `button.ts`**

Replace the entire contents of `content/playerChrome/button.ts` with:

```ts
import { PLAYER_CHROME_BUTTON_CLASS } from './types';

export type ChromeButtonState = 'off' | 'enabled' | 'translating';

export interface ChromeButtonHandle {
  button: HTMLButtonElement;
  setState(state: ChromeButtonState): void;
}

/** Captions glyph — two C arcs inside a rounded frame. */
const BUTTON_ICON_SVG = `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="2.5" y="4.5" width="19" height="15" rx="3"></rect><path d="M10.5 10.2a2.6 2.6 0 1 0 0 3.6"></path><path d="M17 10.2a2.6 2.6 0 1 0 0 3.6"></path></svg>`;

export function createChromeButton(onToggle: () => void): ChromeButtonHandle {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = PLAYER_CHROME_BUTTON_CLASS;
  button.setAttribute('aria-label', 'Subtitle translation settings');
  button.setAttribute('aria-expanded', 'false');
  button.title = 'AnyLLMTranslate subtitles';
  button.dataset.state = 'off';
  button.innerHTML = BUTTON_ICON_SVG;
  button.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    onToggle();
  });
  return {
    button,
    setState(state: ChromeButtonState): void {
      button.dataset.state = state;
    },
  };
}
```

- [x] **Step 4: Plumb `setButtonState` through `mountFloating.ts`**

In `content/playerChrome/mountFloating.ts`:

4a. Update the import and `ChromeShell` interface:

```ts
import { PLAYER_CHROME_HOST_CLASS, PLAYER_CHROME_BUTTON_CLASS } from './types';
import { createChromeButton, type ChromeButtonState } from './button';

export interface ChromeShell {
  host: HTMLElement;
  shadow: ShadowRoot;
  button: HTMLButtonElement;
  panelSlot: HTMLElement;
  setVisible(visible: boolean): void;
  setExpanded(expanded: boolean): void;
  setButtonState(state: ChromeButtonState): void;
  destroy(): void;
  reposition(): void;
  getMountMode(): 'floating' | 'native';
}
```

4b. Append button-state styles at the end of `CHROME_SHADOW_CSS` (inside the template literal, after the `.panel-slot` rule):

```css
.${PLAYER_CHROME_BUTTON_CLASS}[data-state="enabled"] {
  border-color: rgba(34,211,238,0.55);
  color: #67e8f9;
}
.${PLAYER_CHROME_BUTTON_CLASS}[data-state="translating"] {
  border-color: rgba(34,211,238,0.55);
  color: #67e8f9;
  animation: anyllmChromePulse 1.6s ease-in-out infinite;
}
@keyframes anyllmChromePulse {
  0%, 100% { box-shadow: 0 4px 16px rgba(0,0,0,0.35); }
  50% { box-shadow: 0 0 0 4px rgba(34,211,238,0.18), 0 4px 16px rgba(0,0,0,0.35); }
}
@media (prefers-reduced-motion: reduce) {
  .${PLAYER_CHROME_BUTTON_CLASS}[data-state="translating"] { animation: none; }
}
```

4c. Update `appendChromeShadow` to destructure the new handle and return `setButtonState`:

```ts
function appendChromeShadow(
  host: HTMLElement,
  onToggle: () => void,
): {
  shadow: ShadowRoot;
  button: HTMLButtonElement;
  panelSlot: HTMLElement;
  setButtonState: (state: ChromeButtonState) => void;
} {
  const shadow = host.attachShadow({ mode: 'open' });
  const style = document.createElement('style');
  style.textContent = CHROME_SHADOW_CSS;
  const wrap = document.createElement('div');
  wrap.className = 'wrap';
  const panelSlot = document.createElement('div');
  panelSlot.className = 'panel-slot';
  const handle = createChromeButton(onToggle);
  wrap.append(panelSlot, handle.button);
  shadow.append(style, wrap);
  return { shadow, button: handle.button, panelSlot, setButtonState: handle.setState };
}
```

4d. In both `createFloatingShell` and `createNativeShell`, destructure `setButtonState` from `appendChromeShadow` and add it to the returned shell object:

```ts
const { shadow, button, panelSlot, setButtonState } = appendChromeShadow(host, args.onToggle);
```

and in each returned object literal, add:

```ts
    setButtonState,
```

- [x] **Step 5: Pass `setButtonState` in `index.ts`**

In `content/playerChrome/index.ts`, update the `attachMiniStudio` call:

```ts
    studio = attachMiniStudio({
      shadow: shell.shadow,
      anchorButton: shell.button,
      panelSlot: shell.panelSlot,
      onOpenChange,
      setButtonState: shell.setButtonState,
    });
```

- [x] **Step 6: Run tests to verify they pass**

Run: `npx vitest run content/__tests__/playerChrome/button.test.ts content/__tests__/playerChrome/mountFallback.test.ts content/__tests__/playerChrome/lifecycle.test.ts`
Expected: PASS — new button tests pass; existing shell tests unaffected (additive change).

- [x] **Step 7: Commit**

```bash
git add content/playerChrome/button.ts content/playerChrome/mountFloating.ts content/playerChrome/index.ts content/__tests__/playerChrome/button.test.ts
git commit -m "feat(playerChrome): SVG anchor button with off/enabled/translating state"
```

---

### Task 4: Rewire `miniStudio.ts` onto the new view

**Files:**
- Modify: `content/playerChrome/miniStudio.ts` (full rewrite of the module body)
- Test: `content/__tests__/playerChrome/miniStudio.test.ts` (keep existing tests, add new ones)

**Interfaces:**
- Consumes: `buildMiniStudioView`, `setStatusPill`, `updatePreview`, `fillSelect` from Task 2; `ChromeButtonState` from Task 3; `onSettingsChange` from `@/lib/config`; existing `prefs.ts` APIs (unchanged).
- Produces: unchanged public contract — `attachMiniStudio(args): MiniStudioControllers`; args gains optional `setButtonState?: (state: ChromeButtonState) => void`.

- [x] **Step 1: Add the new failing tests**

Append to `content/__tests__/playerChrome/miniStudio.test.ts` (inside the existing `describe('attachMiniStudio')` block). Also add `onSettingsChange` to the `@/content/playerChrome/prefs` mock is NOT needed — instead mock `@/lib/config` at the top of the file, next to the existing prefs mock:

```ts
vi.mock('@/lib/config', () => ({
  onSettingsChange: vi.fn(() => () => {}),
}));
```

New tests:

```ts
  it('applies snapshot to widgets, status pill, preview, and button state', async () => {
    const host = document.createElement('div');
    const shadow = host.attachShadow({ mode: 'open' });
    document.body.appendChild(host);
    const btn = document.createElement('button');
    shadow.appendChild(btn);
    const setButtonState = vi.fn();
    const studio = attachMiniStudio({
      shadow,
      anchorButton: btn,
      onOpenChange: vi.fn(),
      setButtonState,
    });
    await studio.open();

    const panel = shadow.querySelector(`.${PLAYER_CHROME_PANEL_CLASS}`) as HTMLElement;
    const enable = panel.querySelector('[data-action="enable"]') as HTMLInputElement;
    expect(enable.checked).toBe(true);

    const displayChecked = panel.querySelector(
      'input[data-action="displayMode"]:checked',
    ) as HTMLInputElement;
    expect(displayChecked.value).toBe('bilingual');

    const font = panel.querySelector('[data-action="fontSize"]') as HTMLInputElement;
    expect(font.value).toBe('18');
    expect(panel.querySelector('[data-role="fontValue"]')?.textContent).toBe('18');

    const pill = panel.querySelector('[data-role="status"]') as HTMLElement;
    expect(pill.dataset.status).toBe('idle');
    expect(pill.textContent).toContain('Ready');

    const cue = panel.querySelector('[data-role="previewCue"]') as HTMLElement;
    expect(cue.style.fontSize).toBe('11px'); // round(18 * 0.6)

    expect(setButtonState).toHaveBeenCalledWith('enabled');
    studio.destroy();
  });

  it('slider input updates preview live but persists only on change', async () => {
    const host = document.createElement('div');
    const shadow = host.attachShadow({ mode: 'open' });
    document.body.appendChild(host);
    const btn = document.createElement('button');
    shadow.appendChild(btn);
    const studio = attachMiniStudio({ shadow, anchorButton: btn, onOpenChange: vi.fn() });
    await studio.open();

    const panel = shadow.querySelector(`.${PLAYER_CHROME_PANEL_CLASS}`) as HTMLElement;
    const font = panel.querySelector('[data-action="fontSize"]') as HTMLInputElement;
    vi.mocked(prefs.setAppearance).mockClear();

    font.value = '30';
    font.dispatchEvent(new Event('input', { bubbles: true }));
    expect(panel.querySelector('[data-role="fontValue"]')?.textContent).toBe('30');
    const cue = panel.querySelector('[data-role="previewCue"]') as HTMLElement;
    expect(cue.style.fontSize).toBe('18px'); // round(30 * 0.6)
    expect(prefs.setAppearance).not.toHaveBeenCalled();

    font.dispatchEvent(new Event('change', { bubbles: true }));
    expect(prefs.setAppearance).toHaveBeenCalledWith({ fontSize: 30 });
    studio.destroy();
  });

  it('closes via the header close button', async () => {
    const host = document.createElement('div');
    const shadow = host.attachShadow({ mode: 'open' });
    document.body.appendChild(host);
    const btn = document.createElement('button');
    shadow.appendChild(btn);
    const onOpenChange = vi.fn();
    const studio = attachMiniStudio({ shadow, anchorButton: btn, onOpenChange });
    await studio.open();

    const closeBtn = shadow.querySelector('[data-action="close"]') as HTMLButtonElement;
    closeBtn.click();
    expect(studio.isOpen()).toBe(false);
    expect(onOpenChange).toHaveBeenLastCalledWith(false);
    studio.destroy();
  });

  it('maps disabled snapshot to off button state and Off pill', async () => {
    vi.mocked(prefs.loadMiniStudioSnapshot).mockResolvedValueOnce({
      enabled: false,
      displayMode: 'bilingual',
      fontSize: 18,
      position: 'bottom',
      backgroundOpacity: 0.7,
      knobs: {},
      lists: [],
      activeListId: null,
      hostname: 'youtube.com',
      status: 'disabled',
    });
    const host = document.createElement('div');
    const shadow = host.attachShadow({ mode: 'open' });
    document.body.appendChild(host);
    const btn = document.createElement('button');
    shadow.appendChild(btn);
    const setButtonState = vi.fn();
    const studio = attachMiniStudio({
      shadow,
      anchorButton: btn,
      onOpenChange: vi.fn(),
      setButtonState,
    });
    await studio.open();

    const panel = shadow.querySelector(`.${PLAYER_CHROME_PANEL_CLASS}`) as HTMLElement;
    const pill = panel.querySelector('[data-role="status"]') as HTMLElement;
    expect(pill.dataset.status).toBe('disabled');
    expect(pill.textContent).toContain('Off');
    expect(setButtonState).toHaveBeenCalledWith('off');
    studio.destroy();
  });
```

- [x] **Step 2: Run tests to verify they fail**

Run: `npx vitest run content/__tests__/playerChrome/miniStudio.test.ts`
Expected: FAIL — new assertions fail against the old panel (no `[data-role="previewCue"]`, no close button, `setButtonState` never called).

- [x] **Step 3: Rewrite `miniStudio.ts`**

Replace the entire contents of `content/playerChrome/miniStudio.ts` with:

```ts
/**
 * On-player mini studio panel — glass UI, sectioned layout, live preview.
 * Presentation rewired onto miniStudioView; all writes still flow through prefs.ts.
 */

import type { ProfileKnobs } from '@/lib/subtitleProfiles';
import { onSettingsChange } from '@/lib/config';
import { isContextInvalidated } from '@/lib/utils';
import type { ChromeButtonState } from './button';
import type { MiniStudioSnapshot } from './prefs';
import {
  hydrateLocalKnobs,
  loadMiniStudioSnapshot,
  setActiveGlossaryList,
  setAppearance,
  setSubtitlesEnabled,
  setTabKnob,
} from './prefs';
import {
  buildMiniStudioView,
  setStatusPill,
  updatePreview,
  type MiniStudioView,
} from './miniStudioView';

export interface MiniStudioControllers {
  open(): Promise<void>;
  close(): void;
  isOpen(): boolean;
  refresh(): Promise<void>;
  destroy(): void;
}

/** Slightly longer than the 160ms panel transition so the close fade completes
 *  before `hidden` is applied. */
const CLOSE_HIDE_MS = 170;

function openFullSubtitleStudio(): void {
  let url: string;
  try {
    // Deep-link straight to the Subtitles section (the Subtitle Studio) so the
    // options page opens there, not on the default General tab.
    url = chrome.runtime.getURL('options.html?section=subtitles');
  } catch {
    return; // no extension context
  }
  try {
    // Route through the background, which uses chrome.tabs.create — that reliably
    // renders the extension page. window.open-ing a chrome-extension:// URL from a
    // content script opens a blank (about:blank) tab for non-web-accessible pages,
    // so we avoid it here.
    chrome.runtime.sendMessage({ action: 'OPEN_OPTIONS', url }).catch(() => {
      try {
        if (typeof chrome !== 'undefined' && chrome.runtime?.openOptionsPage) {
          void chrome.runtime.openOptionsPage();
        }
      } catch {
        /* ignore */
      }
    });
  } catch {
    try {
      if (typeof chrome !== 'undefined' && chrome.runtime?.openOptionsPage) {
        void chrome.runtime.openOptionsPage();
      }
    } catch {
      /* ignore */
    }
  }
}

function buttonStateFromSnapshot(snap: MiniStudioSnapshot): ChromeButtonState {
  if (!snap.enabled) return 'off';
  return snap.status === 'translating' ? 'translating' : 'enabled';
}

export function attachMiniStudio(args: {
  shadow: ShadowRoot;
  anchorButton: HTMLButtonElement;
  panelSlot?: HTMLElement | null;
  onOpenChange: (open: boolean) => void;
  setButtonState?: (state: ChromeButtonState) => void;
}): MiniStudioControllers {
  const view: MiniStudioView = buildMiniStudioView();
  const panel = view.panel;

  const parent = args.panelSlot ?? args.shadow;
  parent.append(view.style, panel);

  let open = false;
  let destroyed = false;
  let closeTimer: ReturnType<typeof setTimeout> | null = null;

  function currentPreviewArgs(): {
    fontSize: number;
    backgroundOpacity: number;
    position: 'top' | 'bottom';
    displayMode: string;
  } {
    return {
      fontSize: Number(view.fontSize.input.value),
      backgroundOpacity: Number(view.opacity.input.value) / 100,
      position: view.position.value() as 'top' | 'bottom',
      displayMode: view.displayMode.value(),
    };
  }

  function applySnapshot(snap: MiniStudioSnapshot): void {
    view.enable.input.checked = snap.enabled;
    view.displayMode.setValue(snap.displayMode);
    view.fontSize.setValue(snap.fontSize);
    view.fontValue.textContent = String(snap.fontSize);
    view.position.setValue(snap.position);
    const pct = Math.round(snap.backgroundOpacity * 100);
    view.opacity.setValue(pct);
    view.opacityValue.textContent = String(pct);
    hydrateLocalKnobs(snap.knobs);
    for (const select of view.knobSelects) {
      const knob = select.dataset.knob as keyof ProfileKnobs;
      select.value = snap.knobs[knob] ?? 'auto';
    }
    view.glossary.innerHTML = '';
    const none = document.createElement('option');
    none.value = '';
    none.textContent = 'None';
    view.glossary.appendChild(none);
    for (const list of snap.lists) {
      const opt = document.createElement('option');
      opt.value = list.id;
      opt.textContent = list.name;
      view.glossary.appendChild(opt);
    }
    view.glossary.value = snap.activeListId ?? '';
    setStatusPill(view.statusPill, view.statusLabel, snap.status);
    updatePreview(view.preview, {
      fontSize: snap.fontSize,
      backgroundOpacity: snap.backgroundOpacity,
      position: snap.position,
      displayMode: snap.displayMode,
    });
    args.setButtonState?.(buttonStateFromSnapshot(snap));
  }

  async function refresh(): Promise<void> {
    if (destroyed) return;
    const snap = await loadMiniStudioSnapshot();
    if (destroyed) return;
    applySnapshot(snap);
  }

  async function openPanel(): Promise<void> {
    if (destroyed || open) return;
    open = true;
    if (closeTimer != null) {
      clearTimeout(closeTimer);
      closeTimer = null;
    }
    panel.hidden = false;
    // Next frame so the open transition actually runs from the initial state.
    requestAnimationFrame(() => {
      if (open && !destroyed) panel.classList.add('open');
    });
    args.onOpenChange(true);
    await refresh();
  }

  function closePanel(): void {
    if (destroyed || !open) return;
    open = false;
    panel.classList.remove('open');
    closeTimer = setTimeout(() => {
      closeTimer = null;
      if (!open && !destroyed) panel.hidden = true;
    }, CLOSE_HIDE_MS);
    args.onOpenChange(false);
  }

  const onKeyDown = (e: KeyboardEvent): void => {
    if (!open) return;
    if (e.key === 'Escape') {
      e.stopPropagation();
      closePanel();
    }
  };

  const onPointerDown = (e: Event): void => {
    if (!open) return;
    const path = typeof e.composedPath === 'function' ? e.composedPath() : [];
    if (path.includes(panel) || path.includes(args.anchorButton)) return;
    closePanel();
  };

  document.addEventListener('keydown', onKeyDown, true);
  document.addEventListener('pointerdown', onPointerDown, true);

  // Keep the anchor button state (and an open panel) in sync with external
  // settings writes (popup/options). Event-driven — no polling.
  let unsubscribeSettings: (() => void) | null = null;
  if (!isContextInvalidated()) {
    try {
      unsubscribeSettings = onSettingsChange(() => {
        if (!destroyed) void refresh();
      });
    } catch {
      /* no extension context */
    }
  }

  view.enable.input.addEventListener('change', () => {
    void setSubtitlesEnabled(view.enable.input.checked).then(() => refresh());
  });
  for (const input of view.displayMode.inputs) {
    input.addEventListener('change', () => {
      if (!input.checked) return;
      void setAppearance({
        displayMode: input.value as MiniStudioSnapshot['displayMode'],
      }).then(() => refresh());
    });
  }
  view.fontSize.input.addEventListener('input', () => {
    view.fontValue.textContent = view.fontSize.input.value;
    updatePreview(view.preview, currentPreviewArgs());
  });
  view.fontSize.input.addEventListener('change', () => {
    void setAppearance({ fontSize: Number(view.fontSize.input.value) }).then(() => refresh());
  });
  for (const input of view.position.inputs) {
    input.addEventListener('change', () => {
      if (!input.checked) return;
      void setAppearance({
        position: input.value as MiniStudioSnapshot['position'],
      }).then(() => refresh());
    });
  }
  view.opacity.input.addEventListener('input', () => {
    view.opacityValue.textContent = view.opacity.input.value;
    updatePreview(view.preview, currentPreviewArgs());
  });
  view.opacity.input.addEventListener('change', () => {
    void setAppearance({ backgroundOpacity: Number(view.opacity.input.value) / 100 }).then(() =>
      refresh(),
    );
  });
  view.glossary.addEventListener('change', () => {
    const id = view.glossary.value || null;
    void setActiveGlossaryList(id).then(() => refresh());
  });
  view.optionsBtn.addEventListener('click', (e) => {
    e.preventDefault();
    openFullSubtitleStudio();
  });
  view.closeBtn.addEventListener('click', () => {
    closePanel();
  });

  for (const select of view.knobSelects) {
    select.addEventListener('change', () => {
      const knob = select.dataset.knob as keyof ProfileKnobs;
      setTabKnob(knob, select.value);
      void refresh();
    });
  }

  return {
    open: openPanel,
    close: closePanel,
    isOpen: () => open,
    refresh,
    destroy() {
      destroyed = true;
      open = false;
      if (closeTimer != null) {
        clearTimeout(closeTimer);
        closeTimer = null;
      }
      unsubscribeSettings?.();
      unsubscribeSettings = null;
      document.removeEventListener('keydown', onKeyDown, true);
      document.removeEventListener('pointerdown', onPointerDown, true);
      panel.remove();
      view.style.remove();
    },
  };
}
```

- [x] **Step 4: Run tests to verify they pass**

Run: `npx vitest run content/__tests__/playerChrome/miniStudio.test.ts`
Expected: PASS — the 2 pre-existing tests (enable wiring, open-options deep link) plus the 4 new tests.

Note: the pre-existing tests must pass unmodified — `data-action="enable"` is still a checkbox, `data-action="open-options"` is still the footer button.

- [x] **Step 5: Commit**

```bash
git add content/playerChrome/miniStudio.ts content/__tests__/playerChrome/miniStudio.test.ts
git commit -m "feat(playerChrome): rewire mini studio onto glass view with live preview"
```

---

### Task 5: Quality gates

**Files:**
- None (verification only; fix-forward if failures surface).

**Interfaces:**
- Consumes: everything from Tasks 1–4.
- Produces: verified build.

- [x] **Step 1: Type check**

Run: `npm run compile`
Expected: exit 0, no TypeScript errors.

- [x] **Step 2: Lint**

Run: `npm run lint`
Expected: exit 0, no ESLint errors (warnings pre-existing in the repo are acceptable only if untouched by this change).

- [x] **Step 3: Full test suite**

Run: `npm test`
Expected: PASS — entire suite green, including all `content/__tests__/playerChrome/` tests (existing lifecycle/visibility/host/prefs/adapter tests untouched).

- [x] **Step 4: Production build**

Run: `npm run build`
Expected: WXT build completes without errors.

- [x] **Step 5: Manual smoke (if a browser session is available)**

On YouTube (floating + native mount) and one generic-handler site:
- Icon shows captions SVG; state ring appears when subtitles enabled.
- Panel opens with fade/slide; glass material visible over video; closes via ✕, Esc, and outside click.
- Preview updates live while dragging font-size/opacity sliders; display mode and position reflected in preview.
- Status pill matches pipeline state; `prefers-reduced-motion` disables animations.

---

## Self-Review Notes

- **Spec coverage:** §5.1 tokens → Task 2 CSS; §5.2 structure → Task 2 view; §5.3 button → Task 3 (+ Task 4 storage subscription); §5.4 behavior (close ✕, live preview on input, preserved write paths) → Task 4; §5.5 a11y → native inputs throughout, `aria-live` pill, focus rings in CSS; §6.1 file split → Tasks 1–4; §7 tests → per-task tests + Task 5 gates.
- **Deviation from spec §6.2:** `mountFloating.ts` is modified (button-state CSS + `setButtonState` plumbing) — required because the anchor button's styles live in `CHROME_SHADOW_CSS`; no behavior change.
- **Type consistency:** `ChromeButtonState` defined in Task 3, consumed by Tasks 3–4; `MiniStudioView`/`PreviewElements`/`PREVIEW_FONT_SCALE` defined in Task 2, consumed by Tasks 2 and 4; `data-action` values match the pre-existing test contract.
