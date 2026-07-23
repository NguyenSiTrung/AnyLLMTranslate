# Google AI Studio Multi-Model Pool Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let Google AI Studio pool providers list multiple Gemini models and rotate with **preferred + failover (default)** or **round-robin**, stacking free-tier per-model quotas without changing other providers.

**Architecture:** Add optional `models[]` + `modelStrategy` on `PoolProvider` (meaningful only for Google AI Studio). Pure helpers resolve ordered models and eligibility. `resolveSlots` expands `provider × model × key` with composite `slotId` when multi-model is active. `ProviderPoolCoordinator` keys members/breakers/throttles by `slotId`, picks slots with preferred order (A) or flat RR (C), and keeps single-model pools byte-compatible (`slotId === keyId`). UI multi-model controls appear only in Google AI Studio provider edit.

**Tech Stack:** TypeScript, Vitest, existing pool stack (`lib/poolResolver.ts`, `services/providerPool.ts`, `lib/circuitBreaker.ts`), React options UI (`ProviderEditDrawer`, `ModelPicker`, `SegmentedControl`).

**Spec:** `docs/superpowers/specs/2026-07-23-google-ai-studio-multi-model-pool-design.md`  
**Beads:** AnyLLMTranslate-xxq

## Global Constraints

- **Google AI Studio only** — multi-model expansion requires `catalogId === 'google-ai-studio'` **or** `isGeminiOpenAiCompatBaseUrl(baseUrl)`.
- **Other providers unchanged** — always one model; ignore stray `models[]` if written.
- Default strategy: **`preferred_failover`**. Optional: **`round_robin`**.
- Preferred multi-key order **A:** `model0+k1 → model0+k2 → model1+k1 → model1+k2`.
- Round-robin **C:** flat healthy slots; expansion order model-major then key-major.
- Single-model `slotId === keyId` so existing breaker continuity is preserved.
- Multi-model `slotId = \`${keyId}::${model}\`` so one model’s 429 does not cool others on the same key.
- `model` always equals `models[0]` when multi-model is active.
- No hard-coded free RPM/RPD tables.
- Track work with **bd** (`AnyLLMTranslate-xxq`); do not use TodoWrite.
- TDD: failing tests → implement → pass → commit per task.
- Prefer non-interactive shell flags (`cp -f`, `rm -f`, etc.).

---

## File map

| File | Responsibility |
|------|----------------|
| Modify `types/config.ts` | `GoogleModelStrategy`, optional `models?`, `modelStrategy?` on `PoolProvider` |
| Create `lib/googleMultiModel.ts` | Eligibility, resolve/dedupe models, normalize provider, strategy default, slotId helper |
| Create `lib/__tests__/googleMultiModel.test.ts` | Pure unit tests |
| Modify `lib/poolResolver.ts` | Expand multi-model slots; `PoolSlot.model` + `slotId`; healthy by `slotId` |
| Modify `lib/__tests__/providerPoolHelpers.test.ts` or Create `lib/__tests__/poolResolver.multiModel.test.ts` | Resolver expansion tests |
| Modify `services/providerPool.ts` | Members/dispatch/status by `slotId`; preferred + RR strategies; mixed-pool group pick |
| Modify `services/__tests__/providerPool.test.ts` | Multi-model dispatch + isolation tests (keep existing single-model green) |
| Modify `lib/config.ts` | `computePoolSignature` includes `models` + `modelStrategy` |
| Modify `lib/providerPoolHelpers.ts` | `buildProviderConfig` stays single-model from provider.model (primary); optional normalize helper re-export |
| Modify `entrypoints/options/hooks/useProviderPoolActions.ts` | Normalize models when patching provider model/models/strategy |
| Modify `entrypoints/options/components/ProviderEditDrawer.tsx` | Google-only multi-model UI + strategy control |
| Modify `entrypoints/options/components/ProviderRow.tsx` | Optional: show `+N models` when multi-model active |
| Modify `services/providerPool.ts` `KeyStatus` + `types/messages.ts` `PoolKeyStatusPayload` | Add `slotId`, `model`; status map keyed by `slotId` |
| Modify key chip aggregation (`getKeyChipView` or equivalent) | Aggregate worst open among slots for a key |
| Spec status | Mark approved in design doc after plan accepted |

**Do not modify:** Non-Google catalog entries, OpenAICompatibleService request shape (already model-from-config), hard-coded quota tables.

---

### Task 1: Types + pure multi-model helpers

**Files:**
- Modify: `types/config.ts` (on `PoolProvider`, after `model` / before or after `thinkingEffort`)
- Create: `lib/googleMultiModel.ts`
- Create: `lib/__tests__/googleMultiModel.test.ts`

**Interfaces:**
- Consumes: `PoolProvider` from `@/types/config`; `isGeminiOpenAiCompatBaseUrl` from `@/lib/thinkingMode`
- Produces:
  - `export type GoogleModelStrategy = 'preferred_failover' | 'round_robin'` (also exported from config)
  - `export function isGoogleAiStudioProvider(provider: Pick<PoolProvider, 'catalogId' | 'baseUrl'>): boolean`
  - `export function resolveProviderModels(provider: Pick<PoolProvider, 'catalogId' | 'baseUrl' | 'model' | 'models'>): string[]`
  - `export function isMultiModelActive(provider: Pick<PoolProvider, 'catalogId' | 'baseUrl' | 'model' | 'models'>): boolean`
  - `export function resolveModelStrategy(provider: Pick<PoolProvider, 'modelStrategy' | 'catalogId' | 'baseUrl' | 'model' | 'models'>): GoogleModelStrategy`
  - `export function normalizeGoogleModels(provider: PoolProvider): PoolProvider` — dedupe, sync `model` ↔ `models[0]`, strip multi-model if not Google
  - `export function makeSlotId(keyId: string, model: string, multiModel: boolean): string` — multi → `` `${keyId}::${model}` `` else `keyId`

