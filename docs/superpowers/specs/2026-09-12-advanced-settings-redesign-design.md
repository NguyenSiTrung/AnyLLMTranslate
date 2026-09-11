# Advanced Settings Information Architecture and UX Redesign

**Date:** 2026-09-12  
**Status:** Implemented and verified  
**Beads issue:** `AnyLLMTranslate-5gn`

## Summary

The Advanced Settings tab has accumulated several first-class product features and unrelated system workflows. It currently combines translation prompting, performance, page compatibility, text-to-speech, PDF behavior, a local PDF bridge, backup and restore, diagnostics, cache maintenance, and factory reset in a single 2,462-line component.

The redesign will promote Speech and PDF to dedicated tabs in the Media navigation group. The remaining Advanced tab will be reorganized around five understandable destinations: Translation engine, Performance, Website compatibility, Data and recovery, and Diagnostics. Reset remains isolated in the Danger Zone.

The implementation will preserve all settings keys, persisted values, and runtime semantics. It is an information-architecture, component-boundary, and presentation change—not a translation, TTS, PDF-processing, backup, or cache behavior rewrite.

## Problem

### Information architecture

- Speech is a substantial user-facing feature hidden inside Translation Quality.
- PDF open behavior and the required local PDF bridge are shown as separate concepts even though they form one workflow.
- The Advanced tab mixes common feature configuration with low-level tuning and destructive operations.
- The overview chips combine status and navigation semantics. Disabled-looking chips are still interactive, while several major sections are omitted.
- The long page makes important configuration difficult to discover and specialist controls difficult to understand.

### Usability and visual hierarchy

- Technical labels such as “Body-tag whitelist,” “Model-scoped cache keys,” and “Walk open Shadow DOM” lead with implementation language rather than user outcomes.
- Specialist request budgets and DOM controls have nearly the same visual prominence as commonly useful settings.
- Numerous accent colors, nested bordered surfaces, and small secondary text create visual noise.
- Current controls expose numeric ranges but often do not explain practical effects or recommended defaults.

### Maintainability

`entrypoints/options/sections/AdvancedSection.tsx` contains three large React components and multiple unrelated async workflows. It owns TTS model and voice loading, speech testing, cache statistics, backup encryption and import, PDF bridge health, prompt editing, settings reset, and all Advanced presentation. This makes focused testing and safe visual iteration unnecessarily difficult.

## Goals

1. Make Speech and PDF discoverable as first-class Media features.
2. Make the Advanced tab understandable at a glance without removing expert capability.
3. Present recommended controls before specialist tuning.
4. Replace implementation-oriented primary labels with outcome-oriented language.
5. Establish feature boundaries that can be tested and changed independently.
6. Preserve persisted settings and all existing runtime behavior.
7. Improve keyboard navigation, focus behavior, responsive layout, and status communication.

## Non-goals

- Redesigning every Settings tab or replacing the existing sidebar shell.
- Changing the settings storage schema or default values.
- Changing translation, speech synthesis, PDF processing, bridge, cache, import, export, or encryption semantics.
- Introducing a new settings search system.
- Replacing the current UI component library.
- Adding cloud PDF processing or another TTS credential store.
- Removing expert settings.

## Alternatives Considered

### A. Polish the existing Advanced tab

Split the file, improve spacing, and add disclosures without moving features. This minimizes navigation changes but leaves Speech and PDF difficult to discover and does not resolve the mixed information architecture.

### B. Selective reorganization — chosen

Promote Speech and PDF to Media tabs, then simplify Advanced around genuinely advanced controls. This resolves the largest usability problems while preserving the existing Settings shell and limiting regression risk.

### C. Redesign all Settings navigation

Reconsider every sidebar group and tab. This could produce a more comprehensive global architecture but would substantially increase scope and risk without being necessary to solve the current problem.

## Navigation Architecture

The Media group will contain these tabs in order:

1. Subtitles
2. Speech
3. PDF

