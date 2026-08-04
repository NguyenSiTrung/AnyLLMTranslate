# Mini Studio Glass Redesign — Design Spec

> **Date:** 2026-08-04
> **Status:** Approved (brainstorming)
> **Approach:** Sectioned single column (Approach A), glassmorphism visual language
> **Related:**
> - [Player Subtitle Chrome (In-Player Mini Studio)](./2026-07-31-player-subtitle-chrome-design.md) — parent feature spec; control set and behavior contracts defined there remain normative
> - [Selection Bubble Redesign](./2026-07-23-selection-bubble-full-redesign-design.md) — glassmorphism precedent for content-script UI

---

## 1. Context

The in-player mini studio (`content/playerChrome/miniStudio.ts`) ships the approved v1 control set — enable, display mode, font size, position, background opacity, four style knobs, glossary list, status line, and a link to the full Subtitle Studio — but its presentation is utilitarian:

- Flat, unsectioned stack of ten controls in a 280px dark box.
- Browser-native widgets (checkbox, `<select>`, unstyled range inputs) that render inconsistently across browsers and look dated.
- Raw technical values exposed to users (`idiomatic`, `terse`, lowercase knob keys as labels).
- Plain cyan status text with no semantic color or icon.
- No live preview — appearance changes are only visible after closing the panel.
- Text-based `A⇄` anchor button with no state feedback.
- Instant appear/disappear with no motion.
- Predates the glassmorphism language established by the selection bubble redesign.

### Problem summary

| Gap | Detail |
|-----|--------|
| No visual hierarchy | Appearance, translation behavior, and glossary controls mixed in one flat list |
| Dated widgets | Native checkbox/select/slider; inconsistent cross-browser rendering |
| Unfriendly copy | Raw knob keys and lowercase enum values as user-facing labels |
| No preview | Users must close the panel to see font/opacity/position changes |
| Weak status signaling | Plain text; no color semantics or iconography |
| No motion | Abrupt open/close |
| Stateless anchor | `A⇄` text button gives no indication of subtitle state |

---

## 2. Goals

1. **Glassmorphism panel** matching the selection-bubble material: translucent dark + backdrop blur, hairline border, soft shadow, cyan accent.
2. **Sectioned single-column layout** (Approach A): header, live preview, Appearance / Translation style / Glossary sections, footer.
3. **Modern widgets**: toggle switch, segmented controls, styled sliders with value bubbles, styled selects — all built on native inputs underneath to preserve keyboard and screen-reader behavior.
4. **Live preview strip** inside the panel that reflects appearance changes instantly.
5. **Status pill** with semantic color and icon.
6. **SVG anchor button** with state feedback (off / enabled / translating).
7. **Open/close motion** respecting `prefers-reduced-motion`.
8. **Pure presentation refactor** — no changes to settings write paths, storage keys, or the visibility/lifecycle state machines.

---

## 3. Non-Goals

- New controls beyond the approved v1 set (no retry, track picker, ASR, reset button, quick-toggle-on-icon).
- Changes to `prefs.ts` write APIs, `subtitleControls.ts`, settings schema, or storage keys.
- Changes to the visibility state machine (`visibility.ts`), mount logic (`mountFloating.ts` / `mountNative.ts`), or adapter contracts.
- React or any framework inside the shadow DOM (parent spec non-goal).
- Options-page Subtitle Studio redesign.
- Custom dropdown popups replacing native `<select>` listboxes (styled native selects only).

---

## 4. Product decisions (locked this brainstorm)

| Decision | Choice |
|----------|--------|
| Redesign scope | **Full redesign** — reorganized sections, modern widgets, live preview, status pill, motion, SVG state button |
| Visual language | **Glassmorphism** — translucent dark + backdrop blur, matching the selection bubble |
| Layout | **Approach A** — sectioned single column, header + preview + sections + footer, single scroll |
| Widget strategy | Native inputs underneath (checkbox/radio/range/select), fully restyled — a11y and testability preserved |
| Write paths | Unchanged (`prefs.ts` APIs remain the only authority) |

---

## 5. Design details

### 5.1 Visual language