- [ ] **Step 1: Add types to `types/config.ts`**

After `model: string` on `PoolProvider` (or near thinking fields), add:

```typescript
/**
 * Multi-model rotation strategy for Google AI Studio free-tier stacking.
 * Only meaningful when {@link PoolProvider.models} has length ≥ 2 on a Google
 * AI Studio provider. Default when unset: preferred_failover.
 */
export type GoogleModelStrategy = 'preferred_failover' | 'round_robin';
```

On `PoolProvider`:

```typescript
  /**
   * Optional ordered model list (Google AI Studio only).
   * Absent / empty / single → single-model behavior.
   * When length ≥ 2 and provider is Google AI Studio, pool expands key×model slots.
   * models[0] must equal {@link model} when multi-model is active.
   */
  models?: string[];
  /**
   * How to pick among multi-model slots. Default: preferred_failover.
   * Ignored when multi-model is inactive or provider is not Google AI Studio.
   */
  modelStrategy?: GoogleModelStrategy;
```

- [ ] **Step 2: Write failing tests**

```typescript
// lib/__tests__/googleMultiModel.test.ts
import { describe, it, expect } from 'vitest';
import {
  isGoogleAiStudioProvider,
  resolveProviderModels,
  isMultiModelActive,
  resolveModelStrategy,
  normalizeGoogleModels,
  makeSlotId,
} from '@/lib/googleMultiModel';
import type { PoolProvider } from '@/types/config';

function google(overrides: Partial<PoolProvider> = {}): PoolProvider {
  return {
    id: 'g1',
    displayName: 'Google AI Studio (Gemini)',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    model: 'gemini-2.5-flash',
    catalogId: 'google-ai-studio',
    requiresApiKey: true,
    temperature: 0.3,
    maxTokens: 4096,
    enabled: true,
    keys: [],
    ...overrides,
  };
}

function openrouter(): PoolProvider {
  return {
    id: 'or1',
    displayName: 'OpenRouter',
    baseUrl: 'https://openrouter.ai/api/v1',
    model: 'openai/gpt-4o-mini',
    catalogId: 'openrouter',
    requiresApiKey: true,
    temperature: 0.3,
    maxTokens: 4096,
    enabled: true,
    keys: [],
  };
}

describe('isGoogleAiStudioProvider', () => {
  it('detects catalogId and Gemini baseUrl', () => {
    expect(isGoogleAiStudioProvider(google())).toBe(true);
    expect(
      isGoogleAiStudioProvider(
        google({ catalogId: undefined, baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai' }),
      ),
    ).toBe(true);
    expect(isGoogleAiStudioProvider(openrouter())).toBe(false);
  });
});

describe('resolveProviderModels / isMultiModelActive', () => {
  it('single model when models absent', () => {
    expect(resolveProviderModels(google())).toEqual(['gemini-2.5-flash']);
    expect(isMultiModelActive(google())).toBe(false);
  });

  it('returns ordered unique models for Google multi-model', () => {
    const p = google({
      model: 'gemini-2.5-flash',
      models: ['gemini-2.5-flash', 'gemini-2.5-flash-lite', 'gemini-2.5-flash'],
    });
    expect(resolveProviderModels(p)).toEqual(['gemini-2.5-flash', 'gemini-2.5-flash-lite']);
    expect(isMultiModelActive(p)).toBe(true);
  });

  it('ignores models[] on non-Google providers', () => {
    const p = { ...openrouter(), models: ['a', 'b'] };
    expect(resolveProviderModels(p)).toEqual(['openai/gpt-4o-mini']);
    expect(isMultiModelActive(p)).toBe(false);
  });
});

describe('resolveModelStrategy', () => {
  it('defaults to preferred_failover; honors round_robin when multi-model active', () => {
    const multi = google({ models: ['gemini-2.5-flash', 'gemini-2.5-flash-lite'] });
    expect(resolveModelStrategy(multi)).toBe('preferred_failover');
    expect(resolveModelStrategy({ ...multi, modelStrategy: 'round_robin' })).toBe('round_robin');
    expect(resolveModelStrategy(google({ modelStrategy: 'round_robin' }))).toBe('preferred_failover'); // inactive
  });
});

describe('normalizeGoogleModels', () => {
  it('syncs model to models[0], strips multi-model for non-Google', () => {
    const n = normalizeGoogleModels(
      google({ model: 'old', models: ['  gemini-2.5-flash  ', 'gemini-2.5-flash-lite', ''] }),
    );
    expect(n.model).toBe('gemini-2.5-flash');
    expect(n.models).toEqual(['gemini-2.5-flash', 'gemini-2.5-flash-lite']);

    const stripped = normalizeGoogleModels({
      ...openrouter(),
      models: ['a', 'b'],
      modelStrategy: 'round_robin',
    });
    expect(stripped.models).toBeUndefined();
    expect(stripped.modelStrategy).toBeUndefined();
  });
});

describe('makeSlotId', () => {
  it('uses keyId alone for single-model; composite for multi-model', () => {
    expect(makeSlotId('k1', 'm', false)).toBe('k1');
    expect(makeSlotId('k1', 'gemini-2.5-flash', true)).toBe('k1::gemini-2.5-flash');
  });
});
```

