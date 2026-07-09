# Spec: Inline Input Translation — Immersive-Parity Hardening

## Overview

Harden and expand **inline input-box translation** so it approaches Immersive Translate’s input-translation pipeline: IME-safe gestures, multi-strategy write-back, deep focus resolution, race-safe replace, language-prefix targeting, `Alt+I` shortcut, site blocklist, and a full advanced settings panel — while **default write mode remains translation-only**.

Builds on archived track `inline-translate_20260418` and code in `content/inlineTranslate.ts`.

**Out of scope by decision:** Mobile/WebView floating-dot UI.

## Goals

1. **Correctness** — No false triggers under IME or key-repeat; no overwrite of user edits mid-request.
2. **Compatibility** — Reliable write-back on React/Vue/Angular inputs, CE, shadow roots where feasible.
3. **Parity features** — Prefix language codes, `chrome.commands` shortcut, URL blocklist, dual mode optional.
4. **Maintainability** — Split monolithic module; TDD; Immersive reference as design oracle, not code dump.

## Functional Requirements

### FR-1: Gesture robustness (P0)

- **FR-1.1**: Ignore `event.isComposing`, `event.repeat`, and untrusted events for gesture counting.
- **FR-1.2**: Reset / ignore gesture progress on composition (`compositionstart`/`end`) and delete-like input where applicable.
- **FR-1.3**: Prefer dual listening model: capture `keydown` (current) **and** `input`/`keyup`/`compositionend` for IME-safe trailing-space counting (Immersive-aligned).
- **FR-1.4**: Optional idle debounce after last trigger tap before fire (configurable; Immersive uses idle after space bursts).
- **FR-1.5**: Keep existing config: `triggerKey`, `tapCount`, `timeWindowMs`; add advanced knobs (idle/gap/tolerance) as needed.

### FR-2: Race-safe orchestration (P0)

- **FR-2.1**: Snapshot `rawText` + element identity before request; abort write if field text or element identity changed.
- **FR-2.2**: Re-verify `isConnected` + editable after await.
- **FR-2.3**: Request id / cancel when user continues typing in a cancel window (Immersive-style cancel).
- **FR-2.4**: Do not leave toast/pulse stuck on cancelled/aborted runs.

### FR-3: Multi-strategy write-back (P0/P1)

- **FR-3.1**: Primary: selection + `InputEvent` (`beforeinput`/`input`, `inputType: 'insertText'`) + `execCommand('insertText')` where available.
- **FR-3.2**: Fallbacks: direct value assign + events; contentEditable selectAll + insertText; legacy paths only if needed.
- **FR-3.3**: Verify written text matches expected; try next strategy if verify fails.
- **FR-3.4**: Default **translation-only** replace; optional **dual mode** setting joins original + translation (separator rules for input vs textarea).
- **FR-3.5**: On total failure: restore snapshot original and error toast.

### FR-4: Deep focus & editable guards

- **FR-4.1**: Resolve deep active element (shadowRoot, same-origin iframe, CE caret parent).
- **FR-4.2**: Skip `readOnly`, `disabled`, password; improve code-editor detection.
- **FR-4.3**: Prefer caret-at-end (or strip trailing trigger only when caret is at end) for trailing-space gestures to avoid mid-string corruption.
- **FR-4.4**: Full-field translate (current); partial selection translate remains out of scope.

### FR-5: Language prefix (`/` + codes)

- **FR-5.1**: If text starts with configured prefix + language token (e.g. `/en`, `/ja`, aliases), use that as **this-request** target language.
- **FR-5.2**: Strip prefix (+ optional trailing space after code) before translate and write.
- **FR-5.3**: Fire still requires **trailing gesture or Alt+I** (no auto-fire on prefix alone).
- **FR-5.4**: Default prefix `/`; aliases table inspired by Immersive (en, zh, ja, ko, vi, fr, es, etc.).
- **FR-5.5**: Enable/disable + prefix char configurable in advanced panel (default on).

### FR-6: Shortcut `translate-input-box` (Alt+I)

- **FR-6.1**: Add `chrome.commands` entry `translate-input-box` suggested `Alt+I`.
- **FR-6.2**: Background routes command → content message (e.g. `translateInputBox`).
- **FR-6.3**: Content translates focused deep-active editable using same pipeline as gesture (no need for trailing spaces).
- **FR-6.4**: Document conflict with user-customized Chrome shortcuts; show command in Options shortcuts help if present.

