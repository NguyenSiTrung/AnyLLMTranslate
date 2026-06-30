# Plan: Providers Tab UI/UX Overhaul

**Track ID:** `providers-ux-overhaul_20260630`
**Execution:** Sequential TDD (most changes touch `ProvidersSection.tsx`; parallel execution would
cause file-ownership conflicts). Phase 1 (data model) precedes Phase 5 (status surfacing); Phase 2
(catalog data) precedes Phase 4 Task 2 (placeholder/link UI).

---

## Phase 1: Persisted Test-Status Data Model (A1, D1)
<!-- execution: sequential -->

- [x] Task 1: Add `lastTestResult` field to `PoolKey` & `PoolProvider` types
  - Define type `KeyTestResult = { success: boolean; at: number; latencyMs?: number; error?: string }`.
  - Add optional `lastTestResult?: KeyTestResult` to `PoolKey` and `PoolProvider` in `types/config.ts`.
  - Update `DEFAULT_SETTINGS.providers[0].keys[0]` (no lastTestResult by default).
  - Update `types/__tests__/config.test.ts` (type shape assertion).
  - **Files:** `types/config.ts`, `types/__tests__/config.test.ts`
  - **Done:** type compiles; new field optional; default unaffected.

- [x] Task 2: Migration-tolerant encrypt/decrypt + deep-merge for `lastTestResult`
  - Extend `lib/config.ts` deep-merge to preserve `lastTestResult` across `loadSettings`/`updateSettings`/`onSettingsChange`.
  - Ensure `lastTestResult` is NOT encrypted (it carries no secret) — keep it out of the `encryptPoolKeys`/`decryptPoolKeys` loops.
  - **Files:** `lib/config.ts`, `lib/__tests__/configMigration.pool.test.ts`
  - **Done:** a saved `lastTestResult` round-trips through storage; merge does not drop it.

- [x] Task 3: Pure invalidation helper `invalidateTestResult`
  - New pure helper in `lib/providerReadiness.ts` (or a small `lib/poolTestStatus.ts`) that returns a
    cleared `lastTestResult` when `baseUrl`/`model`/`apiKey` changes. Injectable clock not needed.
  - Comparator: given old + new provider/key, return `true` if the credential fields changed.
  - **Files:** `lib/providerReadiness.ts` (or new `lib/poolTestStatus.ts`), corresponding test file.
  - **Done:** unit tests cover all three change triggers + no-op when unchanged.

- [x] Task: Conductor - User Manual Verification 'Persisted Test-Status Data Model' (Protocol in workflow.md)

---

## Phase 2: Catalog Get-Key Links (A2)
<!-- execution: sequential -->

- [ ] Task 1: Add `getKeyUrl` field to `OpenAiCompatibleCatalogEntry` + populate real URLs
  - Add optional `getKeyUrl?: string` to the interface in `lib/openAiCompatibleCatalog.ts`.
  - Populate per entry: openrouter `https://openrouter.ai/keys`, groq `https://console.groq.com/keys`,
    nvidia-nim `https://build.nvidia.com/models/api-key`, together `https://api.together.xyz/settings/api-keys`,
    fireworks `https://fireworks.ai/api-keys`, mistral `https://console.mistral.ai/api-keys/`.
    Omit for ollama/lm-studio/custom (no key needed).
  - **Files:** `lib/openAiCompatibleCatalog.ts`, `lib/__tests__/openAiCompatibleCatalog.test.ts`
  - **Done:** field present; URLs set for keyed entries; data tests assert presence.

- [ ] Task 2: Add `getKeyUrlForProvider(baseUrl)` helper + tests
  - Pure helper that infers the catalog entry from a base URL and returns its `getKeyUrl` (or undefined).
  - **Files:** `lib/openAiCompatibleCatalog.ts`, `lib/__tests__/openAiCompatibleCatalog.test.ts`
  - **Done:** helper resolves correct URL for known providers; undefined for unknown/keyless.

- [ ] Task: Conductor - User Manual Verification 'Catalog Get-Key Links' (Protocol in workflow.md)

---

## Phase 3: Provider Card Interaction & Visuals (A3, B1, B3)
<!-- execution: sequential -->

- [ ] Task 1: Multi-expand accordion
  - Replace `expandedProviderId: string | null` with `expandedProviderIds: Set<string>` in
    `ProvidersSection.tsx`. Header click toggles membership.
  - Add "Expand all" / "Collapse all" buttons near the `SectionHeader` (show only when providers.length > 1).
  - **Files:** `entrypoints/options/sections/ProvidersSection.tsx`, `entrypoints/options/__tests__/ProvidersSection.test.tsx`
  - **Done:** two cards can be open at once; expand/collapse-all toggles all.