- [ ] **Step 3: Run tests — expect FAIL**

```bash
npx vitest run lib/__tests__/googleMultiModel.test.ts
```

Expected: FAIL (module not found / exports missing).

- [ ] **Step 4: Implement `lib/googleMultiModel.ts`**

```typescript
import type { GoogleModelStrategy, PoolProvider } from '@/types/config';
import { isGeminiOpenAiCompatBaseUrl } from '@/lib/thinkingMode';

export function isGoogleAiStudioProvider(
  provider: Pick<PoolProvider, 'catalogId' | 'baseUrl'>,
): boolean {
  if (provider.catalogId === 'google-ai-studio') return true;
  return isGeminiOpenAiCompatBaseUrl(provider.baseUrl ?? '');
}

function dedupeModels(ids: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of ids) {
    const m = raw.trim();
    if (!m || seen.has(m)) continue;
    seen.add(m);
    out.push(m);
  }
  return out;
}

export function resolveProviderModels(
  provider: Pick<PoolProvider, 'catalogId' | 'baseUrl' | 'model' | 'models'>,
): string[] {
  if (!isGoogleAiStudioProvider(provider)) {
    const m = (provider.model ?? '').trim();
    return m ? [m] : [];
  }
  const fromList = Array.isArray(provider.models) ? provider.models : [];
  if (fromList.length > 0) {
    const deduped = dedupeModels(fromList);
    if (deduped.length > 0) return deduped;
  }
  const m = (provider.model ?? '').trim();
  return m ? [m] : [];
}

export function isMultiModelActive(
  provider: Pick<PoolProvider, 'catalogId' | 'baseUrl' | 'model' | 'models'>,
): boolean {
  return isGoogleAiStudioProvider(provider) && resolveProviderModels(provider).length >= 2;
}

export function resolveModelStrategy(
  provider: Pick<PoolProvider, 'modelStrategy' | 'catalogId' | 'baseUrl' | 'model' | 'models'>,
): GoogleModelStrategy {
  if (!isMultiModelActive(provider)) return 'preferred_failover';
  return provider.modelStrategy === 'round_robin' ? 'round_robin' : 'preferred_failover';
}

export function normalizeGoogleModels(provider: PoolProvider): PoolProvider {
  if (!isGoogleAiStudioProvider(provider)) {
    if (provider.models === undefined && provider.modelStrategy === undefined) return provider;
    const { models: _m, modelStrategy: _s, ...rest } = provider;
    return rest as PoolProvider;
  }
  const models = resolveProviderModels(provider);
  if (models.length === 0) {
    return { ...provider, models: undefined, modelStrategy: undefined };
  }
  if (models.length === 1) {
    return {
      ...provider,
      model: models[0]!,
      models: undefined,
      // keep strategy only if caller set multi later; strip when single
      modelStrategy: undefined,
    };
  }
  return {
    ...provider,
    model: models[0]!,
    models,
    modelStrategy:
      provider.modelStrategy === 'round_robin' ? 'round_robin' : 'preferred_failover',
  };
}

export function makeSlotId(keyId: string, model: string, multiModel: boolean): string {
  return multiModel ? `${keyId}::${model}` : keyId;
}
```

Re-export `GoogleModelStrategy` from config (already defined there). Import type only in helper file.

- [ ] **Step 5: Run tests — expect PASS**

```bash
npx vitest run lib/__tests__/googleMultiModel.test.ts
```

- [ ] **Step 6: Commit**

```bash
git add types/config.ts lib/googleMultiModel.ts lib/__tests__/googleMultiModel.test.ts
git commit -m "feat(pool): Google multi-model types and pure helpers"
```

---

### Task 2: Expand `resolveSlots` with model × key and `slotId`

**Files:**
- Modify: `lib/poolResolver.ts`
- Create: `lib/__tests__/poolResolver.multiModel.test.ts`

**Interfaces:**
- Consumes: `resolveProviderModels`, `isMultiModelActive`, `makeSlotId` from `lib/googleMultiModel.ts`
- Produces updated `PoolSlot`:
  - `model: string`
  - `slotId: string`
  - existing fields unchanged
- `healthySlots` uses `breaker.isHealthy(slot.slotId, now)`

- [ ] **Step 1: Write failing tests**