| Token | Value |
|-------|-------|
| Panel background | `rgba(12,12,16,0.72)` with `backdrop-filter: blur(16px) saturate(1.4)` |
| Fallback background (no backdrop-filter) | `rgba(12,12,16,0.97)` via `@supports not (backdrop-filter: …)` |
| Border | `1px solid rgba(255,255,255,0.08)` |
| Radius | 16px panel; 10px widgets; 999px pills/toggle |
| Shadow | `0 16px 48px rgba(0,0,0,0.5)` |
| Accent | cyan `#0ea5e9` / `#22d3ee` (existing extension accent) |
| Text | section labels 11px uppercase tracked, zinc-500; control labels 12px, zinc-300; values 13px, zinc-50 |
| Panel size | 288px wide; `max-height: min(72vh, 480px)`; slim custom scrollbar |
| Motion | open: 160ms ease-out fade + 6px slide-up; close: 120ms fade-in-reverse; disabled under `prefers-reduced-motion` |

### 5.2 Panel structure (top → bottom)

1. **Header** — "Subtitles" title; **status pill** (dot + label); close ✕ button.
   - Status mapping: `idle` → "Ready" (cyan dot), `waiting` → "Waiting for captions" (amber dot), `translating` → "Translating" (pulsing cyan dot), `error` → "Error" (red dot), `disabled` → "Off" (zinc dot).
2. **Live preview strip** — 16:9 mini-"video" area (subtle dark gradient) rendering a sample bilingual cue (e.g. original line + translated line) that updates instantly with font size, background opacity, position (top/bottom within the strip), and display mode (bilingual hides the original line). Purely presentational; never touches the real overlay.
3. **Enable row** — "Enable subtitles" label + toggle switch (restyled checkbox, `role` preserved via native input).
4. **Appearance section** —
   - Display mode: segmented control (Bilingual | Translation only), radios underneath.
   - Font size: slider with cyan filled track + value bubble (`18px`), 12–36 step 1.
   - Position: segmented control (Bottom | Top), radios underneath.
   - Background: slider with filled track + % bubble, 0–100 step 5.
5. **Translation style section** — four styled selects: Faithfulness, Brevity, Register, Profanity. Capitalized labels; option text capitalized (e.g. "Auto", "Idiomatic", "Terse"). Glass background, custom chevron, cyan focus ring; native `<select>` element preserved.
6. **Glossary section** — styled select, "None" first option, long names truncated with ellipsis.
7. **Footer** — subtle full-width link-button "Open Subtitle Studio ↗" (existing `OPEN_OPTIONS` path unchanged).

### 5.3 Anchor button

- SVG captions glyph replaces `A⇄` text (inline SVG, `currentColor`).
- State feedback via a status modifier class on the button:
  - `off` (subtitles disabled): zinc icon, no glow.
  - `enabled`: cyan-tinted icon + hairline cyan ring.
  - `translating`: soft 1.6s pulse glow; animation removed under `prefers-reduced-motion`.
- State derives from the existing `MiniStudioSnapshot.status` / enabled flag. Updates are event-driven, no polling: (a) on every panel refresh, and (b) via a `chrome.storage.onChanged` listener (settings writes already flow through `updateSettings`), which re-derives enabled + samples `isInOverlayMode()` for the translating state. No new message actions.
- Unchanged: 36px hit target, `aria-label`, `aria-expanded`, click toggle behavior.

### 5.4 Behavior

- Open/close triggers unchanged (icon toggle, Escape, outside pointerdown) **plus** the header ✕ button.
- Panel remains sticky while open; visibility state machine untouched.
- All control handlers call the same `prefs.ts` APIs (`setSubtitlesEnabled`, `setAppearance`, `setTabKnob`, `setActiveGlossaryList`) with the same payloads; `data-action` attributes are preserved on the new widgets so existing test selectors keep working.
- Slider `input` events update the bubble **and the preview** live; `change` events persist (unchanged from current behavior).
- Preview updates on `input` (not just `change`) — this is the one deliberate UX addition, presentation-only.

### 5.5 Accessibility

- Native inputs underneath every custom widget (checkbox for toggle, radio groups for segmented controls, range for sliders, select for dropdowns).
- `role="dialog"` and `aria-label` on the panel preserved; ✕ gets `aria-label="Close"`.
- Visible cyan focus rings on all interactive elements.
- `prefers-reduced-motion`: no panel transition, no status pulse.
- Status pill keeps `aria-live="polite"` semantics from the current status line.

---

## 6. Architecture

### 6.1 File changes

