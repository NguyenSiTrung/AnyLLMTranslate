# Track Learnings: inline-input-parity-v2_20261012

Patterns, gotchas, and context discovered during implementation.

## Codebase Patterns (Inherited)

From `conductor/patterns.md` (inline-translate sections):

- **A DOM write into a framework composer is destructive, and refusing is not a feature:** ProseMirror reverts it, Lexical duplicates the text, Draft.js corrupts the draft. The ladder is Quill `__quill` API → synthetic paste → native `insertText` (Draft.js) → copy panel; never leave the user with only a refusal.
- **Element-boundary selections are never adopted:** `setBaseAndExtent` / `selectNodeContents` / `execCommand('selectAll')` are ignored by Lexical and Draft.js, so a paste lands at their stale model selection. Select from the **first to the last text node**, then nudge `selectionchange`.
- **A selection is not in the editor's model in the same tick:** Slate debounces `selectionchange` by a task and React re-renders first, silently dropping the paste. Wait `FRAMEWORK_SELECTION_SETTLE_MS` between the selection and the paste dispatch.
- **Success is exact content verification, never the event outcome:** stop the strategy chain on a partial change, and compare contentEditable through the reader's newline normalization so a kept blank line does not look like a failure.
- **Never mutate the field before the translation exists**, never steal focus (require focus for selection helpers, drop reactions after `focusin` moves it), and make the copy panel's primary action copy **and** select the draft so a real Ctrl+V replaces it.
- **Read contentEditable block-aware:** newlines at block boundaries / `<br>` / `img alt`, skipping placeholder and `aria-hidden` subtrees, or an empty composer reads its placeholder as a draft.
- **A shared first→last gesture budget needs a migration when widened:** `timeWindowMs` is split across `tapCount − 1` gaps (1000 ms → 500 ms/gap for Space×3), and stored values beat the deep merge — so raising the default requires a versioned one-shot flag (`inlineGestureWindowMigrated`) or existing installs stay stuck forever.
- **Write the framework state, not just the DOM:** chat composers (Discord, and any React/Vue controlled input) re-render from their own state, so setting `element.value` / `textContent` alone is discarded on the next render and the *original* text gets sent. Commit the translated value through the framework's value-setter path (native setter + `input` event) so controlled components observe it.
- **Preserve the composer's editable contract:** the fix must not break IME composition, draft state, or the send/submit affordance — keep the write-back scoped to the value commit, and leave focus/selection behaviour to the existing inline-translate path.
- **Guard own write-back with `isWritingBack`:** Synthetic `input`/`change` from multi-strategy write-back must not cancel in-flight translate or skip toast dismiss. Set a module flag around write, and ignore cancel-on-type while it is true. (from: inline-input-parity_20260709, archived 2026-07-09)
- **Partial nested config updates must not clobber arrays with `undefined`:** When merging `Partial<InlineTranslateRuntimeConfig>`, omit keys that are absent (especially `blocklistPatterns`) instead of spreading `undefined` over existing values. (from: inline-input-parity_20260709, archived 2026-07-09)
- **Fallback undo only when field is still the last write:** Store `lastWrittenMap` alongside `undoMap`. Re-trigger restores original only if current text still matches last successful write; after user edit, clear state and translate again. (from: inline-input-parity_20260709, archived 2026-07-09)
- **No `import.meta` in content-script modules:** Content scripts bundle as IIFE; `import.meta` becomes `{}` and warns at build. Detect Vitest via `process.env.VITEST` only. (from: inline-input-parity_20260709, archived 2026-07-09)
- **Chrome `commands` max 4 `suggested_key` entries — extra commands without defaults:** A 5th command (e.g. `translate-input-box`) may exist with description only; users bind it at `chrome://extensions/shortcuts`. Exceeding 4 suggested keys fails extension load. (from: inline-input-parity_20260709, archived 2026-07-09)
- **jsdom KeyboardEvents are never `isTrusted`:** Production must ignore untrusted events for gesture counting; under Vitest allow untrusted so synthetic keydown tests work. (from: inline-input-parity_20260709, archived 2026-07-09)
- **Dual-mode join separators differ by editable type:** When dual mode is on, plain `input` joins original + translation with ` / `; `textarea` and contentEditable use a newline. Default remains translation-only. (from: inline-input-parity_20260709, archived 2026-07-09)
- **Blocklist policy = replace when non-empty:** If the user supplies any `blocklistPatterns`, that list fully replaces the seeded defaults; empty/absent → seed defaults (Notion/Figma/Lark-class hosts). (from: inline-input-parity_20260709, archived 2026-07-09)
- `document.execCommand('insertText')` is the most reliable way to replace text in standard inputs while preserving the browser's native undo stack. (from: inline-translate_20260418, archived 2026-04-18)
- Multi-framework compatibility (React, Vue, Angular) requires dispatching both `input` and `change` synthetic events manually after programmatically updating input values. (from: inline-translate_20260418, archived 2026-04-18)
- **`Promise.withResolvers<void>()` fails lint** (from: `d4f2cf1`, 2026-09-10): `@typescript-eslint/no-invalid-void-type` rejects `void` in this generic position even though the TS lib signature is `withResolvers<T>()`. Use `Promise.withResolvers<undefined>()` (and `resolve()`), or a plain `new Promise` wrapper, in test helpers — `content/inlineTranslate/writeback.ts` already uses the `<undefined>` form, so follow it. This one slipped through a release because `pnpm compile` (tsc) was clean: **tsc passing does not mean lint passing**, so run both before declaring a gate green.