```typescript
// lib/__tests__/poolResolver.multiModel.test.ts
import { describe, it, expect } from 'vitest';
import { resolveSlots, healthySlots } from '@/lib/poolResolver';
import { createCircuitBreaker } from '@/lib/circuitBreaker';
import type { PoolProvider } from '@/types/config';

function googleMulti(): PoolProvider {
  return {
    id: 'g1',
    displayName: 'G',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    catalogId: 'google-ai-studio',
    model: 'gemini-2.5-flash',
    models: ['gemini-2.5-flash', 'gemini-2.5-flash-lite'],
    modelStrategy: 'preferred_failover',
    requiresApiKey: true,
    temperature: 0.3,
    maxTokens: 4096,
    enabled: true,
    keys: [
      { id: 'k1', apiKey: 'sk-1', maxRpm: 20, concurrencyLimit: 1, interval: 500, enabled: true },
      { id: 'k2', apiKey: 'sk-2', maxRpm: 20, concurrencyLimit: 1, interval: 500, enabled: true },
    ],
  };
}

describe('resolveSlots multi-model', () => {
  it('expands model-major × key-major with composite slotId', () => {
    const slots = resolveSlots([googleMulti()]);
    expect(slots.map((s) => s.slotId)).toEqual([
      'k1::gemini-2.5-flash',
      'k2::gemini-2.5-flash',
      'k1::gemini-2.5-flash-lite',
      'k2::gemini-2.5-flash-lite',
    ]);
    expect(slots.map((s) => s.providerConfig.model)).toEqual([
      'gemini-2.5-flash',
      'gemini-2.5-flash',
      'gemini-2.5-flash-lite',
      'gemini-2.5-flash-lite',
    ]);
    expect(slots[0]!.keyId).toBe('k1');
    expect(slots[0]!.model).toBe('gemini-2.5-flash');
  });

  it('keeps slotId === keyId for single-model', () => {
    const p = googleMulti();
    delete p.models;
    const slots = resolveSlots([p]);
    expect(slots).toHaveLength(2);
    expect(slots.map((s) => s.slotId)).toEqual(['k1', 'k2']);
  });

  it('does not expand models on OpenRouter', () => {
    const slots = resolveSlots([
      {
        id: 'or',
        displayName: 'OR',
        baseUrl: 'https://openrouter.ai/api/v1',
        catalogId: 'openrouter',
        model: 'openai/gpt-4o-mini',
        models: ['a', 'b'],
        requiresApiKey: true,
        temperature: 0.3,
        maxTokens: 4096,
        enabled: true,
        keys: [{ id: 'k1', apiKey: 'sk', maxRpm: 0, concurrencyLimit: 0, interval: 0, enabled: true }],
      },
    ]);
    expect(slots).toHaveLength(1);
    expect(slots[0]!.slotId).toBe('k1');
    expect(slots[0]!.providerConfig.model).toBe('openai/gpt-4o-mini');
  });

  it('healthySlots filters by slotId breaker', () => {
    const slots = resolveSlots([googleMulti()]);
    const breaker = createCircuitBreaker({ clock: () => 0 });
    breaker.recordFailure(slots[0]!.slotId, 'rateLimit', 0);
    const healthy = healthySlots(slots, breaker, 0);
    expect(healthy.map((s) => s.slotId)).not.toContain('k1::gemini-2.5-flash');
    expect(healthy.map((s) => s.slotId)).toContain('k1::gemini-2.5-flash-lite');
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

```bash
npx vitest run lib/__tests__/poolResolver.multiModel.test.ts
```

- [ ] **Step 3: Implement resolver changes**

Update `PoolSlot`:

```typescript
export interface PoolSlot {
  providerId: string;
  keyId: string;
  /** Model id for this slot. */
  model: string;
  /**
   * Breaker / member / throttle identity.
   * Single-model: keyId. Multi-model: `${keyId}::${model}`.
   */
  slotId: string;
  providerConfig: ProviderConfig;
  concurrencyLimit: number;
  interval: number;
}
```

Rewrite `resolveSlots` loop:

```typescript
export function resolveSlots(providers: PoolProvider[]): PoolSlot[] {
  const slots: PoolSlot[] = [];
  for (const provider of providers) {
    if (!provider.enabled) continue;
    const multi = isMultiModelActive(provider);
    const models = resolveProviderModels(provider);
    if (models.length === 0) continue;
    for (const model of models) {
      for (const key of provider.keys ?? []) {
        if (!key.enabled) continue;
        if (provider.requiresApiKey && !key.apiKey.trim()) continue;
        slots.push(
          buildSlot(
            provider,
            key.id,
            key.apiKey,
            key.maxRpm,
            key.concurrencyLimit,
            key.interval,
            model,
            multi,
          ),
        );
      }
    }
  }
  return slots;
}

export function healthySlots(
  slots: PoolSlot[],
  breaker: CircuitBreaker,
  now: number,
): PoolSlot[] {
  return slots.filter((slot) => breaker.isHealthy(slot.slotId, now));
}

