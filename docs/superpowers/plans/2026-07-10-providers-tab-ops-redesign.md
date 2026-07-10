# Providers Tab Ops Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild Settings → Providers into a guided + ops-dashboard control plane: pool command bar, dense rotation rows, edit drawer, guided add, drag-reorder, and live circuit-breaker health.

**Architecture:** Keep pure pool math in `lib/` (dashboard status, key chips, reorder). Wire live statuses via a new background message over existing `ProviderPoolCoordinator.getAllKeyStatuses`. Rebuild options UI as shell + focused components (`PoolCommandBar`, `ProviderRow`, `ProviderEditDrawer`, `GuidedAddProvider`, `EmptyPoolHero`) orchestrated by a thinner `ProvidersSection`. No new settings schema keys — order is existing `providers[]` / `keys[]` array order.

**Tech Stack:** React 19, TypeScript, Tailwind CSS 4, Lucide React, Zustand (`useSettingsStore`), Vitest + Testing Library, existing `ui/*` primitives, WXT extension messaging.

**Spec:** `docs/superpowers/specs/2026-07-10-providers-tab-ops-redesign-design.md`  
**Beads:** ALT-d75

## Global Constraints

- No new `chrome.storage` / settings schema keys — only reorder existing `providers` and nested `keys` arrays.
- Do not change circuit-breaker thresholds, RPM math, or round-robin algorithm.
- Do not break popup: `getPoolReadinessStatus` / `getPoolRecoveryMessage` / `countEnabledKeys` / `getPoolReadiness` export contracts stay stable (dashboard status is a **separate** pure module).
- `ProvidersSection` props from `App.tsx` stay: `onOpenSetup?`, `onNavigateToAdvanced?`.
- Unified test story: key Test / provider Test (all keys on provider) / Test all — **remove** standalone `ProviderConnectionTest` panel as a third concept (reuse its progress UI inside key/drawer tests).
- Section header accent: **cyan**; amber only for warnings.
- Live poll: **3s** while Providers tab visible + on focus + after tests; honor `document.visibilityState`.
- Degraded threshold: ≥50% of enabled slots are live-open or credentialInvalid while still canTranslate.
- DnD: lightweight HTML5 (no new dependency unless already present); keyboard Move up/down required.
- Drawer: focus trap, Escape, restore focus; delete confirm uses existing `Modal` above drawer.
- TDD for pure helpers first; component smoke tests for shell behaviors.
- Prefer non-interactive shell flags; run `pnpm test` / targeted vitest paths as listed per task.
- Track work in **bd** (ALT-d75); close sub-tasks if created; do not use TodoWrite.

---

## File map

| File | Responsibility |
|------|----------------|
| Create `lib/poolDashboardStatus.ts` | Pure merge of settings + live statuses → dashboard state, metrics, key chips |
| Create `lib/__tests__/poolDashboardStatus.test.ts` | Unit tests for ready/partial/degraded/not-ready + chip merge |
| Create `lib/poolReorder.ts` | Pure reorder helpers for providers and keys |
| Create `lib/__tests__/poolReorder.test.ts` | Unit tests for move/reorder |
| Modify `types/messages.ts` | Add `GET_POOL_KEY_STATUSES` action + request/response types |
| Modify `services/background.ts` | Handle message → `initService` + `getAllKeyStatuses` |
| Create or modify background unit test | Message handler returns statuses |
| Create `entrypoints/options/hooks/usePoolKeyStatuses.ts` | Poll + focus refresh |
| Create `entrypoints/options/hooks/__tests__/usePoolKeyStatuses.test.ts` | Mock chrome.runtime messaging |
| Create `ui/Drawer.tsx` | Reusable right drawer / bottom sheet shell |
| Create `ui/__tests__/Drawer.test.tsx` | Escape, focus trap smoke |
| Create `entrypoints/options/components/PoolCommandBar.tsx` | Status + metrics + actions |
| Create `entrypoints/options/components/ProviderRow.tsx` | Dense ops row |
| Create `entrypoints/options/components/ProviderRotationList.tsx` | List + DnD + keyboard |
| Create `entrypoints/options/components/ProviderEditDrawer.tsx` | Tabbed editor |
| Rewrite `entrypoints/options/components/ProviderKeyRow.tsx` | Compact + advanced disclosure + chips |
| Create `entrypoints/options/components/EmptyPoolHero.tsx` | First-run hero |
| Create `entrypoints/options/components/GuidedAddProvider.tsx` | 3-step add modal (replace/upgrade `AddProviderModal`) |
| Create `entrypoints/options/hooks/useProviderPoolActions.ts` | CRUD, bulk test, reorder commits (extract from section) |
| Rewrite `entrypoints/options/sections/ProvidersSection.tsx` | Thin shell wiring |
| Create `entrypoints/options/sections/__tests__/ProvidersSection.test.tsx` | Smoke: empty hero, list, open drawer, test all label |
| Deprecate/remove usage of `ProviderCard.tsx`, `ProviderConnectionTest.tsx` as primary UI (delete after migration or thin re-export if tests import) |
| Keep `ProviderIdentityBadge`, `ModelPicker`, `ProviderCatalogPicker`, `ConnectionTestProgressList`, `ProviderTestResult` | Reuse |

