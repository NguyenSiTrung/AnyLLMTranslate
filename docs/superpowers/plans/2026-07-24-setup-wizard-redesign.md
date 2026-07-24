# Setup Wizard UI/UX Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the first-run setup wizard as a unified 4-step Success Path (`welcome → connect → verify → ready`) with brand Welcome, Connect category filters, shared WizardShell, and Guided-Add-quality catalog rows — without changing readiness math or connection-test pipeline semantics.

**Architecture:** Keep pure step math and legacy migration in `lib/setupWizard.ts`. Extract presentational shell + step components under `entrypoints/options/components/wizard/`. Extract shared catalog list UI (`ProviderCatalogRows`) for Guided Add + Connect. Orchestration (store writes, test run, skip/finish) stays in a slim `SetupWizard.tsx`.

**Tech Stack:** React 19, TypeScript, Tailwind CSS 4, Lucide React, Zustand settings store, Vitest + Testing Library (jsdom), WXT options entry.

**Spec:** `docs/superpowers/specs/2026-07-24-setup-wizard-redesign-design.md`  
**Beads:** AnyLLMTranslate-rnm

## Global Constraints

- Product direction is **B + C-lite**: 4 steps; Connect filters (All / Cloud / Local / Custom); brand Welcome; WizardShell extract. **No** hard Cloud/Local/Custom Welcome path forks.
- Preserve atomic provider + pool writes (`updateSettings({ provider, providers: syncProviderToPool(...) })`). Never concurrent partial writes.
- Preserve skip / resume / completed-reopen-at-connect / Escape skip-confirm / focus trap behavior (adapted to new step ids).
- Preserve `testConnection` + `ConnectionTestProgressList` + readiness gates (`getProviderReadiness` / recovery messages).
- Migrate `OnboardingState.lastStep` to new ids; always **normalize legacy** ids on read; write only new ids.
- Deep links: `?setup=1`, `#setup`, `?step=` accept new **and** legacy step ids via `normalizeWizardStep`.
- Catalog active state uses **cyan** wash (wizard brand), not blue.
- Base URL lives under **Advanced** disclosure when a catalog template prefilled it; default open for Custom / empty URL.
- Target language is chosen on **Verify** (not a separate step). No auto-navigate after successful test — user clicks Finish.
- Welcome: Skip **footer-only**; Connect/Verify: Skip **header-only**.
- Do not rewrite Scientific PDF wizard (shell may be reusable later; not required for acceptance).
- Commits: if git user unset, use  
  `git -c user.name="AnyLLMTranslate Agent" -c user.email="agent@anyllmtranslate.local" commit ...`
- Prefer `npx vitest run <paths>` or project scripts; Node `>=20.12.0`.

---

## File map

| File | Responsibility |
|------|----------------|
| Modify: `types/config.ts` | `OnboardingState.lastStep` union → new step ids |
| Modify: `lib/setupWizard.ts` | New steps, labels, `normalizeWizardStep`, entry resolve, filter type helpers |
| Create: `lib/__tests__/setupWizard.test.ts` | Unit tests for normalize / entry / index / labels |
| Modify: `tests/unit/legacyUtils.test.ts` | Update entry-step expectation if needed |
| Create: `entrypoints/options/components/wizard/WizardProgress.tsx` | 4-segment progress bar |
| Create: `entrypoints/options/components/wizard/WizardShell.tsx` | Backdrop, panel, progress, skip slot, footer |
| Create: `entrypoints/options/components/wizard/steps/WelcomeStep.tsx` | Brand welcome body |
| Create: `entrypoints/options/components/wizard/steps/ConnectStep.tsx` | Choose + credentials phases |
| Create: `entrypoints/options/components/wizard/steps/VerifyStep.tsx` | Language + test UI |
| Create: `entrypoints/options/components/wizard/steps/ReadyStep.tsx` | Success + CTAs body |
| Create: `entrypoints/options/components/ProviderCatalogRows.tsx` | Shared search + filters + grouped badge rows |
| Create: `entrypoints/options/components/__tests__/ProviderCatalogRows.test.tsx` | Filter + select smoke |
| Modify: `entrypoints/options/components/GuidedAddProvider.tsx` | Use `ProviderCatalogRows` for choose step |
| Rewrite: `entrypoints/options/SetupWizard.tsx` | Slim orchestration |
| Create: `entrypoints/options/__tests__/SetupWizard.test.tsx` | Integration: skip, finish, step flow |
| Modify: `entrypoints/options/App.tsx` | Deep-link via `normalizeWizardStep` |
| Keep: `lib/__tests__/setupWizardProviderSync.test.ts` | Regression — must keep passing |
| Keep: `ConnectionTestProgressList`, `ModelPicker`, `ProviderIdentityBadge` | Reuse as-is |

**Do not modify:** `services/providerTester.ts` internals, pool coordinator, popup recovery IA (only step id compatibility if it passes `step=`).

---

### Task 1: Pure wizard step model + legacy normalize (TDD)

**Files:**
- Modify: `types/config.ts` (`OnboardingState.lastStep`)
- Modify: `lib/setupWizard.ts`
- Create: `lib/__tests__/setupWizard.test.ts`
- Modify: `tests/unit/legacyUtils.test.ts` (if entry expectations change)

