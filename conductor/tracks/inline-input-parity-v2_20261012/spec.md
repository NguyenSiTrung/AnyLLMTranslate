# Spec: Inline Input Translation — Refer-Parity v2

## Overview

Bring the inline (in-field) translation feature to behavioral parity with the
reference extension (`refer/`, build 1.33.3) analysed on
2026-10-12, while keeping our stronger write-back (exact verification,
framework-API writers, copy-panel fallback). Scope: gesture FSM, tail gate +
removeTail, trailing-key + shortcut-only mode, language prefix + auto target
language, per-site overrides, pacing (cancel window, min-duration, loading
overlay), target-language bar + undo, long-text confirm, first-use guide,
Options UI, local stats attribution.

Predecessors: `inline-translate_20260418`, `inline-input-parity_20260709`
(archived). Evidence: `refer/content_main.js` prettified at
`/tmp/refer_extract/content_main.pretty.js` (line cites below), `refer/default_config.json`.

## Functional Requirements

### FR-1 Gesture FSM (two branches, refer `Pqe` 85836–85967)
- **Space branch:** a tap counts only when the tail gate (FR-4) passes;
  `count++` if `now − lastTap ≤ triggerGapMs` (250) else `count = 1`; every tap
  re-arms an idle timer of `idleMs` (250). On idle fire:
  `tapCount ≤ count ≤ tapCount + triggerToleranceCount` (3..5) → fire; else
  reset, no fire (6+ fast taps never fire).
- **Non-space branch:** `count` resets when `now − lastHandled > triggerTimeoutMs`
  (combo interval, default 200); fire immediately when `count ≥ tapCount`.
- Any non-trigger key, delete-type input, or `compositionstart` resets counters.
- Keep ours: keydown primary + `insertText` fallback dual path, 100 ms dedupe,
  IME composition guards, `isTrusted` (production), deep-active target.
- `timeWindowMs` is removed (clean cutover); `triggerGapMs` becomes live
  (currently plumbed but never read).

### FR-2 Trailing trigger key
- Options: `space` (default) `/ = ; , . :`. Gesture uses the stored key.
- Equivalence: `space` matches `' '`, `U+00A0`, `U+3000`; punctuation keys match
  their full-width IME forms (`/`→`、`, `.`→`。`, `,`→`，`, `;`→`；`, `:`→`：`)
  per refer `inputStartingTriggerKeyAlias`.

### FR-3 Gesture-off (shortcut-only) mode
- New `gestureEnabled` (default true). When false and the feature is enabled,
  only the `translate-input-box` command (Alt+I recommended, user-bound) and the
  existing `translateFocusedInput()` path trigger translation.

### FR-4 Tail gate (refer `qR` 86468, `pde` 86511)
- Keep caret-at-end check. Additionally: the last non-empty line must end with
  the trigger char (or alias) and contain ≥ `min(tapCount, 2)` consecutive
  trigger chars. Typing a letter after the taps aborts.

### FR-5 removeTail (refer `Z5` 86607)
1. Trim trailing newlines/whitespace when the key is space.
2. If the tail matched, delete exactly the consecutive trigger count
   (whitespace-class equivalence); otherwise delete trailing trigger/alias chars
   capped at `maxDelete = tapCount`.
3. If fewer than 3 removed and the preceding char is `.`/`。`, remove it too.
4. `https?://…` spans are replaced with placeholders before prefix parsing and
   restored after (refer `rqe` 84420).

### FR-6 Language prefix (refer `Ice`/`eqe`/`nqe` 84440–84481)
- Starting key dropdown: `/ = ; , . :` + `none` (disables prefix parsing);
  options exclude the selected trailing key.
- Prefix char aliases (FR-2 table). Language token resolves through a
  bidirectional code↔name alias table (seed from refer `inputLanguageCodeAlias`,
  e.g. `英文`→`en`, `中文`/`zh`→`zh-CN`) plus our language list.
- A prefix with no body text after it is not a translation request (no fire).
- Prefix token is stripped from the written result.

### FR-7 Auto target language (refer `Zqe` 87215)
- Precedence: explicit prefix → `auto_selector` (per-site selectors; text of
  matched nodes, excluding our own injected nodes, → `lib/langDetect`
  `detectLanguage`) → `auto_page` (opt-in, page language) → default
  `targetLanguage`.
- Selector syntax supports refer's `parentElementTo <ancestor> <selector>`
  (closest ancestor of the field, first match) and plain selectors (all matches).
- Settings: `autoLanguageEnable` (default true), `autoLanguagePageEnable`
  (default false).
- Same-language handling (refer `Pde` 87139): if detected source equals the
  resolved target and the result equals the source text, show an
  "Already in <language>" notice instead of writing.

### FR-8 Per-site overrides
- `SiteRule` gains optional `inlineTranslate?: InlineSiteOverride` with
  `triggerGapMs, idleMs, triggerToleranceCount, cancelWindowMs, minDurationMs,
  confirmLongTextLength, autoLanguageEnable, autoLanguageSelectors`.
- Built-in seed selectors for Twitter/X, Reddit, YouTube, Discord, Telegram,
  WhatsApp (from refer `rules[].inputConfig.add`).
- Site Rules editor: "Inline translate" disclosure (selectors textarea + numeric
  overrides). Resolution: global settings ← most-specific matching site rule.

### FR-9 Pacing (refer `lde` 85645, `x3` 86333)
- Cancel window: any user input in the field within `cancelWindowMs` (3000)
  after trigger cancels the in-flight request and resets counters (our own
  write-back is excluded via `isWritingBack`).