**Do not modify:** translation dispatch in `providerPool.ts` (except already-public getters), content scripts, popup layout (readiness helpers only if needed and backward compatible).

---

### Task 1: Pure pool dashboard status + key chip merge

**Files:**
- Create: `lib/poolDashboardStatus.ts`
- Create: `lib/__tests__/poolDashboardStatus.test.ts`

**Interfaces:**
- Consumes: `ExtensionSettings`, `PoolProvider`, `PoolKey`, `KeyTestResult` from `@/types/config`; shape compatible with `KeyStatus` from `@/services/providerPool` (duplicate a serializable type in lib or types to avoid options importing services if preferred — **prefer** `types/config.ts` or a small `types/poolStatus.ts` export of `PoolKeyLiveStatus`)
- Produces:
  - `export type PoolDashboardState = 'ready' | 'partial' | 'degraded' | 'not-ready'`
  - `export type KeyChipKind = 'healthy' | 'failed' | 'cooling' | 'invalid' | 'off' | 'untested'`
  - `export interface KeyChipView { keyId: string; kind: KeyChipKind; label: string; title: string; latencyMs?: number; openUntil?: number }`
  - `export interface PoolDashboardView { state: PoolDashboardState; title: string; description: string; action: string; canTranslate: boolean; providerCount: number; healthyKeyCount: number; coolingKeyCount: number; invalidKeyCount: number; failedKeyCount: number; untestedKeyCount: number; enabledKeyCount: number }`
  - `export function getKeyChipView(provider: PoolProvider, key: PoolKey, live: PoolKeyLiveStatus | undefined, now: number): KeyChipView`
  - `export function getPoolDashboardView(settings: ExtensionSettings, liveByKeyId: Record<string, PoolKeyLiveStatus> | null, now: number): PoolDashboardView`
  - `export function formatCooldownRemaining(openUntil: number, now: number): string` // `mm:ss` or `Xs`

- [ ] **Step 1: Write the failing tests**

```typescript
// lib/__tests__/poolDashboardStatus.test.ts
import { describe, it, expect } from 'vitest';
import {
  getKeyChipView,
  getPoolDashboardView,
  formatCooldownRemaining,
} from '@/lib/poolDashboardStatus';
import type { ExtensionSettings, PoolProvider, PoolKey } from '@/types/config';
import { DEFAULT_SETTINGS } from '@/lib/config'; // or construct minimal settings

function key(partial: Partial<PoolKey> & { id: string }): PoolKey {
  return {
    apiKey: 'sk-test',
    maxRpm: 0,
    concurrencyLimit: 0,
    interval: 0,
    enabled: true,
    ...partial,
  };
}

function provider(partial: Partial<PoolProvider> & { id: string; keys: PoolKey[] }): PoolProvider {
  return {
    displayName: 'OpenRouter',
    baseUrl: 'https://openrouter.ai/api/v1',
    model: 'test-model',
    requiresApiKey: true,
    temperature: 0.3,
    maxTokens: 4096,
    requestTimeoutMs: 60000,
    enabled: true,
    catalogId: 'openrouter',
    ...partial,
  };
}

describe('formatCooldownRemaining', () => {
  it('formats minutes and seconds', () => {
    expect(formatCooldownRemaining(65_000, 0)).toMatch(/1:05|65s/);
  });
});

describe('getKeyChipView', () => {
  const p = provider({ id: 'p1', keys: [] });

  it('marks disabled keys off', () => {
    const chip = getKeyChipView(p, key({ id: 'k1', enabled: false }), undefined, 0);
    expect(chip.kind).toBe('off');
  });

  it('marks credentialInvalid as invalid over failed test', () => {
    const chip = getKeyChipView(
      p,
      key({ id: 'k1', lastTestResult: { success: false, at: 1 } }),
      { keyId: 'k1', providerId: 'p1', open: true, openUntil: 99_999, credentialInvalid: true, disabled: false },
      0,
    );
    expect(chip.kind).toBe('invalid');
  });

  it('marks open breaker as cooling when not credentialInvalid', () => {
    const chip = getKeyChipView(
      p,
      key({ id: 'k1', lastTestResult: { success: true, at: 1, latencyMs: 120 } }),
      { keyId: 'k1', providerId: 'p1', open: true, openUntil: 30_000, credentialInvalid: false, disabled: false },
      0,
    );
    expect(chip.kind).toBe('cooling');
    expect(chip.openUntil).toBe(30_000);
  });

  it('marks last test success as healthy when live closed', () => {
    const chip = getKeyChipView(
      p,
      key({ id: 'k1', lastTestResult: { success: true, at: 1, latencyMs: 50 } }),
      { keyId: 'k1', providerId: 'p1', open: false, openUntil: 0, credentialInvalid: false, disabled: false },
      0,
    );
    expect(chip.kind).toBe('healthy');
    expect(chip.latencyMs).toBe(50);
  });

  it('marks untested when no result and not live-open', () => {
    const chip = getKeyChipView(p, key({ id: 'k1' }), undefined, 0);
    expect(chip.kind).toBe('untested');
  });
});

describe('getPoolDashboardView', () => {
  it('not-ready when no providers', () => {
    const view = getPoolDashboardView({ ...DEFAULT_SETTINGS, providers: [] }, null, 0);
    expect(view.state).toBe('not-ready');
    expect(view.canTranslate).toBe(false);
  });

  it('ready when one healthy enabled key and no live degradation', () => {
    const settings = {
      ...DEFAULT_SETTINGS,
      providers: [
        provider({
          id: 'p1',
          keys: [key({ id: 'k1', lastTestResult: { success: true, at: 1 } })],
        }),
      ],
    };
    const view = getPoolDashboardView(settings, null, 0);
    expect(view.state).toBe('ready');
    expect(view.canTranslate).toBe(true);
    expect(view.healthyKeyCount).toBe(1);
  });

  it('partial when one healthy and one failed among enabled', () => {
    const settings = {
      ...DEFAULT_SETTINGS,
      providers: [
        provider({
          id: 'p1',
          keys: [
            key({ id: 'k1', lastTestResult: { success: true, at: 1 } }),
            key({ id: 'k2', lastTestResult: { success: false, at: 2 } }),
          ],
        }),
      ],
    };
    const view = getPoolDashboardView(settings, null, 0);
    expect(view.state).toBe('partial');
    expect(view.canTranslate).toBe(true);
  });

  it('degraded when ≥50% enabled slots are live open and can still translate', () => {
    const settings = {
      ...DEFAULT_SETTINGS,
      providers: [
        provider({
          id: 'p1',
          keys: [
            key({ id: 'k1', lastTestResult: { success: true, at: 1 } }),
            key({ id: 'k2', lastTestResult: { success: true, at: 1 } }),
          ],
        }),
      ],
    };
    const live = {
      k1: { keyId: 'k1', providerId: 'p1', open: true, openUntil: 99_999, credentialInvalid: false, disabled: false },
      // k2 healthy closed
    };
    const view = getPoolDashboardView(settings, live, 0);
    // 1 of 2 open = 50% → degraded
    expect(view.state).toBe('degraded');
    expect(view.canTranslate).toBe(true);
    expect(view.coolingKeyCount).toBe(1);
  });
});
```