**Interfaces:**
- Produces:
  - `export type WizardStep = 'welcome' | 'connect' | 'verify' | 'ready'`
  - `export type LegacyWizardStep = 'provider' | 'test' | 'language' | 'done'`
  - `export type WizardStepInput = WizardStep | LegacyWizardStep | string | null | undefined`
  - `export type CatalogFilterId = 'all' | 'cloud' | 'local' | 'custom'`
  - `export const WIZARD_STEPS: readonly WizardStep[]`
  - `export const WIZARD_STEP_LABELS: Record<WizardStep, string>`
  - `export function normalizeWizardStep(input: WizardStepInput): WizardStep | null`
  - `export function resolveWizardEntryStep(onboarding: OnboardingState): WizardStep`
  - `export function wizardStepIndex(step: WizardStep): number` — 1-based
  - Existing: `getPopularTargetLanguages`, `providerPatchInvalidatesTest`, `isTranslatablePageUrl`

- [ ] **Step 1: Write failing unit tests**

Create `lib/__tests__/setupWizard.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  WIZARD_STEPS,
  WIZARD_STEP_LABELS,
  normalizeWizardStep,
  resolveWizardEntryStep,
  wizardStepIndex,
} from '@/lib/setupWizard';

describe('setupWizard steps', () => {
  it('exposes four steps in order', () => {
    expect(WIZARD_STEPS).toEqual(['welcome', 'connect', 'verify', 'ready']);
    expect(WIZARD_STEP_LABELS.welcome).toBe('Welcome');
    expect(WIZARD_STEP_LABELS.connect).toBe('Connect');
    expect(WIZARD_STEP_LABELS.verify).toBe('Verify');
    expect(WIZARD_STEP_LABELS.ready).toBe('Ready');
  });

  it('normalizeWizardStep maps legacy and new ids', () => {
    expect(normalizeWizardStep('welcome')).toBe('welcome');
    expect(normalizeWizardStep('connect')).toBe('connect');
    expect(normalizeWizardStep('verify')).toBe('verify');
    expect(normalizeWizardStep('ready')).toBe('ready');
    expect(normalizeWizardStep('provider')).toBe('connect');
    expect(normalizeWizardStep('test')).toBe('verify');
    expect(normalizeWizardStep('language')).toBe('verify');
    expect(normalizeWizardStep('done')).toBe('ready');
    expect(normalizeWizardStep('nope')).toBeNull();
    expect(normalizeWizardStep(undefined)).toBeNull();
  });

  it('wizardStepIndex is 1-based', () => {
    expect(wizardStepIndex('welcome')).toBe(1);
    expect(wizardStepIndex('ready')).toBe(4);
  });

  it('resolveWizardEntryStep: first run defaults to welcome', () => {
    expect(
      resolveWizardEntryStep({ completed: false, skipped: false }),
    ).toBe('welcome');
  });

  it('resolveWizardEntryStep: completed reopens at connect', () => {
    expect(
      resolveWizardEntryStep({
        completed: true,
        skipped: false,
        lastStep: 'ready',
      }),
    ).toBe('connect');
  });

  it('resolveWizardEntryStep: resumes lastStep when incomplete', () => {
    expect(
      resolveWizardEntryStep({
        completed: false,
        skipped: false,
        lastStep: 'provider',
      }),
    ).toBe('connect');
    expect(
      resolveWizardEntryStep({
        completed: false,
        skipped: false,
        lastStep: 'verify',
      }),
    ).toBe('verify');
  });

  it('resolveWizardEntryStep: lastStep ready without complete', () => {
    expect(
      resolveWizardEntryStep({
        completed: false,
        skipped: true,
        lastStep: 'ready',
      }),
    ).toBe('welcome');
    expect(
      resolveWizardEntryStep({
        completed: false,
        skipped: false,
        lastStep: 'done',
      }),
    ).toBe('verify');
  });
});
```

- [ ] **Step 2: Run tests — expect FAIL**

```bash
npx vitest run lib/__tests__/setupWizard.test.ts
```

Expected: FAIL (old steps still `provider` / missing `normalizeWizardStep`).

- [ ] **Step 3: Update types**

In `types/config.ts`, change:

```ts
export interface OnboardingState {
  completed: boolean;
  skipped: boolean;
  /** Last wizard step visited, used to resume setup (new ids; legacy normalized on read) */
  lastStep?: 'welcome' | 'connect' | 'verify' | 'ready';
}
```

- [ ] **Step 4: Implement pure helpers**

Replace step constants and entry logic in `lib/setupWizard.ts` with:

```ts
import type { OnboardingState } from '@/types/config';
import { LANGUAGES, type Language } from '@/lib/languages';

export type WizardStep = NonNullable<OnboardingState['lastStep']>;

/** Legacy ids that may still exist in chrome.storage or deep links. */
export type LegacyWizardStep = 'provider' | 'test' | 'language' | 'done';

export type WizardStepInput = WizardStep | LegacyWizardStep | string | null | undefined;

export type CatalogFilterId = 'all' | 'cloud' | 'local' | 'custom';

export const WIZARD_STEPS: readonly WizardStep[] = [
  'welcome',
  'connect',
  'verify',
  'ready',
] as const;

export const WIZARD_STEP_LABELS: Record<WizardStep, string> = {
  welcome: 'Welcome',
  connect: 'Connect',
  verify: 'Verify',
  ready: 'Ready',
};

const LEGACY_STEP_MAP: Record<LegacyWizardStep, WizardStep> = {
  provider: 'connect',
  test: 'verify',
  language: 'verify',
  done: 'ready',
};

export function normalizeWizardStep(input: WizardStepInput): WizardStep | null {
  if (input == null || input === '') return null;
  if ((WIZARD_STEPS as readonly string[]).includes(input)) {
    return input as WizardStep;
  }
  if (input in LEGACY_STEP_MAP) {
    return LEGACY_STEP_MAP[input as LegacyWizardStep];
  }
  return null;
}

export function resolveWizardEntryStep(onboarding: OnboardingState): WizardStep {
  if (onboarding.completed) {
    return 'connect';
  }

  const last = normalizeWizardStep(onboarding.lastStep) ?? 'welcome';
  if (last === 'ready') {
    return onboarding.skipped ? 'welcome' : 'verify';
  }
  return last;
}

export function wizardStepIndex(step: WizardStep): number {
  return WIZARD_STEPS.indexOf(step) + 1;
}

// Keep POPULAR_TARGET_LANGUAGE_CODES, getPopularTargetLanguages,
// providerPatchInvalidatesTest, TranslatePageResult, isTranslatablePageUrl
// as they are today (only adjust comments if they mention old step names).
```

Also export `DEFAULT_ONBOARDING_STATE.lastStep` remains `'welcome'` (already valid).

- [ ] **Step 5: Fix `legacyUtils.test.ts`**

Ensure:

```ts
expect(resolveWizardEntryStep({ completed: false, skipped: false })).toBe('welcome');
```

still passes (no change if already welcome).

- [ ] **Step 6: Run tests — expect PASS**

```bash
npx vitest run lib/__tests__/setupWizard.test.ts tests/unit/legacyUtils.test.ts lib/__tests__/setupWizardProviderSync.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add types/config.ts lib/setupWizard.ts lib/__tests__/setupWizard.test.ts tests/unit/legacyUtils.test.ts
git commit -m "feat(setup-wizard): 4-step model and legacy lastStep normalize"
```

---

### Task 2: `WizardProgress` + `WizardShell`

**Files:**
- Create: `entrypoints/options/components/wizard/WizardProgress.tsx`
- Create: `entrypoints/options/components/wizard/WizardShell.tsx`

**Interfaces:**
- Consumes: `WizardStep`, `WIZARD_STEPS`, `WIZARD_STEP_LABELS`, `wizardStepIndex` from `@/lib/setupWizard`; `Button` from `@/ui/Button`
- Produces:
  - `WizardProgressProps { step: WizardStep; onGoToCompleted?: (step: WizardStep) => void }`
  - `WizardShellProps { open: boolean; title: string; titleId: string; step: WizardStep; showSkip: boolean; onSkip: () => void; footer: ReactNode; children: ReactNode; skipConfirm?: ReactNode; dialogRef: RefObject<HTMLDivElement | null> }`

- [ ] **Step 1: Implement `WizardProgress.tsx`**

```tsx
/**
 * Segment progress for the 4-step setup wizard.
 */
import {
  type WizardStep,
  WIZARD_STEP_LABELS,
  WIZARD_STEPS,
  wizardStepIndex,
} from '@/lib/setupWizard';

interface WizardProgressProps {
  step: WizardStep;
  onGoToCompleted?: (step: WizardStep) => void;
}

export function WizardProgress({ step, onGoToCompleted }: WizardProgressProps) {
  const currentIndex = wizardStepIndex(step);

  return (
    <nav className="mt-3" aria-label="Setup progress">
      <ol className="flex items-center gap-1.5">
        {WIZARD_STEPS.map((s) => {
          const idx = wizardStepIndex(s);
          const isCompleted = idx < currentIndex;
          const isCurrent = s === step;
          const clickable = Boolean(isCompleted && onGoToCompleted && s !== 'ready');
          return (
            <li key={s} className="flex min-w-0 flex-1 items-center gap-1.5">
              <button
                type="button"
                disabled={!clickable}
                onClick={() => clickable && onGoToCompleted?.(s)}
                className={`flex w-full min-w-0 items-center gap-1.5 rounded-full px-2 py-1 text-[11px] font-medium transition-colors ${
                  isCurrent
                    ? 'bg-cyan-500/15 text-cyan-300 ring-1 ring-cyan-500/40'
                    : isCompleted
                      ? 'bg-cyan-500/10 text-cyan-400/90 hover:bg-cyan-500/20 cursor-pointer'
                      : 'bg-zinc-800/80 text-zinc-500 cursor-default'
                }`}
                aria-current={isCurrent ? 'step' : undefined}
              >
                <span
                  className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[10px] ${
                    isCurrent
                      ? 'bg-cyan-500 text-zinc-950'
                      : isCompleted
                        ? 'bg-cyan-600 text-white'
                        : 'bg-zinc-700 text-zinc-400'
                  }`}
                  aria-hidden="true"
                >
                  {isCompleted ? '✓' : idx}
                </span>
                <span className="hidden truncate sm:inline">{WIZARD_STEP_LABELS[s]}</span>
              </button>
              {idx < WIZARD_STEPS.length && (
                <span
                  className={`hidden h-0.5 w-2 shrink-0 sm:block ${
                    isCompleted ? 'bg-cyan-600/60' : 'bg-zinc-700'
                  }`}
                  aria-hidden="true"
                />
              )}
            </li>
          );
        })}
      </ol>
      <div
        className="mt-2 h-1 w-full overflow-hidden rounded-full bg-zinc-800"
        aria-hidden="true"
      >
        <div
          className="h-full rounded-full bg-gradient-to-r from-cyan-500 to-sky-400 transition-[width] duration-200 motion-reduce:transition-none"
          style={{ width: `${(currentIndex / WIZARD_STEPS.length) * 100}%` }}
        />
      </div>
    </nav>
  );
}
```

- [ ] **Step 2: Implement `WizardShell.tsx`**

```tsx
/**
 * Shared chrome for the first-run setup wizard (backdrop, progress, footer slots).
 */