function buildSlot(
  provider: PoolProvider,
  keyId: string,
  apiKey: string,
  maxRpm: number,
  concurrencyLimit: number,
  interval: number,
  model: string,
  multiModel: boolean,
): PoolSlot {
  const providerConfig: ProviderConfig = {
    preset: 'custom',
    baseUrl: provider.baseUrl,
    apiKey,
    model,
    temperature: provider.temperature,
    maxTokens: provider.maxTokens,
    displayName: provider.displayName,
    requiresApiKey: provider.requiresApiKey,
    requestTimeoutMs: provider.requestTimeoutMs,
    maxRpm,
    maxBatchChars: provider.maxBatchChars,
    maxTextGroupCount: provider.maxTextGroupCount,
    thinkingMode: provider.thinkingMode,
    thinkingEffort: provider.thinkingEffort,
  };
  return {
    providerId: provider.id,
    keyId,
    model,
    slotId: makeSlotId(keyId, model, multiModel),
    providerConfig,
    concurrencyLimit: Math.max(0, concurrencyLimit | 0),
    interval: Math.max(0, interval | 0),
  };
}
```

Import helpers from `@/lib/googleMultiModel`.

- [ ] **Step 4: Run tests — expect PASS**

```bash
npx vitest run lib/__tests__/poolResolver.multiModel.test.ts lib/__tests__/googleMultiModel.test.ts
```

Fix any existing tests that construct `PoolSlot` manually if they break (grep `PoolSlot` / `resolveSlots`).

- [ ] **Step 5: Commit**

```bash
git add lib/poolResolver.ts lib/__tests__/poolResolver.multiModel.test.ts
git commit -m "feat(pool): expand Google multi-model slots in resolveSlots"
```

---

### Task 3: Coordinator dispatch — preferred + round-robin + slotId identity

**Files:**
- Modify: `services/providerPool.ts`
- Modify: `services/__tests__/providerPool.test.ts`
- Possibly: `services/__tests__/providerPool.integration.test.ts`

**Interfaces:**
- Consumes: `PoolSlot.slotId`, `resolveModelStrategy` (via provider on slots’ providerId lookup or store strategy on slot)
- Prefer attaching strategy on slot at resolve time to avoid re-looking up providers:

Optional: add `modelStrategy: GoogleModelStrategy` and `multiModel: boolean` on `PoolSlot` in Task 2 if not already — **add in this task if missing**:

```typescript
// on PoolSlot
modelStrategy: GoogleModelStrategy; // preferred_failover when inactive
```

Set in `buildSlot` from `resolveModelStrategy(provider)`.

- Members map: `Map<slotId, MemberRecord>` (was keyId)
- ServiceFactory second arg: `{ keyId, providerId, slotId, model }`
- Breaker / inFlight / lastDispatchAt / queues: keyed by **`slotId`**
- `tried` set: **`slotId`**
- `getKeyStatus(id)` / `getAllKeyStatuses()`: key by **`slotId`**; include `model`, `slotId` on `KeyStatus`
- `testSpecificKey(keyId)`: find first member whose `slot.keyId === keyId` (primary model first due to expansion order)

**Dispatch algorithm (replace body of `dispatchWithFailover` pick loop):**

1. Compute `healthy = healthySlots(...)`.
2. Build ordered attempt list once per request via pure helper (can live in `lib/googleMultiModel.ts` or `lib/poolDispatchOrder.ts`):

```typescript
/**
 * Order healthy slots for one dispatch attempt chain.
 * - Single strategy round_robin: caller uses cursor; this helper returns healthy as-is (expansion order).
 * - preferred_failover within each provider group: sort by model rank then key order (already expansion order).
 * Mixed pool: partition by providerId (stable), RR pick provider group, then within group apply strategy.
 */
export function orderSlotsForAttempt(
  healthy: PoolSlot[],
  opts: {
    mode: 'initial' | 'list';
    /** For mixed RR across providers: last provider cursor index */
    providerCursor?: number;
  },
): PoolSlot[]
```

**v1 locked algorithm (implement exactly):**

```
function buildAttemptOrder(allSlots: PoolSlot[], healthy: PoolSlot[], cursor: PoolCursor): PoolSlot[] {
  // Group healthy by providerId preserving first-seen provider order from allSlots
  const providerOrder = unique providerIds from allSlots
  const groups = providerOrder.map(pid => healthy.filter(s => s.providerId === pid)).filter(g => g.length)

  // Round-robin starting provider: use cursor over groups.length for which group starts first,
  // then concatenate groups in rotated order.
  // Within each group:
  //   if any slot has multi-model and strategy preferred_failover:
  //     keep group order as resolveSlots order (already model-major × key) — first healthy wins
  //   else:
  //     keep resolveSlots order; cursor will pick across flattened list for pure RR providers
}
```

Simpler **v1 that still satisfies A+C for the common single-Google-provider case** (implement this if mixed-pool complexity blocks):

**For v1 implement:**

1. If **every** healthy slot has `modelStrategy === 'round_robin'` OR no multi-model in healthy set → **existing cursor RR over healthy** (today’s code), but `tried`/`breaker` use `slotId`.
2. If **any** multi-model preferred provider is present:
   - Build attempt order = healthy sorted by: provider order from `this.slots`, then model rank (index in expansion — already order of `this.slots`), then key order.  
   - **Do not** use cursor for first pick: always take first untried in that sorted list.  
   - On failover continue down the list.
3. Pure round_robin multi-model (only Google RR, no preferred): use existing cursor on healthy list (expansion order already model×key).

For **single Google provider preferred**, attempt order of healthy slots is exactly A when both models+keys healthy.

For **single Google provider round_robin**, existing cursor RR is C.

For **mixed pool with preferred Google**: sorting by full `this.slots` order puts Google’s Flash keys before Lite before next provider — that can starve later providers if Google primary always healthy. Spec says inter-provider RR. **Implement inter-provider RR as follows:**

```typescript
// Pseudocode inside dispatchWithFailover
const healthy = healthySlots(this.slots, this.breaker, now);
const byProvider = groupHealthyByProvider(this.slots, healthy); // ordered provider groups with ≥1 healthy
// Rotate groups with a providerCursor (new PoolCursor or reuse with setSlotCount(groups.length))
const start = providerCursor.next() ?? 0;
const rotated = rotate(byProvider, start);

