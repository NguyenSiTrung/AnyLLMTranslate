# Implementation Plan: youtube-asr-resegment_20260709

## Phase 1: Types, Config & Pure Algorithm (TDD)
<!-- execution: sequential -->

- [ ] Task 1: Define settings + ASR resegment types
  Add `YoutubeAsrResegmentSettings` (or nested under `SubtitleSettings`): `enable: boolean` (default `true`), `aiEnable: boolean` (default `false`, reserved). Export defaults in `DEFAULT_SUBTITLE_SETTINGS` / `DEFAULT_SETTINGS`. Document AI hook in types (JSDoc). Include language config types: `AsrLangConfig`, `splitConfig`, `mergeConfig`, `endCompatibleConfigs`, `base` + `en` defaults.

- [ ] Task 2: Write failing unit tests for pure resegment engine
  Create `lib/__tests__/youtubeAsrResegment.test.ts` (or `asrResegment.test.ts`):
  (a) flatten JSON3-like word events (segs + tOffsetMs),
  (b) split on gap / breakWords / maxWords,
  (c) merge hanging endWords / startWords,
  (d) endCompatible merge of tiny tails,
  (e) cue-level fallback without word offsets,
  (f) language resolve `en` → base fallback,
  (g) empty / error inputs → fail-open empty or passthrough fixtures,
  (h) punctuation-heavy path if implemented (optional Immersive M6e-style).

- [ ] Task 3: Implement pure resegment library
  Implement `lib/youtubeAsrResegment.ts` (pure, no Chrome APIs):
  - `resegmentYoutubeAsr({ words | cues, language, config }) → SubtitleCue[]`
  - word-level path (preferred) + cue-level fallback
  - English-tuned defaults + generic base
  - Match Immersive intent, not bit-identical minified code
  Make Task 2 tests pass.

- [ ] Task 4: Export default ASR language config constant
  Ship `DEFAULT_YOUTUBE_ASR_CONFIG` (enable, wordsRegex, langsConfig base/en, aiEnable false). Keep tunable values in one place for settings/tests.

- [ ] Task: Conductor - User Manual Verification 'Phase 1' (Protocol in workflow.md)

## Phase 2: YouTube Parse Surface for Word Events
<!-- execution: sequential -->
<!-- depends: phase1 -->

- [ ] Task 1: Tests for word-event extraction from YouTube JSON3
  Extend `tests/unit/youtubeHandler.test.ts` (or pure lib tests): multi-seg events with `tOffsetMs`, newline segs, ASR-like fragmentation fixtures.

- [ ] Task 2: Expose word-level parse path from YouTube handler
  In `inject/subtitleHandlers/youtube.ts` (or shared pure parse helper used by handler):
  - Keep existing `transformResponse` → cue list for non-ASR / when resegment off
  - Add ability to obtain word-timed events OR resegmented cues for ASR (prefer pure functions callable from coordinator if MAIN/ISOLATED boundary requires it)
  Document: resegment may run in ISOLATED after intercept if MAIN only has string body — prefer parse+resegment wherever cues first become available before translate.

- [ ] Task 3: Wire resegment call site before translation
  In `content/subtitleCoordinator.ts` (and/or handler path that feeds translate):
  - If platform YouTube + ASR + settings.enable → resegment → replace source cues
  - Else passthrough
  - Fail-open to original cues on throw
  - Ensure cache key uses post-resegment text
  - Order: resegment → then existing progressive translate / `subtitleTiming` as currently ordered (document in code comment)

- [ ] Task 4: Coordinator / handler unit tests for gate
  Tests: ASR+enable → fewer cues / different texts; enable false → original; non-ASR → original; throw → original.

- [ ] Task: Conductor - User Manual Verification 'Phase 2' (Protocol in workflow.md)

## Phase 3: Settings UI & AI Hook Surface
<!-- execution: sequential -->
<!-- depends: phase2 -->

- [ ] Task 1: Persist settings in store / migration-safe defaults
  Ensure `settingsStore` deep-merge and any config migration leave `youtubeAsrResegment` / nested field at default `enable: true`. Add unit test if migration helpers exist.

- [ ] Task 2: Options UI — YouTube toggle
  In `SubtitlesSection.tsx` (or small extracted control): Supported Sites / YouTube-adjacent card area — toggle **“Improve auto-generated captions”** with short description. Default on. Dim/disable when subtitles master off (`DisabledDimmer` pattern). No full AI control required; optional muted “AI re-align (coming soon)” or only type-level `aiEnable`.

- [ ] Task 3: AI hook stub (design-only)
  Export typed placeholder e.g. `// future: requestAiAsrResegment` interface or no-op function with JSDoc; ensure no network call. Spec note in learnings.

- [ ] Task 4: Options / settings tests if section has coverage patterns
  Smoke-test store default + toggle write path where existing tests live.

- [ ] Task: Conductor - User Manual Verification 'Phase 3' (Protocol in workflow.md)

## Phase 4: Regression, Lint & Manual Smoke
<!-- execution: sequential -->
<!-- depends: phase3 -->

- [ ] Task 1: Full unit suite
  Run `pnpm test` (or project’s `test:fast`) — all existing + new tests green.

- [ ] Task 2: Lint
  Run `pnpm lint` on touched files / project standard.

- [ ] Task 3: Manual smoke (user)
  YouTube video with **auto-generated English** captions: toggle on → more coherent bilingual sentences; toggle off → prior fragmentation behavior. Human-uploaded track unchanged. Confirm no crash if resegment errors.

- [ ] Task: Conductor - User Manual Verification 'Phase 4' (Protocol in workflow.md)