- Min duration: the result is not written until `minDurationMs` (1500) has
  elapsed since trigger. One request at a time; triggers while busy are dropped.

### FR-10 Loading overlay (refer `Nqe` 86217)
- Rolling-dot indicator anchored to the field (shadow-DOM host, max z-index,
  repositions with the field), shown from trigger until write/cancel/error.
  Coexists with our existing pulse class.

### FR-11 Target-language bar + undo (refer `zR`, `Qce` 85256, 85566)
- After a successful write (when `enableTargetLanguageBar`, default true):
  floating bar anchored to the field with: target-language chip + searchable
  menu, source badge (`explicit` / `auto` / `default`), Undo button.
- Choosing a language persists `targetLanguage` and re-translates the
  **original draft** in place (from `undoMap`), not the translation.
- Undo restores the original draft (our verified writer). Auto-hides after ~5 s
  of inactivity; reopen on field focus while the translation is unchanged.
- Native Ctrl+Z stays primary for plain `input`/`textarea` (write ordering keeps
  `execCommand('insertText')` first there); our fallback undo remains.

### FR-12 Long-text confirm (refer `kce` 84366)
- If the request text length > `confirmLongTextLength` (200; 0 = off): modal
  Translate / Cancel / Don't ask again (persists `confirmLongText: false`).

### FR-13 First-use guide
- On the first gesture fire per install, show a one-time guide modal
  (Space×N, Alt+I, Ctrl+Z / Undo) with Enable / Turn off; persists
  `inlineGuideShown` and, on Turn off, `enabled: false`.

### FR-14 Settings model + migration
- `InlineTranslateSettings` adds `gestureEnabled, triggerTimeoutMs,
  cancelWindowMs, minDurationMs, confirmLongText, confirmLongTextLength,
  enableTargetLanguageBar, autoLanguageEnable, autoLanguagePageEnable`; removes
  `timeWindowMs`; `triggerKey` constrained to the FR-2 set.
- Defaults = refer: gap 250, idle 250, tolerance 2, timeout 200, cancel 3000,
  min-duration 1500, long-text 200.
- One-shot versioned migration (`inlineParityV2Migrated`): installs carrying
  the old default fingerprints (idle 0, gap 0, tolerance 0) get the new
  values; user-customized values are kept; `timeWindowMs` dropped. Values of
  `triggerTimeoutMs` < 100 are ignored (default used); range 150–1000.

### FR-15 Options UI (Inline Translate section)
- Refer surface: enable, gesture on/off, target language, keep-original (dual),
  auto-language (chat / page), starting key (incl. none), trailing key, combo
  interval (150–1000), URL exclude list.
- Advanced disclosure: tap count, gap, idle, tolerance, cancel window,
  min-duration, long-text threshold, target-language bar on/off, fallback undo.
- Copy follows refer intent (en); live preview text reflects selected keys.

### FR-16 Local stats attribution
- Inline requests record `mode: 'inline'` (today they are counted as
  `'selection'` because inline reuses `translateSelection`; `inlineEvents`
  never increments). Existing v2 dimensions only (language pair, provider,
  host when host tracking is on); no stats schema change. On-device only.

## Non-Functional Requirements
- No regression in framework-composer safety (Quill/Draft/Lexical/ProseMirror
  guards, exact verification, copy panel).
- Zero work on non-trigger keystrokes beyond O(1) bookkeeping.
- All timers/clock injectable (`now()`) for Vitest fake timers.
- Extension UI (overlay, bar, modals) isolated in shadow DOM; no host style
  pollution.
- TypeScript strict, named exports, coverage floor ≥ 70 %.

## Acceptance Criteria
1. FSM truth table passes (fake timers): Space gaps 200 ms ×3 → fire;
   400 ms gaps ×3 → no fire; 4–5 taps → fire; 6 taps → no fire; NBSP/U+3000
   count; letter after taps → no fire; non-space `/`×3 within 200 ms → fire.
2. removeTail vectors: NBSP, U+3000, `.`/`。` rule, URL placeholders round-trip.
3. Prefix: `//en hello`, `、、英文 hello`, `none` mode, prefix-only no-fire.
4. Auto language: selector hit → detected target; page fallback when enabled;
   default otherwise; same-language notice.
5. Cancel window 2999 ms cancels / 3001 ms does not; min-duration hold 1500 ms.
6. Bar: retarget re-translates the original draft; Undo restores it; settings
   persist.
7. Migration: old-default fingerprints migrate; custom values preserved;
   flag prevents re-run.
8. Stats: inline translation increments `inlineEvents`, not `selectionEvents`.
9. Integration test (Vitest/jsdom, fake timers) on a plain textarea and a
   contentEditable composer: gesture → overlay held ≥ 1.5 s → write →
   language change → Undo; draft never mutated before the response.
   No manual verification steps in this track (user decision 2026-10-12).
10. `pnpm test` green (known flake rules apply), `pnpm compile` 0, lint count
    not above baseline (37).

## Out of Scope
- Per-feature service picker (`inputTranslationService`): no per-feature
  provider routing exists in the pool (`bestEffortProviderId`).
- Mobile timeout / touch gesture (product non-goal: mobile browsers).
- WebView floating dot; per-site tutorial placeholders (`tutorialsText`).
- Refer's 4-strategy blind write chain + containment verification.
- Network telemetry.
