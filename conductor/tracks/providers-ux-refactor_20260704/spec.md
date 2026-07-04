# Spec: Providers Tab UX Refactor

**Track ID:** `providers-ux-refactor_20260704`
**Type:** Feature (UI/UX improvement + structural refactor)
**Priority:** 🟠 High
**Created:** 2026-07-04
**Predecessor:** `providers-ux-overhaul_20260630` (resolved 13 *different* findings — persisted test state, get-key links, multi-expand accordion, bulk test. This track does **not** re-cover those.)

---

## Overview

The Providers tab is the most complex screen in the extension (`ProvidersSection.tsx`, 1001 lines vs. 89–654 for every other section) and bundles five distinct concerns into one file. A deep analysis surfaced 11 concrete problems across code health, visual design, UX, and performance. This track resolves the **Providers-tab-scoped** subset (visual + structural + parallel-test + IA), deferring app-wide primitive changes (`<Surface>` tokens, password eye toggle on shared `Input`) to a separate follow-up track.

The outcome: a tab users can scan in one glance, where every provider is instantly recognizable, test health is front-and-center, the file is split into maintainable units, and typing/bulk-testing no longer lag.

## Functional Requirements

### FR-1 — Split the monolithic file (code health)
The 1001-line `ProvidersSection.tsx` must be decomposed into focused units under `entrypoints/options/sections/` and `entrypoints/options/components/`:
- `ProvidersSection.tsx` — orchestrator only (read store, mutate pool, render list)
- `components/ProviderCard.tsx` — one collapsible provider card (header + body)
- `components/ProviderKeyRow.tsx` — one API-key row
- `components/ProviderConnectionTest.tsx` — provider-level test panel
- `components/ProviderTestResult.tsx` — shared success/failure result block (dedupes the copy-pasted UI currently living in both `KeyRow` and `ProviderConnectionTest`)
- `components/AddProviderModal.tsx` — extracted as its own component
- `hooks/useConnectionTest.ts` — the test lifecycle hook

The public export `ProvidersSection` and its prop signature MUST stay identical so `App.tsx` and existing tests keep working. Helper exports `countEnabledKeys` and `getPoolReadiness` MUST stay re-exported from `ProvidersSection.tsx` for backward compat with the popup.

### FR-2 — Provider identity badges (visual)
Each `OpenAiCompatibleCatalogEntry` gains two optional fields: `accent` (one of the existing `SectionHeader` accent colors) and `monogram` (1–3 uppercase letters). Each collapsed provider header renders a colored square badge containing the monogram (or the first letter of `displayName` as fallback). The badge uses the same `bg-X-600/15 border-X-500/20 text-X-400` token pattern as the readiness banner.

Accent assignments:
| Provider | Accent | Monogram |
|---|---|---|
| OpenRouter | slate/zinc | OR |
| NVIDIA NIM | emerald | NV |
| Groq | orange | GQ |
| Together AI | pink | TG |
| Fireworks AI | amber | FW |
| Mistral | amber | MI |
| Ollama | teal | OL |
| LM Studio | cyan | LM |
| Custom | zinc | ⚙ (gear icon) |

A provider with a `catalogId` whose entry has no `accent`/`monogram` falls back to the catalog's inferred entry, then to a zinc badge with the first letter of `displayName`.

### FR-3 — Promote test status from dot to badge (visual)
The current `w-2 h-2` test-health dot in the collapsed header is replaced with a real `<Badge>` carrying an icon + label + age:
- Healthy → emerald `<Badge>` with `CheckCircle2` icon, label "Verified · 2h ago"
- Failed → red badge with `XCircle` icon, label "Failed · 5m ago"
- Untested → no badge (current behavior preserved)

The `formatTestResultAge` helper in `lib/poolTestStatus.ts` already exists; this FR only changes the *rendering*, not the data.

### FR-4 — Re-layout collapsed header (visual)
The current single-row header crams 6 elements. Adopt a two-zone layout:
- **Left zone:** identity badge (FR-2) + displayName + test-health badge (FR-3)
- **Right zone:** key-count chip (`KeyRound` + N) + chevron