```
content/playerChrome/
├── miniStudio.ts        # lifecycle + bindings only (slimmed from ~370 lines)
├── miniStudioView.ts    # NEW — panel DOM template + section/widget composition
├── miniStudioCss.ts     # NEW — glass stylesheet as exported CSS text
├── widgets.ts           # NEW — toggle / segmented / slider / styled-select builders
├── button.ts            # MODIFIED — SVG glyph + state modifier class
└── prefs.ts             # unchanged
```

- `miniStudio.ts` keeps the `attachMiniStudio` export signature and the `MiniStudioControllers` contract — `index.ts` needs no changes.
- `widgets.ts` builders return `{ root, input(s) }` and set `data-action` attributes matching today's values (`enable`, `displayMode`, `fontSize`, `position`, `opacity`, `glossary`, `knob`, `open-options`) so event wiring and tests stay aligned.
- `miniStudioCss.ts` exports a template-string constant consumed by `miniStudioView.ts`; all panel CSS moves out of `miniStudio.ts`.
- `button.ts` adds `setButtonState(state: 'off' | 'enabled' | 'translating')` on the created button (or a returned handle) driven by `applySnapshot`.

### 6.2 What is NOT touched

`index.ts`, `visibility.ts`, `host.ts`, `mountFloating.ts` (except no changes needed — panel slot and shadow CSS stay), `mountNative.ts`, `fullscreen.ts`, `adapters/*`, `prefs.ts`, `types.ts`, and all coordinator/overlay modules.

### 6.3 Edge cases

| Case | Behavior |
|------|----------|
| No `backdrop-filter` support | Solid fallback background via `@supports` |
| Reduced motion | No transitions/pulse |
| Long glossary names | Ellipsis truncation in styled select |
| Very short viewports | Panel scrolls; max-height clamp unchanged in spirit (`min(72vh, 480px)`) |
| Extension context invalidated | Existing quiet-fail paths in `prefs.ts` unchanged |
| Preview with display mode `translation-only` | Original line hidden in preview, mirroring overlay semantics |
| Knob value missing from options | Select falls back to `auto` (existing `fillSelect` behavior retained) |

---

## 7. Testing strategy

| Layer | Coverage |
|-------|----------|
| Unit | `widgets.ts` builders render expected structure and set `data-action` / values |
| Unit | `applySnapshot` maps snapshot → new widgets (toggle checked, segmented selection, slider values, status pill class/label, button state class) |
| Unit | Existing wiring tests updated for new DOM: enable, displayMode, fontSize, position, opacity, glossary, knob, open-options handlers call the same `prefs.ts` APIs |
| Unit | Preview updates on slider `input` without persisting (no `setAppearance` call until `change`) |
| Unchanged | lifecycle, visibility, mount-fallback, adapter, and prefs tests must pass untouched |

Manual: open panel on YouTube (floating + native mount) and one generic site; verify glass rendering, preview live-update, sticky-while-open, Esc/outside/✕ close, fullscreen, reduced-motion.

---

## 8. Success criteria

- [ ] Panel renders glassmorphism material with fallback; matches tokens in §5.1.
- [ ] All v1 controls present, organized into header / preview / Appearance / Translation style / Glossary / footer.
- [ ] Preview updates live on slider input and display-mode/position changes.
- [ ] Status pill shows correct color + label for all five statuses.
- [ ] Anchor button shows off / enabled / translating states.
- [ ] Every control writes through the existing `prefs.ts` APIs; no new storage keys or message actions.
- [ ] Open/close motion present; absent under `prefers-reduced-motion`.
- [ ] `npm run lint` and the playerChrome unit test suite pass.

---

## 9. Risks & mitigations

| Risk | Mitigation |
|------|------------|
| Restyled widgets break existing tests | Preserve `data-action` values and `MiniStudioControllers` contract; update tests alongside |
| Backdrop-filter perf on low-end machines | Blur radius modest (16px); solid fallback; no animated blur |
| Shadow DOM style leakage | All styles remain inside the existing shadow root stylesheet |
| Scope creep into behavior | Spec limits change to presentation; write paths frozen |
| Slider fill styling cross-browser | Standard `::-webkit-slider-thumb` / `::-moz-range-thumb` + JS-driven fill custom property; jsdom tests assert classes/attrs, not paint |

---

## 10. Summary

Reskin and reorganize the in-player mini studio into a **glass, sectioned panel** — header with status pill and close, live preview strip, Appearance / Translation style / Glossary sections, modern native-backed widgets, and an SVG state-aware anchor button — while keeping every write path, contract, and behavior defined in the parent player-chrome spec intact.
