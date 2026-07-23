# Google AI Studio Multi-Model Pool — Design Spec

**Issue:** AnyLLMTranslate-xxq  
**Date:** 2026-07-23  
**Status:** Approved — implementation plan `docs/superpowers/plans/2026-07-23-google-ai-studio-multi-model-pool.md`  

**Scope:** Provider pool + Options → Providers (Google AI Studio only)

## Problem

Google AI Studio (Gemini API) free-tier rate limits are **per model** (and **per project**, not per API key):

- RPM / TPM / RPD apply separately to each model id
- Using only `gemini-2.5-flash` leaves free capacity on sibling models (e.g. Flash-Lite) unused
- Adding more API keys on the **same Google Cloud project does not multiply free quota**

The existing multi-provider pool can approximate multi-model by adding several Google AI Studio provider entries with different `model` values, but:

1. UX is clunky (duplicate base URL, keys, cards)
2. Circuit-breaker identity is per `PoolKey.id` only — fine when each model is a separate provider+key row, but wrong if one key later owns many models without composite slot identity
3. There is no first-class **preferred model + failover to free siblings** strategy

Users who rely on free tier for web/subtitle/PDF translation burn one model’s RPD while other free models sit idle.

## Goals

1. **Google AI Studio only:** a single pool provider can list **multiple models** and use them together for free-tier capacity stacking.
2. **Two strategies:**
   - **`preferred_failover` (default):** quality-first; use preferred model whenever healthy; fail over to ordered alternatives on 429 / cooling / open breaker.
   - **`round_robin`:** throughput-first; treat all healthy `(key × model)` slots equally.
3. **Correct slot identity:** circuit breaker, per-key throttle state, and concurrency must be scoped so one model’s rate limit does **not** cool other models on the same key.
4. **Backward compatible:** existing single-model providers (all catalogs) keep working with no settings migration required.
5. **Other providers unchanged:** OpenRouter, Groq, Ollama, custom, etc. keep a single `model` field and current slot expansion.

## Non-goals

- Multi-model lists for non–Google AI Studio providers
- Hard-coded free-tier RPM/RPD tables (Google changes them; rely on live 429 + breaker)
- Automatic multi-project key farming or ToS-hostile free-tier abuse automation
- Quality-tier routing (e.g. short text → Pro, bulk → Lite) — future work
- Changing global batch budgets algorithm beyond existing tightest-positive rules
- Midnight-PT RPD hold as a hard requirement in v1 (nice-to-have follow-up if error payloads allow reliable detection)

## Decisions (locked)

| Decision | Choice |
|----------|--------|
| Provider scope | **Google AI Studio only** (`catalogId === 'google-ai-studio'` and/or Gemini OpenAI-compat base URL) |
| Strategies | **`preferred_failover` + `round_robin`** |
| Default strategy | **`preferred_failover`** |
| Preferred multi-key order | **A — preferred model across keys first** |
| Round-robin multi-key order | **C — flat equal slots among all healthy `(key × model)`** |
| Backward compat | Single `model` remains canonical primary; `models[]` optional |
| Other providers | No schema UI / no multi-model expansion |

### Preferred order (A)

Given models `[Flash, Lite]` and keys `[K1, K2]`, healthy try order:

```text
Flash+K1 → Flash+K2 → Lite+K1 → Lite+K2
```

Quality-first: exhaust preferred model across all keys before secondary models.

### Round-robin order (C)

All healthy slots participate equally in the existing healthy-subset cursor, e.g. stable expansion order:

```text
Flash+K1, Flash+K2, Lite+K1, Lite+K2
```

(or key-major expansion if implementation prefers; must be stable and documented in tests). Failover still skips open slots.

**Implementation preference for expansion order (locked):**

1. Model order as configured (primary first)
2. Within each model, key insertion order

That yields the preferred list above and a deterministic round-robin sequence.

## Design

### 1. Data model (`types/config.ts`)

Extend `PoolProvider` with optional fields (ignored for non-Google providers):

