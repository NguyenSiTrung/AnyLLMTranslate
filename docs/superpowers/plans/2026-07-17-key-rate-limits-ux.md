# Key Rate Limits UX Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Surface per-key concurrency & throttle on Providers → Keys as a collapsed **Rate limits** summary strip with one-click expand, presets (Safe / Balanced / Aggressive / Unlimited), cleaner fine-tune fields, and remove rate limits from the ⋯ overflow menu.

**Architecture:** Extract pure formatting + preset matching into `lib/keyRateLimits.ts` (unit-tested). Rework `ProviderKeyRow` to use a single disclosure (summary strip) instead of ⋯ menu + nested `AdvancedDisclosure`. No settings schema or pool engine changes — still `PoolKey.maxRpm`, `concurrencyLimit`, `interval`.

**Tech Stack:** React 19, TypeScript, Tailwind CSS 4, Lucide React, Vitest + Testing Library, existing `ui/*` (`FieldGroup`, `Input`, `Button`), product defaults from `@/types/config`.

**Spec:** `docs/superpowers/specs/2026-07-17-key-rate-limits-ux-design.md`  
**Beads:** AnyLLMTranslate-apl

## Global Constraints

- Do **not** change throttle/concurrency behavior in `services/providerPool.ts` or default constants (`DEFAULT_KEY_*`) except to **read** them for Safe preset / Reset.
- Do **not** add new settings schema fields or storage keys.
- Do **not** put rate-limit controls back in the ⋯ menu.
- Single progressive disclosure only — **no** nested `AdvancedDisclosure` for rate limits.
- Commit model: number fields commit on blur (existing clamps); presets and Reset commit immediately.
- Track work with **bd** (AnyLLMTranslate-apl); do not use TodoWrite.
- Prefer non-interactive shell flags; run targeted vitest paths listed per task.
- TDD: pure helpers first, then component tests, then UI wiring.

---

## File map

| File | Responsibility |
|------|----------------|
| Create `lib/keyRateLimits.ts` | Pure summary string, preset table, match active preset, apply preset values |
| Create `lib/__tests__/keyRateLimits.test.ts` | Unit tests for format + match + preset values |
| Modify `entrypoints/options/components/ProviderKeyRow.tsx` | Summary strip, expand body, presets, cleaner fields, slim ⋯ menu |
| Create `entrypoints/options/components/__tests__/ProviderKeyRow.test.tsx` | Component smoke: summary, expand, preset, menu contents, custom state |
| Spec (already done) | `docs/superpowers/specs/2026-07-17-key-rate-limits-ux-design.md` |

**Do not modify:** `services/providerPool.ts` throttle logic, `types/config.ts` schema (may import existing constants only), Advanced tab global RPM, provider Advanced drawer fields unrelated to keys.

---

### Task 1: Pure rate-limit helpers + unit tests

**Files:**
- Create: `lib/keyRateLimits.ts`
- Create: `lib/__tests__/keyRateLimits.test.ts`

**Interfaces:**
- Consumes: `DEFAULT_KEY_MAX_RPM`, `DEFAULT_KEY_CONCURRENCY_LIMIT`, `DEFAULT_KEY_INTERVAL_MS` from `@/types/config`
- Produces:
  - `export type KeyRateLimitPresetId = 'safe' | 'balanced' | 'aggressive' | 'unlimited'`
  - `export interface KeyRateLimitValues { maxRpm: number; concurrencyLimit: number; interval: number }`
  - `export interface KeyRateLimitPreset { id: KeyRateLimitPresetId; label: string; values: KeyRateLimitValues }`
  - `export const KEY_RATE_LIMIT_PRESETS: readonly KeyRateLimitPreset[]`
  - `export function formatKeyRateLimitSummary(values: KeyRateLimitValues): string`
  - `export function matchKeyRateLimitPreset(values: KeyRateLimitValues): KeyRateLimitPresetId | null`
  - `export function getKeyRateLimitPresetValues(id: KeyRateLimitPresetId): KeyRateLimitValues`

- [ ] **Step 1: Write the failing tests**

