# Scientific Job Modal UX Redesign

**Date:** 2026-07-17  
**Issue:** AnyLLMTranslate-w5y  
**Status:** Approved for planning  
**Scope:** Full `ScientificJobModal` (running, done, error) — not PDF viewer toolbar chrome

## Problem

After Translate (Scientific) completes, the modal stacks pipeline chips, a full progress bar, status copy, a dense activity log, a bullet essay of format definitions, and multiple equal-weight buttons. Users cannot quickly answer:

1. Did it succeed?
2. Which file should I take?
3. What does each format actually mean?

Jargon (`pdf2zh`, `L|R`, dual mono labels) and a always-visible log make the done state feel like a debug console rather than a completion moment.

## Goals

- Clear state-specific focus: calm wait → clear recovery → confident download choice.
- Download-first completion UX with viewer as secondary.
- Plain-language format labels and honest dual-layout copy.
- Default recommended format: side-by-side when available.
- Preserve existing job APIs and manual-download policy (no auto-download).

## Non-goals

- Toolbar / Fast vs Scientific toggle / header pill redesign.
- New export formats or bridge API changes.
- Auto-open of result PDF.
- Changing `useScientificPdfJob` orchestration beyond what the UI needs for busy/feedback states.

## Approach

**Success cards + collapsible log (Approach A).**

One modal, three layouts driven by `progress.stage`:

| State | Focus |
|-------|--------|
| Running (`checking`…`downloading`) | Steps + progress + short status; activity log collapsed |
| Done | Format cards + primary Download + secondary Open/Close; log collapsed |
| Error | Human message + one primary recovery action; log expanded once |

## Information architecture

### Shell (all states)

- Title reflects outcome (working / complete / failed).
- Job ID remains muted monospace meta under the title (optional, not primary).
- Cancel while active; Close on done/error.
- Keep dark PDF-viewer chrome tokens (`#18181b`, zinc borders, blue primary, green success).

### Running

1. Horizontal step rail: Connect → Upload → Translate → Fetch → Done (existing stage map / labels).
2. Progress bar + percent.
3. One status sentence (plain language).
4. Activity log in a collapsible `<details>` (or equivalent), **collapsed by default**.
5. Auto-scroll log **only when expanded**.

### Done

1. Success title: `Translation ready`.
2. Subcopy: `Choose a format, then download. Nothing downloads automatically.`
3. Format **cards** (radiogroup): hide unavailable formats entirely.
4. Primary CTA: download selected format (label follows selection).
5. Secondary: `Open in viewer`, `Close`.
6. Log stays collapsed.
7. Inline download feedback under actions (`Downloading…` / `Assembling…` / `Saved`), no second modal.

### Error

| Condition | Primary | Secondary |
|-----------|---------|-----------|
| Offline / setup (`errorCode === 'offline'`) | Open setup | Close |
| Other failure | Retry | Close |

- Show human-readable `progress.error` (or stage message).
- Expand activity log once on error so the failure line is visible.
- If partial artifacts exist after a soft failure path, prefer showing available format cards with a soft warning rather than a dead-end error when the product already has downloadable mono/dual — only when existing progress flags support it; otherwise pure error UI.

## Format model & copy

| Internal | Card title | Hint | Download CTA |
|----------|------------|------|----------------|
| Side-by-side | Side-by-side | Original on the left, translation on the right. | Download side-by-side |
| Dual (`hasDual`) | Bilingual (bridge) | Original and translation paired by the layout engine. | Download bilingual |
| Mono (`hasMono`) | Translated only | Layout-preserving pages in the target language. | Download translated PDF |

- Badge **Recommended** on Side-by-side when it is the default selection.
- No user-facing `pdf2zh` or `L|R` jargon.
- Abstract CSS mini-glyphs (single page / paired blocks / two columns) — not photoreal PDF thumbnails (dual is not always strict left\|right).

### Default selection order

1. Side-by-side if `hasMono` (assembly uses original + mono).
2. Else bilingual if `hasDual`.
3. Else translated-only if `hasMono`.