The System group will retain Statistics, Shortcuts, Inline Translate, and Advanced. No other existing tabs move in this redesign.

`App.tsx` will add `speech` and `pdf` tab definitions and render their corresponding sections. URL section handling will accept any identifier in the existing valid-tab collection rather than maintaining special cases for Providers and Subtitles. An invalid `?section=` value will continue to fall back to General.

Existing vertical tab keyboard behavior will automatically include the new tabs through the shared ordered tab identifier list. Tab ids, `aria-controls`, and panel labels must remain stable and unique.

## Speech Screen

### Purpose

Make listening to original or translated text easy to enable and test, while keeping provider and per-language configuration available to expert users.

### Header

- Title: **Speech**
- Description: **Listen to original or translated text using browser or AI voices.**
- Media-oriented icon and a consistent tab accent.

### Enable panel

A prominent `Enable Speak` toggle appears directly below the header. Its description changes with state:

- Enabled: explains that the Speak action is available from the selection translation bubble.
- Disabled: explains where the action will appear after enabling it.

All dependent controls must be programmatically disabled while Speech is disabled, not merely visually dimmed.

### Quick setup

The primary card contains:

- Backend choice:
  - **Automatic** — use an AI provider when available, otherwise browser speech.
  - **Browser voice** — local and free.
  - **AI voice** — use a compatible configured provider, with browser fallback according to current runtime semantics.
- Voice selection when applicable.
- Speech rate with its current value visible.
- A persistent **Test voice** action.

The UI labels may be simplified, but their stored enum values remain `auto`, `browser`, and `provider`.

### AI provider configuration

Provider controls appear only when the selected backend can use provider TTS. The section includes:

- Provider pool versus custom endpoint.
- Pool provider selection.
- Custom base URL and API key when custom credentials are selected.
- Model field and model-loading action.
- Voice field and voice-loading action when supported.
- Inline status and actionable errors.

Host-specific endpoint language and optional expert fields belong under an **Advanced provider settings** disclosure. The custom endpoint continues to override the provider pool for Speech only.

Model or voice refresh failures must not erase the saved model, voice, or previously loaded selections. Errors appear beside the affected control, with a toast used as supplemental feedback rather than the only error communication.

### Language-specific voices

The language override area is collapsed when empty and summarizes its state when populated, for example **2 language overrides**.

Adding or editing an override uses a focused editor rather than displaying every field in a permanently expanded stack. Each override exposes:

- Language.
- Credential inheritance or override.
- Provider/custom endpoint fields when overridden.
- Model inheritance or override.
- Voice inheritance or override.

Empty inherited values are presented as **Uses default model**, **Uses default voice**, or equivalent explicit language. Duplicate language overrides remain prohibited. Removal requires a clear action but not a destructive confirmation because the change is immediately visible and can be re-added.

## PDF Screen

### Purpose

Present PDF translation as one coherent workflow centered on readiness. Auto-open behavior and the local layout-preserving bridge are not separate products.

### Header and readiness panel

The page opens with one status:

- **Ready** — the bridge is enabled and healthy.
- **Bridge offline** — configured but unreachable.
- **Not configured** — setup has not been completed.

The primary action changes by state:

- Not configured: **Set up PDF translation**.
- Offline: **Check connection**.
- Ready: **How to translate a PDF**, which reveals concise instructions to open a PDF in the browser and use the built-in viewer. This redesign does not add an options-page file picker or synthetic browser tab.

The existing setup wizard remains the setup mechanism.

### Workflow explanation

A short explanation presents the current process:

1. Open a PDF.
2. AnyLLMTranslate sends the job to the configured bridge.
3. The translated layout opens in the built-in viewer.

“Scientific PDF” is not presented as a separate Settings product. The underlying `scientificPdf` settings identifiers remain unchanged to avoid schema and runtime changes.

### Open behavior

The screen provides:

- Manual, Prompt, and Automatic behavior as a segmented or comparably clear single-choice control.
- New tab versus same tab.
- Site exceptions.

Site exceptions should render as removable hostname chips with an explicit add interaction. Stored values remain `pdfSettings.neverAutoOpenSites: string[]`. Input is normalized and committed without preventing users from typing separators or intermediate values.

### Local bridge

The bridge card contains:

- Enable state.
- Server URL.
- Current connection state.
- Setup or reconnect action.
- Setup guide.

The loopback default is emphasized. A non-loopback URL produces a prominent warning that the full PDF and temporary provider credentials will be sent to a remote host. Existing validation and health checks remain authoritative.

### Privacy and troubleshooting

A compact, always-visible privacy explanation states that the full PDF and short-lived provider credentials go to the configured bridge only for PDF jobs.

A collapsed Troubleshooting section contains:

- Refresh status.
- Setup guide.
- Connection details and actionable failure text.

Failures distinguish not configured, offline, untrusted remote URL, and unexpected connection failure where current data allows that distinction.

## Advanced Screen

### Header and section navigation

The header remains **Advanced** with a shorter description focused on expert translation and system controls.

The current status-chip strip is replaced by explicit section navigation:

- Translation engine
- Performance
- Website compatibility
- Data and recovery
- Diagnostics

These controls must visually and semantically read as navigation. They use buttons with descriptive accessible names and the existing reduced-motion-aware scroll/focus/highlight behavior. On wider screens the navigator may remain visible near the top of the content scroller. On narrow screens it becomes a horizontally scrollable row without obscuring content.

Feature status is shown inside the relevant card, not encoded into navigation styling.

### Translation engine

This card has three progressively disclosed groups.

#### System prompt

- Summary shows **Using default** or **Customized**.
- The editor is collapsed by default when unchanged.
- Expanding it reveals variable insertion, validation warnings, auto-save behavior, and Reset to default.
- A customized prompt must remain clearly discoverable even when its editor is collapsed.

#### Translation behavior

Primary controls include:

- Dictionary mode for selection.
- Rich inline formatting.
- Streaming translation.
- Source-language detection.
- Failure cache.
- Cross-session resume.

Request budgets and DOM compatibility controls do not appear in this group.

#### Context awareness

- Main context-aware translation toggle.
- Page-category detection appears only when context awareness is enabled.
- Category detection states that it makes an additional AI request.
- Detection mode appears only when category detection is enabled.

### Performance

The primary surface shows understandable system information and common limits:

- Current cache usage and storage limit.
- Cache lifetime.
- Provider requests per minute.
- Clear cache as a secondary maintenance action.

**Custom performance tuning** is collapsed by default and contains:

- Maximum batch characters.
- Maximum pieces per request.
- Maximum characters per request.
- Failure-cache lifetime.
- Adaptive batching.

Each field must include its default and practical effect. Invalid values remain local to the field and are not persisted. Clear cache retains its confirmation dialog and explains that provider costs may increase after clearing. It no longer appears in the Danger Zone because it does not remove user configuration and the cache can be rebuilt.

### Website compatibility

The existing page-scope preset is the primary control:

- Balanced — recommended.
- Broad.
- Classic.
- Custom when individual values do not match a named preset.

An **Individual compatibility controls** disclosure contains:

- Body-region filtering.
- Sidebar and aside limits.
- Open Shadow DOM extraction.
- Layout containment.
- Model-specific cache separation.
- Translation self-check.

Primary labels describe outcomes. Technical terms such as Shadow DOM can remain in secondary help text where required for accuracy. Each control explains a situation in which changing it is useful.

### Data and recovery

One card provides three workflows:

- Export backup.
- Import backup.
- Restore previous settings, only when a pre-import snapshot exists.

When API keys exist, encrypted export is recommended and plain JSON is visually secondary. Existing format selection, encryption, merge/replace impact summary, snapshot, and undo behavior remain unchanged.

