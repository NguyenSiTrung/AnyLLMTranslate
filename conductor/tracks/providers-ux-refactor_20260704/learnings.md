# Track Learnings: providers-ux-refactor_20260704

Patterns, gotchas, and context discovered during implementation.

## Codebase Patterns (Inherited)

Seeded from `providers-ux-overhaul_20260630` (the predecessor — resolved 13 *different* findings) and `conductor/patterns.md`.

### The Providers tab surface — the heart of this track
- **`ProvidersSection.tsx` (1001 lines)** is the largest section file in the app (vs 89–654 for every other section). Contains: pool readiness banner, empty state, `providers.map(...)` collapsible cards, the global System Prompt editor, `KeyRow` (per-key UI), `ProviderConnectionTest`, `AddProviderModal`, `useConnectionTest` hook, helpers (`buildProviderConfig`, `getCredentialKey`, `canRunConnectionTest`, `getProviderTestStatus`), and exported helpers `countEnabledKeys` / `getPoolReadiness`.
- **FR-1 splits it** into: `hooks/useConnectionTest.ts`, `components/ProviderTestResult.tsx` (dedupes failure/success UI), `components/ProviderConnectionTest.tsx`, `components/ProviderKeyRow.tsx`, `components/ProviderCard.tsx`, `components/AddProviderModal.tsx`. `ProvidersSection.tsx` becomes orchestrator only.
- **Public API invariant (NFR-2):** `ProvidersSection` default export prop signature MUST stay `(props?: { onOpenSetup?; getKeyStatus? }) => JSX`. `countEnabledKeys` + `getPoolReadiness` MUST stay re-exported from `ProvidersSection.tsx` (popup imports them).
- **`useConnectionTest`** stores results in `useState` (`testProgress`, `testResult`) but ALSO writes `lastTestResult` back to the pool via `onUpdate`/`onTestComplete` callbacks — so test state IS persisted across collapse/reload (predecessor shipped this).
- **`getCredentialKey(provider)` / `canRunConnectionTest(provider, key)`** are the existing gate predicates for the provider-level test — reuse in the parallel bulk test (FR-8) to filter runnable slots.

### Header anatomy (FR-2/3/4 change this)
- **Current collapsed header** (`ProvidersSection.tsx:370-408`): single `<button>` row containing `Server` icon → displayName → on/off `Badge` → key-count chip (`KeyRound` + N) → `w-2 h-2` test-status dot → chevron.
- **FR-4 two-zone layout:** Left = identity badge (FR-2) + name + status badge (FR-3); Right = key-count chip + chevron. **Drop the on/off Badge** — body toggle text already says enabled/disabled, and `opacity-60` on disabled is the stronger signal.
- **Test status dot** (`ProvidersSection.tsx:392-405`) currently renders as a 2×2 px colored circle with only `title` text. FR-3 replaces it with a real `<Badge>` carrying icon + label + age.

### Catalog data (FR-2, FR-7 extend it)
- **`OPENAI_COMPATIBLE_CATALOG`** in `lib/openAiCompatibleCatalog.ts` (9 entries: openrouter, nvidia-nim, groq, together, fireworks, mistral, ollama, lm-studio, custom).
- **FR-2 adds:** optional `accent: AccentColor` + `monogram: string` per entry. Accent must be one of `SectionHeader`'s union: `'blue' | 'pink' | 'emerald' | 'amber' | 'zinc' | 'teal' | 'cyan' | 'orange'`.
- **FR-7 adds:** `category: 'cloud' | 'local' | 'custom'` per entry. Cloud = openrouter/nvidia/groq/together/fireworks/mistral; Local = ollama/lm-studio; Custom = custom.
- **Catalog `id` is NOT persisted** into `ProviderPreset` (preset stays `'custom'`) — but `PoolProvider.catalogId` IS persisted. `inferCatalogId(baseUrl)` resolves when unset.
- **`accent`/`monogram`/`category` are also NOT persisted in storage** — they're catalog metadata looked up at render time via `getCatalogEntryById(provider.catalogId ?? inferCatalogId(provider.baseUrl))`. No `extractSettings()` change needed (unlike the predecessor which added `lastTestResult`).