```ts
/** Multi-model rotation for Google AI Studio free-tier stacking only. */
export type GoogleModelStrategy = 'preferred_failover' | 'round_robin';

export interface PoolProvider {
  // ...existing fields...
  /**
   * Model id used as primary / display model. Always kept in sync with
   * models[0] when models is non-empty for Google AI Studio multi-model.
   */
  model: string;

  /**
   * Optional ordered model list (Google AI Studio only).
   * - Absent / empty / single entry → current single-model behavior.
   * - Length ≥ 2 → multi-model slots (preferred first).
   * models[0] MUST equal `model` when multi-model is active.
   */
  models?: string[];

  /**
   * How to pick among multi-model slots. Default: preferred_failover.
   * Only meaningful when models has length ≥ 2 on Google AI Studio.
   */
  modelStrategy?: GoogleModelStrategy;
}
```

**Invariants**

- `model` is never empty when the provider is usable (unchanged readiness rules).
- When saving multi-model: `models = unique non-empty trimmed ids`, `model = models[0]`.
- When user changes primary model in UI: rewrite `models[0]` and keep remaining order.
- When user removes multi-model (back to one): clear `models` or set to `[model]`; strategy may remain stored but is inactive.

**Migration**

- No storage migration job. Missing fields ⇒ single-model path.
- Load-time normalize (optional pure helper): if `models` present with length ≥ 1, ensure `model === models[0]` after dedupe.

### 2. Eligibility: when multi-model applies

A pure helper (e.g. `lib/googleMultiModel.ts`):

```ts
function isGoogleAiStudioProvider(provider: PoolProvider): boolean
function resolveProviderModels(provider: PoolProvider): string[]
function isMultiModelActive(provider: PoolProvider): boolean
```

**`isGoogleAiStudioProvider`**

True when any of:

1. `provider.catalogId === 'google-ai-studio'`
2. `isGeminiOpenAiCompatBaseUrl(provider.baseUrl)` (existing `lib/thinkingMode.ts` helper)

**`resolveProviderModels`**

- If multi-model eligible and `models?.length ≥ 1`: deduped ordered list
- Else: `[provider.model]` if model non-empty, else `[]`

**`isMultiModelActive`**

- Eligible + `resolveProviderModels(...).length ≥ 2`

Non-eligible providers **always** resolve to a single model even if a buggy UI wrote `models[]`.

### 3. Slot expansion (`lib/poolResolver.ts`)

Today:

```text
enabled provider × enabled key → PoolSlot (keyId identity)
```

Multi-model Google:

```text
enabled provider × model (ordered) × enabled key → PoolSlot
```

**`PoolSlot` extensions**

```ts
export interface PoolSlot {
  providerId: string;
  keyId: string;
  /** Model id for this slot (from provider.model or multi-model expansion). */
  model: string;
  /**
   * Stable rotation / breaker identity.
   * Single-model: keyId (backward compatible with existing breaker state).
   * Multi-model: `${keyId}::${model}`
   */
  slotId: string;
  providerConfig: ProviderConfig; // model field set to this slot's model
  concurrencyLimit: number;
  interval: number;
}
```

**Identity rules**

| Case | `slotId` |
|------|----------|
| Single model (all providers) | `keyId` — **preserve existing breaker continuity** |
| Google multi-model (`models.length ≥ 2`) | `` `${keyId}::${model}` `` |

Member map and breaker keys switch from raw `keyId` to `slotId` for multi-model; single-model keeps `keyId` so live cooldowns are not reset for users not on multi-model.

**`providerConfig.model`** must be the slot’s model so `OpenAICompatibleService` requests the correct model.

**Throttle / concurrency**

- Per-slot: `inFlight`, queues, `lastDispatchAt`, and breaker all key by `slotId`.
- Rationale: free-tier limits are per model; saturating Flash should not block Lite concurrency accounting on the same API key string.
- User-facing rate-limit fields remain on `PoolKey` and are **copied** onto each model slot for that key (same maxRpm/concurrency/interval values applied independently per slot). Document this in UI help: “Limits apply per key×model slot when multi-model is on.”

### 4. Dispatch strategies (`services/providerPool.ts`)

Both strategies reuse healthy-slot filtering + existing 429 failover. Difference is **initial pick + walk order**.

#### 4.1 Shared