Import parsing, decryption, and snapshot failure behavior must remain isolated from current settings. No settings are changed until the user confirms the import summary.

### Diagnostics

A compact card contains Debug mode and explains:

- What enabling it does.
- That logging can be noisy.
- Where the user can inspect logs.
- That it should be disabled after troubleshooting.

### Danger Zone

Only **Reset all settings** remains in the Danger Zone. Its copy lists the data that will be removed and states that the operation cannot be undone. An adjacent **Export backup first** action takes the user to Data and recovery or opens the export workflow directly without performing the reset.

## Visual Design Principles

- Use neutral card surfaces for normal configuration.
- Use one cyan/blue interaction accent per screen for navigation, selection, and focus.
- Reserve green, amber, and red for success, caution, and destructive severity.
- Avoid nested bordered boxes unless they communicate conditional state or a distinct workflow.
- Prefer readable labels and secondary descriptions over extensive 11-pixel text.
- Use two columns only for short, closely related fields; long descriptions and dynamic controls remain single-column.
- Keep recommended controls visible and specialist controls collapsed.
- Preserve existing SectionHeader, Card, Toggle, FieldGroup, Button, Badge, DisabledDimmer, Modal, and disclosure patterns where they satisfy these principles.

## Component Architecture

The intended feature boundaries are:

```text
entrypoints/options/sections/
  AdvancedSection.tsx
  SpeechSection.tsx
  PdfSection.tsx
  advanced/
    TranslationEngineCard.tsx
    PerformanceCard.tsx
    WebsiteCompatibilityCard.tsx
    DataRecoveryCard.tsx
    DiagnosticsCard.tsx
  speech/
    SpeechQuickSetup.tsx
    SpeechProviderSettings.tsx
    LanguageVoiceOverrides.tsx
  pdf/
    PdfStatusPanel.tsx
    PdfOpenBehavior.tsx
    PdfBridgeSettings.tsx
```

These names describe boundaries, not a requirement to create a component for trivial markup. During planning, adjacent units may be combined when doing so preserves a single responsibility and keeps tests focused.

`AdvancedSection` becomes a composition layer that renders the header, section navigation, cards, and reset flow. It must not own Speech model/voice loading or PDF bridge health.

Existing `ScientificPdfWizard` and backup dialogs remain reusable components. Async orchestration should live with the feature that owns it:

- Speech model/voice loading and test state with Speech.
- PDF bridge health and setup state with PDF.
- Backup/import state with Data and recovery.
- Cache statistics and clearing state with Performance.

Shared pure logic remains in existing `lib` and `services` modules rather than being copied into UI components.

## Data Flow and Persistence

- Zustand remains the UI source of truth.
- All current settings paths and enum values remain unchanged.
- Existing persisted values render in their new locations without migration.
- `updateSettings`, `replaceSettings`, `restoreSettings`, and `resetToDefaults` retain their current semantics.
- Deferred commit remains in use for text and numeric fields where per-keystroke normalization would interfere with editing.
- Components must read the latest store state before patching nested settings when a deferred commit could otherwise overwrite concurrent changes.
- The redesign introduces no second API-key store and no duplicate PDF or Speech settings.

## Error Handling

- Success feedback uses toasts.
- Actionable errors appear inline near the responsible field or workflow, with toasts as supplemental notification.
- Loading controls disable duplicate requests and expose a clear loading label or spinner.
- Speech test errors distinguish browser speech unavailability from provider failures.
- PDF bridge status remains visible after failed refresh attempts.
- Backup decryption and parsing failures do not alter current settings.
- Clear-cache and reset operations retain confirmations and report failure without presenting a false success state.
- Unexpected runtime-message failures use concise fallback messages and preserve the user’s current configuration.

## Accessibility

