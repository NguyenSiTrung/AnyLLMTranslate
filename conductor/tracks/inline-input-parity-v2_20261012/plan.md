# Plan: Inline Input Translation — Refer-Parity v2

Track: `inline-input-parity-v2_20261012` · Spec: `./spec.md`
Method (conductor/workflow.md): TDD per task (failing test → implement →
refine), Conventional Commit per task with `git notes` summary, learnings
appended per task. Phase gate = `pnpm test`, `pnpm compile`, `pnpm lint`
(count ≤ 37 baseline). No manual verification tasks (user decision).

## Phase 1: Settings model, migration, per-site resolution
<!-- execution: sequential -->

- [x] Task 1: Extend `InlineTranslateSettings` + defaults (FR-14)
  <!-- files: types/config.ts, types/__tests__/config.test.ts -->
  - [x] Test: defaults equal refer values (gap 250, idle 250, tolerance 2, timeout 200, cancel 3000, min 1500, long-text 200, bar on, autoLanguage on/page off, gestureEnabled on, confirmLongText on)
  - [x] Add `InlineTriggerKey` union (`' ' | '/' | '=' | ';' | ',' | '.' | ':'`), new fields, `inlineParityV2Migrated`, `inlineGuideShown`
- [x] Task 2: One-shot migration `migrateInlineParityV2` (FR-14)
  <!-- files: lib/config.ts, lib/__tests__/config.test.ts -->
  - [x] Test: old fingerprints (idle 0 / gap 0 / tolerance 0) → new defaults; customized values kept; flag blocks re-run; `triggerTimeoutMs` < 100 → default, clamp 150–1000; persist on false→true like `migrateInlineGestureWindowDefaults`
- [x] Task 3: `SiteRule.inlineTranslate` override + resolver (FR-8)
  <!-- files: types/config.ts, lib/siteRules.ts, lib/__tests__/siteRules.test.ts -->
  - [x] Test: most-specific rule wins; absent keys fall through to globals; built-in seeds for x.com/twitter.com, reddit.com, youtube.com, discord.com, web.telegram.org, web.whatsapp.com carry refer `autoLanguageSelectors`
  - [x] `resolveInlineSiteConfig(settings, hostname)` pure function
- [x] Task 4: Runtime projection (FR-14, FR-8)
  <!-- files: content/inlineTranslate/types.ts, content/inlineTranslate/index.ts, content/__tests__/inlineTranslate.test.ts -->
  - [x] Test: `settingsToRuntime` carries new fields and applies site overrides for `location.hostname`; partial updates never clobber arrays with `undefined`
- [x] Task: Conductor - Phase Verification 'Phase 1' (automated gates only)

## Phase 2: Trigger engine — keys, tail gate, removeTail, FSM
<!-- execution: sequential -->
<!-- depends: phase1 -->

- [x] Task 1: Trigger-key alias module (FR-2)
  <!-- files: content/inlineTranslate/triggerKeys.ts, content/__tests__/inlineTranslate.triggerKeys.test.ts -->
  - [x] Test: `space` ≡ ' ', U+00A0, U+3000; `/`≡`、`, `.`≡`。`, `,`≡`，`, `;`≡`；`, `:`≡`：`; keydown `code === 'Space'` path
  - [x] `matchesTriggerChar`, `triggerCharClass`, `startingKeyAliases`
- [x] Task 2: Tail gate + removeTail (FR-4, FR-5)
  <!-- files: content/inlineTranslate/tail.ts, content/inlineTranslate/orchestrate.ts, content/__tests__/inlineTranslate.tail.test.ts -->
  - [x] Test vectors: last-line rule, ≥ min(tapCount,2) consecutive, letter-after aborts, NBSP/U+3000 removal, maxDelete cap, `.`/`。` rule, URL placeholders round-trip
  - [x] Replace `stripTrailingTrigger` in `orchestrate.ts` (delete old helper)
- [x] Task 3: Two-branch gesture FSM (FR-1); remove `timeWindowMs` everywhere
  <!-- files: content/inlineTranslate/gesture.ts, content/inlineTranslate/index.ts, types/config.ts, lib/config.ts, entrypoints/options/sections/ShortcutsSection.tsx, entrypoints/options/sections/InlineTranslateSection.tsx, entrypoints/options/components/InlineTranslatePreview.tsx, lib/inlineTranslatePreview.ts, content/__tests__/inlineTranslate.parity.test.ts -->
  - [x] Test truth table (fake timers, injected `now`): Space gaps 200×3 fire, 400×3 none, 4–5 taps fire, 6 none, tail-gate failure resets, non-space `/`×3 within 200 ms fires immediately, gap > timeout resets, compositionstart/delete input reset; keydown+insertText dedupe preserved
  - [x] Drop `timeWindowMs` from type, defaults, migration (delete it from stored settings), UI and preview; retire `inlineGestureWindowMigrated` logic if fully superseded
- [x] Task 4: Gesture-off (shortcut-only) mode (FR-3)
  <!-- files: content/inlineTranslate/index.ts, content/__tests__/inlineTranslate.test.ts -->
  - [x] Test: `gestureEnabled: false` → taps never fire; `translateFocusedInput()` still translates; `enabled: false` blocks both
- [x] Task: Conductor - Phase Verification 'Phase 2' (automated gates only)

## Phase 3: Language resolution (pure modules)
<!-- execution: parallel -->
<!-- depends: phase1 -->