### FR-7: Site blocklist / excludes

- **FR-7.1**: Default blocklist for hosts that break on programmatic input (seed from Immersive: Notion, Figma, Lark/Feishu patterns, etc.).
- **FR-7.2**: Configurable URL patterns in advanced settings; honor exclude matches.
- **FR-7.3**: No activation of gesture/shortcut write path on blocked URLs (still no-op cleanly).

### FR-8: Undo & feedback

- **FR-8.1**: Keep native undo via successful `execCommand` path.
- **FR-8.2**: Wire `undoMap` fallback: re-trigger gesture/shortcut or explicit undo affordance restores pre-translate text when native undo is unavailable.
- **FR-8.3**: Toast + pulse remain; improve scroll-safe positioning if cheap; cancel clears feedback.

### FR-9: Settings — full advanced panel

- **FR-9.1**: Expand Options → Inline Translation with **full advanced** controls:
  - Enable, default target language, trigger key / tap count / time window
  - Idle debounce, trigger gap, tolerance (if implemented)
  - Language prefix enable + prefix key
  - Dual mode toggle (default off)
  - Blocklist editor (patterns)
  - Shortcut hint (Alt+I / Chrome shortcuts link)
- **FR-9.2**: Deep-merge nested `inlineTranslate` settings (existing pattern).
- **FR-9.3**: Sensible defaults matching Immersive where safe (triple space, translation-only, prefix on).

### FR-10: Module structure

- Split `content/inlineTranslate.ts` into focused modules under `content/inlineTranslate/`:
  - `gesture.ts`, `editable.ts`, `writeback.ts`, `feedback.ts`, `prefix.ts`, `blocklist.ts`, `index.ts`
- Public API stays: `initInlineTranslate`, `setInlineTranslateEnabled`, `updateInlineTranslateConfig` (extend config type). Re-export from existing path if needed for import stability.

### FR-11: Tests

- Unit tests for IME/repeat guards, snapshot race, write-back verify chain, deep active (jsdom limits documented), prefix parse/strip, blocklist match, dual mode join, command message path.
- Regression: existing triple-space happy path must still pass.

## Non-Functional Requirements

- No new npm dependencies.
- TDD per `conductor/workflow.md`; `pnpm test` + `pnpm lint` green.
- Gesture path must stay low-latency (count path < ~5ms per keystroke).
- TypeScript strict; no `any` leaks.
- Host-page CSS still via `styles/inject.css` only for toast/pulse.
- Do not port Immersive minified code verbatim — reimplement cleanly.

## Acceptance Criteria

- [ ] IME composition and key-repeat do not fire false triple-space translations.
- [ ] Editing the field during an in-flight request does not overwrite user text.
- [ ] Write-back succeeds on plain input/textarea with verify; fallback works when `execCommand` fails.
- [ ] `/en hello` + gesture uses English as target and strips `/en`.
- [ ] `Alt+I` (`translate-input-box`) translates focused input via same pipeline.
- [ ] Default blocklist prevents activation on listed hosts; patterns configurable.
- [ ] Dual mode optional; default remains translation-only.
- [ ] Fallback undo restores original when native undo unavailable.
- [ ] Full advanced Options panel for new settings.
- [ ] Module split + comprehensive unit tests; existing tests updated.

## Out of Scope

- Mobile / WebView floating-dot translator button.
- Partial in-field selection translate (use existing text-selection feature).
- Rich HTML preservation inside contentEditable (plain text replace OK; document limitation).
- Separate `inputTranslationService` provider override (use main pool / same as selection translate).
- Same-language modal / power-user upsell (Immersive product UX).
- Touch multi-finger shortcuts.

## Technical Approach (summary)

| Area | Approach |
|------|----------|
| Reference | `ImmersiveTransalteExtensionCode/1.30.3_0` input-translate behaviors |
| Message | Reuse `translateSelection`; add content action `translateInputBox` from command |
| Settings | Extend `InlineTranslateSettings` + defaults + Options section |
| Commands | `wxt.config.ts` + `background.ts` + content listener |

## Decisions locked

| Decision | Choice |
|----------|--------|
| Scope | Full Immersive-like minus WebView dot |
| Settings UX | Full advanced panel |
| Default write | Translation only; dual optional |
| Prefix | Prefix + trailing gesture/Alt+I to fire |
| Shortcut | `chrome.commands` + content handler |
| Execution | Sequential phases |
| Priority | High |
