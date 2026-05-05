# Bilingual Display UI/UX Hardening

## Overview

Improve page translation UX when Bilingual display mode is active. This track focuses on reliability/trust, display clarity, layout robustness, and accessibility for bilingual and translation-only page display surfaces.

## Functional Requirements

1. **Accurate translation progress and status**
   - Popup status must distinguish active visible translation, lazy/off-screen pending pieces, partial completion, and full completion.
   - Progress should not claim completion while viewport-observed pieces remain untranslated.

2. **Safe translation lifecycle**
   - Restoring the original page must prevent stale in-flight translation responses from reinserting translations.
   - Repeated start actions must not leave duplicate viewport observers, mutation watchers, or stale page state.
   - Settings changes while translation is active must not leave the page in an inconsistent display state.

3. **Translation-only inline feedback**
   - Short inline pieces must show visible loading, error, and translated output in translation-only mode.
   - Loading/error UI must remain visible even when the original inline container is hidden.

4. **Consistent display controls and previews**
   - Popup and options labels must consistently use the same terms for Bilingual and Translation-only modes.
   - Theme preview must reflect the current display mode and translation position/layout.
   - Preview must include representative block, inline, loading, and error display states.

5. **Layout robustness**
   - Side and side-by-side layouts should adapt or fall back for constrained containers such as tables, grid/flex cards, and narrow columns.
   - Bilingual insertion must continue to avoid invalid list/table DOM.

6. **Accessibility**
   - Block and inline translations must consistently expose language and text direction metadata.
   - Mask/reveal themes must be keyboard-accessible.
   - Loading and error states should expose accessible status text where practical.

## Non-Functional Requirements

- Keep DOM insertion safe by using `textContent` and extension-scoped data attributes/classes.
- Avoid broad host page style pollution; all injected CSS must remain scoped to `anyllm` selectors/attributes.
- Preserve lazy translation performance and existing viewport batching behavior.
- Keep changes lint/typecheck/test clean.
- Prefer targeted fixes over broad redesign.

## Acceptance Criteria

- Automated tests cover lazy status/progress, cancellation/stale response handling, duplicate start cleanup, translation-only inline loading/error visibility, preview/label consistency, and accessibility/layout fallback behavior.
- `compile`, `lint`, `test`, and `build` pass before completion.
- Existing page translation, restore, popup toggle, and options setting flows continue to work.
- No subtitle, provider, cache, or glossary behavior is changed except where affected by shared settings/display state.

## Out of Scope

- New translation providers or prompt changes.
- Subtitle translation UI/UX.
- PDF/mobile browser support.
- Large visual redesign beyond bilingual display surfaces.