Adjust imports if `DEFAULT_SETTINGS` path differs — use whatever the repo already exports from `@/lib/config`.

- [ ] **Step 2: Run tests to verify they fail**

```bash
pnpm exec vitest run lib/__tests__/poolDashboardStatus.test.ts
```

Expected: FAIL (module not found).

- [ ] **Step 3: Implement `lib/poolDashboardStatus.ts`**

Rules (must match tests):

1. Chip priority: `off` (key or provider disabled) → `invalid` (live.credentialInvalid) → `cooling` (live.open) → `failed` (lastTestResult.success === false) → `healthy` (lastTestResult.success) → `untested`.
2. Labels: Healthy / Failed / Cooling / Invalid key / Off / Untested (copy deck).
3. Dashboard `canTranslate`: same idea as `getPoolReadinessStatus` (dispatchable slot exists: enabled provider with baseUrl+model and enabled key with apiKey if required) — **call** `getPoolReadinessStatus` for canTranslate rather than re-deriving if possible.
4. State:
   - `not-ready` if !canTranslate
   - else if live present and cooling+invalid count ≥ ceil(enabledSlots/2) OR ≥ 50% of enabled slots → `degraded`
   - else if any failed/cooling/invalid/untested among enabled while ≥1 healthy → `partial` (untested alone with healthy still partial or ready — prefer: only failed/cooling/invalid force partial; all healthy+tested → ready; all untested but canTranslate → partial with action "Verify connection")
   - else `ready`

Use recovery titles from copy deck for title/description/action fields.

- [ ] **Step 4: Run tests to verify they pass**

```bash
pnpm exec vitest run lib/__tests__/poolDashboardStatus.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/poolDashboardStatus.ts lib/__tests__/poolDashboardStatus.test.ts types/poolStatus.ts 2>/dev/null
git add -A lib/ types/
git commit -m "feat(providers): pure pool dashboard status and key chips"
```

---

### Task 2: Pure reorder helpers

**Files:**
- Create: `lib/poolReorder.ts`
- Create: `lib/__tests__/poolReorder.test.ts`

**Interfaces:**
- Produces:
  - `export function reorderByIndex<T>(items: T[], fromIndex: number, toIndex: number): T[]`
  - `export function moveProvider(providers: PoolProvider[], fromIndex: number, toIndex: number): PoolProvider[]`
  - `export function moveKey(provider: PoolProvider, fromIndex: number, toIndex: number): PoolProvider`
  - `export function moveProviderById(providers: PoolProvider[], providerId: string, direction: 'up' | 'down'): PoolProvider[]`
  - `export function moveKeyById(provider: PoolProvider, keyId: string, direction: 'up' | 'down'): PoolProvider`

- [ ] **Step 1: Write failing tests**