```typescript
// lib/__tests__/keyRateLimits.test.ts
import { describe, it, expect } from 'vitest';
import {
  formatKeyRateLimitSummary,
  matchKeyRateLimitPreset,
  getKeyRateLimitPresetValues,
  KEY_RATE_LIMIT_PRESETS,
} from '@/lib/keyRateLimits';
import {
  DEFAULT_KEY_MAX_RPM,
  DEFAULT_KEY_CONCURRENCY_LIMIT,
  DEFAULT_KEY_INTERVAL_MS,
} from '@/types/config';

describe('formatKeyRateLimitSummary', () => {
  it('formats Safe defaults', () => {
    expect(
      formatKeyRateLimitSummary({
        maxRpm: 20,
        concurrencyLimit: 1,
        interval: 500,
      }),
    ).toBe('20/min · 1 at once · 500 ms gap');
  });

  it('formats unlimited zeros', () => {
    expect(
      formatKeyRateLimitSummary({
        maxRpm: 0,
        concurrencyLimit: 0,
        interval: 0,
      }),
    ).toBe('Unlimited rate · No concurrency cap · No gap');
  });

  it('formats mixed custom', () => {
    expect(
      formatKeyRateLimitSummary({
        maxRpm: 30,
        concurrencyLimit: 0,
        interval: 100,
      }),
    ).toBe('30/min · No concurrency cap · 100 ms gap');
  });
});

describe('matchKeyRateLimitPreset', () => {
  it('matches safe from product defaults', () => {
    expect(
      matchKeyRateLimitPreset({
        maxRpm: DEFAULT_KEY_MAX_RPM,
        concurrencyLimit: DEFAULT_KEY_CONCURRENCY_LIMIT,
        interval: DEFAULT_KEY_INTERVAL_MS,
      }),
    ).toBe('safe');
  });

  it('matches balanced, aggressive, unlimited exactly', () => {
    expect(matchKeyRateLimitPreset(getKeyRateLimitPresetValues('balanced'))).toBe(
      'balanced',
    );
    expect(matchKeyRateLimitPreset(getKeyRateLimitPresetValues('aggressive'))).toBe(
      'aggressive',
    );
    expect(matchKeyRateLimitPreset(getKeyRateLimitPresetValues('unlimited'))).toBe(
      'unlimited',
    );
  });

  it('returns null for custom values', () => {
    expect(
      matchKeyRateLimitPreset({ maxRpm: 15, concurrencyLimit: 1, interval: 500 }),
    ).toBeNull();
  });
});

describe('KEY_RATE_LIMIT_PRESETS', () => {
  it('defines four presets with expected Safe values', () => {
    expect(KEY_RATE_LIMIT_PRESETS.map((p) => p.id)).toEqual([
      'safe',
      'balanced',
      'aggressive',
      'unlimited',
    ]);
    expect(getKeyRateLimitPresetValues('safe')).toEqual({
      maxRpm: 20,
      concurrencyLimit: 1,
      interval: 500,
    });
    expect(getKeyRateLimitPresetValues('balanced')).toEqual({
      maxRpm: 40,
      concurrencyLimit: 2,
      interval: 250,
    });
    expect(getKeyRateLimitPresetValues('aggressive')).toEqual({
      maxRpm: 60,
      concurrencyLimit: 4,
      interval: 100,
    });
    expect(getKeyRateLimitPresetValues('unlimited')).toEqual({
      maxRpm: 0,
      concurrencyLimit: 0,
      interval: 0,
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm exec vitest run lib/__tests__/keyRateLimits.test.ts`

Expected: FAIL — module `@/lib/keyRateLimits` not found (or similar).

- [ ] **Step 3: Implement pure helpers**