const attemptOrder: PoolSlot[] = [];
for (const group of rotated) {
  const strategy = group[0].modelStrategy; // all slots in group share provider strategy
  if (strategy === 'round_robin') {
    // append group slots in expansion order; outer loop will RR via sequential tried walk
    attemptOrder.push(...group);
  } else {
    // preferred_failover: group already model-major order from resolveSlots
    attemptOrder.push(...group);
  }
}
// Walk attemptOrder sequentially (not cursor-index), skipping tried + optional saturation spread
```

Note: for pure multi-key single-model pools, `modelStrategy` is always `preferred_failover` from helper but `multiModel` is false — **treat non-multi-model groups as today’s key RR**:

```typescript
if (!group.some(s => s.slotId.includes('::'))) {
  // single-model group: use cursor fairness among group slots
}
```

Cleaner: add `multiModel: boolean` on `PoolSlot`.

```typescript
// buildSlot
multiModel,
modelStrategy: resolveModelStrategy(provider),
```

Dispatch:

```typescript
if (!slot.multiModel && group is single-model) {
  // existing key RR behavior for that group
}
```

**Minimal implementation that preserves all existing tests:**

- Change all internal keys from `keyId` → `slotId` where slot identity is needed.
- Keep try-loop structure; replace `tried.has(slot.keyId)` with `tried.has(slot.slotId)`.
- `members.get(slot.slotId)`.
- Factory: `serviceFactory(config, { keyId: slot.keyId, providerId, slotId: slot.slotId, model: slot.model })` — store stubs by `slotId` in tests.
- For pick order when `healthy` contains any `multiModel && preferred_failover`:
  - Build `attemptOrder` as rotated provider groups concatenated (preferred groups unsorted beyond expansion order; RR multi groups same).
  - Walk `attemptOrder` with index instead of `cursor.next()` for those requests.
- Else: existing `cursor.next()` path.

Existing two-key RR tests must remain green — they are single-model so stay on cursor path.

- [ ] **Step 1: Write failing multi-model tests** (append to `providerPool.test.ts`)

```typescript
function googleMultiSettings(strategy: 'preferred_failover' | 'round_robin' = 'preferred_failover'): ExtensionSettings {
  const providers: PoolProvider[] = [
    {
      id: 'g1',
      displayName: 'Google',
      baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
      catalogId: 'google-ai-studio',
      model: 'gemini-2.5-flash',
      models: ['gemini-2.5-flash', 'gemini-2.5-flash-lite'],
      modelStrategy: strategy,
      requiresApiKey: true,
      temperature: 0.3,
      maxTokens: 4096,
      enabled: true,
      keys: [
        { id: 'k1', apiKey: 'sk-1', maxRpm: 0, concurrencyLimit: 0, interval: 0, enabled: true },
        { id: 'k2', apiKey: 'sk-2', maxRpm: 0, concurrencyLimit: 0, interval: 0, enabled: true },
      ],
    },
  ];
  return { ...DEFAULT_SETTINGS, providers };
}

// In beforeEach factory, key stubs by identity.slotId ?? identity.keyId

it('preferred: always uses primary model when healthy (order A)', async () => {
  const coord = new ProviderPoolCoordinator({ serviceFactory: factory, clock: () => clockNow });
  coord.rebuild(googleMultiSettings('preferred_failover'));
  const used: string[] = [];
  for (let i = 0; i < 4; i++) {
    await coord.translate(baseRequest());
    // track which stub model/slot was used via call counts on flash slots only
  }
  const flashK1 = stubs.get('k1::gemini-2.5-flash');
  const flashK2 = stubs.get('k2::gemini-2.5-flash');
  const liteK1 = stubs.get('k1::gemini-2.5-flash-lite');
  expect((flashK1?.callCount ?? 0) + (flashK2?.callCount ?? 0)).toBe(4);
  expect(liteK1?.callCount ?? 0).toBe(0);
});

it('preferred: fails over to lite when flash slots 429', async () => {
  const coord = new ProviderPoolCoordinator({ serviceFactory: factory, clock: () => clockNow });
  coord.rebuild(googleMultiSettings('preferred_failover'));
  setOutcome('k1::gemini-2.5-flash', { kind: 'fail', error: new ApiError('rl', 429) });
  setOutcome('k2::gemini-2.5-flash', { kind: 'fail', error: new ApiError('rl', 429) });
  const result = await coord.translate(baseRequest());
  expect(result.success).toBe(true);
  expect(stubs.get('k1::gemini-2.5-flash-lite')?.callCount ?? stubs.get('k2::gemini-2.5-flash-lite')?.callCount).toBeGreaterThan(0);
  // lite not open
  expect(coord.getKeyStatus('k1::gemini-2.5-flash-lite').open).toBe(false);
  expect(coord.getKeyStatus('k1::gemini-2.5-flash').open).toBe(true);
});

it('round_robin: spreads across models', async () => {
  const coord = new ProviderPoolCoordinator({ serviceFactory: factory, clock: () => clockNow });
  coord.rebuild(googleMultiSettings('round_robin'));
  for (let i = 0; i < 4; i++) await coord.translate(baseRequest());
  const modelsUsed = [...stubs.values()].filter((s) => s.callCount > 0).length;
  expect(modelsUsed).toBeGreaterThanOrEqual(2);
});