```typescript
import { describe, it, expect } from 'vitest';
import { reorderByIndex, moveProviderById, moveKeyById } from '@/lib/poolReorder';

describe('reorderByIndex', () => {
  it('moves item forward', () => {
    expect(reorderByIndex(['a', 'b', 'c'], 0, 2)).toEqual(['b', 'c', 'a']);
  });
  it('no-ops on out of range', () => {
    expect(reorderByIndex(['a'], 0, 5)).toEqual(['a']);
  });
});

describe('moveProviderById', () => {
  const providers = [{ id: 'p1' }, { id: 'p2' }, { id: 'p3' }] as any;
  it('moves up', () => {
    expect(moveProviderById(providers, 'p2', 'up').map((p: any) => p.id)).toEqual(['p2', 'p1', 'p3']);
  });
  it('no-ops at top', () => {
    expect(moveProviderById(providers, 'p1', 'up').map((p: any) => p.id)).toEqual(['p1', 'p2', 'p3']);
  });
});

describe('moveKeyById', () => {
  const provider = { id: 'p1', keys: [{ id: 'k1' }, { id: 'k2' }] } as any;
  it('moves key down', () => {
    expect(moveKeyById(provider, 'k1', 'down').keys.map((k: any) => k.id)).toEqual(['k2', 'k1']);
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

```bash
pnpm exec vitest run lib/__tests__/poolReorder.test.ts
```

- [ ] **Step 3: Implement immutably (slice/splice copies, never mutate input)**

- [ ] **Step 4: Run — expect PASS**

- [ ] **Step 5: Commit**

```bash
git add lib/poolReorder.ts lib/__tests__/poolReorder.test.ts
git commit -m "feat(providers): pure pool reorder helpers"
```

---

### Task 3: Background `GET_POOL_KEY_STATUSES` message

**Files:**
- Modify: `types/messages.ts`
- Modify: `services/background.ts` (message switch + handler)
- Create/Modify: `services/__tests__/background.poolStatuses.test.ts` (or extend an existing background test file)

**Interfaces:**
- Produces message types:

```typescript
// types/messages.ts additions
| 'GET_POOL_KEY_STATUSES'

export interface GetPoolKeyStatusesMessage {
  action: 'GET_POOL_KEY_STATUSES';
}

export interface GetPoolKeyStatusesResponse {
  success: boolean;
  statuses?: Record<string, {
    keyId: string;
    providerId: string;
    open: boolean;
    openUntil: number;
    credentialInvalid: boolean;
    lastFailureKind?: string;
    disabled: boolean;
  }>;
  error?: string;
}
```

Add to `MessageAction` union and `ExtensionMessage` union.

- [ ] **Step 1: Write failing test** that mocks/spies coordinator:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
// Follow patterns in services/__tests__/background.translate.test.ts for loading handleMessage / background exports.

describe('GET_POOL_KEY_STATUSES', () => {
  it('returns getAllKeyStatuses from the pool coordinator', async () => {
    // Arrange: settings with one provider/key; ensure initService builds coordinator
    // Act: send { action: 'GET_POOL_KEY_STATUSES' }
    // Assert: success true, statuses is object (may be empty if pool not rebuilt — then spy getAllKeyStatuses)
  });
});
```

If background tests are heavy, minimal approach: unit-test a small exported helper:

```typescript
// services/poolStatusQuery.ts
export async function queryPoolKeyStatuses(
  getService: () => Promise<TranslationService>,
): Promise<GetPoolKeyStatusesResponse> {
  const service = await getService();
  if (!(service instanceof ProviderPoolCoordinator)) {
    return { success: true, statuses: {} };
  }
  return { success: true, statuses: service.getAllKeyStatuses() };
}
```

Prefer extracting `queryPoolKeyStatuses` for easy unit tests, then call it from the switch case.

- [ ] **Step 2: Run test — FAIL**

- [ ] **Step 3: Implement message types + helper + `case 'GET_POOL_KEY_STATUSES':` in background switch that `return queryPoolKeyStatuses(initService)`**

Ensure `initService` is used so the pool is rebuilt from latest settings before snapshot.

- [ ] **Step 4: Run test — PASS**

- [ ] **Step 5: Commit**

```bash
git add types/messages.ts services/background.ts services/poolStatusQuery.ts services/__tests__/
git commit -m "feat(providers): expose pool key statuses to options UI"
```

---

### Task 4: `usePoolKeyStatuses` hook

**Files:**
- Create: `entrypoints/options/hooks/usePoolKeyStatuses.ts`
- Create: `entrypoints/options/hooks/__tests__/usePoolKeyStatuses.test.ts`

**Interfaces:**
- Produces:

```typescript
export function usePoolKeyStatuses(enabled: boolean): {
  statuses: Record<string, PoolKeyLiveStatus> | null;
  liveAvailable: boolean;
  refresh: () => Promise<void>;
}
```

- Poll every **3000ms** when `enabled && document.visibilityState === 'visible'`
- Refresh on `window` `focus` and when `enabled` flips true
- On chrome.runtime failure: set `liveAvailable` false, keep last statuses or null
- Use `chrome.runtime.sendMessage({ action: 'GET_POOL_KEY_STATUSES' })`

