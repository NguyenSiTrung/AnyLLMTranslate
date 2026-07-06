# Track Learnings: advanced-ux-refactor_20260706

Patterns, gotchas, and context discovered during implementation.

## Codebase Patterns (Inherited)

Read `conductor/patterns.md` for full project patterns. Key ones for this track:

- **Settings section shape:** `<SectionHeader>` + a `space-y-4` stack of `<Card variant="bordered">` blocks, each wrapped in `<div className="animate-stagger" style={stagger(N)}>` with unique ascending N.
- **Shared UI primitives** live in `ui/*` (`Card`, `FieldGroup`, `Toggle`, `Slider`, `SegmentedControl`, `Select`, `Input`, `Button`, `Modal`, `Badge`, `AdvancedDisclosure`, `DisabledDimmer`). Reuse over reinventing.
- **`useDeferredCommit(initial, onCommit)`** (`entrypoints/options/hooks/useDeferredCommit.ts`) generalizes commit-on-blur; syncs local state when upstream `initial` changes (reset/import). Built in `providers-ux-refactor` FR-10.
- **`DisabledDimmer`** (`ui/DisabledDimmer.tsx`): visual dim + `pointer-events-none`; inner controls MUST carry their own `disabled` (it does NOT set `aria-hidden`) — built in `subtitles-ux-refactor` FR-8.
- **`getCacheStats()`** already exists in `services/cacheManager.ts` → `{ entryCount, totalSizeBytes }` (reads idb-keyval `entries()`). Options page runs in extension context so the cacheManager can be imported directly (no background message needed).
- **Card title + inline Badge:** `Card` only accepts a string `title`; to put a `Badge` inline, render the card untitled and emit a manual `<h3 className="text-sm font-semibold text-zinc-200">` + badge as the first child (Subtitles FR-4 pattern).
- **`.beads/` is gitignored** — Beads data syncs via `bd dolt push`, NOT `git add`. Never `git add .beads/`.
- **pnpm** not global on this machine — `npx vitest` / `npx tsc` / `npx eslint` work directly via local devDeps.

---

