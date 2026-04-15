# Plan: Fix Display Mode — Wire `displayMode` Setting to Page State

## Phase 1: Core Fix — Read displayMode on Start + Live Update

### Task 1: Update `startTranslation()` to respect displayMode
- [ ] In `entrypoints/content.ts` line 114, replace hardcoded `setPageState('dual')` with:
      `setPageState(settings.displayMode === 'translation-only' ? 'translation-only' : 'dual')`
      (settings are already loaded above this line via `loadSettings()`)
- [ ] Write test in `entrypoints/__tests__/content.test.ts`:
      - `startTranslation()` with `displayMode: 'translation-only'` → page state is `'translation-only'`
      - `startTranslation()` with `displayMode: 'bilingual-below'` → page state is `'dual'`

### Task 2: Live-update displayMode via storage listener
- [ ] In `entrypoints/content.ts` `initInteractionFeatures()`, add to the existing
      `chrome.storage.onChanged` block (after darkMode handling ~line 199):
      ```ts
      if (newSettings.displayMode && getPageState() !== 'off') {
        const next = newSettings.displayMode === 'translation-only' ? 'translation-only' : 'dual';
        setPageState(next);
      }
      ```
- [ ] Write tests:
      - Changing `displayMode` while page state is `'dual'` → state updates to `'translation-only'`
      - Changing `displayMode` while page state is `'off'` → state remains `'off'`

- [ ] Task: Conductor - User Manual Verification 'Phase 1' (Protocol in workflow.md)

## Phase 2: Keyboard Shortcut Fix — togglePageState respects displayMode

### Task 3: Update `togglePageState()` signature in translationDisplay.ts
- [ ] In `content/translationDisplay.ts`, update function signature to:
      `export function togglePageState(displayMode?: DisplayMode): PageState`
- [ ] Add import: `import type { DisplayMode } from '@/types/config';`
- [ ] Change the `'off'` branch: `next = displayMode === 'translation-only' ? 'translation-only' : 'dual';`
- [ ] Update `content/__tests__/translationDisplay.test.ts`:
      - `togglePageState('translation-only')` from `'off'` → returns `'translation-only'`
      - `togglePageState('bilingual-below')` from `'off'` → returns `'dual'`
      - `togglePageState()` (no arg) from `'off'` → returns `'dual'` (backward compat default)
      - Existing toggle-to-off tests remain unchanged

### Task 4: Pass displayMode into toggleTranslation() in content.ts
- [ ] In `entrypoints/content.ts` `toggleTranslation()`, load settings and pass
      `settings.displayMode` to `togglePageState()`:
      ```ts
      export async function toggleTranslation(): Promise<void> {
        const state = getPageState();
        if (state === 'off') {
          await startTranslation(); // startTranslation already handles displayMode
        } else {
          stopTranslation();
        }
      }
      ```
      Note: `toggleTranslation()` currently calls `startTranslation()` (which will
      now correctly read displayMode via FR-1), so Task 4 may require no code change —
      verify the existing flow is sufficient after Task 3 is done.
- [ ] If `togglePageState()` is called directly anywhere else, audit and update those call-sites.

- [ ] Task: Conductor - User Manual Verification 'Phase 2' (Protocol in workflow.md)

## Phase 3: Test Cleanup — Fix Type Mismatch in AdvancedSection.test.tsx

### Task 5: Fix invalid displayMode value in test
- [ ] In `entrypoints/options/__tests__/AdvancedSection.test.tsx`, find all
      `displayMode: 'dual'` occurrences and replace with `displayMode: 'bilingual-below'`
- [ ] Run full test suite: `pnpm test` — confirm 459+ tests pass, no regressions
- [ ] Run lint: `pnpm lint` — confirm clean
- [ ] Commit: `fix(content): wire displayMode setting to page state and keyboard toggle`

- [ ] Task: Conductor - User Manual Verification 'Phase 3' (Protocol in workflow.md)