### Token pattern (NFR-4 — MUST follow)
- **Existing colored-surface pattern** (from readiness banner `ProvidersSection.tsx:317` and `SectionHeader`): `bg-X-600/15 border-X-500/20 text-X-400` for the 8×8 icon container. The new `ProviderIdentityBadge` MUST reuse this exact opacity triplet.
- **Pre-existing drift in inner boxes** (`border-zinc-700/60`, `/40`, `bg-zinc-900/30`, `bg-zinc-800/30`, `/50`) — DO NOT add more ad-hoc opacities. FR-1's extraction is an opportunity to consolidate where touched, but don't refactor untouched surfaces.

### Settings plumbing (predecessor confirmed — RECAP)
- Adding a *persisted* nested field requires updating **`extractSettings()` in `stores/settingsStore.ts`**. **This track adds NO persisted fields** (accent/monogram/category are catalog metadata; lastTestResult already shipped) — so `extractSettings()` / `DEFAULT_SETTINGS` need no changes.
- **`deepMerge`** applies at `loadSettings()`, `updateSettings()`, AND `chrome.storage.onChanged` (`lib/config.ts`).
- **`initStorageSync` masking (`'***'`)** at `settingsStore.ts:92` strips `providers[].keys[].apiKey` on cross-context change then async-reloads to decrypt. Local input state in `useDeferredCommit` (FR-10) is unaffected — it's component-local, never written through the store until blur.

### Debounce (FR-10) — the commit-on-blur invariant
- **Existing precedent:** `maxRpm` in `KeyRow` (`ProvidersSection.tsx:794, 820-824`) already uses local `maxRpmDraft` state + `commitMaxRpm()` on blur. **FR-10 generalizes this** via `useDeferredCommit(initial, onCommit)` hook.
- **NFR-5 — blur-before-unmount:** React fires `onBlur` before unmount in normal navigation. Verify with a test: render input, type, simulate tab switch (`unmount`), assert no commit lost (or assert commit DID fire — design decision in `useDeferredCommit`).
- **Existing pattern note (from `cache-settings-ui_20260416`):** "useEffect syncs local state with settings store to handle reset/import scenarios." `useDeferredCommit` must do the same — when the upstream `initial` changes (e.g. reset to defaults), update local state.

### Parallel bulk test (FR-8)
- **Current `handleTestAll`** (`ProvidersSection.tsx:221-274`) is sequential `for...of` with one global spinner. Builds `slots: {providerId, keyId, config}[]`, awaits `testConnection` per slot, then batch-writes results.
- **FR-8 rewrite** uses pure `runWithConcurrency(items, worker, cap=4)` helper. Each worker resolves to a `KeyTestResult`; commit each result to its key's `lastTestResult` AS IT ARRIVES (not batched) so `KeyRow` re-renders live.
- **Predecessor learning:** `vi.advanceTimersByTimeAsync()` (not `vi.advanceTimersByTime()`) when concurrent async code creates new timers during the advance. The concurrency helper's `delay()` must be fake-timer-friendly.

### Modal/test patterns
- **`AddProviderModal` abuse of Modal `message` prop** (`ProvidersSection.tsx:940-976`) — currently stuffs JSX list into a string field. FR-7 rebuild uses a proper children slot. Check `ui/Modal.tsx` signature: it likely accepts `children` or `message` — prefer `children`.
- **Destructive-action pattern (from `settings-ux-audit_20260506`):** `pendingDeleteId` state + Modal confirmation — already in place for provider removal; don't touch.
- **Test file:** `entrypoints/options/__tests__/ProvidersSection.test.tsx` (~384+ lines) is the comprehensive UI test — extend for every behavioral change.

### A11y (NFR-3)
- Existing accordion uses `aria-expanded` / `aria-controls` / `role="region"` / `aria-labelledby` (`ProvidersSection.tsx:379-415`). New disclosure (FR-5) and change-template button (FR-6) MUST follow the same pattern.
- Test-status dot currently has `aria-label` with age — FR-3's Badge must preserve this (or move to visible text, which is better).

---

<!-- Learnings from implementation will be appended below -->
