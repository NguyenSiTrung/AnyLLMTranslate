# Plan: Fix Display Theme Not Applied Bug

## Phase 1: Import and Apply Visual Settings on Translation Start
<!-- execution: sequential -->

- [ ] Task 1: Import applyTheme, applyPosition, applyDarkMode functions in content.ts
  <!-- files: entrypoints/content.ts -->
  - Add imports from `@/content/translationDisplay`
  - Sub-task: Add `applyTheme` to import statement
  - Sub-task: Add `applyPosition` to import statement
  - Sub-task: Add `applyDarkMode` to import statement

- [ ] Task 2: Load settings in startTranslation() function
  <!-- files: entrypoints/content.ts -->
  - Add `const settings = await loadSettings()` at the beginning of `startTranslation()`
  - Sub-task: Ensure settings are loaded before applying visual settings

- [ ] Task 3: Call applyTheme, applyPosition, applyDarkMode in startTranslation()
  <!-- files: entrypoints/content.ts -->
  - Call `applyTheme(settings.theme)` after loading settings
  - Call `applyPosition(settings.translationPosition)` after theme
  - Call `applyDarkMode(settings.darkMode)` after position
  - Sub-task: Ensure these calls happen before `setPageState('dual')`

- [ ] Task 4: Write tests for visual settings application on start
  <!-- files: content/__tests__/translationDisplay.test.ts -->
  - Test that `applyTheme` is called with correct theme when translation starts
  - Test that `applyPosition` is called with correct position when translation starts
  - Test that `applyDarkMode` is called with correct mode when translation starts
  - Sub-task: Mock `loadSettings` to return test settings
  - Sub-task: Verify DOM attributes are set correctly

- [ ] Task 5: Conductor - User Manual Verification 'Import and Apply Visual Settings on Translation Start' (Protocol in workflow.md)

## Phase 2: Add Settings Change Listeners
<!-- execution: parallel -->

- [ ] Task 1: Add theme change listener in initInteractionFeatures()
  <!-- files: entrypoints/content.ts -->
  - Add check for `newSettings.theme` in storage change listener
  - Call `applyTheme(newSettings.theme)` when theme changes and page state is not 'off'
  - Sub-task: Check `getPageState() !== 'off'` before applying

- [ ] Task 2: Add translationPosition change listener in initInteractionFeatures()
  <!-- files: entrypoints/content.ts -->
  - Add check for `newSettings.translationPosition` in storage change listener
  - Call `applyPosition(newSettings.translationPosition)` when position changes and page state is not 'off'
  - Sub-task: Check `getPageState() !== 'off'` before applying

- [ ] Task 3: Add darkMode change listener in initInteractionFeatures()
  <!-- files: entrypoints/content.ts -->
  - Add check for `newSettings.darkMode` in storage change listener
  - Call `applyDarkMode(newSettings.darkMode)` when darkMode changes and page state is not 'off'
  - Sub-task: Check `getPageState() !== 'off'` before applying

- [ ] Task 4: Write tests for settings change listeners
  <!-- files: entrypoints/content.test.ts -->
  - Test that theme change listener calls applyTheme when translation is active
  - Test that position change listener calls applyPosition when translation is active
  - Test that darkMode change listener calls applyDarkMode when translation is active
  - Test that listeners do nothing when translation is not active (page state is 'off')
  <!-- depends: task1, task2, task3 -->
  - Sub-task: Mock chrome.storage.onChanged listener
  - Sub-task: Set page state to 'dual' for active tests
  - Sub-task: Set page state to 'off' for inactive tests

- [ ] Task 5: Conductor - User Manual Verification 'Add Settings Change Listeners' (Protocol in workflow.md)

## Phase 3: Clean Up Visual Settings on Stop
<!-- execution: sequential -->

- [ ] Task 1: Remove visual settings attributes in stopTranslation()
  <!-- files: entrypoints/content.ts -->
  - Remove `data-lingua-theme` attribute from document.documentElement
  - Remove `data-lingua-position` attribute from document.documentElement
  - Remove `lingua-dark` class from document.documentElement
  - Sub-task: Add cleanup before `removeAllTranslations()` call

- [ ] Task 2: Write tests for cleanup logic
  <!-- files: content/__tests__/translationDisplay.test.ts -->
  - Test that `data-lingua-theme` is removed when translation stops
  - Test that `data-lingua-position` is removed when translation stops
  - Test that `lingua-dark` class is removed when translation stops
  - Sub-task: Set attributes before calling stopTranslation
  - Sub-task: Verify attributes are removed after stopTranslation

- [ ] Task 3: Conductor - User Manual Verification 'Clean Up Visual Settings on Stop' (Protocol in workflow.md)

## Phase 4: Manual Verification
<!-- execution: parallel -->

- [ ] Task 1: Manual verification of theme application
  - Start translation on a test page
  - Change theme in options page
  - Verify translated text immediately updates to new theme
  - Stop translation and verify attributes are removed
  <!-- files: (manual testing, no code changes) -->

- [ ] Task 2: Manual verification of position application
  - Start translation on a test page
  - Change translation position in options page
  - Verify translation position immediately updates
  - Stop translation and verify attributes are removed
  <!-- files: (manual testing, no code changes) -->

- [ ] Task 3: Manual verification of dark mode application
  - Start translation on a test page
  - Change dark mode setting in options page
  - Verify color scheme immediately updates
  - Stop translation and verify class is removed
  <!-- files: (manual testing, no code changes) -->

- [ ] Task 4: Conductor - User Manual Verification 'Manual Verification' (Protocol in workflow.md)
