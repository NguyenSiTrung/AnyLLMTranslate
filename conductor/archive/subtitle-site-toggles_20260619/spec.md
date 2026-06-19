# Spec: Subtitle Supported Sites Display & Per-Site Toggle

## Overview

Add a "Supported Sites" card to the Settings → Subtitles section that lists all platforms
with subtitle translation support. Each site row shows its name, interception method hint,
and an enable/disable toggle. When a site is disabled, the entire subtitle interception and
translation pipeline is skipped for that platform at runtime.

## Functional Requirements

### FR1: Supported Sites Card in Subtitles Section
- Add a new "Supported Sites" Card below the existing "Language Discovery" card in SubtitlesSection.
- Display all 5 current subtitle platforms in a list:
  | Platform          | Method Hint           |
  |-------------------|-----------------------|
  | YouTube           | XHR interception      |
  | Udemy             | XHR interception      |
  | Coursera          | XHR interception      |
  | LinkedIn Learning | Fetch interception    |
  | HBO Max           | DOM cue scraping      |
- Each row displays: platform name, method hint (dimmed), and a Toggle.
- The card is gated behind the global "Enable Subtitles" toggle (disabled state when subtitles are off).

### FR2: Per-Site Enable/Disable Setting
- Add a `disabledSubtitleSites` field (string array) to `SubtitleSettings` in `types/config.ts`.
- Default value: empty array `[]` (all sites enabled by default — opt-out model).
- When a site toggle is turned OFF, add its `platform` identifier (e.g., `'youtube'`) to the array.
- When turned ON, remove it from the array.
- Persisted via the existing Zustand + chrome.storage sync mechanism.

### FR3: Runtime Pipeline Skip for Disabled Sites
- In the content script coordinator, after detecting the current handler, check if
  `handler.platform` is in the `disabledSubtitleSites` array from loaded settings.
- If disabled: pass through intercepted subtitles unmodified (always-respond pattern),
  skip overlay creation, skip auto-activate for that platform.
- **Note:** The MAIN world inject script always registers interceptors for all platforms
  (it runs at `document_start` before settings load and has no access to `chrome.*` APIs).
  Filtering happens in the content script coordinator which has access to settings.

### FR4: Visual Design
- Each site row follows the existing settings list pattern: left-aligned name + hint, right-aligned toggle.
- Method hint uses small dimmed text (e.g., `text-xs text-zinc-500`).
- When the global subtitles toggle is OFF, the entire Supported Sites card shows disabled state
  (opacity-50, pointer-events-none) consistent with other controls.

## Non-Functional Requirements

- No additional permissions or storage keys needed (uses existing `subtitleSettings` object).
- Must not break existing subtitle functionality for any platform.
- Site list is hardcoded (not dynamic discovery) — new platforms are added via code changes.

## Acceptance Criteria

1. Settings → Subtitles shows a "Supported Sites" card listing all 5 platforms with toggles.
2. Toggling a site OFF adds it to `disabledSubtitleSites`; toggling ON removes it.
3. When a site is disabled, visiting that platform does NOT trigger subtitle translation or overlay.
4. When a site is re-enabled, subtitle translation works normally on that platform.
5. All sites are enabled by default for new installs (empty `disabledSubtitleSites` array).
6. The Supported Sites card respects the global "Enable Subtitles" toggle (grayed out when off).
7. Existing tests pass; new tests cover the per-site filtering logic and UI rendering.

## Out of Scope

- Dynamic site discovery (auto-detecting new platforms without code changes).
- Per-site subtitle appearance customization (font size, position, etc. per platform).
- Site-specific subtitle language preferences.
- Netflix handler (not yet implemented — will be added to the list when a handler is created).