- [ ] Task 2: Remove stacked double hairline border
  - In the expanded panel, remove the redundant inner `border-t border-zinc-800/60` on the
    enabled-toggle row (`ProvidersSection.tsx:275`) — keep one divider under the header.
  - **Files:** `entrypoints/options/sections/ProvidersSection.tsx`
  - **Done:** single clean divider under the provider header.

- [ ] Task 3: Distinct styling for disabled providers in collapsed header
  - When `!provider.enabled`, dim the collapsed header (`opacity-60` / muted server icon) so the
    state reads at a glance (badge `info` variant is too subtle alone).
  - **Files:** `entrypoints/options/sections/ProvidersSection.tsx`
  - **Done:** disabled card visually distinct from enabled; still legible.

- [ ] Task: Conductor - User Manual Verification 'Provider Card Interaction & Visuals' (Protocol in workflow.md)

---

## Phase 4: Key Row & API-Key Field (A5, B2, C1, C3)
<!-- execution: sequential -->

- [ ] Task 1: Remove duplicate API-key reveal control
  - Drop the custom Show/Hide `Button` in `KeyRow` (`ProvidersSection.tsx:665-671`); rely on the
    `Input`'s built-in eye toggle (`Input.tsx:44-53`). Remove the now-unused `revealed` state.
  - **Files:** `entrypoints/options/sections/ProvidersSection.tsx`, `entrypoints/options/__tests__/ProvidersSection.test.tsx`
  - **Done:** single reveal control (Input eye); show/hide still toggles masking.

- [ ] Task 2: Hide key field when `requiresApiKey=false` + catalog placeholder
  - In `KeyRow`, render a disabled "No key required for this provider" note instead of the key
    `FieldGroup` when `!provider.requiresApiKey`.
  - When the field IS shown, drive the placeholder from the catalog entry's `placeholder`
    (via `getCatalogEntryById(catalogId)?.placeholder`) instead of hardcoded `sk-...`.
  - When keyed, render a "Get a key ↗" external link inside the key `FieldGroup` using
    `getKeyUrlForProvider(provider.baseUrl)` (Phase 2 Task 2).
  - **Files:** `entrypoints/options/sections/ProvidersSection.tsx`, `entrypoints/options/__tests__/ProvidersSection.test.tsx`
  - **Done:** Ollama shows "No key required"; OpenRouter shows its placeholder + get-key link.