## Track context

- Reference analysis artifacts (not committed): prettified bundle at `/tmp/refer_extract/content_main.pretty.js`; source of truth `refer/content_main.js`, `refer/default_config.json`.
- Today inline requests reuse `translateSelection` and are recorded as `mode: 'selection'`; `inlineEvents` never increments (`services/statsCollector.ts:106`).
- `triggerGapMs` exists in settings but `gesture.ts` never reads it.
- No manual verification in this track (user decision 2026-10-12); phase gates are automated only.

---

<!-- Learnings from implementation will be appended below -->

## [2026-10-12] - Phase 1 Task 1: Extend InlineTranslateSettings + defaults
- **Implemented:** `InlineTriggerKey` union + `INLINE_TRIGGER_KEYS`, combo-interval bounds, 9 new fields + `inlineGuideShown` (inside `inlineTranslate` so content can persist it with a nested patch), top-level `inlineParityV2Migrated` (false default → existing installs migrate). Refer defaults gap/idle 250, tolerance 2.
- **Files changed:** types/config.ts, types/__tests__/config.test.ts, lib/__tests__/settings.test.ts
- **Learnings:**
  - Gotchas: `lib/__tests__/settings.test.ts` pins `DEFAULT_INLINE_TRANSLATE_SETTINGS` too — change both when defaults move.
  - Context: the plan names `lib/__tests__/config.test.ts`, which does not exist; inline migration tests live in `lib/__tests__/settings.test.ts` ("inline gesture window migration").
---

## [2026-10-12] - Phase 1 Task 2: migrateInlineParityV2
- **Implemented:** per-field fingerprint upgrade (each of idle/gap/tolerance still at 0 → refer default), `normalizeInlineTriggerKey` (`'Space'`/unknown → `' '`), always-on `normalizeInlineTriggerTimeoutMs` (<100 → 200, clamp 150–1000) in `loadSettings`; fresh installs start migrated.
- **Files changed:** lib/config.ts, lib/__tests__/settings.test.ts
- **Learnings:**
  - Patterns: per-field (not whole-triple) fingerprinting here, because under the new FSM `triggerGapMs: 0` makes a burst impossible — a partially-tuned install must still get a working gap.
  - Gotchas: `saveSettings` from a migration is fire-and-forget; a "not persisted" assertion must set every other migration flag (`safeKeyThrottleMigrated`, `inlineGestureWindowMigrated`) and yield a macrotask, or it passes vacuously.
---