- Sidebar additions use the existing vertical tab roles, roving tab index, arrow-key navigation, and labeled panels.
- Section navigation uses native interactive elements with visible focus states.
- In-page navigation moves focus to the destination without causing a second scroll.
- Smooth scrolling and highlights respect `prefers-reduced-motion`.
- Disclosures expose `aria-expanded`, `aria-controls`, and labeled regions.
- Loading and connection states are announced through appropriate status regions where they change asynchronously.
- Disabled dependent controls use native disabled semantics when supported.
- Color is never the sole indicator of selection, readiness, warning, or error.
- Small screens preserve logical reading and focus order.

## Responsive Behavior

- New screens use the existing Settings content width and sidebar shell.
- At narrow widths, multi-column control groups stack into one column.
- Primary setup and recovery actions may become full-width where that improves touch usability.
- Section navigation scrolls horizontally rather than wrapping into an excessively tall block.
- Language override editing avoids wide permanent grids.
- No nested independent scroll region is introduced unless required by a bounded picker list.

## Testing Strategy

Implementation follows characterization-first testing:

1. Add or strengthen tests for current Speech values, provider selection, model/voice loading, language overrides, and test action.
2. Add or strengthen tests for current PDF open behavior, bridge configuration, health status, remote-host warning, and setup wizard launch.
3. Preserve backup/import, cache, prompt, jump-navigation, and reset behavior through focused tests before extraction.
4. Extract components without intentionally changing behavior.
5. Move components into new tabs and update navigation tests.
6. Apply the new hierarchy and progressive disclosure with component-level interaction and accessibility assertions.

Required test coverage includes:

- Speech and PDF appear in the Media group and participate in keyboard navigation.
- Every valid `?section=` value opens its tab; invalid values fall back safely.
- Existing saved values appear in their new controls.
- Disabled and conditionally visible states follow their parent controls.
- Speech loading failures preserve current selections.
- Duplicate language overrides remain blocked.
- PDF readiness states and remote URL warnings render correctly.
- Site exceptions can be added and removed without destructive per-keystroke normalization.
- Advanced section navigation targets every rendered destination.
- Prompt reset, cache confirmation, encrypted backup recommendation, import confirmation, restore snapshot, debug mode, and full reset retain behavior.
- Reduced-motion navigation avoids smooth scrolling.

Verification includes focused Vitest suites, the full test suite, TypeScript checking, ESLint, and a production extension build using the repository’s existing scripts.

## Implementation Sequence

1. Write characterization tests for workflows being moved.
2. Extract Speech components while keeping them in Advanced.
3. Extract PDF components while keeping them in Advanced.
4. Extract Advanced cards and workflow ownership without changing visible structure.
5. Add Speech and PDF tabs and generalized section deep-link handling.
6. Move Speech and PDF into their tabs and verify persisted-value continuity.
7. Replace the Advanced overview strip and regroup remaining controls.
8. Apply progressive disclosure, revised labels, status placement, and responsive styling.
9. Run accessibility-focused component tests and manual keyboard checks.
10. Run all quality gates and review the final diff for unrelated changes.

Structural extraction and visible redesign must remain separate enough in the implementation history or reviewable diffs to diagnose regressions.

## Acceptance Criteria

- Speech and PDF are visible under Media and open as dedicated settings tabs.
- Every existing Advanced setting remains available in a logically named destination.
- Existing persisted values require no migration and retain their meaning.
- PDF setup and auto-open behavior read as one coherent workflow.
- Advanced initially emphasizes common expert controls while keeping specialist tuning accessible through disclosures.
- The Advanced navigator is explicitly navigational and covers every major Advanced destination.
- Clear cache is located in Performance; only full reset remains in the Danger Zone.
- Loading, success, warning, failure, disabled, and destructive states remain accurate and accessible.
- `AdvancedSection.tsx` becomes a focused composition component rather than a multi-feature implementation.
- No runtime translation, TTS, PDF-processing, backup, encryption, cache, or reset semantics change.
- Focused tests, full tests, typecheck, lint, and production build pass before implementation is considered complete.
