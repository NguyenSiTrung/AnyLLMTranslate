# Advanced Active Features Jump Nav Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Advanced overview “Active features” chips jump to the top of the matching settings card with smooth scroll, focus, and a brief highlight.

**Architecture:** Keep a pure constants + DOM helper module (`scrollToAdvancedSection`) unit-tested in isolation. Wire chips in `AdvancedSection` as buttons that call the helper and mark section wrappers with stable ids. No store, routing, or schema changes.

**Tech Stack:** React 19, TypeScript, Tailwind CSS 4, Vitest + Testing Library, existing `AdvancedSection` / `Card` patterns.

**Spec:** `docs/superpowers/specs/2026-07-27-advanced-active-features-jump-nav-design.md`

## Global Constraints

- Jump to **card/section tops** only (not individual toggles).
- Chips **must not** mutate settings — navigation only.
- No URL hash / deep-link routing in this change.
- No new chips (e.g. Scientific PDF).
- No reusable multi-tab TOC framework.
- Track work with **bd**; do not use TodoWrite.
- Prefer non-interactive shell flags; run targeted vitest paths listed per task.
- TDD: helper tests first, then component wiring tests, then UI.
- Prefer `GIT_AUTHOR_NAME` / `GIT_COMMITTER_*` env if local `user.name` is unset — do not run `git config`.

---

## File map

| File | Responsibility |
|------|----------------|
| Create `entrypoints/options/lib/scrollToAdvancedSection.ts` | Section id constants, reduced-motion check, scroll + focus + highlight helper |
| Create `entrypoints/options/lib/__tests__/scrollToAdvancedSection.test.ts` | Unit tests for helper behavior |
| Modify `entrypoints/options/sections/AdvancedSection.tsx` | Section wrapper ids, chip buttons, call helper, highlight class |
| Create `entrypoints/options/sections/__tests__/AdvancedSection.jumpNav.test.tsx` | Component tests: chips → targets, no settings mutation |
| Spec (done) | `docs/superpowers/specs/2026-07-27-advanced-active-features-jump-nav-design.md` |

**Do not modify:** settings store, portable keys, Card component API (prefer wrapper divs), other options tabs.

---

### Task 1: Scroll helper + unit tests

**Files:**
- Create: `entrypoints/options/lib/scrollToAdvancedSection.ts`
- Create: `entrypoints/options/lib/__tests__/scrollToAdvancedSection.test.ts`

**Interfaces:**
- Consumes: `document.getElementById`, `window.matchMedia`, `Element.scrollIntoView`, `HTMLElement.focus`
- Produces:
  - `export const ADVANCED_SECTION_IDS` — readonly map of logical keys → DOM ids
  - `export type AdvancedSectionId = (typeof ADVANCED_SECTION_IDS)[keyof typeof ADVANCED_SECTION_IDS]`
  - `export const ADVANCED_SECTION_HIGHLIGHT_MS = 1200`
  - `export function prefersReducedMotion(win?: Window): boolean`
  - `export function scrollToAdvancedSection(sectionId: string, opts?: { document?: Document; window?: Window }): boolean`
    - returns `true` if target found and scroll/focus attempted; `false` if missing
  - Highlight: sets `data-advanced-section-highlight="true"` on target, clears after timeout (and clears any previous target’s attribute)

- [ ] **Step 1: Write the failing tests**

Create `entrypoints/options/lib/__tests__/scrollToAdvancedSection.test.ts`:

```typescript
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ADVANCED_SECTION_IDS,
  ADVANCED_SECTION_HIGHLIGHT_MS,
  prefersReducedMotion,
  scrollToAdvancedSection,
} from '../scrollToAdvancedSection';

describe('ADVANCED_SECTION_IDS', () => {
  it('maps every overview chip key to a stable id', () => {
    expect(ADVANCED_SECTION_IDS).toEqual({
      prompt: 'advanced-section-prompt',
      performance: 'advanced-section-performance',
      quality: 'advanced-section-quality',
      context: 'advanced-section-context',
      pdf: 'advanced-section-pdf',
      developer: 'advanced-section-developer',
    });
  });
});

describe('prefersReducedMotion', () => {
  it('returns true when matchMedia matches', () => {
    const win = {
      matchMedia: vi.fn().mockReturnValue({ matches: true }),
    } as unknown as Window;
    expect(prefersReducedMotion(win)).toBe(true);
    expect(win.matchMedia).toHaveBeenCalledWith('(prefers-reduced-motion: reduce)');
  });

  it('returns false when matchMedia does not match', () => {
    const win = {
      matchMedia: vi.fn().mockReturnValue({ matches: false }),
    } as unknown as Window;
    expect(prefersReducedMotion(win)).toBe(false);
  });

  it('returns false when matchMedia is missing', () => {
    const win = {} as Window;
    expect(prefersReducedMotion(win)).toBe(false);
  });
});

describe('scrollToAdvancedSection', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    document.body.innerHTML = '';
  });

  afterEach(() => {
    vi.useRealTimers();
    document.body.innerHTML = '';
  });

  it('returns false when target is missing', () => {
    expect(scrollToAdvancedSection('advanced-section-missing')).toBe(false);
  });

  it('smooth-scrolls, focuses, and highlights the target', () => {
    const el = document.createElement('div');
    el.id = ADVANCED_SECTION_IDS.context;
    el.tabIndex = -1;
    const scrollIntoView = vi.fn();
    const focus = vi.fn();
    el.scrollIntoView = scrollIntoView;
    el.focus = focus;
    document.body.appendChild(el);

    const win = {
      matchMedia: vi.fn().mockReturnValue({ matches: false }),
    } as unknown as Window;

    expect(scrollToAdvancedSection(ADVANCED_SECTION_IDS.context, { window: win })).toBe(
      true,
    );
    expect(scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth', block: 'start' });
    expect(focus).toHaveBeenCalledWith({ preventScroll: true });
    expect(el.getAttribute('data-advanced-section-highlight')).toBe('true');

    vi.advanceTimersByTime(ADVANCED_SECTION_HIGHLIGHT_MS);
    expect(el.hasAttribute('data-advanced-section-highlight')).toBe(false);
  });

  it('uses auto scroll behavior when reduced motion is preferred', () => {
    const el = document.createElement('div');
    el.id = ADVANCED_SECTION_IDS.prompt;
    el.tabIndex = -1;
    const scrollIntoView = vi.fn();
    el.scrollIntoView = scrollIntoView;
    el.focus = vi.fn();
    document.body.appendChild(el);

    const win = {
      matchMedia: vi.fn().mockReturnValue({ matches: true }),
    } as unknown as Window;

    scrollToAdvancedSection(ADVANCED_SECTION_IDS.prompt, { window: win });
    expect(scrollIntoView).toHaveBeenCalledWith({ behavior: 'auto', block: 'start' });
  });

  it('replaces highlight on a second jump (single active highlight)', () => {
    const a = document.createElement('div');
    a.id = ADVANCED_SECTION_IDS.prompt;
    a.tabIndex = -1;
    a.scrollIntoView = vi.fn();
    a.focus = vi.fn();
    const b = document.createElement('div');
    b.id = ADVANCED_SECTION_IDS.developer;
    b.tabIndex = -1;
    b.scrollIntoView = vi.fn();
    b.focus = vi.fn();
    document.body.appendChild(a);
    document.body.appendChild(b);

    const win = {
      matchMedia: vi.fn().mockReturnValue({ matches: false }),
    } as unknown as Window;

    scrollToAdvancedSection(ADVANCED_SECTION_IDS.prompt, { window: win });
    expect(a.getAttribute('data-advanced-section-highlight')).toBe('true');

    scrollToAdvancedSection(ADVANCED_SECTION_IDS.developer, { window: win });
    expect(a.hasAttribute('data-advanced-section-highlight')).toBe(false);
    expect(b.getAttribute('data-advanced-section-highlight')).toBe('true');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
npx vitest run entrypoints/options/lib/__tests__/scrollToAdvancedSection.test.ts
```

Expected: FAIL — module not found / cannot resolve `../scrollToAdvancedSection`.

- [ ] **Step 3: Implement the helper**