```typescript
// lib/keyRateLimits.ts
/**
 * Pure helpers for per-key rate limit summary + presets (Providers → Keys UI).
 */

import {
  DEFAULT_KEY_CONCURRENCY_LIMIT,
  DEFAULT_KEY_INTERVAL_MS,
  DEFAULT_KEY_MAX_RPM,
} from '@/types/config';

export type KeyRateLimitPresetId =
  | 'safe'
  | 'balanced'
  | 'aggressive'
  | 'unlimited';

export interface KeyRateLimitValues {
  maxRpm: number;
  concurrencyLimit: number;
  interval: number;
}

export interface KeyRateLimitPreset {
  id: KeyRateLimitPresetId;
  label: string;
  values: KeyRateLimitValues;
}

export const KEY_RATE_LIMIT_PRESETS: readonly KeyRateLimitPreset[] = [
  {
    id: 'safe',
    label: 'Safe',
    values: {
      maxRpm: DEFAULT_KEY_MAX_RPM,
      concurrencyLimit: DEFAULT_KEY_CONCURRENCY_LIMIT,
      interval: DEFAULT_KEY_INTERVAL_MS,
    },
  },
  {
    id: 'balanced',
    label: 'Balanced',
    values: { maxRpm: 40, concurrencyLimit: 2, interval: 250 },
  },
  {
    id: 'aggressive',
    label: 'Aggressive',
    values: { maxRpm: 60, concurrencyLimit: 4, interval: 100 },
  },
  {
    id: 'unlimited',
    label: 'Unlimited',
    values: { maxRpm: 0, concurrencyLimit: 0, interval: 0 },
  },
] as const;

export function formatKeyRateLimitSummary(values: KeyRateLimitValues): string {
  const rate =
    values.maxRpm > 0 ? `${values.maxRpm}/min` : 'Unlimited rate';
  const concurrent =
    values.concurrencyLimit > 0
      ? `${values.concurrencyLimit} at once`
      : 'No concurrency cap';
  const gap =
    values.interval > 0 ? `${values.interval} ms gap` : 'No gap';
  return `${rate} · ${concurrent} · ${gap}`;
}

export function matchKeyRateLimitPreset(
  values: KeyRateLimitValues,
): KeyRateLimitPresetId | null {
  for (const preset of KEY_RATE_LIMIT_PRESETS) {
    if (
      preset.values.maxRpm === values.maxRpm &&
      preset.values.concurrencyLimit === values.concurrencyLimit &&
      preset.values.interval === values.interval
    ) {
      return preset.id;
    }
  }
  return null;
}

export function getKeyRateLimitPresetValues(
  id: KeyRateLimitPresetId,
): KeyRateLimitValues {
  const preset = KEY_RATE_LIMIT_PRESETS.find((p) => p.id === id);
  if (!preset) {
    throw new Error(`Unknown key rate limit preset: ${id}`);
  }
  return { ...preset.values };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm exec vitest run lib/__tests__/keyRateLimits.test.ts`

Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/keyRateLimits.ts lib/__tests__/keyRateLimits.test.ts
git commit -m "feat: pure key rate limit summary and presets"
```

---

### Task 2: ProviderKeyRow component tests (failing first)

**Files:**
- Create: `entrypoints/options/components/__tests__/ProviderKeyRow.test.tsx`
- (Implementation in Task 3 — tests will fail until then)

**Interfaces:**
- Consumes: `ProviderKeyRow` props as today (`provider`, `poolKey`, `targetLanguage`, `chip`, `displayIndex`, `onUpdate`, `onRemove`, optional `onMove`)
- Produces: failing tests that lock UX contract from the design spec

- [ ] **Step 1: Write component tests**

```tsx
// entrypoints/options/components/__tests__/ProviderKeyRow.test.tsx
/**
 * ProviderKeyRow — rate limits summary strip + presets + slim overflow menu.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { ProviderKeyRow } from '../ProviderKeyRow';
import type { PoolKey, PoolProvider } from '@/types/config';
import type { KeyChipView } from '@/lib/poolDashboardStatus';

vi.stubGlobal('chrome', {
  runtime: {
    sendMessage: vi.fn().mockResolvedValue({ success: true }),
  },
});

function sampleProvider(overrides: Partial<PoolProvider> = {}): PoolProvider {
  return {
    id: 'p1',
    displayName: 'OpenRouter',
    baseUrl: 'https://openrouter.ai/api/v1',
    model: 'test-model',
    requiresApiKey: true,
    catalogId: 'openrouter',
    temperature: 0.3,
    maxTokens: 4096,
    enabled: true,
    keys: [],
    ...overrides,
  };
}

function sampleKey(overrides: Partial<PoolKey> = {}): PoolKey {
  return {
    id: 'k1',
    apiKey: 'sk-test',
    maxRpm: 20,
    concurrencyLimit: 1,
    interval: 500,
    enabled: true,
    ...overrides,
  };
}

const chip: KeyChipView = {
  keyId: 'k1',
  kind: 'healthy',
  label: 'OK',
  title: 'Healthy',
};

function renderRow(
  opts: {
    poolKey?: PoolKey;
    onUpdate?: ReturnType<typeof vi.fn>;
    onRemove?: ReturnType<typeof vi.fn>;
    onMove?: ReturnType<typeof vi.fn>;
  } = {},
) {
  const onUpdate = opts.onUpdate ?? vi.fn();
  const onRemove = opts.onRemove ?? vi.fn();
  const poolKey = opts.poolKey ?? sampleKey();
  render(
    <ProviderKeyRow
      provider={sampleProvider()}
      poolKey={poolKey}
      targetLanguage="vi"
      chip={chip}
      displayIndex={1}
      onUpdate={onUpdate}
      onRemove={onRemove}
      onMove={opts.onMove}
    />,
  );
  return { onUpdate, onRemove };
}

describe('ProviderKeyRow rate limits UX', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows collapsed rate limits summary for Safe defaults', () => {
    renderRow();
    expect(
      screen.getByRole('button', {
        name: /Rate limits.*20\/min · 1 at once · 500 ms gap/i,
      }),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText(/Max rate/i)).not.toBeInTheDocument();
  });

  it('expands fine-tune fields and presets on summary click', () => {
    renderRow();
    fireEvent.click(
      screen.getByRole('button', { name: /Rate limits/i }),
    );
    expect(screen.getByLabelText(/Max rate/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Safe$/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Balanced$/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Aggressive$/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Unlimited$/i })).toBeInTheDocument();
  });

  it('applies Balanced preset via onUpdate', () => {
    const { onUpdate } = renderRow();
    fireEvent.click(screen.getByRole('button', { name: /Rate limits/i }));
    fireEvent.click(screen.getByRole('button', { name: /^Balanced$/i }));
    expect(onUpdate).toHaveBeenCalledWith({
      maxRpm: 40,
      concurrencyLimit: 2,
      interval: 250,
    });
  });

  it('shows Custom when values match no preset', () => {
    renderRow({
      poolKey: sampleKey({ maxRpm: 15, concurrencyLimit: 1, interval: 500 }),
    });
    fireEvent.click(screen.getByRole('button', { name: /Rate limits/i }));
    expect(screen.getByText(/^Custom$/i)).toBeInTheDocument();
  });

  it('Reset to Safe commits Safe values', () => {
    const { onUpdate } = renderRow({
      poolKey: sampleKey({ maxRpm: 0, concurrencyLimit: 0, interval: 0 }),
    });
    fireEvent.click(screen.getByRole('button', { name: /Rate limits/i }));
    fireEvent.click(screen.getByRole('button', { name: /Reset to Safe/i }));
    expect(onUpdate).toHaveBeenCalledWith({
      maxRpm: 20,
      concurrencyLimit: 1,
      interval: 500,
    });
  });

  it('overflow menu has Move/Remove but not Advanced limits', () => {
    renderRow({ onMove: vi.fn() });
    // Open overflow via focus-within: focus the menu button
    const menuBtn = screen.getByRole('button', { name: /Key 1 menu/i });
    menuBtn.focus();
    const menu = menuBtn.closest('.relative') ?? document.body;
    expect(within(menu as HTMLElement).getByText(/Move up/i)).toBeInTheDocument();
    expect(within(menu as HTMLElement).getByText(/Remove/i)).toBeInTheDocument();
    expect(
      within(menu as HTMLElement).queryByText(/Advanced limits/i),
    ).not.toBeInTheDocument();
    expect(
      within(menu as HTMLElement).queryByText(/Hide limits/i),
    ).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm exec vitest run entrypoints/options/components/__tests__/ProviderKeyRow.test.tsx`

Expected: FAIL — missing summary control / still has Advanced limits / presets not present.

- [ ] **Step 3: Commit tests only**

```bash
git add entrypoints/options/components/__tests__/ProviderKeyRow.test.tsx
git commit -m "test: ProviderKeyRow rate limits UX contract"
```

---

### Task 3: Rework ProviderKeyRow UI

**Files:**
- Modify: `entrypoints/options/components/ProviderKeyRow.tsx`

**Interfaces:**
- Consumes: helpers from `@/lib/keyRateLimits`; existing props unchanged
- Produces: summary strip + expanded presets/fields; slim ⋯ menu

- [ ] **Step 1: Replace rate-limits UI in `ProviderKeyRow`**

Implementation notes (apply as one coherent edit to `ProviderKeyRow.tsx`):

1. **Imports**
   - Remove `AdvancedDisclosure` import.
   - Add `ChevronDown` from `lucide-react`.
   - Add:
     ```typescript
     import {
       formatKeyRateLimitSummary,
       matchKeyRateLimitPreset,
       getKeyRateLimitPresetValues,
       KEY_RATE_LIMIT_PRESETS,
       type KeyRateLimitValues,
     } from '@/lib/keyRateLimits';
     ```

2. **State**
   - Rename/repurpose `showAdvanced` → `rateLimitsOpen` (default `false`).
   - Keep `maxRpmDraft`, `concurrencyDraft`, `intervalDraft` + blur commits with existing clamps (0–600, 0–20, 0–60000).

3. **Apply values helper (inside component)**
   ```typescript
   const applyRateLimits = (values: KeyRateLimitValues) => {
     setMaxRpmDraft(String(values.maxRpm));
     setConcurrencyDraft(String(values.concurrencyLimit));
     setIntervalDraft(String(values.interval));
     const patch: Partial<PoolKey> = {};
     if (values.maxRpm !== poolKey.maxRpm) patch.maxRpm = values.maxRpm;
     if (values.concurrencyLimit !== (poolKey.concurrencyLimit ?? 0)) {
       patch.concurrencyLimit = values.concurrencyLimit;
     }
     if (values.interval !== (poolKey.interval ?? 0)) patch.interval = values.interval;
     if (Object.keys(patch).length > 0) onUpdate(patch);
   };
   ```
   Prefer a **single** `onUpdate` call with all three fields when applying presets (tests expect one call with full object). Simpler and correct:

   ```typescript
   const applyRateLimits = (values: KeyRateLimitValues) => {
     setMaxRpmDraft(String(values.maxRpm));
     setConcurrencyDraft(String(values.concurrencyLimit));
     setIntervalDraft(String(values.interval));
     onUpdate({
       maxRpm: values.maxRpm,
       concurrencyLimit: values.concurrencyLimit,
       interval: values.interval,
     });
   };
   ```

4. **Summary values for display** (committed props, not drafts, so collapsed summary stays stable while typing until blur):
   ```typescript
   const committedLimits: KeyRateLimitValues = {
     maxRpm: poolKey.maxRpm,
     concurrencyLimit: poolKey.concurrencyLimit ?? 0,
     interval: poolKey.interval ?? 0,
   };
   const summary = formatKeyRateLimitSummary(committedLimits);
   const activePreset = matchKeyRateLimitPreset(committedLimits);
   const regionId = `rate-limits-${poolKey.id}`;
   ```

5. **⋯ menu** — delete the “Advanced limits” / “Hide limits” button. Keep Move up/down (if `onMove`) and Remove only.

6. **After Label field**, insert rate limits block (replace old `showAdvanced` + `AdvancedDisclosure` block):

```tsx
{/* Rate limits — single disclosure */}
<div className="rounded-lg border border-zinc-700/50 bg-zinc-900/30">
  <button
    type="button"
    id={`rate-limits-btn-${poolKey.id}`}
    aria-expanded={rateLimitsOpen}
    aria-controls={regionId}
    onClick={() => setRateLimitsOpen((v) => !v)}
    className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-zinc-800/40 transition-colors rounded-lg"
  >
    <span className="text-xs font-medium text-zinc-300 shrink-0">Rate limits</span>
    <span
      className="text-xs text-zinc-500 font-mono truncate flex-1"
      title={summary}
    >
      {summary}
    </span>
    <ChevronDown
      className={`w-3.5 h-3.5 text-zinc-500 shrink-0 transition-transform duration-200 ${
        rateLimitsOpen ? 'rotate-180' : ''
      }`}
    />
  </button>

  {rateLimitsOpen && (
    <div
      id={regionId}
      role="region"
      aria-labelledby={`rate-limits-btn-${poolKey.id}`}
      className="px-3 pb-3 space-y-3 border-t border-zinc-700/40"
    >
      <p className="text-xs text-zinc-500 leading-relaxed pt-3">
        Limits how fast this key hits the API. Presets are a starting point — tweak
        the numbers if you need to.
      </p>

      <div
        role="radiogroup"
        aria-label="Rate limit presets"
        className="flex flex-wrap gap-1.5"
      >
        {KEY_RATE_LIMIT_PRESETS.map((preset) => {
          const selected = activePreset === preset.id;
          return (
            <button
              key={preset.id}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => applyRateLimits(preset.values)}
              className={`px-2.5 py-1 rounded-md text-xs font-medium border transition-colors ${
                selected
                  ? 'bg-cyan-600/20 border-cyan-500/40 text-cyan-300'
                  : 'bg-zinc-800/50 border-zinc-700 text-zinc-400 hover:text-zinc-200 hover:border-zinc-600'
              }`}
            >
              {preset.label}
            </button>
          );
        })}
        {activePreset === null && (
          <span className="px-2 py-1 text-xs text-zinc-500 self-center">Custom</span>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <FieldGroup
          label="Max rate"
          description="Requests this key may start per minute."
          htmlFor={`pr-${poolKey.id}`}
        >
          <Input
            id={`pr-${poolKey.id}`}
            type="number"
            min={0}
            max={600}
            value={maxRpmDraft}
            onChange={(e) => setMaxRpmDraft(e.target.value)}
            onBlur={commitMaxRpm}
            suffix="req/min"
            placeholder="20"
            hint="0 = unlimited · 0–600"
          />
        </FieldGroup>
        <FieldGroup
          label="Max concurrent"
          description="In-flight requests at the same time."
          htmlFor={`pc-${poolKey.id}`}
        >
          <Input
            id={`pc-${poolKey.id}`}
            type="number"
            min={0}
            max={20}
            value={concurrencyDraft}
            onChange={(e) => setConcurrencyDraft(e.target.value)}
            onBlur={commitConcurrency}
            suffix="at once"
            placeholder="1"
            hint="0 = global cap only · 0–20"
          />
        </FieldGroup>
        <FieldGroup
          label="Min gap"
          description="Wait after one request before the next."
          htmlFor={`pi-${poolKey.id}`}
        >
          <Input
            id={`pi-${poolKey.id}`}
            type="number"
            min={0}
            max={60000}
            value={intervalDraft}
            onChange={(e) => setIntervalDraft(e.target.value)}
            onBlur={commitInterval}
            suffix="ms"
            placeholder="500"
            hint="0 = off · 0–60000 · 1000 ms = 1 s"
          />
        </FieldGroup>
      </div>

      <button
        type="button"
        className="text-xs text-cyan-400 hover:text-cyan-300 transition-colors"
        onClick={() => applyRateLimits(getKeyRateLimitPresetValues('safe'))}
      >
        Reset to Safe
      </button>
    </div>
  )}
</div>
```

7. **Accessible name for summary button**  
   Ensure the button’s accessible name includes “Rate limits” and the summary text (visible children already do if both are text nodes). If Testing Library struggles, add:
   ```tsx
   aria-label={`Rate limits, ${summary}`}
   ```

8. **Draft sync when `poolKey` props change** (e.g. after preset from parent re-render): optional `useEffect` to sync drafts from props when id/values change — only if existing pattern elsewhere requires it. Prefer matching current row: local state initialized from props; preset `applyRateLimits` updates drafts immediately so UI stays consistent.

- [ ] **Step 2: Run component tests**

Run: `pnpm exec vitest run entrypoints/options/components/__tests__/ProviderKeyRow.test.tsx`

Expected: all PASS. If overflow menu assertion fails due to CSS `hidden group-focus-within:block`, adjust test to query document text for “Advanced limits” globally (should be absent) and query Move/Remove when menu is forced open — or add `data-testid="key-overflow-menu"` that is always in DOM (menu content already in DOM with `hidden` class; `queryByText` still finds hidden text in Testing Library by default). Prefer asserting:

```typescript
expect(screen.queryByText(/Advanced limits/i)).not.toBeInTheDocument();
expect(screen.getByText(/Remove/i)).toBeInTheDocument(); // still in DOM when onMove provided
```

Update the test in the same commit if needed so it matches real DOM (menu items remain mounted).

- [ ] **Step 3: Run pure helper tests + Providers section smoke**

Run:

```bash
pnpm exec vitest run lib/__tests__/keyRateLimits.test.ts entrypoints/options/components/__tests__/ProviderKeyRow.test.tsx entrypoints/options/sections/__tests__/ProvidersSection.test.tsx
```

Expected: all PASS.

- [ ] **Step 4: Commit**

```bash
git add entrypoints/options/components/ProviderKeyRow.tsx entrypoints/options/components/__tests__/ProviderKeyRow.test.tsx
git commit -m "feat: rate limits summary strip and presets on key rows"
```

---

### Task 4: Verification + close issue

**Files:** none required unless typecheck fails

- [ ] **Step 1: Typecheck**

Run: `pnpm compile`

Expected: no errors related to key rate limits.

- [ ] **Step 2: Full targeted regression**

Run:

```bash
pnpm exec vitest run lib/__tests__/keyRateLimits.test.ts entrypoints/options/components/__tests__/ProviderKeyRow.test.tsx entrypoints/options/sections/__tests__/ProvidersSection.test.tsx
```

Expected: all PASS.

- [ ] **Step 3: Manual checklist** (options UI)

1. Open Settings → Providers → Edit a provider → Keys.  
2. See **Rate limits** strip with summary under Label (no need to open ⋯).  
3. Click strip → presets + 3 fields + Reset to Safe.  
4. Click Balanced → summary updates after parent re-renders with new values.  
5. Edit Max rate to a custom number → blur → **Custom** label; no preset selected.  
6. Reset to Safe → Safe chip selected; summary `20/min · 1 at once · 500 ms gap`.  
7. ⋯ menu shows Move/Remove only — no Advanced limits.

- [ ] **Step 4: Close beads issue**

```bash
bd close AnyLLMTranslate-apl --reason="Rate limits summary strip + presets shipped on ProviderKeyRow"
```

- [ ] **Step 5: Session push (if ending session)**

```bash
git pull --rebase
bd dolt push
git push
git status
```

---

## Spec coverage checklist (self-review)

| Spec requirement | Task |
|------------------|------|
| Collapsed summary + one-click expand | Task 3 |
| Summary format (zeros vs numbers) | Task 1 + 3 |
| Presets Safe/Balanced/Aggressive/Unlimited | Task 1 + 3 |
| Active preset highlight + Custom | Task 3 |
| Cleaner field copy | Task 3 |
| Reset to Safe | Task 3 |
| ⋯ = Move/Remove only | Task 3 |
| No nested AdvancedDisclosure | Task 3 |
| No engine/schema change | All tasks |
| Unit + component tests | Task 1, 2, 3 |

## Placeholder scan

No TBD/TODO steps; concrete file paths, full helper code, full test bodies, explicit commit messages.

## Type consistency

- `KeyRateLimitValues` / `KeyRateLimitPresetId` defined in Task 1; used in Tasks 2–3.
- Preset numbers match design: Safe 20/1/500, Balanced 40/2/250, Aggressive 60/4/100, Unlimited 0/0/0.
- Clamp ranges unchanged: maxRpm 0–600, concurrency 0–20, interval 0–60000.
