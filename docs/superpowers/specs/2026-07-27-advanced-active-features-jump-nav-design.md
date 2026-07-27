# Advanced tab — Active features jump navigation

**Date:** 2026-07-27  
**Status:** Draft for implementation  
**Scope:** Options → Advanced → overview “Active features” chips

## Problem

The Advanced tab is long (system prompt, performance, quality, context, PDF, scientific PDF, portability, developer, danger zone). The overview strip already shows live status chips (prompt, Context, Streaming, Debug, RPM, PDF), but they are display-only. Users who scan the strip still have to manually scroll to edit the matching setting.

## Goal

Make each Active features chip a jump control that smooth-scrolls to the top of the related settings **card/section**, so the strip doubles as a mini table of contents without changing settings layout.

## Non-goals

- Deep-linking via URL hash / shareable anchors (can be added later)
- Jumping to individual toggles inside a card (user chose card-level targets)
- Sticky/floating TOC outside the overview strip
- Adding new chips (e.g. Scientific PDF) in this change
- Reusable multi-tab section-nav framework

## Approach

**Chosen: in-page `id` + `scrollIntoView` (Approach A).**

- Stable `id` attributes on each target card wrapper in `AdvancedSection.tsx`
- Chips become keyboard-accessible buttons
- On click: `element.scrollIntoView({ behavior: 'smooth', block: 'start' })`, brief visual highlight, move focus to the target for accessibility
- Rejected hash anchors (routing/history friction on options page) and a shared TOC component (YAGNI for one strip)

## Chip → section mapping

| Chip key / label | Scroll target card | Suggested element `id` |
|------------------|--------------------|------------------------|
| `prompt` — Custom / Default prompt | Translation System Prompt | `advanced-section-prompt` |
| `context` — Context | Context & Intelligence | `advanced-section-context` |
| `stream` — Streaming | Translation Quality | `advanced-section-quality` |
| `debug` — Debug | Developer | `advanced-section-developer` |
| RPM chip (`maxRpm`) | Performance & Throughput | `advanced-section-performance` |
| PDF chip (`pdfAutoOpen`) | PDF Translator | `advanced-section-pdf` |

Chips without a mapped section must not be clickable. All current chips above are mapped.

## Interaction design

1. **Affordance**
   - Chips use `type="button"`, `cursor-pointer`, hover/focus-visible styles
   - Keep existing on/off color treatment; do not restyle as primary CTAs
   - `aria-label` like “Jump to Context & Intelligence” (section title, not chip short label)

2. **Click / keyboard activate**
   - Resolve target by `id`
   - If missing, no-op (defensive; should not happen in production)
   - `scrollIntoView({ behavior: 'smooth', block: 'start' })`
   - Prefer scrolling within the options main content scroller if that is the scroll parent; otherwise window/document is fine if that is what currently scrolls

3. **Focus**
   - Target wrapper is focusable via `tabIndex={-1}`
   - After scroll starts (or on next frame), `focus({ preventScroll: true })` on the target so screen-reader/keyboard users land on the section

4. **Highlight**
   - Brief ring/pulse on the target card (~1–1.5s), then clear
   - Implementation options (pick simplest that matches existing Tailwind patterns): temporary class toggled with `setTimeout`, or CSS animation class removed on `animationend`
   - Respect `prefers-reduced-motion`: still jump and focus; skip or shorten smooth scroll and pulse if reduced motion is preferred

5. **No setting mutation**
   - Jump only; chips do not toggle features

## Implementation sketch

Primary file: `entrypoints/options/sections/AdvancedSection.tsx`

1. Define a small constant map, e.g. `ADVANCED_SECTION_IDS` / chip `targetId` + `ariaLabel`.
2. Add `id={...}` (and `tabIndex={-1}`) on the outer wrapper of each mapped card (the stagger wrapper or the `Card` root — whichever reliably exists and is the visual top of the section).
3. Extract a tiny helper, e.g. `scrollToAdvancedSection(id: string)`, used by all chips.
4. Convert overview chip `<span>`s to `<button type="button">` with the helper on click.
5. Optional: shared highlight state `highlightedSectionId` cleared after timeout; apply highlight class on the matching wrapper.

No store, routing, or portable-settings changes.

## Accessibility

- Buttons, not non-interactive spans
- Descriptive `aria-label` per chip
- Visible `:focus-visible` ring on chips and on the jumped section while focused/highlighted
- Reduced-motion friendly scroll/highlight
- Do not trap focus; only move focus once to the section

## Testing

- Unit/component test (existing AdvancedSection test patterns): clicking a chip calls scroll/focus path for the expected `id` (mock `scrollIntoView` / focus).
- Mapping coverage: every chip in the overview has a target id present in the rendered tree.
- Manual: open Options → Advanced, click each chip, confirm card tops into view and highlight/focus behave; keyboard Tab to chip + Enter/Space.

## Risks & mitigations

| Risk | Mitigation |
|------|------------|
| Sticky header covers card title after scroll | Use `scroll-margin-top` on targets if layout has a sticky bar |
| Smooth scroll + focus fights each other | `focus({ preventScroll: true })` after initiating scroll |
| Double-click spam queues highlights | Replace highlight timer on each jump; single active highlight id |

## Success criteria

- Every Active features chip jumps to the correct card top
- Keyboard and screen-reader users can activate chips and land on the section
- No change to chip status semantics (on/off colors still reflect live settings)
- No regressions to Advanced settings save/import behavior