- [ ] **Step 1: Write hook tests with fake timers + mocked sendMessage**

```typescript
import { renderHook, act, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { usePoolKeyStatuses } from '../usePoolKeyStatuses';

describe('usePoolKeyStatuses', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal('chrome', {
      runtime: {
        sendMessage: vi.fn().mockResolvedValue({
          success: true,
          statuses: { k1: { keyId: 'k1', providerId: 'p1', open: false, openUntil: 0, credentialInvalid: false, disabled: false } },
        }),
      },
    });
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('loads statuses when enabled', async () => {
    const { result } = renderHook(() => usePoolKeyStatuses(true));
    await act(async () => { await Promise.resolve(); });
    await waitFor(() => {
      expect(result.current.statuses?.k1).toBeDefined();
    });
    expect(result.current.liveAvailable).toBe(true);
  });

  it('does not poll when disabled', async () => {
    renderHook(() => usePoolKeyStatuses(false));
    await act(async () => { vi.advanceTimersByTime(10000); });
    expect(chrome.runtime.sendMessage).not.toHaveBeenCalled();
  });
});
```

Adapt if project chrome mock already exists in `vitest.setup.ts`.

- [ ] **Step 2: Run — FAIL**

```bash
pnpm exec vitest run entrypoints/options/hooks/__tests__/usePoolKeyStatuses.test.ts
```

- [ ] **Step 3: Implement hook**

- [ ] **Step 4: Run — PASS**

- [ ] **Step 5: Commit**

```bash
git add entrypoints/options/hooks/usePoolKeyStatuses.ts entrypoints/options/hooks/__tests__/usePoolKeyStatuses.test.ts
git commit -m "feat(providers): poll live pool key statuses in options"
```

---

### Task 5: Shared `Drawer` primitive

**Files:**
- Create: `ui/Drawer.tsx`
- Create: `ui/__tests__/Drawer.test.tsx`

**Interfaces:**

```typescript
interface DrawerProps {
  open: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  headerExtra?: React.ReactNode;
  /** optional footer */
  footer?: React.ReactNode;
  widthClassName?: string; // default w-full max-w-md
}
```

Behavior:
- `role="dialog"` `aria-modal="true"` `aria-label={title}`
- Backdrop click + Escape → `onClose`
- Focus trap similar to `ui/Modal.tsx`
- Right side panel on `sm+`; full-width bottom sheet on narrow (`max-sm: items-end`)
- `z-50` (same as Modal); when both open, Modal should use higher z or render after — document: danger Modal uses `z-[60]` if needed

- [ ] **Step 1: Write smoke tests** — renders title when open; calls onClose on Escape

- [ ] **Step 2: Run — FAIL**

- [ ] **Step 3: Implement Drawer** (mirror Modal focus logic)

- [ ] **Step 4: Run — PASS**

- [ ] **Step 5: Commit**

```bash
git add ui/Drawer.tsx ui/__tests__/Drawer.test.tsx
git commit -m "feat(ui): add Drawer primitive for provider editor"
```

---

### Task 6: `useProviderPoolActions` — extract CRUD + bulk test

**Files:**
- Create: `entrypoints/options/hooks/useProviderPoolActions.ts`
- Create: `entrypoints/options/hooks/__tests__/useProviderPoolActions.test.ts` (optional pure extracts preferred)
- Prefer also: `lib/poolBulkTest.ts` pure slot enumeration if easier to test

**Interfaces:**

```typescript
export function useProviderPoolActions(): {
  providers: PoolProvider[];
  commitProviders: (next: PoolProvider[]) => void;
  updateProviderFields: (providerId: string, patch: Partial<PoolProvider>) => void;
  updateKey: (providerId: string, keyId: string, patch: Partial<PoolKey>) => void;
  addKey: (providerId: string) => void;
  removeKey: (providerId: string, keyId: string) => void;
  removeProvider: (providerId: string) => void;
  addProviderFromCatalog: (catalogId: string, overrides?: Partial<PoolProvider>) => string; // returns new provider id
  reorderProviders: (from: number, to: number) => void;
  moveProvider: (providerId: string, direction: 'up' | 'down') => void;
  reorderKeys: (providerId: string, from: number, to: number) => void;
  moveKey: (providerId: string, keyId: string, direction: 'up' | 'down') => void;
  handleTestAll: () => Promise<void>;
  handleTestProvider: (providerId: string) => Promise<void>;
  isBulkTesting: boolean;
  bulkTestProgress: { done: number; total: number } | null;
}
```

Move logic from current `ProvidersSection` almost verbatim:
- `applyProviderPatch` / `applyKeyPatch`
- `poolIdGenerators`
- `runWithConcurrency` + `BULK_TEST_CONCURRENCY = 4`
- **Fix stale closure:** when committing per-key test results during bulk test, read latest providers from `useSettingsStore.getState().providers` instead of closed-over `providers`

- [ ] **Step 1: Unit-test bulk slot enumeration**

