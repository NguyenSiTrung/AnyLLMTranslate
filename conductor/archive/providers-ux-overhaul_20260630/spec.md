# Spec: Providers Tab UI/UX Overhaul

**Track ID:** `providers-ux-overhaul_20260630`
**Type:** Feature (UI/UX improvement)
**Priority:** 🟠 High
**Created:** 2026-06-30

---

## Overview

The **Providers** tab (`entrypoints/options/sections/ProvidersSection.tsx`) is the primary
onboarding and trust surface for configuring LLM providers and API keys. A deep UI/UX analysis
identified 13 gaps across interaction model, layout, and microcopy. This track resolves all 13,
prioritizing (1) **durable connection-test status** so a verified provider stays verified across
collapse/navigation, and (2) **reduced onboarding friction** so a user picking "Groq" or "Together
AI" is one click from obtaining a key.

The work is UI-layered but touches the pool data model (`types/config.ts`), catalog data
(`lib/openAiCompatibleCatalog.ts`), and shared UI primitives. Background dispatch/failover logic is
out of scope.

---

## Functional Requirements

### FR-1 — Persisted connection-test status (A1, D1)
- Store the most-recent test outcome on the pool model so it **survives card collapse, tab
  navigation, popup round-trips, and extension reload**.
- Fields per key/provider: `{ success: boolean; at: number; latencyMs?: number; error?: string }`.
- **Invalidation:** editing `baseUrl`, `model`, or the key's `apiKey` must clear the stored result
  so a stale "✓ verified" cannot lie (mirrors `connectionStatus: 'unknown'` reset in SetupWizard).

### FR-2 — Catalog "Get API key" links (A2)
- Keyed catalog entries expose a signup/keys URL (`getKeyUrl`).
- The key `FieldGroup` renders a "Get a key ↗" external link when the selected catalog entry has one.

### FR-3 — Multi-expand accordion (A3)
- Replace the single `expandedProviderId: string | null` with a set; multiple provider cards may be
  open simultaneously. Provide expand-all / collapse-all controls.

### FR-4 — Bulk "Test all keys" (A4)
- A banner action tests all enabled keys sequentially, respecting per-key RPM, and aggregates the
  result ("5/6 healthy"). Reuses FR-1 storage.

### FR-5 — Key-field context (A5, B2)
- Single API-key reveal control (remove the duplicate — rely on `Input`'s built-in eye toggle).
- Hide the key `FieldGroup` (or render a disabled "No key required for this provider" note) when
  `provider.requiresApiKey === false` (Ollama, LM Studio, Custom).
- Drive the key input placeholder from the catalog entry's `placeholder` instead of hardcoded
  `sk-...`.

### FR-6 — Card visuals (B1, B3)
- Remove the stacked double hairline border at the top of expanded cards.
- Disabled providers must read as disabled at a glance in the collapsed header (dim / distinct icon).

### FR-7 — Prompt editor, empty state, microcopy (B4, B5, C2, C5)
- Relabel the global System Prompt card to "Global System Prompt (advanced)" and swap the misleading
  `RotateCcw` title icon for a neutral one (`FileText`). Keep location under Providers.
- Replace the inline amber empty card with the `ui/EmptyState.tsx` primitive + inline primary CTA.
- Surface the 600 RPM cap as helper text on the Max RPM field; clarify the "Next:" banner microcopy.

### FR-8 — Interaction & accessibility (C1, C3, C4, D2, D3, D4)
- Inline reason hint under a disabled key-row Test button ("Enter an API key to test this key").
- Scroll a newly added key into view.
- `aria-controls` + `role="region"` + `aria-labelledby` pairing on the provider header/panel.
- Key-count icon cluster; `AddProviderModal` relabel (drop the dual "Close"); banner CTA alignment.

---

## Non-Functional Requirements

- **No regression:** all existing Providers/UI tests stay green; new behavior is test-covered.
- **Accessibility:** keyboard + screen-reader parity for all new/changed controls.
- **Type safety:** no `any` leaks; named exports only; strict-mode clean.
- **Codebase patterns:** prefer pure, dependency-free helpers (mirror `lib/poolResolver.ts`,
  `lib/rateLimiter.ts`); TDD (write test → implement → refine).
- **Performance:** no new per-render allocations that break memoization of provider cards.

---

## Acceptance Criteria

1. After a successful connection test, the result (success/fail, latency, age) **survives collapse
   and tab navigation** and is visible in the collapsed provider header.
2. Editing `baseUrl`/`model`/`apiKey` invalidates the stored test result.
3. Picking a keyed catalog entry shows a "Get a key ↗" link that opens the correct signup URL.
4. Multiple provider cards can be expanded simultaneously; expand/collapse-all works.
5. "Test all keys" runs sequentially (RPM-respecting) and reports an N/M healthy aggregate.
6. Providers with `requiresApiKey=false` hide the key field; the key input has a single reveal control.
7. Disabled providers are visually distinct when collapsed; expanded cards show no double border.
8. Empty state uses `EmptyState` primitive with an inline CTA; Max RPM shows the 600 cap hint.
9. `pnpm test` + `pnpm lint` + build are green; no TypeScript errors.

---

## Out of Scope

- Relocating the System Prompt editor to a new nav section (only relabel + icon swap in scope).
- Background provider-pool dispatch / circuit-breaker / failover logic.
- Adding new catalog provider entries (metadata-only changes to existing entries).
- i18n extraction (strings remain i18n-ready but are not externalized this track).
- Cross-context live health badge from the coordinator (`getKeyStatus` prop) — already plumbed, not extended.