- [ ] Task 1: Prefix parser upgrade (FR-6)
  <!-- files: lib/inlineTranslatePrefix.ts, lib/__tests__/inlineTranslatePrefix.test.ts -->
  - [ ] Test: `//en hello`, `、、英文 hello`, `;;ja x`, `none` disables, prefix-only → no request, code↔name aliases both directions, starting key ≠ trailing key
- [ ] Task 2: Auto target language detector (FR-7)
  <!-- files: content/inlineTranslate/autoLanguage.ts, content/__tests__/inlineTranslate.autoLanguage.test.ts -->
  - [ ] Test: `parentElementTo` first-match, plain selector all-matches, own injected nodes excluded, page fallback only when enabled, default otherwise; returns `{ lang, source: 'auto_selector' | 'auto_page' | 'default' }`
- [ ] Task: Conductor - Phase Verification 'Phase 3' (automated gates only)

## Phase 4: Pipeline wiring, pacing and in-page UI
<!-- execution: parallel -->
<!-- depends: phase2, phase3 -->

- [ ] Task 1: Wire language precedence + same-language notice into orchestrate (FR-6, FR-7)
  <!-- files: content/inlineTranslate/orchestrate.ts, content/__tests__/inlineTranslate.parity.test.ts -->
  - [ ] Test: explicit > auto_selector > auto_page > default; prefix stripped from written result; result equal to source + same language → notice, field untouched
- [ ] Task 2: Cancel window + min-duration + busy drop (FR-9)
  <!-- files: content/inlineTranslate/orchestrate.ts, content/__tests__/inlineTranslate.chatHardening.test.ts -->
  <!-- depends: task1 -->
  - [ ] Test: input at 2999 ms cancels, 3001 ms ignored; own write-back excluded; write held until 1500 ms; trigger while busy dropped
- [ ] Task 3: Loading overlay (FR-10)
  <!-- files: content/inlineTranslate/overlay.ts, content/__tests__/inlineTranslate.overlay.test.ts -->
  - [ ] Test: shadow-root host mounted next to field, follows field rect, removed on write/cancel/error
- [ ] Task 4: Target-language bar + Undo + retarget (FR-11)
  <!-- files: content/inlineTranslate/languageBar.ts, content/__tests__/inlineTranslate.languageBar.test.ts -->
  - [ ] Test: chip/menu search, source badge, retarget callback receives original draft from `undoMap`, persists `targetLanguage`, Undo restores original, auto-hide ~5 s, reopen on focus while unchanged
- [ ] Task 5: Long-text confirm + first-use guide modals (FR-12, FR-13)
  <!-- files: content/inlineTranslate/modals.ts, content/__tests__/inlineTranslate.modals.test.ts -->
  - [ ] Test: > threshold prompts; Don't ask again persists; guide once, Turn off sets `enabled: false`
- [ ] Task 6: Integrate overlay, bar and modals into the pipeline (FR-9…13, AC-9)
  <!-- files: content/inlineTranslate/orchestrate.ts, content/inlineTranslate/index.ts, content/__tests__/inlineTranslate.integration.test.ts -->
  <!-- depends: task2, task3, task4, task5 -->
  - [ ] Integration test (textarea + contentEditable): gesture → overlay ≥ 1.5 s → write → retarget → Undo; draft unchanged before response
- [ ] Task: Conductor - Phase Verification 'Phase 4' (automated gates only)

## Phase 5: Options UI and Site Rules UI
<!-- execution: parallel -->
<!-- depends: phase2 -->

- [ ] Task 1: Inline Translate section — refer surface + Advanced disclosure (FR-15)
  <!-- files: entrypoints/options/sections/InlineTranslateSection.tsx, entrypoints/options/components/InlineTranslatePreview.tsx, lib/inlineTranslatePreview.ts, entrypoints/options/sections/__tests__/inlineTranslateSection.test.tsx -->
  - [ ] Test: trailing/starting key selects (starting excludes trailing, `none`), combo interval 150–1000, gesture toggle, auto-language toggles, Advanced knobs write settings
- [ ] Task 2: Site Rules "Inline translate" disclosure (FR-8)
  <!-- files: entrypoints/options/sections/SiteRulesSection.tsx, entrypoints/options/sections/__tests__/siteRulesSection.test.tsx -->
  - [ ] Test: selectors textarea + numeric overrides persist on the rule; empty fields remove the override key
- [ ] Task: Conductor - Phase Verification 'Phase 5' (automated gates only)

## Phase 6: Stats attribution, docs and close-out
<!-- execution: sequential -->
<!-- depends: phase4, phase5 -->

- [ ] Task 1: Inline stats attribution (FR-16)
  <!-- files: content/inlineTranslate/orchestrate.ts, types/messages.ts, services/background.ts, services/__tests__/background.test.ts -->
  - [ ] Test: inline-origin `translateSelection` records `mode: 'inline'` (increments `inlineEvents`), plain selection still `'selection'`
- [ ] Task 2: Update `conductor/product.md`, README inline section, track learnings → `conductor/patterns.md`
- [ ] Task: Conductor - Phase Verification 'Phase 6' (automated gates only)

## Parallelism notes
- Phase 3 (pure modules) runs alongside Phase 2; both depend only on Phase 1.
- Phase 5 runs alongside Phase 4 (UI files only; needs Phase 2's removal of `timeWindowMs`).
- `orchestrate.ts` is touched by Phase 2 T2, Phase 4 T1/T2/T6 and Phase 6 T1 —
  the dependency graph never schedules two of them concurrently.