- [ ] Task 3: Inline reason hint under disabled key Test button
  - When the key Test button is disabled (`!canTest`), show a hint line ("Enter an API key to test
    this key") mirroring the provider-level hint at `ProvidersSection.tsx:586-590`.
  - **Files:** `entrypoints/options/sections/ProvidersSection.tsx`
  - **Done:** disabled Test explains why; keyless providers don't show the hint.

- [ ] Task 4: Scroll newly added key into view
  - After `addKey`, scroll the new `KeyRow` into view (ref + `scrollIntoView({ block: 'nearest' })`).
  - **Files:** `entrypoints/options/sections/ProvidersSection.tsx`
  - **Done:** clicking "+ Add key" brings the new row into view.

- [ ] Task: Conductor - User Manual Verification 'Key Row & API-Key Field' (Protocol in workflow.md)

---

## Phase 5: Test-Status Surfacing & Bulk Test (A1 UI, A4)
<!-- execution: sequential -->
<!-- depends: phase1 -->

- [ ] Task 1: Write `lastTestResult` after each test run
  - In `KeyRow.handleTest` and `ProviderConnectionTest.handleTest`, after `runTest` resolves, write
    `{ success, at: Date.now(), latencyMs, error }` to the key/provider via `onUpdate`/`updateProviderFields`.
  - Wire Phase 1 Task 3 invalidation: `updateKey`/`updateProviderFields` clear `lastTestResult` when
    credential fields change.
  - **Files:** `entrypoints/options/sections/ProvidersSection.tsx`, `entrypoints/options/__tests__/ProvidersSection.test.tsx`
  - **Done:** test result persists across collapse/navigate; editing fields clears it.

- [ ] Task 2: Render status dot + tooltip in collapsed provider header
  - In the collapsed header, show a status dot/cluster derived from the provider's `lastTestResult`
    (and/or its keys' results): green ✓ (latency/age), red ✗, grey untested. Tooltip with age.
  - **Files:** `entrypoints/options/sections/ProvidersSection.tsx`, `entrypoints/options/__tests__/ProvidersSection.test.tsx`
  - **Done:** collapsed card shows verifiable status; tooltip shows when/latency.

- [ ] Task 3: "Test all keys" banner action
  - Add a button in the readiness banner; on click, iterate enabled (provider, key) pairs
    sequentially (await each), respecting per-key RPM via the existing limiter semantics, writing
    each result (FR-1) and aggregating N/M healthy. Toast the aggregate.
  - **Files:** `entrypoints/options/sections/ProvidersSection.tsx`, `entrypoints/options/__tests__/ProvidersSection.test.tsx`
  - **Done:** one click tests the whole pool; aggregate shown; results persist.

- [ ] Task: Conductor - User Manual Verification 'Test-Status Surfacing & Bulk Test' (Protocol in workflow.md)

---

## Phase 6: Readiness Banner, Empty State & System Prompt (B4, B5, C2, C5)
<!-- execution: sequential -->

- [ ] Task 1: Relabel System Prompt editor + swap title icon
  - Change card title to "Global System Prompt (advanced)"; replace `RotateCcw` title icon with
    `FileText`. Keep the per-card "Reset to Default" button's `RotateCcw` (that action is correct).
  - **Files:** `entrypoints/options/sections/ProvidersSection.tsx`
  - **Done:** title/icon no longer imply a reset action.

- [ ] Task 2: Replace inline empty card with `EmptyState` primitive + inline CTA
  - Swap the `providers.length === 0` amber card (`ProvidersSection.tsx:235-246`) for the
    `ui/EmptyState.tsx` primitive with an inline primary "Add provider" action (opens the modal).
  - **Files:** `entrypoints/options/sections/ProvidersSection.tsx`, `entrypoints/options/__tests__/ProvidersSection.test.tsx`
  - **Done:** empty state is centered, action-inline; still test-asserted.

- [ ] Task 3: Max RPM cap hint + banner "Next:" microcopy
  - Add helper text to the Max RPM field ("Cap is 600 RPM; 0 = unlimited").
  - Refactor the readiness banner "Next: {action}" line: drop the prefix or convert actionable
    `recoveryMessage.action` into a real CTA button where applicable.
  - **Files:** `entrypoints/options/sections/ProvidersSection.tsx`, `entrypoints/options/__tests__/ProvidersSection.test.tsx`
  - **Done:** cap is surfaced; banner copy reads naturally.

- [ ] Task: Conductor - User Manual Verification 'Readiness Banner, Empty State & System Prompt' (Protocol in workflow.md)

---

## Phase 7: Accessibility & Final Polish (C4, D2, D3, D4)
<!-- execution: sequential -->

- [ ] Task 1: Provider header/panel ARIA pairing
  - Add `id` to the expanded panel, `aria-controls={id}` on the header button, `role="region"` +
    `aria-labelledby` on the panel (currently only `aria-expanded` exists).
  - **Files:** `entrypoints/options/sections/ProvidersSection.tsx`, `entrypoints/options/__tests__/ProvidersSection.test.tsx`
  - **Done:** screen readers pair header ↔ panel; axe-clean.

- [ ] Task 2: Key-count cluster + AddProviderModal relabel + banner CTA alignment
  - Render the collapsed-header key count as a small icon+badge cluster for scannability.
  - In `AddProviderModal`, drop the dual "Close"/"Close" footer; use a single dismiss affordance
    (or a dedicated layout without confirm/cancel).
  - Align banner "Open setup guide" prominence with the "Add provider from catalog" CTA when not ready.
  - **Files:** `entrypoints/options/sections/ProvidersSection.tsx`
  - **Done:** modal is unambiguous; CTAs coherent; key count scannable.

- [ ] Task: Conductor - User Manual Verification 'Accessibility & Final Polish' (Protocol in workflow.md)

---

## Phase 8: Final Verification
<!-- execution: sequential -->
<!-- depends: phase1, phase2, phase3, phase4, phase5, phase6, phase7 -->

- [ ] Task 1: Full quality gates — `pnpm test` + `pnpm lint` + build green
  - Run the complete suite; resolve any regressions; confirm no TypeScript errors.
  - **Files:** (verification only)
  - **Done:** all tests pass; lint clean; `pnpm build` succeeds.

- [ ] Task: Conductor - User Manual Verification 'Final Verification' (Protocol in workflow.md)