it('flash 429 does not open lite slot on same key', async () => {
  const coord = new ProviderPoolCoordinator({ serviceFactory: factory, clock: () => clockNow });
  coord.rebuild(googleMultiSettings('preferred_failover'));
  setOutcome('k1::gemini-2.5-flash', { kind: 'fail', error: new ApiError('rl', 429) });
  setOutcome('k2::gemini-2.5-flash', { kind: 'fail', error: new ApiError('rl', 429) });
  await coord.translate(baseRequest());
  expect(coord.getKeyStatus('k1::gemini-2.5-flash').open).toBe(true);
  expect(coord.getKeyStatus('k1::gemini-2.5-flash-lite').open).toBe(false);
});
```

Update factory in `beforeEach`:

```typescript
factory = vi.fn((config, identity: { keyId: string; providerId: string; slotId?: string }) => {
  const id = identity.slotId ?? identity.keyId;
  const s = makeStub(id, config);
  stubs.set(id, s);
  return s;
});
```

- [ ] **Step 2: Run multi-model tests — expect FAIL**

```bash
npx vitest run services/__tests__/providerPool.test.ts
```

- [ ] **Step 3: Implement coordinator changes**

Critical touch points in `services/providerPool.ts`:

1. `rebuild`: members keyed by `slot.slotId`; factory second arg includes `slotId` + `model`.
2. `KeyStatus` interface:

```typescript
export interface KeyStatus {
  keyId: string;
  slotId: string;
  model: string;
  providerId: string;
  open: boolean;
  openUntil: number;
  credentialInvalid: boolean;
  lastFailureKind?: FailureKind;
  disabled: boolean;
}
```

3. `getAllKeyStatuses`: iterate `this.slots` (and disabled keys for reporting — keep listing keyIds without multi expansion for disabled-only keys as today if needed). For multi-model, emit one status per slot.

4. `dispatchWithFailover`: use `slot.slotId` everywhere instead of `slot.keyId` for tried/breaker/members/throttle/inFlight.

5. Preferred path: when building attempt order for a request, if any healthy slot has `multiModel && modelStrategy === 'preferred_failover'`, walk ordered list (provider-rotated groups, within group expansion order) instead of healthy-cursor RR. Otherwise keep existing cursor RR.

6. `earliestOpenUntil`: use `slot.slotId` for breaker state.

7. `testSpecificKey(keyId)`: `this.slots.find(s => s.keyId === keyId)` → member by that slot’s slotId (first match = primary model).

- [ ] **Step 4: Run full pool tests**

```bash
npx vitest run services/__tests__/providerPool.test.ts services/__tests__/providerPool.integration.test.ts services/__tests__/poolStatusQuery.test.ts
```

Expected: all PASS. Fix status payload types if tests assert shape.

- [ ] **Step 5: Commit**

```bash
git add services/providerPool.ts services/__tests__/providerPool.test.ts lib/poolResolver.ts
git commit -m "feat(pool): preferred and round-robin multi-model dispatch"
```

---

### Task 4: Signature, status payload types, chip aggregation

**Files:**
- Modify: `lib/config.ts` (`computePoolSignature`)
- Modify: `types/messages.ts` (`PoolKeyStatusPayload`)
- Modify: chip helper used by `ProviderKeyRow` / `ProviderEditDrawer` (find `getKeyChipView`)
- Modify tests that snapshot status shape if any

- [ ] **Step 1: Update `computePoolSignature`**

```typescript
const providers = (settings.providers ?? []).map((p) => ({
  id: p.id,
  baseUrl: p.baseUrl,
  model: p.model,
  models: p.models ?? [],
  modelStrategy: p.modelStrategy ?? 'preferred_failover',
  // ...rest unchanged
}));
```

Add a unit assertion in existing config tests if present (`grep computePoolSignature`).

- [ ] **Step 2: Extend `PoolKeyStatusPayload`**

```typescript
export interface PoolKeyStatusPayload {
  keyId: string;
  slotId: string;
  model: string;
  providerId: string;
  open: boolean;
  openUntil: number;
  credentialInvalid: boolean;
  lastFailureKind?: string;
  disabled: boolean;
}
```

- [ ] **Step 3: Aggregate key chip for multi-model**

When statuses are keyed by `slotId`, `liveByKeyId?.[poolKey.id]` breaks. Change options polling consumer to:

```typescript
// statuses: Record<slotId, PoolKeyStatusPayload>
function statusesForKey(statuses: Record<string, PoolKeyStatusPayload>, keyId: string): PoolKeyStatusPayload[] {
  return Object.values(statuses).filter((s) => s.keyId === keyId);
}

