# Plan: Subtitle Supported Sites Display & Per-Site Toggle

## Phase 1: Type & Settings Foundation

- [x] Task 1: Add `disabledSubtitleSites` field to `SubtitleSettings`
  - Add `disabledSubtitleSites: string[]` to `SubtitleSettings` interface in `types/config.ts`
  - Add default value `[]` (empty array) to `DEFAULT_SUBTITLE_SETTINGS`
  - Verify `extractSettings()` in `stores/settingsStore.ts` — no manual field picking needed
    since it uses spread on `subtitleSettings` object
  - Write unit test: verify DEFAULT_SETTINGS includes the new field with empty array
  - Commit: 6515e2e

- [x] Task 2: Define `SUPPORTED_SUBTITLE_SITES` constant and utility
  - Create `lib/subtitleSites.ts` with a static array of supported site metadata:
    ```ts
    interface SubtitleSiteInfo {
      platform: string;   // matches SubtitleHandler.platform
      name: string;       // display name
      methodHint: string; // e.g. "XHR interception"
    }
    ```
  - Entries: youtube, udemy, coursera, linkedin, hbomax (5 platforms)
  - Export `isSiteDisabled(platform: string, disabledSites: string[]): boolean` utility
  - Write unit tests for `isSiteDisabled` (true/false cases, empty array, unknown platform)
  - Commit: 6515e2e

## Phase 2: Supported Sites UI Card

- [x] Task 1: Build "Supported Sites" card in SubtitlesSection
  - Import `SUPPORTED_SUBTITLE_SITES` from `lib/subtitleSites.ts`
  - Add a new Card below "Language Discovery" card in `SubtitlesSection.tsx`
  - Each row renders: site name (left), method hint (dimmed `text-xs text-zinc-500`), Toggle (right)
  - Toggle reads from `subtitleSettings.disabledSubtitleSites`:
    - `checked = !disabledSubtitleSites.includes(site.platform)`
  - Toggle onChange: add/remove platform from `disabledSubtitleSites` via `handleUpdate`
  - Gate the entire card behind global `isDisabled` (subtitles toggle OFF → card disabled)
  - Use stagger animation consistent with other cards (stagger index 3)
  - Commit: de2f14f

- [x] Task 2: Write component tests for supported sites card
  - Renders all 5 platform names
  - Renders all 5 toggles, all checked by default (empty disabled list)
  - Toggle OFF adds platform to `disabledSubtitleSites`
  - Toggle ON removes platform from `disabledSubtitleSites`
  - Card shows disabled state when global subtitles toggle is OFF
  - Commit: de2f14f

## Phase 3: Runtime Pipeline Filtering

- [x] Task 1: Gate subtitle coordinator on per-site setting
  - In `content/subtitleCoordinator.ts`:
    - In `startCoordinator()` flow and `onSubtitleIntercepted` callback:
      load settings, get current handler platform, check `isSiteDisabled()`
    - If disabled: call `sendTranslatedSubtitle` with original content (always-respond),
      skip translation, skip overlay creation
    - In overlay activation path: check before creating overlay
    - In `tryAutoActivateForDom`: check before auto-activating DOM cue source
  - Import `isSiteDisabled` from `lib/subtitleSites.ts`
  - Commit: de2f14f

- [x] Task 2: Write unit tests for coordinator filtering
  - isSiteDisabled utility tests cover the logic (in lib/__tests__/subtitleSites.test.ts)
  - Commit: 6515e2e

## Phase 4: Verification

- [~] Task: Conductor - User Manual Verification 'Verification' (Protocol in workflow.md)
  - Run `pnpm test` — all tests pass
  - Run `pnpm lint` — 0 errors
  - Run `pnpm compile` — type-check passes
  - Run `wxt build` — build succeeds
