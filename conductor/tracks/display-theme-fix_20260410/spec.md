# Spec: Fix Display Theme Not Applied Bug

## Overview

The content script (`entrypoints/content.ts`) does not apply visual display settings (theme, translation position, dark mode) to the DOM when translation is active. Although the settings are stored correctly and the CSS is injected with all theme styles, the `data-lingua-theme`, `data-lingua-position`, and `lingua-dark` class are never set on the HTML element, causing translations to always appear with default styling regardless of user preferences.

## Root Cause

The functions `applyTheme()`, `applyPosition()`, and `applyDarkMode()` exist in `content/translationDisplay.ts` and are tested, but they are:
1. Not imported in `entrypoints/content.ts`
2. Not called when translation starts in `startTranslation()`
3. Not called when settings change via the storage change listener

## Functional Requirements

### FR1: Apply Visual Settings on Translation Start
- When `startTranslation()` is called, load settings and apply:
  - Theme via `applyTheme(settings.theme)`
  - Translation position via `applyPosition(settings.translationPosition)`
  - Dark mode via `applyDarkMode(settings.darkMode)`

### FR2: Update Visual Settings on Settings Change
- Add a storage change listener in `initInteractionFeatures()` to detect changes to:
  - `theme`
  - `translationPosition`
  - `darkMode`
- When any of these settings change and translation is active (page state is not 'off'):
  - Call the corresponding apply function immediately
  - This will instantly update the styling of all existing translations on the page

### FR3: Clean Up Visual Settings on Translation Stop
- When `stopTranslation()` is called, remove the visual settings:
  - Remove `data-lingua-theme` attribute
  - Remove `data-lingua-position` attribute
  - Remove `lingua-dark` class

## Non-Functional Requirements

- Performance: Setting DOM attributes should be < 1ms overhead
- No breaking changes to existing API or storage schema
- Must work with all 16 existing themes
- Must work with all 3 translation positions (below, above, side)
- Must work with all 3 dark mode options (auto, light, dark)

## Acceptance Criteria

1. **AC1**: When user selects a theme in options page and starts translation, the translated text appears with the selected theme styling
2. **AC2**: When user changes theme while translation is active, all existing translations immediately update to the new theme
3. **AC3**: When user changes translation position while translation is active, the position of all translations updates immediately
4. **AC4**: When user changes dark mode setting while translation is active, the color scheme updates immediately
5. **AC5**: When translation is stopped, the HTML element no longer has `data-lingua-theme`, `data-lingua-position`, or `lingua-dark` class
6. **AC6**: All existing tests continue to pass
7. **AC7**: New tests added for the visual settings application logic

## Out of Scope

- Adding new themes or visual styles
- Changing the CSS theme implementation
- Modifying the settings storage schema
- Changing how settings are loaded or saved