## [2026-10-12] - Phase 1 Task 3: SiteRule.inlineTranslate + resolver
- **Implemented:** `InlineSiteOverride` type, `SiteRule.inlineTranslate?`, `BUILT_IN_INLINE_SITE_OVERRIDES` (x/twitter, reddit, youtube, discord, telegram, whatsapp), `resolveInlineSiteConfig(settings, hostname, userRules)` = globals ← most-specific seed ← most-specific user rule *carrying* an override.
- **Files changed:** types/config.ts, lib/siteRules.ts, lib/__tests__/siteRules.test.ts
- **Learnings:**
  - Gotchas: built-in seeds cannot live on `BUILT_IN_RULES` objects — `loadSettings` injects built-ins only when stored `siteRules` is empty, so existing installs would never see new seed data. Layer seeds in the resolver.
  - Context: `refer/` was not present on this machine (2026-10-12), so the seed selectors are hand-written approximations of refer's `rules[].inputConfig.add` intent (conversation text near the composer), ordered by priority.
---

## [2026-10-12] - Phase 1 Task 4: Runtime projection
- **Implemented:** `InlineTranslateRuntimeConfig` now = settings (with `triggerKey: string`) + `autoLanguageSelectors`; `index.ts` keeps `baseConfig` (globals) + remembered `siteRules` and projects `config = resolveInlineSiteConfig(base, location.hostname, siteRules)` on every update; `updateInlineTranslateConfig(partial, { siteRules })`; `settingsToRuntime` drops every undefined key. `content.ts` passes `settings.siteRules`.
- **Files changed:** content/inlineTranslate/types.ts, content/inlineTranslate/index.ts, lib/siteRules.ts (generic resolver), entrypoints/content.ts, content/__tests__/inlineTranslate*.test.ts
- **Learnings:**
  - Gotchas: `index.ts` tests mock `@/lib/config` with only `loadSettings`, so content modules must not import other helpers from `lib/config` (they come back undefined). `lib/siteRules` is safe (types-only imports).
  - Gotchas: runtime gesture timing defaults stay at the legacy 0/0/0 until P2T3 rewrites the FSM and its tests (TODO in `types.ts`).
  - Patterns: test runtime-config helpers spread `DEFAULT_RUNTIME_CONFIG` first so new fields never break their type.
---

## [2026-10-12] - Phase 1 Verification
- **Gates:** `pnpm test` 848/848 (123 files) on the rerun, `pnpm compile` 0, `pnpm lint` 37 (baseline).
- **Learnings:**
  - Gotchas: `content/__tests__/webTranslateLifecycle.test.ts` `vi.doMock('@/lib/siteRules')` with a fixed export list; the inline module resolves its config at import time, so a new `lib/siteRules` export it uses must be added to that mock or all 33 lifecycle cases fail on import.
---

## [2026-10-12] - Phase 2 Task 1: Trigger-key alias module
- **Implemented:** `triggerKeys.ts` — alias table (space ≡ NBSP ≡ U+3000; `/`↔`、`, `.`↔`。`, `,`↔`，`, `;`↔`；`, `:`↔`：`, `=`↔`＝`), `matchesTriggerChar`, `triggerCharClass`, `startingKeyAliases`, `isTriggerKeyEvent` (Space via `code`).
- **Files changed:** content/inlineTranslate/triggerKeys.ts, content/__tests__/inlineTranslate.triggerKeys.test.ts
- **Learnings:**
  - Context: unknown keys (`Enter` in legacy tests) map to a one-element class, so the runtime still accepts arbitrary keys on the non-space branch.
---

## [2026-10-12] - Phase 2 Task 2: Tail gate + removeTail
- **Implemented:** `tail.ts` — `passesTailGate` (last non-empty line ends with ≥ min(tapCount,2) consecutive trigger/alias chars), `removeTail` (whole run when matched, else capped at tapCount; drops a preceding `.`/`。` when < 3 removed), `protectUrls` (private-use placeholders, restore). `orchestrate.ts` uses them; `stripTrailingTrigger` deleted.
- **Files changed:** content/inlineTranslate/tail.ts, content/inlineTranslate/orchestrate.ts, content/inlineTranslate/triggerKeys.ts (escape fix), content/__tests__/inlineTranslate.tail.test.ts
- **Learnings:**
  - Gotchas: writing ` ` / `　` through a shell heredoc can land as the literal characters; ESLint `no-irregular-whitespace` then flags regex literals (strings are skipped, so it hides in string tables). Grep for the raw bytes or write escapes from Python.
  - Patterns: the period rule is skipped when `.` is itself the trigger key, otherwise `.`-key bursts would eat a real sentence end.