import type { ReactNode, RefObject } from 'react';
import type { WizardStep } from '@/lib/setupWizard';
import { wizardStepIndex, WIZARD_STEPS } from '@/lib/setupWizard';
import { Button } from '@/ui/Button';
import { WizardProgress } from './WizardProgress';

interface WizardShellProps {
  title: string;
  titleId: string;
  step: WizardStep;
  showSkip: boolean;
  onSkip: () => void;
  onGoToCompletedStep?: (step: WizardStep) => void;
  footer: ReactNode;
  children: ReactNode;
  skipConfirm?: ReactNode;
  dialogRef: RefObject<HTMLDivElement | null>;
}

export function WizardShell({
  title,
  titleId,
  step,
  showSkip,
  onSkip,
  onGoToCompletedStep,
  footer,
  children,
  skipConfirm,
  dialogRef,
}: WizardShellProps) {
  const currentIndex = wizardStepIndex(step);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/70 backdrop-blur-sm p-4 sm:p-6"
      role="presentation"
    >
      <div
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative w-full max-w-2xl my-auto flex max-h-[min(92vh,760px)] min-h-0 flex-col overflow-hidden rounded-2xl border border-cyan-500/15 bg-zinc-950 shadow-2xl shadow-cyan-950/40 animate-scale-in motion-reduce:animate-none"
      >
        <div
          className="h-1 w-full shrink-0 bg-gradient-to-r from-cyan-500 via-sky-500 to-amber-400"
          aria-hidden="true"
        />
        <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
          <div className="absolute -top-24 -right-16 h-48 w-48 rounded-full bg-cyan-500/10 blur-3xl" />
          <div className="absolute top-40 -left-20 h-40 w-40 rounded-full bg-sky-500/5 blur-3xl" />
        </div>

        <div className="relative flex shrink-0 items-start justify-between gap-3 border-b border-zinc-800/90 px-5 py-4 sm:px-6">
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold uppercase tracking-wider text-cyan-400">
              Step {currentIndex} of {WIZARD_STEPS.length}
            </p>
            <h2 id={titleId} className="truncate text-lg font-semibold text-zinc-100">
              {title}
            </h2>
            <WizardProgress step={step} onGoToCompleted={onGoToCompletedStep} />
          </div>
          {showSkip && (
            <Button variant="ghost" size="sm" className="shrink-0" onClick={onSkip}>
              Skip for now
            </Button>
          )}
        </div>

        <div className="relative flex-1 min-h-0 overflow-y-auto overflow-x-hidden p-5 sm:p-6">
          <div key={step} className="animate-fade-in-up motion-reduce:animate-none">
            {children}
          </div>
        </div>

        <div className="relative flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-zinc-800/90 bg-zinc-950/95 px-5 py-3.5 sm:px-6">
          {footer}
        </div>

        {skipConfirm}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Typecheck shell compiles**

```bash
npx tsc --noEmit 2>&1 | head -40
```

Expected: no errors in new wizard files (other pre-existing errors OK only if already present — fix any introduced by these files).

- [ ] **Step 4: Commit**

```bash
git add entrypoints/options/components/wizard/
git commit -m "feat(setup-wizard): add WizardShell and progress chrome"
```

---

### Task 3: Shared `ProviderCatalogRows` (TDD) + Guided Add adopt

**Files:**
- Create: `entrypoints/options/components/ProviderCatalogRows.tsx`
- Create: `entrypoints/options/components/__tests__/ProviderCatalogRows.test.tsx`
- Modify: `entrypoints/options/components/GuidedAddProvider.tsx` (choose step only)

**Interfaces:**
- Consumes: `filterCatalog`, `groupByCategory`, `CatalogCategory`, `OpenAiCompatibleCatalogEntry`, `ProviderAccent` from `@/lib/openAiCompatibleCatalog`; `CatalogFilterId` from `@/lib/setupWizard`; `ProviderIdentityBadge`; `Input`
- Produces:
  - `export function resolveIdentityForEntry(entry: OpenAiCompatibleCatalogEntry): { accent: ProviderAccent; monogram: string }`
  - `export interface ProviderCatalogRowsProps { query: string; onQueryChange: (q: string) => void; filter: CatalogFilterId; onFilterChange: (f: CatalogFilterId) => void; selectedCatalogId?: string | null; onSelect: (entry: OpenAiCompatibleCatalogEntry) => void; showFilters?: boolean; maxListClassName?: string; activeTone?: 'cyan' | 'neutral' }`

- [ ] **Step 1: Write failing component test**

```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ProviderCatalogRows } from '../ProviderCatalogRows';

describe('ProviderCatalogRows', () => {
  it('filters to local category and calls onSelect', () => {
    const onSelect = vi.fn();
    const onFilterChange = vi.fn();
    render(
      <ProviderCatalogRows
        query=""
        onQueryChange={() => {}}
        filter="local"
        onFilterChange={onFilterChange}
        onSelect={onSelect}
        showFilters
      />,
    );

    expect(screen.getByRole('button', { name: /Ollama/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /OpenRouter/i })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /All/i }));
    expect(onFilterChange).toHaveBeenCalledWith('all');

    // switch filter prop simulation: re-render with all is out of scope;
    // click Ollama while local
    fireEvent.click(screen.getByRole('button', { name: /Ollama/i }));
    expect(onSelect).toHaveBeenCalled();
    expect(onSelect.mock.calls[0][0].id).toMatch(/ollama/i);
  });
});
```

- [ ] **Step 2: Run test — expect FAIL**

```bash
npx vitest run entrypoints/options/components/__tests__/ProviderCatalogRows.test.tsx
```

- [ ] **Step 3: Implement `ProviderCatalogRows.tsx`**

```tsx
/**
 * Searchable, filterable, grouped provider catalog list with identity badges.
 * Shared by SetupWizard Connect and GuidedAddProvider choose step.
 */
import { Search } from 'lucide-react';
import {
  filterCatalog,
  groupByCategory,
  type CatalogCategory,
  type OpenAiCompatibleCatalogEntry,
  type ProviderAccent,
} from '@/lib/openAiCompatibleCatalog';
import type { CatalogFilterId } from '@/lib/setupWizard';
import { Input } from '@/ui/Input';
import { ProviderIdentityBadge } from './ProviderIdentityBadge';

const CATEGORY_LABELS: Record<CatalogCategory, string> = {
  cloud: 'Cloud',
  local: 'Local',
  custom: 'Custom',
};

const FILTERS: { id: CatalogFilterId; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'cloud', label: 'Cloud' },
  { id: 'local', label: 'Local' },
  { id: 'custom', label: 'Custom' },
];

export function resolveIdentityForEntry(entry: OpenAiCompatibleCatalogEntry): {
  accent: ProviderAccent;
  monogram: string;
} {
  const trimmed = entry.displayName.trim();
  return {
    accent: entry.accent ?? 'zinc',
    monogram: entry.monogram ?? (trimmed.length > 0 ? trimmed.charAt(0).toUpperCase() : '?'),
  };
}

export interface ProviderCatalogRowsProps {
  query: string;
  onQueryChange: (q: string) => void;
  filter: CatalogFilterId;
  onFilterChange: (f: CatalogFilterId) => void;
  selectedCatalogId?: string | null;
  onSelect: (entry: OpenAiCompatibleCatalogEntry) => void;
  showFilters?: boolean;
  maxListClassName?: string;
  /** cyan = setup wizard brand; neutral = guided add default hover */
  activeTone?: 'cyan' | 'neutral';
}

export function ProviderCatalogRows({
  query,
  onQueryChange,
  filter,
  onFilterChange,
  selectedCatalogId,
  onSelect,
  showFilters = true,
  maxListClassName = 'max-h-80',
  activeTone = 'neutral',
}: ProviderCatalogRowsProps) {
  const filtered = filterCatalog(query);
  const byFilter =
    filter === 'all'
      ? filtered
      : filtered.filter((e) => (e.category ?? 'cloud') === filter);
  const groups = groupByCategory(byFilter);

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500 pointer-events-none" />
        <Input
          type="search"
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          placeholder="Search OpenRouter, Groq, Ollama..."
          className="pl-9"
          aria-label="Search provider catalog"
        />
      </div>

      {showFilters && (
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Provider category filter">
          {FILTERS.map((f) => {
            const active = filter === f.id;
            return (
              <button
                key={f.id}
                type="button"
                aria-pressed={active}
                onClick={() => onFilterChange(f.id)}
                className={`rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors cursor-pointer ${
                  active
                    ? 'bg-cyan-500 text-zinc-950'
                    : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200'
                }`}
              >
                {f.label}
              </button>
            );
          })}
        </div>
      )}

      <div className={`${maxListClassName} overflow-y-auto space-y-3`}>
        {groups.length === 0 && (
          <p className="p-3 text-xs text-zinc-500">No providers match your search.</p>
        )}
        {groups.map((group) => (
          <div key={group.category}>
            <p className="text-[10px] uppercase tracking-widest text-zinc-600 px-1 mb-1.5">
              {CATEGORY_LABELS[group.category]}
            </p>
            <div className="space-y-1.5" role="listbox" aria-label={`${CATEGORY_LABELS[group.category]} providers`}>
              {group.entries.map((entry) => {
                const identity = resolveIdentityForEntry(entry);
                const isActive = entry.id === selectedCatalogId;
                const activeClass =
                  activeTone === 'cyan'
                    ? 'border-cyan-500/40 bg-cyan-500/10 text-cyan-100'
                    : 'border-zinc-600 bg-zinc-800/50 text-zinc-100';
                return (
                  <button
                    key={entry.id}
                    type="button"
                    role="option"
                    aria-selected={isActive}
                    onClick={() => onSelect(entry)}
                    className={`w-full flex items-center gap-3 p-2.5 rounded-lg border transition-colors text-left cursor-pointer ${
                      isActive
                        ? activeClass
                        : 'border-zinc-700/60 hover:bg-zinc-800/50 hover:border-zinc-600 text-zinc-200'
                    }`}
                  >
                    <ProviderIdentityBadge
                      accent={identity.accent}
                      monogram={identity.monogram}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">{entry.displayName}</p>
                      <p className="text-xs text-zinc-500 font-mono truncate">
                        {entry.baseUrl || 'Custom base URL'}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Adopt in GuidedAddProvider choose step**

Replace the choose-step search + groups block with:

```tsx
import { ProviderCatalogRows, resolveIdentityForEntry } from './ProviderCatalogRows';
// remove unused Search import if no longer needed; keep resolveIdentityForEntry local if still used elsewhere — prefer import from ProviderCatalogRows and delete local duplicate.

// state:
const [catalogFilter, setCatalogFilter] = useState<CatalogFilterId>('all');

// in choose:
<ProviderCatalogRows
  query={query}
  onQueryChange={setQuery}
  filter={catalogFilter}
  onFilterChange={setCatalogFilter}
  selectedCatalogId={catalogId}
  onSelect={pickEntry}
  showFilters
  activeTone="neutral"
/>
```

`pickEntry` already accepts an entry — wire `onSelect={pickEntry}`.

Remove the local `resolveIdentityForEntry` / `CATEGORY_LABELS` duplicates if unused after extract.

- [ ] **Step 5: Run tests**

```bash
npx vitest run entrypoints/options/components/__tests__/ProviderCatalogRows.test.tsx
```

Expected: PASS. Manually sanity-check Guided Add still opens if you run the extension.

- [ ] **Step 6: Commit**

```bash
git add entrypoints/options/components/ProviderCatalogRows.tsx \
  entrypoints/options/components/__tests__/ProviderCatalogRows.test.tsx \
  entrypoints/options/components/GuidedAddProvider.tsx
git commit -m "feat(providers): shared ProviderCatalogRows with category filters"
```

---

### Task 4: Step presentational components

**Files:**
- Create: `entrypoints/options/components/wizard/steps/WelcomeStep.tsx`
- Create: `entrypoints/options/components/wizard/steps/ConnectStep.tsx`
- Create: `entrypoints/options/components/wizard/steps/VerifyStep.tsx`
- Create: `entrypoints/options/components/wizard/steps/ReadyStep.tsx`

**Interfaces (props contracts):**

```ts
// WelcomeStep
{ }

// ConnectStep
{
  phase: 'choose' | 'credentials';
  onPhaseChange: (p: 'choose' | 'credentials') => void;
  catalogFilter: CatalogFilterId;
  onCatalogFilterChange: (f: CatalogFilterId) => void;
  catalogQuery: string;
  onCatalogQueryChange: (q: string) => void;
  catalogId: string;
  provider: ProviderConfig;
  canContinueToTest: boolean;
  recovery: RecoveryMessage;
  apiKeyPlaceholder: string;
  onSelectCatalogEntry: (entry: OpenAiCompatibleCatalogEntry) => void;
  onProviderPatch: (patch: Partial<ProviderConfig>) => void;
}

// VerifyStep
{
  providerLabel: string;
  modelLabel: string;
  selectedLanguage: string;
  onLanguageChange: (code: string) => void;
  popularLanguages: Language[];
  targetLanguageOptions: { value: string; label: string }[];
  isTesting: boolean;
  testResult: ConnectionTestResult | null;
  testProgress: ConnectionTestStep[];
  connectionStatus: string;
  onTest: () => void;
  failedMessage: { title: string; description: string; action: string };
}

// ReadyStep
{
  providerDisplayName?: string;
  targetLanguageLabel: string;
}
```

- [ ] **Step 1: Implement `WelcomeStep.tsx`**

Brand monogram constellation (copy monogram list from `EmptyPoolHero` `HERO_MONOGRAMS`), headline “See the web in your language”, three compact proof lines (Any LLM / Privacy-first / Quick setup), micro hint `1 Connect · 2 Verify · 3 Translate`. No CTAs (footer owns them).

- [ ] **Step 2: Implement `ConnectStep.tsx`**

- `phase === 'choose'`: `ProviderCatalogRows` with `activeTone="cyan"`, `maxListClassName="max-h-40 sm:max-h-56"`. On select → call `onSelectCatalogEntry` then `onPhaseChange('credentials')`.
- `phase === 'credentials'`: identity header (badge via `getCatalogEntryById` + `resolveIdentityForEntry`) + **Change** → `onPhaseChange('choose')`; API key field; ModelPicker; Advanced disclosure for Base URL using details/summary or a small toggle:

```tsx
<details className="group rounded-lg border border-zinc-800 bg-zinc-900/40" open={shouldOpenUrl}>
  <summary className="cursor-pointer px-3 py-2 text-xs font-medium text-zinc-400">
    Advanced · Base URL
  </summary>
  <div className="px-3 pb-3">
    <Input id="setup-base-url" value={provider.baseUrl} onChange={...} className="font-mono" />
  </div>
</details>
```

`shouldOpenUrl = !provider.baseUrl.trim() || catalogId === 'custom'`.

Readiness amber banner when `!canContinueToTest`.

- [ ] **Step 3: Implement `VerifyStep.tsx`**

Port language chips + select from current SetupWizard language step; summary chips; test button + `ConnectionTestProgressList` + success/previous/error banners from current test step. Use props only — no store access.

- [ ] **Step 4: Implement `ReadyStep.tsx`**

Centered success UI from current done step (without footer buttons).

- [ ] **Step 5: Commit**

```bash
git add entrypoints/options/components/wizard/steps/
git commit -m "feat(setup-wizard): presentational welcome/connect/verify/ready steps"
```

---

### Task 5: Rewrite `SetupWizard.tsx` orchestration

**Files:**
- Rewrite: `entrypoints/options/SetupWizard.tsx`
- Modify: `entrypoints/options/App.tsx` (deep-link normalize)

**Interfaces:**
- Public API unchanged:
  - `SetupWizardProps { open; onClose; onTranslateCurrentPage?; forceEntryStep?: WizardStep | null }`
- Consumes shell + steps + store + tester + readiness + `normalizeWizardStep` / `resolveWizardEntryStep` / `syncProviderToPool` / `resolveCatalogSelection` / `inferCatalogId`

- [ ] **Step 1: Rewrite orchestration**

Key behaviors to preserve/port:

1. When `open` flips true: resolve entry via `forceEntryStep` normalized or `resolveWizardEntryStep`; reset language from settings; clear test UI; body scroll lock; focus dialog.
2. Focus trap + Escape (skip confirm / close when completed or step ready / open skip confirm otherwise).
3. `updateProviderAndPool` with `providerPatchInvalidatesTest`.
4. `setWizardStep` persists `lastStep` with **new** ids only.
5. `handleSkip`, `handleTestConnection`, `handleFinish` (set `lastStep: 'ready'`, `completed: true`), `handleTranslate`.
6. Footer matrix:

| step | left | right |
|------|------|-------|
| welcome | Skip for now | Get started → connect |
| connect | Back (credentials→choose, else→welcome) | Continue to verify (disabled if !canTest) |
| verify | Back → connect | Finish setup (disabled if !canProceedPastTest) |
| ready | Open settings | Translate current page (if prop) |

7. `showSkip` prop to shell: `step === 'connect' || step === 'verify'` (not welcome, not ready).
8. Skip confirm overlay (reuse existing markup) as `skipConfirm` slot.
9. Title: `settings.onboarding.completed ? 'Update provider' : 'Get ready to translate'`.
10. Connect local state: `connectPhase`, `catalogQuery`, `catalogFilter`.
11. On catalog select: `resolveCatalogSelection` → `updateProviderAndPool(patch)` → credentials phase.
12. When entering connect on open, if provider already has baseUrl+model, optional start in `credentials` — recommend: start **choose** always on open for first-run; if reconfigure (`completed`), start **credentials** when `inferCatalogId` resolves.

Render:

```tsx
if (!open) return null;
return (
  <WizardShell ... footer={...} skipConfirm={...}>
    {step === 'welcome' && <WelcomeStep />}
    {step === 'connect' && <ConnectStep ... />}
    {step === 'verify' && <VerifyStep ... />}
    {step === 'ready' && <ReadyStep ... />}
  </WizardShell>
);
```

- [ ] **Step 2: Update App deep-link**

In `entrypoints/options/App.tsx`:

```ts
import { normalizeWizardStep, type WizardStep } from '@/lib/setupWizard';
// remove WIZARD_STEPS include-check for step param

const stepParam = url.searchParams.get('step');
const normalized = normalizeWizardStep(stepParam);
if (normalized) {
  setWizardForceStep(normalized);
}
```

Update comment “done step” → “ready step”.

- [ ] **Step 3: Compile**

```bash
npx tsc --noEmit 2>&1 | head -50
```

Fix any broken imports from old step names.

- [ ] **Step 4: Commit**

```bash
git add entrypoints/options/SetupWizard.tsx entrypoints/options/App.tsx
git commit -m "feat(setup-wizard): wire 4-step shell orchestration and deep links"
```

---

### Task 6: SetupWizard integration tests

**Files:**
- Create: `entrypoints/options/__tests__/SetupWizard.test.tsx`

- [ ] **Step 1: Write tests**

```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { SetupWizard } from '../SetupWizard';
import { useSettingsStore } from '@/stores/settingsStore';
import { DEFAULT_SETTINGS } from '@/types/config';

// Mock testConnection to succeed quickly
vi.mock('@/services/providerTester', () => ({
  testConnection: vi.fn(async (_p, onStep) => {
    onStep?.({ name: 'ping', success: true, latencyMs: 1 });
    onStep?.({ name: 'models', success: true, latencyMs: 1 });
    onStep?.({ name: 'translation', success: true, latencyMs: 1 });
    return {
      overall: true,
      steps: [
        { name: 'ping', success: true, latencyMs: 1 },
        { name: 'models', success: true, latencyMs: 1 },
        { name: 'translation', success: true, latencyMs: 1 },
      ],
    };
  }),
}));

vi.mock('@/ui/ToastProvider', () => ({
  useToast: () => ({ error: vi.fn(), success: vi.fn() }),
}));

describe('SetupWizard', () => {
  beforeEach(() => {
    useSettingsStore.setState({
      ...DEFAULT_SETTINGS,
      isLoaded: true,
      onboarding: { completed: false, skipped: false, lastStep: 'welcome' },
      updateSettings: vi.fn(async (partial) => {
        useSettingsStore.setState((s) => ({ ...s, ...partial }));
      }),
    } as never);
  });

  it('persists skipped onboarding from the welcome step', async () => {
    const onClose = vi.fn();
    render(<SetupWizard open onClose={onClose} />);

    fireEvent.click(screen.getByRole('button', { name: /Skip for now/i }));
    fireEvent.click(screen.getByRole('button', { name: /^Skip for now$/i }));
    // confirm dialog has Skip for now — use getAllBy if needed

    await waitFor(() => {
      expect(onClose).toHaveBeenCalled();
    });
    const onboarding = useSettingsStore.getState().onboarding;
    expect(onboarding.skipped).toBe(true);
    expect(onboarding.completed).toBe(false);
  });

  it('advances welcome → connect on Get started', () => {
    render(<SetupWizard open onClose={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: /Get started/i }));
    expect(screen.getByText(/Choose where translations run|Connect your|Search OpenRouter/i)).toBeTruthy();
  });
});
```

Adjust selectors to match final copy in WelcomeStep / ConnectStep. Prefer `getByRole` and accessible names. If store mock is awkward, follow patterns from other options section tests (`ProvidersSection.test.tsx`).

Add a third test if feasible: with pre-filled provider (baseUrl, model, apiKey), forceEntryStep `verify`, click Finish after mocked success path — assert `onboarding.completed === true` and `lastStep === 'ready'`.

- [ ] **Step 2: Run tests; fix until PASS**

```bash
npx vitest run entrypoints/options/__tests__/SetupWizard.test.tsx
```

- [ ] **Step 3: Commit**

```bash
git add entrypoints/options/__tests__/SetupWizard.test.tsx entrypoints/options/SetupWizard.tsx
git commit -m "test(setup-wizard): cover skip and step advance for 4-step flow"
```

---

### Task 7: Polish, docs touchpoints, full verification

**Files:**
- Possibly: `README.md` (one line if it still says 5-step wizard)
- Possibly: `conductor/product.md` bullet for setup wizard
- `entrypoints/options/SetupWizard.tsx` / steps — copy and a11y polish only

- [ ] **Step 1: Grep stale step names in docs/UI**

```bash
rg -n "provider → test → language|'provider'|'language' step|5-step first-run|Step 2 of 5" --glob '!node_modules' --glob '!.git' --glob '!docs/superpowers/**' --glob '!conductor/archive/**' | head -40
```

Update user-facing README / product bullets to **4-step** wording. Leave historical design docs alone.

- [ ] **Step 2: Visual / a11y checklist (manual or code review)**

- [ ] Welcome has no header Skip; Connect/Verify have header Skip  
- [ ] Catalog filters work; cyan active tone on wizard  
- [ ] Base URL advanced disclosure  
- [ ] Language on Verify  
- [ ] Completed reopen → connect  
- [ ] `prefers-reduced-motion` classes present  
- [ ] Focus trap / Escape still work  

- [ ] **Step 3: Full test suite for touched areas**

```bash
npx vitest run \
  lib/__tests__/setupWizard.test.ts \
  lib/__tests__/setupWizardProviderSync.test.ts \
  tests/unit/legacyUtils.test.ts \
  entrypoints/options/components/__tests__/ProviderCatalogRows.test.tsx \
  entrypoints/options/__tests__/SetupWizard.test.tsx