1. Build healthy slots via breaker on `slotId`.
2. If none → `PoolExhaustedError` (unchanged).
3. On thrown `ApiError` rate-limit/server/network → open breaker for that `slotId`, try next in strategy order without reusing tried slots.
4. Auth 401/403 → long-open that slot; continue failover.
5. Content/parse `{success:false}` without throw → no multi-slot failover (unchanged semantics).

#### 4.2 `preferred_failover` (default)

When building try order for a request:

1. Group by model priority index (0 = primary).
2. Within each model, preserve key order from expansion.
3. Pick first healthy untried slot in that list (no round-robin cursor for model choice).
4. Optional optimization (recommended): if primary model has any healthy slot, never start on secondary for the **first** attempt of a request.

Cursor: for preferred mode, do **not** advance a global RR cursor across models. Optional key-level fairness within the same model rank may use a small per-`(providerId, model)` cursor; v1 may simply always prefer first healthy key in insertion order for simplicity (document as known limitation; keys still fail over).

**v1 simplicity (locked):** within a model rank, try keys in stable insertion order every time. Fairness across keys at the same model rank can be a follow-up.

#### 4.3 `round_robin`

1. Healthy multi-model slots form one flat list (expansion order).
2. Existing `PoolCursor` advances over healthy subset (current FR-3 behavior).
3. Failover walks remaining healthy slots without revisit.

Non-Google / single-model pools keep today’s pure key round-robin (unchanged).

#### 4.4 Mixed pool

If the global pool contains Google multi-model providers **and** other providers:

- Expansion still flattens everything into one slot list.
- **Strategy is per Google provider** when choosing among that provider’s model slots.
- Cross-provider ordering remains provider insertion order × (model × key for Google multi-model).

Example providers order `[Google(Flash,Lite), Groq]`:

- Preferred Google: Flash keys, then Lite keys, then Groq keys (as subsequent providers).
- For a pure Google-only pool, only Google slots exist.

When the coordinator currently round-robins **across providers**, multi-model preferred mode must not starve other providers forever if Google primary is always healthy. **Locked rule for mixed pools:**

- Treat each **top-level provider entry** as today for cross-provider rotation when `modelStrategy === 'round_robin'` or when multi-model is inactive.
- For `preferred_failover` Google multi-model: among slots belonging to that Google provider, apply preferred model order; when the pool has multiple provider entries, keep existing inter-provider round-robin over **provider groups**, and within the Google group apply preferred model order.

**Clarified algorithm (mixed pool):**

1. Partition healthy slots by `providerId` (provider insertion order).
2. Round-robin pick the next **provider group** that has ≥1 healthy slot (existing fairness across providers).
3. Within the chosen Google multi-model group:
   - preferred: ordered model ranks then keys
   - round_robin: cursor within that group’s slots
4. Within a non-Google / single-model group: current key RR / single slot.

If only one Google multi-model provider is enabled (common free-tier case), this reduces to pure preferred or pure RR as above.

### 5. UI (Options → Providers)

Show multi-model controls **only** when `isGoogleAiStudioProvider(provider)`.

#### Placement

On Google AI Studio provider edit card / model section (near existing model picker):

1. **Primary model** — existing model field / listing picker (unchanged entry point).
2. **Additional free-tier models** (optional multi-select or “Add model” list).
3. **Model strategy** segmented control — visible only when ≥2 models configured:
   - **Preferred + failover** (default)
   - **Round-robin**
4. Short help copy:

> Free-tier Gemini limits are per model (and per project). Extra models let the pool use remaining free quota when the preferred model is rate-limited. Extra API keys on the same project do not increase free limits.

#### Interactions

- Add model from model listing (same listing API as today); reject duplicates.
- Reorder secondary models (drag or up/down); primary is always index 0 — changing primary is “set as preferred” action.
- Remove secondary model; if one left, multi-model UI collapses strategy control.
- Suggested chips (non-binding): e.g. add `gemini-2.5-flash-lite` when primary is Flash — optional nicety, not required for v1.

#### Status display

Pool key status / cooling badges should eventually show **model** when multi-model is active (e.g. `Flash cooling`). Minimum v1: status map keys use `slotId`; UI can show `label · model` if available. If status UI still keys only by `keyId`, expand to list slots under each key for Google multi-model.