---

## [2026-10-12] - Phase 2 Task 3: Two-branch gesture FSM; timeWindowMs removed
- **Implemented:** `gesture.ts` rewritten — Space branch (gap/idle/tolerance, evaluate on idle), non-space branch (combo timeout, fire on next task so the key's char is in the field); tail gate callback evaluated at fire time; modifier keys ignored; any other key cancels a pending evaluation. `timeWindowMs` + `inlineGestureWindowMigrated` + `migrateInlineGestureWindowDefaults` deleted; `loadSettings` drops stored `timeWindowMs`. Options: Time Window slider → Tap Gap slider; `buildGestureRow(tapCount, triggerKey)`.
- **Files changed:** content/inlineTranslate/{gesture,index,types}.ts, types/config.ts, lib/config.ts, lib/shortcutDisplay.ts, entrypoints/options/{sections/ShortcutsSection,sections/InlineTranslateSection,components/InlineTranslatePreview}.tsx, tests (parity truth table, settings, ShortcutsSection, chatHardening, inlineTranslate).
- **Learnings:**
  - Gotchas: a keydown fires *before* its character lands. A tail gate or text read at keydown time never sees the current tap — evaluate on the idle timer (Space) or `setTimeout(0)` (other keys), else the Nth char's own `input` event also reads as "user typed during the request".
  - Gotchas: Shift (for `:`) is a non-trigger keydown; without a modifier skip-list it resets every burst on shifted trigger keys.
  - Patterns: pipeline-focused suites pin `idleMs: 0`; suites asserting real defaults advance the fake clock past the 250 ms idle window instead.
---

## [2026-10-12] - Phase 2 Task 4: Gesture-off (shortcut-only) mode
- **Implemented:** gesture `enabled = enabled && gestureEnabled`; `translateFocusedInput` gated only by `enabled`.
- **Files changed:** content/inlineTranslate/index.ts, content/__tests__/inlineTranslate.test.ts
- **Learnings:**
  - Patterns: `setInlineTranslateEnabled` must derive the gesture flag through `gestureConfigFrom`, or re-enabling the feature silently re-arms taps in shortcut-only mode.
---

## [2026-10-12] - Phase 2 Verification
- **Gates:** `pnpm compile` 0, `pnpm lint` 37 (baseline). `pnpm test`: 863/864, 124/125 files across three full runs; the single red is `background.streamStats.test.ts` (known flake `AnyLLMTranslate-slmv`), isolated 3/3 green. A full run at the pre-track base `8eccb2f` and at the Phase 1 checkpoint also went red on streamStats (moving case), so this is not a branch regression. No fully green repeat run was obtained.
- **Learnings:**
  - Gotchas: streamStats/translate background tests mutate the stored settings object in place and reset the settings cache; a fire-and-forget migration `saveSettings` can race and overwrite it. Hypothesis recorded on `AnyLLMTranslate-slmv`.
---

## [2026-10-12] - Phase 3 Task 1: Prefix parser upgrade
- **Implemented:** `parseLanguagePrefix` accepts 1–2 starting chars from the starting-key alias class (`//en`, `、、英文`, `；ko`), `'none'` disables parsing, and a starting key equal to the trailing key is ignored (orchestrate passes `trailingKey`). Token resolution = explicit table (CJK names such as 英文/日文 added) over single-word English/native names from `LANGUAGES` plus validated bare codes; `resolveLanguageToken` (name→code) and `languagePrefixTokens` (code→names) exported.
- **Files changed:** lib/inlineTranslatePrefix.ts, lib/inlineTriggerKeys.ts (moved from content/inlineTranslate/triggerKeys.ts, which now re-exports), content/inlineTranslate/orchestrate.ts, lib/__tests__/inlineTranslatePrefix.test.ts
- **Learnings:**
  - Patterns: the key alias table lives in `lib/inlineTriggerKeys.ts` so lib code (prefix parser) never imports from `content/`.
  - Gotchas: 3+ starting chars are rejected (`///en` stays text); prefix-only gives an empty body, which orchestrate already treats as "nothing to translate".
---

## [2026-10-12] - Phase 3 Task 2: Auto target language detector
- **Implemented:** `resolveAutoTargetLanguage(field, opts)` → `{ lang, source }`. Ordered selectors (the first one whose text yields a detectable language wins): `parentElementTo <ancestor> <selector>` = closest ancestor, then first non-excluded match; plain selectors = all matches (2000-char sample). Text walker skips our injected nodes (`[data-anyllm-owned]`, `[data-anyllm-role]`, translation/inline classes), script/style, and the field subtree. Page fallback (only with `autoLanguagePageEnable`): `<html lang>` normalized (`de-DE`→`de`, `zh-Hant`→`zh-TW`), else body-text detection.
- **Files changed:** content/inlineTranslate/autoLanguage.ts, content/__tests__/inlineTranslate.autoLanguage.test.ts
- **Learnings:**
  - Patterns: Phase 4 in-page UI (overlay, language bar, modals) must carry `data-anyllm-owned` so auto-language never reads it.
  - Gotchas: `detectLanguage` returns Han-only text as `zh` with ≤0.72 confidence and Latin guesses from 0.3; detections under 0.5 are ignored. Invalid user selectors are swallowed (try/catch around `closest`/`querySelectorAll`).
---

## [2026-10-12] - Phase 3 Verification
- **Gates:** `pnpm compile` 0, `pnpm lint` 37 (baseline), `pnpm test` 880/881 (126/127 files); only red = streamStats `dedupes identical source text… bedw` (known flake `AnyLLMTranslate-slmv`, also red at base).
---

## [2026-10-12] - Phase 4 Task 1: Language precedence + same-language notice
- **Implemented:** orchestrate resolves the target as explicit prefix → `resolveAutoTargetLanguage` (auto_selector → auto_page → default). `lastWrittenMap` entries now carry `targetLanguage` and `source` (`InlineTargetSource`) for the language bar. When the result equals the draft (whitespace-normalized) and the draft is detected as the target language, the pipeline shows "Already in <Language>" and leaves the field untouched.
- **Files changed:** content/inlineTranslate/orchestrate.ts, content/__tests__/inlineTranslate.parity.test.ts
- **Learnings:**
  - Gotchas: auto-language runs on `snapshotEl` after `loadSettings`; test configs spread `DEFAULT_RUNTIME_CONFIG`, whose `autoLanguageSelectors: []` keeps legacy tests on the default target.
---

## [2026-10-12] - Phase 4 Task 2: Cancel window + min duration + busy drop
- **Implemented:** `onUserInputDuringTranslate` cancels only within `cancelWindowMs` of the trigger (`activeTriggeredAt`/`activeCancelWindowMs`); later edits are still caught by the pre-write draft check (draft is never overwritten). After the response, the pipeline sleeps until `triggeredAt + minDurationMs` before the identity/draft/focus checks and the write. A trigger while busy is dropped (existing `isTranslating` guard, now tested).
- **Files changed:** content/inlineTranslate/orchestrate.ts, content/__tests__/inlineTranslate.chatHardening.test.ts (+ `minDurationMs: 0` in parity/frameworkWriteback cfg helpers)
- **Learnings:**
  - Gotchas: `vi.useFakeTimers({ shouldAdvanceTime: true })` lets real time leak into `Date.now()`; ms-boundary tests (2999 vs 3001) re-init plain `vi.useFakeTimers()`. Gesture-driven tests run on the module config, so chatHardening's top-level beforeEach sets `updateInlineTranslateConfig({ minDurationMs: 0 })`.
---

## [2026-10-12] - Phase 4 Task 3: Loading overlay
- **Implemented:** `showLoadingOverlay(field)` / `hideLoadingOverlay()` / `getLoadingOverlay()`: fixed, max z-index, `data-anyllm-owned` host with an open shadow root (three amber rolling dots, reduced-motion aware), pinned inside the field's right edge. Repositions on capture-phase scroll, resize and ResizeObserver; self-hides when the field disconnects; mounts inside an open `<dialog>` (top layer) when the field is in one.
- **Files changed:** content/inlineTranslate/overlay.ts, content/__tests__/inlineTranslate.overlay.test.ts
- **Learnings:**
  - Gotchas: jsdom has no layout, so tests stub `getBoundingClientRect` on the field and assert inline styles.
---

## [2026-10-12] - Phase 4 Task 4: Target-language bar + Undo + retarget
- **Implemented:** `showLanguageBar(options)` / `hideLanguageBar()` / `getLanguageBar()`: owned shadow-DOM toolbar below the field with a language chip opening a searchable listbox (filters on code, English and native name), a source badge (`explicit` / `auto` / `default`) and Undo. Choosing a language persists it via the injected `persistTargetLanguage` and calls `onRetarget(lang, getOriginalDraft())`. Auto-hide after 5 s of inactivity (interaction re-arms) is a soft hide that keeps a focus listener; focus reopens only while `isUnchanged()`. Explicit hide / Undo / choose / Escape fully dispose.
- **Files changed:** content/inlineTranslate/languageBar.ts, content/__tests__/inlineTranslate.languageBar.test.ts
- **Learnings:**
  - Patterns: in-page UI modules take persistence and pipeline actions as callbacks, so they never import `@/lib/config` helpers (tests mock it with only `loadSettings`) and avoid an orchestrate import cycle (type-only import).
---

## [2026-10-12] - Phase 4 Task 5: Long-text confirm + first-use guide
- **Implemented:** generic shadow-DOM `openModal` (aria-modal dialog, primary button focused, Escape/backdrop = dismiss value, one modal at a time: a new one settles the old with its dismiss value, focus restored). `needsLongTextConfirm` (> length, 0 / `confirmLongText: false` = off) + `confirmLongText` (Translate / Cancel / Don't ask again → translates and persists `{ confirmLongText: false }`). `shouldShowFirstUseGuide` + `showFirstUseGuide` (gesture, shortcut, Ctrl+Z/Undo; Enable or dismiss persists `{ inlineGuideShown: true }`; Turn off adds `enabled: false` and resolves `'off'`).
- **Files changed:** content/inlineTranslate/modals.ts, content/__tests__/inlineTranslate.modals.test.ts
- **Learnings:**
  - Gotchas: lint bans non-null assertions in source (not in tests); look parts up with optional chaining or a throwing helper.
---

## [2026-10-12] - Phase 4 Task 6: Integrate overlay, bar and modals
- **Implemented:** `OrchestrateOptions` gains `trigger` (`gesture`/`shortcut`/`retarget`), `sourceText`, `targetLanguage`, `onTurnOff`. Before capture (not on retarget): first-use guide on the first gesture (session flag + `inlineGuideShown`; Turn off → `onTurnOff` = `setInlineTranslateEnabled(false)`), then long-text confirm; pacing restarts after the prompts; triggers while a prompt is open are dropped. The overlay is shown with the pulse class and hidden on cancel/finally. After a write the language bar opens (when `enableTargetLanguageBar`): retarget runs the pipeline on the undoMap draft with the chosen language (wins over a prefix; tail stripped only when the draft passes the gate) and keeps the first draft as the undo target; Undo = `tryFallbackUndo`. Settings from in-page UI persist via `persistInlineSettings` (`loadSettings` + `updateSettings`, errors swallowed). index cleanup hides overlay/bar/modal.
- **Files changed:** content/inlineTranslate/orchestrate.ts, content/inlineTranslate/index.ts, content/__tests__/inlineTranslate.integration.test.ts (+ legacy cfg helpers pin `confirmLongText: false`, `enableTargetLanguageBar: false`, `inlineGuideShown: true`)
- **Learnings:**
  - Gotchas: a Space gesture fires `idleMs` (250) after the last tap, so the min-duration write lands at tap + 250 + 1500 ms. `persistInlineSettings` swallows the "no export on mock" error that suites mocking only `loadSettings` would throw.
---