```

Expected: all PASS.

- [ ] **Step 4: Commit docs if changed**

```bash
git add README.md conductor/product.md
git commit -m "docs: setup wizard is 4-step welcome→connect→verify→ready"
```

- [ ] **Step 5: Close bead when work accepted**

```bash
bd close AnyLLMTranslate-rnm --reason="4-step setup wizard redesign implemented per spec"
```

---

## Spec coverage checklist

| Spec requirement | Task |
|------------------|------|
| 4 steps welcome/connect/verify/ready | 1, 5 |
| Legacy normalize + deep links | 1, 5 |
| Completed → connect | 1, 5 |
| WizardShell + progress bar | 2 |
| Brand Welcome + monograms | 4 |
| Catalog badges + groups + filters | 3, 4 |
| Progressive credentials + Advanced URL | 4 |
| Language on Verify | 4, 5 |
| No auto-advance after test | 5 |
| Skip placement rules | 5 |
| Atomic provider/pool writes | 5 (preserve) + sync tests Task 1/7 |
| Guided Add shares rows | 3 |
| Decompose god component | 2, 4, 5 |
| Cyan brand consistency | 2, 3, 4 |
| Integration tests | 6 |
| README/product wording | 7 |

## Placeholder / consistency self-review

- No TBD steps; step ids consistent (`ready` not `done` in new writes).  
- `forceEntryStep` type is `WizardStep | null`; App normalizes legacy before set.  
- `CatalogFilterId` defined once in `lib/setupWizard.ts`.  
- `resolveIdentityForEntry` lives only in `ProviderCatalogRows.tsx` after Task 3.

---

## Execution handoff

Plan complete and saved to `docs/superpowers/plans/2026-07-24-setup-wizard-redesign.md`.

**Two execution options:**

1. **Subagent-Driven (recommended)** — fresh subagent per task, review between tasks  
2. **Inline Execution** — execute tasks in this session with executing-plans checkpoints  

Which approach?