### 6. Cache & batching

| Area | Behavior |
|------|----------|
| Web cache model scope | Unchanged: when `cacheKeyIncludesModel`, cache key uses the **slot model that served the request**. Different models do not share positive cache entries (correctness). |
| Batch budgets | Still tightest positive across enabled providers; multi-model does not invent per-model batch budgets in v1. |
| Thinking mode | Existing per-request Gemini thinking mapping uses the slot’s model id (already model-aware helpers). |

### 7. Connection test

- Provider-level test: try primary model (or first healthy preferred slot) — same as today for single model.
- Optional v1.1: “Test all models” — not required for v1.
- Per-key test: uses primary model unless testing a specific slot later.

### 8. Scientific PDF / TTS / other consumers

All go through `ProviderPoolCoordinator` / resolved pool credentials. Multi-model automatically applies when those paths call `translate` / stream / classify via the pool. No separate credential UI.

PDF bridge job injection today may snapshot a single baseUrl/apiKey/model — **verify at implementation time**. If bridge injects one model for the whole job, preferred mode should inject **primary model** for the job credential snapshot unless the bridge already re-enters the pool per request. Document findings in plan; do not break bridge.

### 9. Testing

| Layer | Cases |
|-------|-------|
| Pure helpers | eligibility, resolve models, dedupe, sync `model` ↔ `models[0]`, non-Google ignores `models` |
| `resolveSlots` | single-model slotId=`keyId`; multi-model expands model×key; disabled model N/A; empty key skip |
| Preferred dispatch | always primary when healthy; failover to secondary on 429; primary recovery; multi-key order A |
| Round-robin dispatch | spreads across models; skips open slots |
| Mixed pool | inter-provider RR + preferred within Google group |
| Breaker isolation | Flash 429 does not open Lite slot on same key |
| Backward compat | existing pool fixtures / tests still pass without `models` |
| UI (if tested) | strategy control hidden for non-Google and single-model |

### 10. Rollout

1. Types + pure helpers + resolver + coordinator strategy (tests first)
2. Settings normalize on load/save
3. Google-only UI
4. Status display polish
5. Manual free-tier smoke: Flash primary + Lite secondary, force RPM, observe failover

## Alternatives considered

| Approach | Why not chosen |
|----------|----------------|
| Document multi-provider workaround only | Works but poor UX; no preferred strategy |
| Multi-model for all catalogs | Most providers lack independent free per-model buckets; quality/UX risk without benefit |
| Round-robin only | Maximizes free RPD but mixed quality; preferred must be default for translation product |
| Key-first preferred (B) | Exhausts one key’s models before others; worse when primary is healthy on key2 |
| Hard-coded free RPM presets per model | Drift; Google rate limit page is dynamic |

## Risks & mitigations

| Risk | Mitigation |
|------|------------|
| Quality mix on same page | Default preferred_failover |
| Breaker wrongly cools whole key | Composite `slotId` when multi-model active |
| Status UI still keyed by keyId | Expand status by slotId |
| PDF bridge single-model snapshot | Verify; inject primary or per-request pool |
| Users expect multi-key free multiplier | Help copy: per project, not per key |
| Daily RPD flapping (60–300s cooldown) | Follow-up: longer open on daily-limit 429 if detectable |

## Success criteria

1. Google AI Studio provider can configure ≥2 models and choose strategy; default preferred_failover.
2. Non-Google providers show no multi-model UI and resolve exactly one model slot per key.
3. With preferred mode, translations use primary model until it is open/429; then secondary serves.
4. Flash rate-limit does not prevent Lite on same API key from being selected.
5. Existing single-model pool tests remain green; new unit tests cover A+C ordering.
6. Free-tier user can complete more page translation work per day than single-model with the same project (manual validation).

## Open follow-ups (out of v1)

- Detect RPD exhaustion and hold until midnight PT
- Per-model rate-limit overrides
- “Test all models” bulk action
- Suggested free-tier model pairs chip
- Quality-tier routing by text length
- Fair RR among keys within the same preferred model rank