Create `entrypoints/options/lib/scrollToAdvancedSection.ts`:

```typescript
export const ADVANCED_SECTION_IDS = {
  prompt: 'advanced-section-prompt',
  performance: 'advanced-section-performance',
  quality: 'advanced-section-quality',
  context: 'advanced-section-context',
  pdf: 'advanced-section-pdf',
  developer: 'advanced-section-developer',
} as const;

export type AdvancedSectionId =
  (typeof ADVANCED_SECTION_IDS)[keyof typeof ADVANCED_SECTION_IDS];

export const ADVANCED_SECTION_HIGHLIGHT_MS = 1200;

let highlightTimer: ReturnType<typeof setTimeout> | null = null;
let highlightedEl: HTMLElement | null = null;

export function prefersReducedMotion(win: Window = window): boolean {
  try {
    return Boolean(win.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches);
  } catch {
    return false;
  }
}

function clearHighlight(): void {
  if (highlightTimer != null) {
    clearTimeout(highlightTimer);
    highlightTimer = null;
  }
  if (highlightedEl) {
    highlightedEl.removeAttribute('data-advanced-section-highlight');
    highlightedEl = null;
  }
}

/**
 * Scrolls the Advanced tab section into view, moves focus, and briefly highlights it.
 * @returns false if the element is not in the document.
 */
export function scrollToAdvancedSection(
  sectionId: string,
  opts?: { document?: Document; window?: Window },
): boolean {
  const doc = opts?.document ?? document;
  const win = opts?.window ?? window;
  const el = doc.getElementById(sectionId);
  if (!el) return false;

  const reduced = prefersReducedMotion(win);
  el.scrollIntoView({
    behavior: reduced ? 'auto' : 'smooth',
    block: 'start',
  });

  if (typeof (el as HTMLElement).focus === 'function') {
    (el as HTMLElement).focus({ preventScroll: true });
  }

  clearHighlight();
  el.setAttribute('data-advanced-section-highlight', 'true');
  highlightedEl = el as HTMLElement;
  highlightTimer = setTimeout(() => {
    if (highlightedEl === el) {
      el.removeAttribute('data-advanced-section-highlight');
      highlightedEl = null;
    }
    highlightTimer = null;
  }, ADVANCED_SECTION_HIGHLIGHT_MS);

  return true;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run:

```bash
npx vitest run entrypoints/options/lib/__tests__/scrollToAdvancedSection.test.ts
```

Expected: PASS (all tests green).

- [ ] **Step 5: Commit**

```bash
git add \
  entrypoints/options/lib/scrollToAdvancedSection.ts \
  entrypoints/options/lib/__tests__/scrollToAdvancedSection.test.ts
GIT_AUTHOR_NAME="AnyLLMTranslate Agent" GIT_AUTHOR_EMAIL="agent@anyllmtranslate.local" \
GIT_COMMITTER_NAME="AnyLLMTranslate Agent" GIT_COMMITTER_EMAIL="agent@anyllmtranslate.local" \
git commit -m "$(cat <<'EOF'
feat(options): add Advanced section jump scroll helper

Pure ids + scroll/focus/highlight helper with reduced-motion support
for Active features chip navigation.
EOF
)"
```

---

### Task 2: Wire Active features chips + section anchors

**Files:**
- Modify: `entrypoints/options/sections/AdvancedSection.tsx`
- Create: `entrypoints/options/sections/__tests__/AdvancedSection.jumpNav.test.tsx`

**Interfaces:**
- Consumes: `ADVANCED_SECTION_IDS`, `scrollToAdvancedSection` from `@/entrypoints/options/lib/scrollToAdvancedSection`
- Produces: clickable overview chips; six section wrappers with matching `id`, `tabIndex={-1}`, `scroll-mt-4`, and highlight ring via `data-advanced-section-highlight`

**Chip → target mapping (must match UI labels):**

| Chip | `aria-label` | `ADVANCED_SECTION_IDS.*` |
|------|--------------|---------------------------|
| prompt | Jump to Translation System Prompt | `prompt` |
| context | Jump to Context & Intelligence | `context` |
| stream | Jump to Translation Quality | `quality` |
| debug | Jump to Developer | `developer` |
| RPM | Jump to Performance & Throughput | `performance` |
| PDF | Jump to PDF Translator | `pdf` |

- [ ] **Step 1: Write the failing component tests**

Create `entrypoints/options/sections/__tests__/AdvancedSection.jumpNav.test.tsx`:

```tsx
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { DEFAULT_SETTINGS } from '@/types/config';
import { useSettingsStore } from '@/stores/settingsStore';
import { ToastProvider } from '@/ui/ToastProvider';
import { ADVANCED_SECTION_IDS } from '@/entrypoints/options/lib/scrollToAdvancedSection';
import { AdvancedSection } from '../AdvancedSection';

