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