The redundant on/off `Badge` in the header is **removed** — the body's "Provider enabled/disabled" toggle text already communicates this, and the header's `opacity-60` treatment when disabled is a stronger signal. Disabled providers keep the dimmed text treatment.

### FR-5 — Advanced disclosure for temperature/maxTokens (UX)
The Temperature and Max Tokens `<Slider>`s move behind a "Advanced settings" disclosure (chevron + collapsible region, default collapsed). The primary path (catalog picker → name → URL → keys → model → test) becomes shorter and less intimidating. Values persist as before; the disclosure is purely presentational.

### FR-6 — Collapse catalog picker when configured (UX)
When a provider has a non-`custom` `catalogId` set, the in-body `ProviderCatalogPicker` collapses behind a "Change template" button. Clicking it reveals the picker; selecting an entry re-collapses. A provider whose `catalogId` is `custom` (or unset) shows the picker inline as today.

### FR-7 — Rebuild AddProviderModal with search + categories (code health + UX)
The current `AddProviderModal` stuffs a JSX list into the Modal `message` prop and has no search, while the in-card `ProviderCatalogPicker` *does* have search — an inconsistency. The modal is rebuilt to:
- Reuse `ProviderCatalogPicker` (or its `filterCatalog` logic) so search works
- Group entries by category with subtle dividers: **Cloud** (OpenRouter, NVIDIA, Groq, Together, Fireworks, Mistral), **Local** (Ollama, LM Studio), **Custom**
- Use the new identity badges (FR-2) in each row
- Use a proper Modal children slot, not the `message` prop

### FR-8 — Parallel "Test all keys" with live progress (UX + perf)
`handleTestAll` currently runs slots sequentially with one global spinner; users watch 7 keys test with zero per-row feedback until the end. It is rewritten to:
- Run tests in parallel with a concurrency cap of 4 (configurable constant) via a small pool/queue helper
- Update each `KeyRow`'s `lastTestResult` live as each result arrives (the existing store path is already reactive)
- Show a live "3/7" counter in the banner button while testing
- Keep the existing aggregate toast on completion

### FR-9 — Move global System Prompt to Advanced (IA)
The Global System Prompt editor is unrelated to any provider yet occupies a third of the Providers tab. It moves to the **Advanced** section. A small "Edit system prompt →" link button is added to the Providers readiness banner that calls a new `onNavigateToAdvanced` prop, which `App.tsx` wires to `setActiveTab('advanced')`. The Advanced section gains a new "Translation System Prompt" card (reusing the exact same FieldGroup + textarea + validation UI).

### FR-10 — Debounce text inputs (perf)
Every text `onChange` in `ProvidersSection`/`KeyRow` (display name, base URL, API key, label) currently fires `updateSettings → chrome.storage.local` with AES-GCM encryption on every keystroke. A 40-char API key triggers 40 encrypted writes. Text inputs switch to **commit-on-blur** for the store write (the local input state updates immediately for responsiveness, the encrypted write fires on `onBlur`). Number inputs (maxRpm) already use this pattern and stay as-is.

The catalog picker, toggles, sliders, and test buttons remain immediate-commit (their writes are infrequent).

## Non-Functional Requirements