const scrollToAdvancedSection = vi.hoisted(() => vi.fn(() => true));

vi.mock('@/entrypoints/options/lib/scrollToAdvancedSection', async () => {
  const actual = await vi.importActual<
    typeof import('@/entrypoints/options/lib/scrollToAdvancedSection')
  >('@/entrypoints/options/lib/scrollToAdvancedSection');
  return {
    ...actual,
    scrollToAdvancedSection,
  };
});

vi.mock('@/entrypoints/options/hooks/useCacheStats', () => ({
  useCacheStats: () => ({
    entryCount: 0,
    totalSizeBytes: 0,
    sizeMb: 0,
    sizeLabel: '0 B',
    loading: false,
    refresh: vi.fn(),
  }),
}));

function renderAdvanced() {
  return render(
    <ToastProvider>
      <AdvancedSection />
    </ToastProvider>,
  );
}

describe('AdvancedSection Active features jump nav', () => {
  beforeEach(() => {
    scrollToAdvancedSection.mockClear();
    useSettingsStore.setState({
      ...DEFAULT_SETTINGS,
      isLoaded: true,
      updateSettings: vi.fn(),
    });
  });

  it('renders stable section anchors for every jump target', () => {
    renderAdvanced();
    for (const id of Object.values(ADVANCED_SECTION_IDS)) {
      const el = document.getElementById(id);
      expect(el).toBeTruthy();
      expect(el).toHaveAttribute('tabindex', '-1');
    }
  });

  it('jumps from each Active features chip without mutating settings', () => {
    const updateSettings = vi.fn();
    useSettingsStore.setState({ updateSettings });
    renderAdvanced();

    const cases: Array<{ name: RegExp; sectionId: string }> = [
      { name: /jump to translation system prompt/i, sectionId: ADVANCED_SECTION_IDS.prompt },
      { name: /jump to context & intelligence/i, sectionId: ADVANCED_SECTION_IDS.context },
      { name: /jump to translation quality/i, sectionId: ADVANCED_SECTION_IDS.quality },
      { name: /jump to developer/i, sectionId: ADVANCED_SECTION_IDS.developer },
      { name: /jump to performance & throughput/i, sectionId: ADVANCED_SECTION_IDS.performance },
      { name: /jump to pdf translator/i, sectionId: ADVANCED_SECTION_IDS.pdf },
    ];

    for (const { name, sectionId } of cases) {
      scrollToAdvancedSection.mockClear();
      fireEvent.click(screen.getByRole('button', { name }));
      expect(scrollToAdvancedSection).toHaveBeenCalledWith(sectionId);
    }

    expect(updateSettings).not.toHaveBeenCalled();
  });

  it('keeps Active features region labeled for discovery', () => {
    renderAdvanced();
    expect(screen.getByText(/active features/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
npx vitest run entrypoints/options/sections/__tests__/AdvancedSection.jumpNav.test.tsx
```

Expected: FAIL — missing buttons / missing section ids / `scrollToAdvancedSection` not called.

- [ ] **Step 3: Wire `AdvancedSection.tsx`**

1. Add import near other local imports:

```typescript
import {
  ADVANCED_SECTION_IDS,
  scrollToAdvancedSection,
} from '@/entrypoints/options/lib/scrollToAdvancedSection';
```

2. Add shared class constants near the top of `AdvancedSection` (inside the component, before `return`, or as module-level constants just above the component):

```typescript
const SECTION_ANCHOR_CLASS =
  'animate-stagger scroll-mt-4 rounded-xl outline-none data-[advanced-section-highlight=true]:ring-2 data-[advanced-section-highlight=true]:ring-cyan-500/40 data-[advanced-section-highlight=true]:ring-offset-2 data-[advanced-section-highlight=true]:ring-offset-zinc-950';

const CHIP_BASE_CLASS =
  'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500/50 focus-visible:ring-offset-1 focus-visible:ring-offset-zinc-950 hover:brightness-110';
```

3. Extend `overviewChips` with `targetId` + `ariaLabel`:

```typescript
const overviewChips = [
  {
    key: 'prompt',
    targetId: ADVANCED_SECTION_IDS.prompt,
    ariaLabel: 'Jump to Translation System Prompt',
    active: isPromptCustom,
    icon: <Braces className="h-3 w-3" />,
    label: isPromptCustom ? 'Custom prompt' : 'Default prompt',
    activeClass: 'border-cyan-500/30 bg-cyan-500/10 text-cyan-300',
  },
  {
    key: 'context',
    targetId: ADVANCED_SECTION_IDS.context,
    ariaLabel: 'Jump to Context & Intelligence',
    active: settings.enableContextAwareTranslation,
    icon: <BrainCircuit className="h-3 w-3" />,
    label: 'Context',
    activeClass: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300',
  },
  {
    key: 'stream',
    targetId: ADVANCED_SECTION_IDS.quality,
    ariaLabel: 'Jump to Translation Quality',
    active: settings.enableStreamingTranslation,
    icon: <Zap className="h-3 w-3" />,
    label: 'Streaming',
    activeClass: 'border-sky-500/30 bg-sky-500/10 text-sky-300',
  },
  {
    key: 'debug',
    targetId: ADVANCED_SECTION_IDS.developer,
    ariaLabel: 'Jump to Developer',
    active: settings.debugMode,
    icon: <Bug className="h-3 w-3" />,
    label: 'Debug',
    activeClass: 'border-amber-500/35 bg-amber-500/15 text-amber-300',
  },
] as const;
```

4. Replace the Active features chip markup (the `overviewChips.map` spans and the RPM/PDF spans) with:

```tsx
<div className="flex flex-wrap gap-1.5">
  {overviewChips.map((chip) => (
    <button
      key={chip.key}
      type="button"
      aria-label={chip.ariaLabel}
      onClick={() => scrollToAdvancedSection(chip.targetId)}
      className={`${CHIP_BASE_CLASS} ${
        chip.active
          ? chip.activeClass
          : 'border-zinc-800 bg-zinc-900/50 text-zinc-600 hover:border-zinc-700 hover:text-zinc-400'
      }`}
    >
      {chip.icon}
      {chip.label}
    </button>
  ))}
  <button
    type="button"
    aria-label="Jump to Performance & Throughput"
    onClick={() => scrollToAdvancedSection(ADVANCED_SECTION_IDS.performance)}
    className={`${CHIP_BASE_CLASS} ${
      maxRpmField.value === 0
        ? 'border-zinc-800 bg-zinc-900/50 text-zinc-600 hover:border-zinc-700 hover:text-zinc-400'
        : 'border-blue-500/30 bg-blue-500/10 text-blue-300'
    }`}
  >
    <Gauge className="h-3 w-3" aria-hidden="true" />
    {maxRpmField.value === 0 ? 'RPM unlimited' : `${maxRpmField.value} RPM`}
  </button>
  <button
    type="button"
    aria-label="Jump to PDF Translator"
    onClick={() => scrollToAdvancedSection(ADVANCED_SECTION_IDS.pdf)}
    className={`${CHIP_BASE_CLASS} ${
      pdfAutoOpen === 'off'
        ? 'border-zinc-800 bg-zinc-900/50 text-zinc-600 hover:border-zinc-700 hover:text-zinc-400'
        : 'border-orange-500/30 bg-orange-500/10 text-orange-300'
    }`}
  >
    <FileText className="h-3 w-3" aria-hidden="true" />
    PDF {pdfAutoOpen}
  </button>
</div>
```

5. Update each mapped card outer stagger wrapper. Example for Translation System Prompt (replace the existing outer div that only has `animate-stagger`):

```tsx
<div
  id={ADVANCED_SECTION_IDS.prompt}
  tabIndex={-1}
  className={SECTION_ANCHOR_CLASS}
  style={stagger(0)}
>
  <Card
    variant="bordered"
    accent="cyan"
    title="Translation System Prompt"
    {/* ... unchanged ... */}
  >
```

Apply the same pattern to:

| Card title | id constant | existing stagger index |
|------------|-------------|------------------------|
| Translation System Prompt | `ADVANCED_SECTION_IDS.prompt` | 0 |
| Performance & Throughput | `ADVANCED_SECTION_IDS.performance` | 1 |
| Translation Quality | `ADVANCED_SECTION_IDS.quality` | 2 |
| Context & Intelligence | `ADVANCED_SECTION_IDS.context` | 3 |
| PDF Translator | `ADVANCED_SECTION_IDS.pdf` | 4 |
| Developer | `ADVANCED_SECTION_IDS.developer` | 7 |

Keep Scientific PDF, Data Portability, and Danger Zone without jump anchors (out of scope). Keep their existing stagger wrappers unchanged except do not break stagger indexes for unmapped cards.

- [ ] **Step 4: Run component + helper + existing Advanced tests**

Run:

```bash
npx vitest run \
  entrypoints/options/lib/__tests__/scrollToAdvancedSection.test.ts \
  entrypoints/options/sections/__tests__/AdvancedSection.jumpNav.test.tsx \
  entrypoints/options/sections/__tests__/AdvancedSection.inputFocus.test.tsx
```

Expected: PASS all three files.

- [ ] **Step 5: Manual smoke (if options UI available)**

1. Open Options → Advanced.
2. Click each Active features chip; confirm the matching card top enters view and gets a brief ring.
3. Tab to a chip, press Enter/Space; same jump.
4. Confirm chip colors still reflect on/off state and toggles still save as before.

- [ ] **Step 6: Commit**

```bash
git add \
  entrypoints/options/sections/AdvancedSection.tsx \
  entrypoints/options/sections/__tests__/AdvancedSection.jumpNav.test.tsx
GIT_AUTHOR_NAME="AnyLLMTranslate Agent" GIT_AUTHOR_EMAIL="agent@anyllmtranslate.local" \
GIT_COMMITTER_NAME="AnyLLMTranslate Agent" GIT_COMMITTER_EMAIL="agent@anyllmtranslate.local" \
git commit -m "$(cat <<'EOF'
feat(options): Active features chips jump to Advanced sections

Overview chips scroll to card tops with focus and brief highlight,
acting as a mini table of contents on the long Advanced tab.
EOF
)"
```

---

## Self-review (plan vs spec)

| Spec requirement | Task |
|------------------|------|
| Chip → card mapping (prompt, context, stream, debug, RPM, PDF) | Task 2 |
| `id` + `scrollIntoView` Approach A | Tasks 1–2 |
| Smooth scroll + `block: 'start'` | Task 1 |
| Focus target with `tabIndex={-1}` + `preventScroll` | Tasks 1–2 |
| Brief highlight ~1–1.5s; single active highlight | Task 1 (`1200ms`) |
| `prefers-reduced-motion` | Task 1 |
| Buttons + aria-labels + focus-visible | Task 2 |
| No settings mutation | Task 2 test |
| No hash routing / no new chips / no multi-tab TOC | Global constraints |
| Unit + component tests | Tasks 1–2 |
| Sticky header offset | `scroll-mt-4` on anchors (Task 2) |

No placeholders left. Types/names consistent: `ADVANCED_SECTION_IDS`, `scrollToAdvancedSection`, `ADVANCED_SECTION_HIGHLIGHT_MS`.

---

## Execution handoff

Plan complete and saved to `docs/superpowers/plans/2026-07-27-advanced-active-features-jump-nav.md`.

**Two execution options:**

1. **Subagent-Driven (recommended)** — fresh subagent per task, review between tasks
2. **Inline Execution** — execute tasks in this session with executing-plans checkpoints

Which approach?