```typescript
// lib/poolBulkTest.ts
export function collectTestableSlots(providers: PoolProvider[]): Array<{ providerId: string; keyId: string }>
// skip disabled providers/keys; skip empty apiKey when requiresApiKey
```

- [ ] **Step 2–4: TDD that helper; implement hook wrapping store**

- [ ] **Step 5: Commit**

```bash
git add entrypoints/options/hooks/useProviderPoolActions.ts lib/poolBulkTest.ts lib/__tests__/poolBulkTest.test.ts
git commit -m "feat(providers): extract pool actions and bulk test slots"
```

---

### Task 7: `PoolCommandBar` + `EmptyPoolHero` (presentational)

**Files:**
- Create: `entrypoints/options/components/PoolCommandBar.tsx`
- Create: `entrypoints/options/components/EmptyPoolHero.tsx`

**Interfaces:**

```typescript
// PoolCommandBar
props: {
  view: PoolDashboardView;
  liveAvailable: boolean;
  isBulkTesting: boolean;
  bulkTestProgress: { done: number; total: number } | null;
  onTestAll: () => void;
  onAddProvider: () => void;
  onOpenSetup?: () => void;
  onNavigateToAdvanced?: () => void;
}

// EmptyPoolHero
props: {
  onAddProvider: () => void;
  onOpenSetup?: () => void;
}
```

Copy from spec §12. Metrics line example:  
`{providerCount} providers · {healthyKeyCount} healthy · {coolingKeyCount} cooling`

Border: emerald when ready, amber when partial/degraded/not-ready.

- [ ] **Step 1: Optional RTL smoke** — EmptyPoolHero shows “Connect your first LLM”; CommandBar shows Test all keys

- [ ] **Step 2: Implement components**

- [ ] **Step 3: Commit**

```bash
git add entrypoints/options/components/PoolCommandBar.tsx entrypoints/options/components/EmptyPoolHero.tsx
git commit -m "feat(providers): pool command bar and empty hero"
```

---

### Task 8: Compact `ProviderKeyRow` rewrite

**Files:**
- Modify: `entrypoints/options/components/ProviderKeyRow.tsx`

**Interfaces:**
- Extend props:

```typescript
interface ProviderKeyRowProps {
  provider: PoolProvider;
  poolKey: PoolKey;
  targetLanguage: string;
  chip: KeyChipView;
  onUpdate: (patch: Partial<PoolKey>) => void;
  onRemove: () => void;
  onMove?: (direction: 'up' | 'down') => void;
  dragHandleProps?: React.HTMLAttributes<HTMLButtonElement>;
}
```

UI:
- Default compact: chip + label + password (if required) + enable + Test + ⋮ menu
- ⋮: Move up/down, open advanced limits, Remove
- Advanced disclosure: Max RPM, concurrency, interval (existing fields)
- Keep `useDeferredCommit`, `useConnectionTest`, `ConnectionTestProgressList`, `ProviderTestResult`
- Display label fallback: `poolKey.label || \`Key ${index+1}\`` — pass `displayIndex` prop if needed

- [ ] **Step 1: If component tests missing, add one smoke test** that renders API key field when requiresApiKey

- [ ] **Step 2: Implement compact layout**

- [ ] **Step 3: Commit**

```bash
git add entrypoints/options/components/ProviderKeyRow.tsx
git commit -m "feat(providers): compact key row with live chip"
```

---

### Task 9: `ProviderEditDrawer` (Connection / Keys / Advanced / Danger)

**Files:**
- Create: `entrypoints/options/components/ProviderEditDrawer.tsx`

**Interfaces:**

```typescript
props: {
  provider: PoolProvider | null;
  open: boolean;
  initialSection?: 'connection' | 'keys' | 'advanced' | 'danger';
  focusKeyId?: string | null;
  targetLanguage: string;
  liveByKeyId: Record<string, PoolKeyLiveStatus> | null;
  onClose: () => void;
  onUpdateProvider: (patch: Partial<PoolProvider>) => void;
  onUpdateKey: (keyId: string, patch: Partial<PoolKey>) => void;
  onAddKey: () => void;
  onRemoveKey: (keyId: string) => void;
  onReorderKey: (from: number, to: number) => void;
  onMoveKey: (keyId: string, direction: 'up' | 'down') => void;
  onTestProvider: () => void;
  onRequestRemoveProvider: () => void;
  onCatalogSelect: (selection: { patch: Partial<ProviderConfig> }) => void;
  isTestingProvider?: boolean;
}
```

Sections:
1. **Connection** — template summary / Change template (`ProviderCatalogPicker` compact), display name, base URL, `ModelPicker` (reuse deferred commit pattern from old card)
2. **Keys** — map `ProviderKeyRow`; Add key button; scroll to `focusKeyId` on open via `data-key-id`
3. **Advanced** — Temperature + Max Tokens sliders (same ranges as today)
4. **Danger** — Remove provider button → parent opens Modal

Header: identity badge, enable toggle, Test provider button.

**Do not** include standalone `ProviderConnectionTest` panel.