- **NFR-1 (Bundle):** No new runtime dependencies. Net delta must stay under +2 KB. No simple-icons, no logo assets.
- **NFR-2 (No regressions):** All existing tests in `entrypoints/options/__tests__/ProvidersSection.test.tsx`, `ProviderCatalogPicker.test.tsx`, `ConnectionTestProgressList.test.tsx`, and `SetupWizard.test.tsx` must keep passing (with assertion updates where labels change). The public API of `ProvidersSection` is unchanged.
- **NFR-3 (Accessibility):** The advanced disclosure (FR-5), change-template button (FR-6), and rebuilt modal (FR-7) must use proper ARIA (`aria-expanded`, `aria-controls`, `role="region"`, focus management). The promoted status badge (FR-3) keeps its `aria-label` with age.
- **NFR-4 (Visual consistency):** All new colored surfaces use the existing `bg-X-600/15 border-X-500/20 text-X-400` token pattern from `SectionHeader.tsx` and the readiness banner. No new ad-hoc opacity values (`/30`, `/40`, `/60` drift) — see existing pattern note in `patterns.md`.
- **NFR-5 (Encryption invariant):** The debounce change (FR-10) MUST NOT cause credential writes to be lost on tab close / navigation. An unload flush is not required (the next settings load re-reads; the only loss is the in-flight keystroke), but blur MUST fire before any navigation that unmounts the input. React's `onBlur` fires before unmount in practice; verify with a test.

## Acceptance Criteria

- [ ] **AC-1:** `entrypoints/options/sections/ProvidersSection.tsx` is the orchestrator only and imports `ProviderCard`, `AddProviderModal`, etc. from `entrypoints/options/components/`. No sub-component definitions remain inline.
- [ ] **AC-2:** Each collapsed provider header shows a colored monogram badge whose color matches the catalog entry's `accent` field, falling back to zinc for custom/unknown.
- [ ] **AC-3:** A provider with at least one healthy key shows a green "Verified · Nh ago" badge in the collapsed header (replacing the 2×2 px dot). A fully-failed provider shows a red "Failed · Nm ago" badge. An untested provider shows no badge.
- [ ] **AC-4:** The collapsed header has exactly two zones: identity (badge + name + status) on the left, meta (key count + chevron) on the right. The standalone on/off `Badge` is gone from the header.
- [ ] **AC-5:** Temperature and Max Tokens are hidden behind an "Advanced settings" disclosure that defaults to collapsed. Expanding reveals both sliders; values are unchanged.
- [ ] **AC-6:** A provider with `catalogId !== 'custom'` shows a "Change template" button instead of the inline picker; clicking it reveals the picker.
- [ ] **AC-7:** The AddProviderModal supports search (filtering by name/keyword as the inline picker does) and groups entries under Cloud / Local / Custom dividers.
- [ ] **AC-8:** "Test all keys" runs up to 4 tests concurrently; each `KeyRow` updates its status live as its result arrives; the banner button shows a live "N/M" counter during the run.
- [ ] **AC-9:** The Global System Prompt card no longer appears on the Providers tab. It appears in the Advanced section. The Providers readiness banner has an "Edit system prompt →" link that switches to the Advanced tab.
- [ ] **AC-10:** Typing into the display name / base URL / API key / label inputs updates the visible value immediately but does not trigger an encrypted store write until the input loses focus.
- [ ] **AC-11:** `pnpm test --run` passes with 0 failures (existing assertions updated where labels changed; new tests added for FR-2, FR-3, FR-5, FR-6, FR-8, FR-10).
- [ ] **AC-12:** `tsc --noEmit` clean. `pnpm lint` introduces no new errors beyond the 2 pre-existing (`subtitleRenderer.ts`, `jsonParseSubtitleHook.ts`).
- [ ] **AC-13:** `wxt build` succeeds; bundle delta < +2 KB.

## Out of Scope

- **App-wide `<Surface>` token primitive** (finding A4) — deferred to a separate "app-wide UI polish" track; it touches every Settings section.
- **Password show/hide eye toggle on shared `Input`** (finding B5) — same; benefits the whole app and deserves its own focused track.
- **Copy-to-clipboard buttons** on base URL / model (finding C5).
- **Drag-to-reorder** for providers and keys (finding C6) — rotation order matters but reordering is a larger feature; defer.
- **Catalog category grouping in the inline picker** (finding B6) — only the modal gets categories; the inline picker stays a flat searchable list.
- **Empty-state hint for zero keys** (finding C1) — minor; may fold in opportunistically during FR-1 but not a tracked requirement.
- Any change to the SetupWizard provider step, popup, or background service.