function aggregateKeyLive(statuses: PoolKeyStatusPayload[] | undefined, now: number) {
  if (!statuses?.length) return undefined;
  // Prefer any open/cooling or credentialInvalid
  const open = statuses.find((s) => s.open && s.openUntil > now);
  if (open) return open;
  const bad = statuses.find((s) => s.credentialInvalid);
  return bad ?? statuses[0];
}
```

Wire `getKeyChipView` / `usePoolKeyStatuses` consumers accordingly. Optional chip label suffix: model short name when open.

- [ ] **Step 4: Tests + commit**

```bash
npx vitest run lib/__tests__ services/__tests__/poolStatusQuery.test.ts entrypoints/options/hooks/__tests__/usePoolKeyStatuses.test.ts
git add lib/config.ts types/messages.ts entrypoints/options/
git commit -m "feat(pool): multi-model status identity and pool signature"
```

---

### Task 5: Options UI — multi-model list + strategy (Google only)

**Files:**
- Modify: `entrypoints/options/components/ProviderEditDrawer.tsx`
- Modify: `entrypoints/options/hooks/useProviderPoolActions.ts` (normalize on update)
- Modify: `entrypoints/options/components/ProviderRow.tsx` (optional subtitle)
- Create: `entrypoints/options/components/__tests__/GoogleMultiModelFields.test.tsx` **or** extend drawer tests if exist

**UI (Connection / model section, after `ModelPicker`):**

Only when `isGoogleAiStudioProvider(provider)`:

1. Label: **Preferred model** — existing `ModelPicker` sets primary via:

```typescript
onModelChange={(model) => {
  const rest = (provider.models ?? []).filter((m) => m !== model);
  onUpdateProvider(
    normalizeGoogleModels({
      ...provider,
      model,
      models: provider.models && provider.models.length >= 2
        ? [model, ...rest]
        : undefined,
    }),
  );
}}
```

2. **Additional models** list:
   - Show chips for `models.slice(1)` or empty state “Add free-tier models…”
   - Input + Add button (or reuse browse list with “Add as secondary” on click when multi mode)
   - Remove chip button
   - Help text:

> Free-tier Gemini limits are per model (and per project). Extra models let the pool use remaining free quota when the preferred model is rate-limited. Extra API keys on the same project do not increase free limits.

3. **Strategy** `SegmentedControl` when `isMultiModelActive(provider)`:

```typescript
options={[
  { value: 'preferred_failover', label: 'Preferred + failover' },
  { value: 'round_robin', label: 'Round-robin' },
]}
value={provider.modelStrategy ?? 'preferred_failover'}
onChange={(v) => onUpdateProvider({ modelStrategy: v })}
```

4. `onUpdateProvider` path in `useProviderPoolActions` must run `normalizeGoogleModels` on the patched provider before save.

- [ ] **Step 1: Normalize in `updateProvider` patch**

In `useProviderPoolActions` (or settings store update), when applying `Partial<PoolProvider>`:

```typescript
providers: state.providers.map((p) =>
  p.id === providerId ? normalizeGoogleModels({ ...p, ...patch }) : p,
)
```

- [ ] **Step 2: UI wiring in `ProviderEditDrawer`**

Import `isGoogleAiStudioProvider`, `isMultiModelActive`, `normalizeGoogleModels` from `@/lib/googleMultiModel`.

Insert multi-model block after `ModelPicker` (~line 231).

Keep UI minimal: secondary models as removable list + text field “Add model id” + Add; strategy segmented control.

- [ ] **Step 3: ProviderRow optional display**

If `isMultiModelActive(provider)`:

```tsx
· {provider.model} +{provider.models!.length - 1}
```

- [ ] **Step 4: Manual typecheck + unit tests**

```bash
npx vitest run lib/__tests__/googleMultiModel.test.ts
npx tsc --noEmit 2>&1 | head -40
```

- [ ] **Step 5: Commit**

```bash
git add entrypoints/options/components/ProviderEditDrawer.tsx entrypoints/options/hooks/useProviderPoolActions.ts entrypoints/options/components/ProviderRow.tsx
git commit -m "feat(ui): Google AI Studio multi-model pool controls"
```

---

### Task 6: Scientific PDF credential snapshot + regression suite

**Files:**
- Verify: `services/background.ts` `resolveSlots(...)[0]` for scientific PDF (~2384)
- With model-major expansion, `slots[0]` is **primary model + first key** — correct for preferred free-tier. No change required if order is model-major.
- Add a short unit test on `resolveSlots` order already covers this.
- Run broad pool-related tests.

- [ ] **Step 1: Confirm PDF injection uses primary**

Document in commit message: multi-model expansion places preferred model first; scientific PDF `slots[0]` remains primary.

If product later needs pool-aware PDF bridge multi-model, that is out of scope.

- [ ] **Step 2: Full verification**

```bash
npx vitest run lib/__tests__/googleMultiModel.test.ts lib/__tests__/poolResolver.multiModel.test.ts services/__tests__/providerPool.test.ts services/__tests__/providerPool.integration.test.ts services/__tests__/poolStatusQuery.test.ts lib/__tests__/providerPoolHelpers.test.ts
```

Expected: all PASS.

- [ ] **Step 3: Update design spec status**

In `docs/superpowers/specs/2026-07-23-google-ai-studio-multi-model-pool-design.md`:

```markdown
**Status:** Approved — implementation plan `docs/superpowers/plans/2026-07-23-google-ai-studio-multi-model-pool.md`
```

- [ ] **Step 4: Close beads / commit**

```bash
bd close AnyLLMTranslate-xxq --reason="Multi-model Google pool implemented per plan"
git add docs/superpowers/specs/2026-07-23-google-ai-studio-multi-model-pool-design.md
git commit -m "docs: mark Google multi-model pool design approved with plan"
```

(Only close the issue after implementation is actually complete; during plan-only phase leave open and instead create child tasks if desired.)

**During plan execution:** keep `AnyLLMTranslate-xxq` open until all tasks done; then close.

---

## Self-review (plan vs spec)

| Spec requirement | Task |
|------------------|------|
| Google-only multi-model | Task 1 eligibility + Task 2 ignore non-Google |
| preferred_failover default | Task 1 `resolveModelStrategy` + Task 5 UI default |
| round_robin option | Task 3 + Task 5 |
| Order A preferred multi-key | Task 2 expansion model-major × key + Task 3 preferred walk |
| Order C flat RR | Task 3 cursor path for RR |
| slotId composite | Task 1 `makeSlotId` + Task 2–3 |
| Single-model slotId=keyId | Task 2 |
| Breaker isolation per model | Task 3 test flash vs lite |
| Backward compatible | Tasks 2–3 existing tests |
| Other providers unchanged | Task 1–2 + UI gate Task 5 |
| computePoolSignature | Task 4 |
| UI help copy free-tier | Task 5 |
| PDF snapshot primary | Task 6 |
| No hard-coded RPD tables | Global constraints |
| Mixed-pool inter-provider RR | Task 3 rotated provider groups |

**Placeholders:** none intentional.  
**Type consistency:** `GoogleModelStrategy`, `slotId`, `models`, `modelStrategy` names are stable across tasks.

---

## Execution handoff

Plan complete and saved to `docs/superpowers/plans/2026-07-23-google-ai-studio-multi-model-pool.md`.

**Two execution options:**

1. **Subagent-Driven (recommended)** — fresh subagent per task, review between tasks  
2. **Inline Execution** — run tasks in this session with executing-plans checkpoints  

Which approach?