### Open in viewer mapping

- Selected bilingual (or default when dual preferred): `onOpenResult('dual')` when `hasDual`.
- Selected side-by-side or translated-only: `onOpenResult('mono')` when mono exists; else dual if only dual exists.
- Side-by-side remains **download-only assembly** (no new viewer mode in this work).

## Visual system

- Modal width ~560–600px on done; same radius/shadow as current `pdf-download-modal`.
- Success title: soft green + small check (existing success token).
- Steps: active = blue pulse; done = green; todo = muted; respect `prefers-reduced-motion` (no pulse).
- Progress fill: blue while running, green at done.
- Format cards: stacked full-width; selected = blue border + tint (align with Fast `DownloadFormatPicker`).
- Primary Download: prominent (footer or full-width under cards).
- Secondary actions: ghost/outline.
- Log: keep monospace console styling inside collapsible region.

## Interactions

### Running

- Cancel uses existing `onCancel` (single click; no new confirm dialog).
- User may expand log anytime during run.

### Done

- Cards = radiogroup; keyboard selectable.
- Primary download invokes the matching callback:
  - mono → `onDownloadMono`
  - dual → `onDownloadDual`
  - side-by-side → `onDownloadSideBySide` (may be async; button busy state `Assembling…`).
- Multiple downloads allowed without closing.
- Close → existing `onClose` (dismiss + reset job state).
- No auto-download.

### Error

- Offline + `onOpenSetup` → primary setup CTA.
- Else Retry → `onRetry`.
- Close secondary.

### Re-entry

- Modal remains while stage is `done` until Close (current App wiring).
- After Close/reset, a new Translate run is required.
- If a new job starts while modal is open, return to running layout and clear prior format selection / feedback.

## Accessibility

- `role="dialog"` with `aria-labelledby` pointing at title.
- Format cards: `role="radiogroup"` / `role="radio"` + `aria-checked`.
- Progress bar exposes value while running (`aria-valuemin/max/now` or equivalent progressbar role).
- Focus management: focus dialog on open; keep keyboard path to Cancel/Close.
- Reduced motion: disable step pulse and nonessential transitions.

## Implementation sketch

Primary files:

- `entrypoints/pdf-viewer/components/ScientificJobModal.tsx` — state sections; extract small presentational pieces if helpful (step rail, collapsible log, format cards).
- `entrypoints/pdf-viewer/style.css` — `pdf-sci-*` card layout, recommended badge, CTA row, collapsible log.
- `entrypoints/pdf-viewer/App.tsx` — only if prop wiring needs adjustment; prefer keeping callbacks as today.
- Tests: component tests for default selection order, hidden unavailable formats, CTA label by selection, open-prefer mapping; keep hook tests unchanged unless UI needs a busy signal from the hook.

Optional local UI state in the modal:

- `selectedFormat: 'mono' | 'dual' | 'side-by-side'`
- `logOpen: boolean`
- `downloadFeedback: 'idle' | 'busy' | 'saved' | 'error'`

Do not change bridge protocol or download binary paths in this redesign.

## Success criteria

1. Done screen answers “what do I get?” in one glance without a bullet essay.
2. Recommended path is obvious (side-by-side default + badge when available).
3. Running state does not dominate with a always-open log.
4. Error recovery exposes one clear primary action.
5. Existing download/open behavior and no-auto-download policy are preserved.
6. Keyboard and screen-reader basics for dialog + format choice work.

## Risks & mitigations

| Risk | Mitigation |
|------|------------|
| Users expected dual as default | Recommended badge + clear card copy; dual still one click |
| Side-by-side assemble latency | Busy label on primary button; keep logs expandable |
| Partial dual/mono availability | Hide missing formats; recompute default when progress flags change |
| Over-styling dual as L\|R | Honest “bridge” copy + non-column glyph for dual |

## Out of scope follow-ups

- Header Scientific toggle / offline pill UX.
- In-viewer side-by-side mode for scientific results.
- Persist last-used format preference.