Confirm on Change template when baseUrl/model would change (window.confirm is **not** ideal — use small inline confirm or existing Modal; prefer Modal “Replace template settings?”).

- [ ] **Step 1: Implement drawer composition using `ui/Drawer`**

- [ ] **Step 2: Smoke test optional** — open shows Connection tab

- [ ] **Step 3: Commit**

```bash
git add entrypoints/options/components/ProviderEditDrawer.tsx
git commit -m "feat(providers): tabbed provider edit drawer"
```

---

### Task 10: `ProviderRow` + `ProviderRotationList` (without DnD first)

**Files:**
- Create: `entrypoints/options/components/ProviderRow.tsx`
- Create: `entrypoints/options/components/ProviderRotationList.tsx`

**Interfaces:**

```typescript
// ProviderRow
props: {
  provider: PoolProvider;
  chips: KeyChipView[];
  aggregateKind: KeyChipKind | 'mixed';
  onToggleEnabled: (enabled: boolean) => void;
  onTest: () => void;
  onEdit: () => void;
  onRemove: () => void;
  onMove: (direction: 'up' | 'down') => void;
  onKeyChipClick: (keyId: string) => void;
  dragHandleProps?: ...
}

// ProviderRotationList
props: {
  providers: PoolProvider[];
  liveByKeyId: Record<string, PoolKeyLiveStatus> | null;
  now?: number; // default Date.now for tests
  onReorder: (from: number, to: number) => void;
  onMove: (providerId: string, direction: 'up' | 'down') => void;
  onToggleEnabled: (providerId: string, enabled: boolean) => void;
  onTestProvider: (providerId: string) => void;
  onEdit: (providerId: string, opts?: { keyId?: string }) => void;
  onRemove: (providerId: string) => void;
}
```

Row layout per spec §5.3. Host chip: try `new URL(baseUrl).host` in try/catch → fallback truncated baseUrl.

Aggregate: if chips empty untested; if all same kind that kind; else `mixed`.

- [ ] **Step 1: Implement list mapping chips via `getKeyChipView`**

- [ ] **Step 2: Commit**

```bash
git add entrypoints/options/components/ProviderRow.tsx entrypoints/options/components/ProviderRotationList.tsx
git commit -m "feat(providers): dense provider rotation list rows"
```

---

### Task 11: Wire P0 shell in `ProvidersSection` (retire mega-card)

**Files:**
- Rewrite: `entrypoints/options/sections/ProvidersSection.tsx`
- Create: `entrypoints/options/sections/__tests__/ProvidersSection.test.tsx`
- Stop using `ProviderCard` as main UI (delete file in Task 14 if unused)

**Behavior:**
- SectionHeader accent **cyan**, new description
- If `providers.length === 0` → `EmptyPoolHero` only
- Else → `PoolCommandBar` + order hint + `ProviderRotationList` + Add provider button
- State: `editingProviderId`, `drawerSection`, `focusKeyId`, `pendingDeleteId`, `showGuidedAdd`
- Wire `useProviderPoolActions`, `usePoolKeyStatuses(true)` when section mounted
- Delete confirm Modal as today
- Keep exports: `countEnabledKeys`, `getPoolReadiness`

- [ ] **Step 1: Write section tests**

```typescript
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ProvidersSection } from '../ProvidersSection';
import { useSettingsStore } from '@/stores/settingsStore';
// reset store; mock chrome.runtime.sendMessage

it('shows empty hero when no providers', () => {
  // set providers []
  render(<ProvidersSection />);
  expect(screen.getByText(/Connect your first LLM/i)).toBeInTheDocument();
});

it('shows provider name in list when configured', () => {
  // seed one provider
  render(<ProvidersSection />);
  expect(screen.getByText('OpenRouter')).toBeInTheDocument();
});

it('opens drawer on Edit', async () => {
  render(<ProvidersSection />);
  fireEvent.click(screen.getByRole('button', { name: /edit/i }));
  expect(screen.getByRole('dialog')).toBeInTheDocument();
});
```

Follow store seeding patterns from `GeneralSection.test.tsx` / `stores/__tests__/settingsStore.test.ts`.

- [ ] **Step 2: Run — FAIL / implement shell until PASS**

```bash
pnpm exec vitest run entrypoints/options/sections/__tests__/ProvidersSection.test.tsx
```

- [ ] **Step 3: Manually ensure `App.tsx` still compiles (props unchanged)**

```bash
pnpm exec tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add entrypoints/options/sections/ProvidersSection.tsx entrypoints/options/sections/__tests__/ProvidersSection.test.tsx
git commit -m "feat(providers): wire dashboard shell and edit drawer"
```

---

### Task 12: `GuidedAddProvider` 3-step flow (P1)

**Files:**
- Create: `entrypoints/options/components/GuidedAddProvider.tsx`
- Modify: `ProvidersSection` to open it instead of old `AddProviderModal`
- Delete or keep `AddProviderModal.tsx` as internal step-1 only — **prefer replace** with GuidedAdd and remove AddProviderModal if unused