## [2026-07-06 14:26] - Phase 1: Shared Primitives & Helpers
- **Implemented:** `ui/Textarea.tsx` (multiline input mirroring `Input` API: error/hint/mono/rows, extracted from the prompt editor's hand-rolled classes) + `ui/__tests__/Textarea.test.tsx` (6 tests). `entrypoints/options/hooks/useCacheStats.ts` wrapping `getCacheStats()` → `{ entryCount, sizeMb, loading, refresh }` + `__tests__/useCacheStats.test.ts` (3 tests).
- **Files changed:** `ui/Textarea.tsx`, `ui/__tests__/Textarea.test.tsx`, `entrypoints/options/hooks/useCacheStats.ts`, `entrypoints/options/hooks/__tests__/useCacheStats.test.ts`.
- **Commits:** (scaffolding) + `feat(options): add Textarea primitive + useCacheStats hook`.
- **Learnings:**
  - **Gotcha (React 19 + renderHook):** after `await result.current.refresh()` (an async hook callback that setState's), `result.current` is NOT updated synchronously — the re-render flushes in a later microtask. Must follow with `await waitFor(() => expect(result.current.X).toBe(...))`. Reading `result.current` on the next line gives the stale pre-refresh value. (Echoes the patterns.md React-19 async-flush gotcha.)
  - **Pattern:** `vi.mock('@/services/cacheManager', () => ({ getCacheStats: vi.fn() }))` + `vi.mocked(getCacheStats)` keeps the hook test off real IndexedDB (jsdom has no usable IDB). The hook's `catch` block lets the readout degrade gracefully on error — tested explicitly.
  - **Pattern:** `Textarea` deliberately does NOT take an `icon`/password-toggle (unlike `Input`) — multiline fields don't need them; keep the primitive minimal and extend later if needed.
  - **vitest config:** `entrypoints/**/*.test.{ts,tsx}` glob already covers `entrypoints/options/hooks/__tests__/**` → jsdom; no vitest.config edit needed (the plan flagged this as a possible gotcha — it's already covered).
---

## [2026-07-06 14:35] - Phase 2: DRY Migration (FR-9) + a11y fix
- **Implemented:** Migrated the 4 number inputs (`cacheTTLDays`, `maxCacheSizeMB`, `maxBatchChars`, `maxRpm`) from hand-rolled `useState` + sync `useEffect` + `useCallback` blur handlers to `useDeferredCommit`; deleted the manual sync effect. Replaced the inline `opacity-40 pointer-events-none` dimmer with `DisabledDimmer` + passed `disabled` to the LLM-detection `Toggle` and Detection Mode `Select`. Added 1 a11y test (31 total).
- **Files changed:** `entrypoints/options/sections/AdvancedSection.tsx`, `entrypoints/options/__tests__/AdvancedSection.test.tsx`.
- **Commit:** 2f34b38
- **Learnings:**
  - **Decision (toast removal):** Deferred-commit inputs drop the per-field success toast. The sidebar "Auto-saved" badge (App.tsx subscribes to the store) already confirms every write, so the toast was redundant. Matches providers-ux-refactor's silent deferred commits. No test asserted the toast, so this was test-safe.
  - **Pattern (validation placement):** `useDeferredCommit`'s `onCommit` is just the store write (no validation/toast inside it — avoids side-effects-in-updater concerns and matches the providers `useDeferredCommit(initial, (v) => onUpdate({...}))` precedent). Range validation lives in a thin blur wrapper that sets/clears the error `useState` and calls `field.commit()` only if valid. This keeps `committed` from advancing to an invalid value (skip-commit-on-invalid), so re-blurring the same invalid value is a no-op — acceptable.
  - **Pattern (dirty-check):** `useDeferredCommit.commit()` already gates `onCommit` on `value !== prevCommitted`, so the existing "does not write when value is unchanged" maxRpm test passes unchanged — no manual `if (value !== settings.X)` guard needed.
  - **a11y fix verified:** `DisabledDimmer` dims visually, but `pointer-events-none` only blocks the mouse — inner controls MUST carry `disabled` to be keyboard-inert. New test asserts `toBeDisabled()` on the LLM toggle when Context-Aware is off. This is the concrete NFR-4 net improvement.
  - **Gotcha (Toggle/Select disabled):** `Toggle` has an explicit `disabled` prop; `Select` has no explicit `disabled` prop but spreads `...props` to the native `<select>`, so `disabled` passes through. Both verified by the passing a11y test.
---

## [2026-07-06 14:43] - Phase 3: Information Architecture Restructure (FR-1, FR-2, FR-7)
- **Implemented:** New card order — Translation System Prompt (elevated to first, `Braces` icon, stagger 0) → Performance & Throughput (merged Rate Limiting; Clear Cache button removed) → Context & Intelligence → PDF Translator → Data Portability (split) → Developer (split, Debug only) → Danger Zone (Clear Cache + Reset All, each with description + icon, `accent="red"`). Removed standalone Rate Limiting card + bare Reset button. Stagger 0-6 unique ascending.
- **Files changed:** `entrypoints/options/sections/AdvancedSection.tsx`, `entrypoints/options/__tests__/AdvancedSection.test.tsx`.
- **Commit:** (this phase)
- **Learnings:**
  - **Pattern (Card danger accent):** `Card` has `accent?: 'blue'|'emerald'|'amber'|'red'` → adds `border-l-4 border-l-red-500`. Use `accent="red"` for the Danger Zone card (left red bar) rather than fighting `border-white/10` with a custom `border-red-500/20` className.
  - **Pattern (move via 2 edits):** Repositioning a card block is cleanest as two edits — insert the block at the new location, then replace the old block (+ adjacent block to remove) with the new content. This avoids reproducing the entire space-y-4 container and sidesteps whitespace-ambiguous blank lines in untouched cards (the Context card has a trailing-whitespace blank line that would break a full-container match).
  - **Decision (Reset label):** Shortened "Reset All Settings to Default" → "Reset All" (fits the Danger Zone row). No test asserted the old label (the prompt-reset test uses `getAllByRole('button', { name: /reset to default/i })` which only ever matched the prompt's "Reset to Default" button — "Reset All Settings to Default" did not contain the substring "reset to default"). Test stayed green.
  - **Import hygiene:** Removing the Rate Limiting card made `Gauge` unused → swapped `Gauge` → `Braces` in the lucide import (Braces used by the elevated System Prompt card). `Wrench` now used by both SectionHeader and the Developer card.
---

## [2026-07-06 14:48] - Phase 4: Hero Status Strip + Cache Readout (FR-3, FR-8)
- **Implemented:** Hero strip above cards with live cache usage (`useCacheStats`: "X entries · Y.X MB", "…" while loading), `Braces` "Custom prompt" chip (`customSystemPrompt !== null`), `Bug` "Debug on" chip (`debugMode`). `handleClearCache` calls `cacheStats.refresh()` on success. 3 new tests (34 total).
- **Files changed:** `entrypoints/options/sections/AdvancedSection.tsx`, `entrypoints/options/__tests__/AdvancedSection.test.tsx`.
- **Learnings:**
  - **Pattern (test-wide cacheManager mock):** Added a file-wide `vi.mock('@/services/cacheManager', () => ({ getCacheStats: vi.fn() }))` to `AdvancedSection.test.tsx` so `useCacheStats` doesn't hit real IndexedDB in jsdom. Default `vi.fn()` returns `undefined` → the hook's try/catch catches the `undefined.entryCount` TypeError → readout shows "0 entries · 0.0 MB". Harmless for the 31 pre-existing tests (none assert hero content); hero tests use `vi.mocked(getCacheStats).mockResolvedValue(...)` to drive the readout.
  - **Pattern (hero ≠ master toggle):** Unlike Subtitles FR-1 (a master-enable hero), Advanced has no single enable, so the hero is a **status strip** (live readout + state chips) — an anchor with information density rather than a control. Matches the spec FR-3 decision.
  - **Gotcha (useCallback dep):** `handleClearCache` gained `cacheStats.refresh` in its `useCallback` deps so the closure sees the stable refresh fn. `cacheStats.refresh` is stable (hook's `useCallback([load])`, `load` is `useCallback([])`), so no re-creation churn.
---

## [2026-07-06 14:51] - Phase 5: Context & Intelligence Cleanup (FR-4)
- **Implemented:** Wrapped Detection Mode in `<AdvancedDisclosure label="Detection mode">` (replaced the `pl-6 border-l-2` indent div). Still gated by `enableLLMPageCategoryDetection` + inside the `DisabledDimmer`. 1 new test (35 total).
- **Files changed:** `entrypoints/options/sections/AdvancedSection.tsx`, `entrypoints/options/__tests__/AdvancedSection.test.tsx`.
- **Learnings:**
  - **Pattern (disclosure collapses children out of DOM):** `AdvancedDisclosure` returns `null` for the region when collapsed, so `queryByLabelText('Detection Mode')` is absent until the trigger is clicked — test asserts both states. Same gotcha as Subtitles FR-5 (disclosed content not in DOM until expanded).
  - **Reduction:** The 3-level nesting (Toggle → dimmed sub-block → Toggle → indented conditional Select) is now 2-level (Toggle → dimmed sub-block → Toggle → disclosure). The disclosure replaces both the indent styling and the always-on visibility of the rarely-changed Detection Mode.
---