**Steps UI:**
1. Choose — reuse search + `groupByCategory` + identity badges from current `AddProviderModal`
2. Connect — fields for key/model; prefilled from catalog entry
3. Verify — run `testConnection` via `useConnectionTest` / `testConnection` service; on success call `addProviderFromCatalog` with key/model overrides; on failure Retry / Skip (add untested)

On success: close modal; set `editingProviderId` to new id; `drawerSection='keys'`.

- [ ] **Step 1: Component test** — step 1 shows search; selecting entry advances (or shows connect fields)

- [ ] **Step 2: Implement**

- [ ] **Step 3: Commit**

```bash
git add entrypoints/options/components/GuidedAddProvider.tsx entrypoints/options/sections/ProvidersSection.tsx
git add entrypoints/options/components/AddProviderModal.tsx # if deleted
git commit -m "feat(providers): guided three-step add provider flow"
```

---

### Task 13: Drag-and-drop reorder + keyboard (P2)

**Files:**
- Modify: `ProviderRotationList.tsx`, `ProviderRow.tsx`, `ProviderEditDrawer.tsx` / `ProviderKeyRow.tsx`

**Implementation:**
- HTML5 DnD: `draggable` on handle only; `onDragStart` set index; `onDragOver` preventDefault; `onDrop` call `onReorder(from, to)`
- Keyboard already via `onMove` up/down in ⋮ menus
- Order hint paragraph under command bar (spec copy)
- No new npm dependency

- [ ] **Step 1: Unit tests already cover reorder helpers — add list test that drop calls onReorder if feasible**

- [ ] **Step 2: Implement handles**

- [ ] **Step 3: Commit**

```bash
git commit -am "feat(providers): drag-and-drop rotation order"
```

---

### Task 14: Live chips, degraded bar, recovery polish (P3) + cleanup (P4)

**Files:**
- Ensure `ProvidersSection` passes live map into list/drawer/command bar via `getPoolDashboardView` + `getKeyChipView`
- Show “Live status unavailable…” when `!liveAvailable && providers.length > 0`
- Cooling countdown: re-render — either 1s interval in list when any cooling chip exists, or pass `now` from parent interval
- Remove dead code: `ProviderCard.tsx`, `ProviderConnectionTest.tsx` if unreferenced
- Unify catalog picker styling with GuidedAdd badges (optional polish: add monograms to `ProviderCatalogPicker`)
- `prefers-reduced-motion`: skip drawer transition class
- Raise Modal z-index above Drawer if needed

- [ ] **Step 1: Extend dashboard tests if any edge cases missing**

- [ ] **Step 2: Run full relevant suites**

```bash
pnpm exec vitest run lib/__tests__/poolDashboardStatus.test.ts lib/__tests__/poolReorder.test.ts lib/__tests__/poolBulkTest.test.ts entrypoints/options/sections/__tests__/ProvidersSection.test.tsx entrypoints/options/hooks/__tests__/usePoolKeyStatuses.test.ts tests/unit/providerReadiness.test.ts
pnpm exec tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git commit -am "feat(providers): live health chips and ops polish"
```

- [ ] **Step 4: Update beads**

```bash
bd close ALT-d75 --reason "Providers ops redesign implemented per plan"
# or leave open until manual QA — if partial, bd update with progress notes
```

---

## Spec coverage checklist

| Spec requirement | Task(s) |
|------------------|---------|
| Guided empty hero | 7, 11, 12 |
| Guided Add 3-step | 12 |
| Pool command bar + states | 1, 7, 11, 14 |
| Dense rotation rows | 10, 11 |
| Edit drawer tabs | 5, 9, 11 |
| Compact keys | 8 |
| Unified test story | 6, 8, 9 (no ProviderConnectionTest panel) |
| Drag + keyboard reorder | 2, 13 |
| Live key statuses message | 3, 4, 14 |
| Setup wizard secondary entry | 7, 11 (`onOpenSetup`) |
| Stable popup helpers | 11 (keep exports); Task 1 separate module |
| Cyan accent / copy deck | 7, 11 |
| Phases P0–P4 | Tasks 1–11 ≈ P0; 12 = P1; 13 = P2; 14 = P3+P4 |

---

## Plan self-review

1. **Spec coverage:** All locked decisions in design §18 map to tasks above.  
2. **Placeholders:** No TBD steps; concrete files, interfaces, and commands.  
3. **Type consistency:** `PoolKeyLiveStatus` / chip / dashboard view names used consistently; message action `GET_POOL_KEY_STATUSES`.  
4. **Risk:** Background test harness may vary — Task 3 allows `poolStatusQuery` extract if full background test is brittle.  
5. **Popup safety:** Dashboard status is **new** module; does not change `getPoolReadinessStatus` return shape.

---

## Execution handoff

Plan complete and saved to `docs/superpowers/plans/2026-07-10-providers-tab-ops-redesign.md`.

**Two execution options:**

1. **Subagent-Driven (recommended)** — Fresh subagent per task, review between tasks, fast iteration (`subagent-driven-development`)
2. **Inline Execution** — Execute tasks in this session with checkpoints (`executing-plans`)

**Which approach?**
