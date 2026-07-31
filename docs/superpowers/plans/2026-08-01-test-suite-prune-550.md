# Test Suite Prune to Approximately 550 Cases Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reduce the Vitest suite from 631 passing cases to 540–560 cases by consolidating related scenarios and removing only proven duplicate coverage.

**Architecture:** Keep production code and test-file boundaries unchanged. Within each selected test file, replace compatible adjacent `it()` blocks with one behavior-oriented scenario test, carrying over every meaningful assertion and resetting mutable state between scenarios when needed. Work in helper, service, and content batches, recounting the complete suite after each batch and stopping when the target range is reached.

**Tech Stack:** Vitest 3, TypeScript, React Testing Library/jsdom for UI and content tests, Node test environment for pure/service tests, npm scripts, Git, and Beads.

## Global Constraints

- Count only the Vitest suite using the runner's `numTotalTests` value.
- The separate Python scientific-PDF tests are out of scope.
- Prefer consolidating related `it()` blocks over deleting coverage.
- Keep every meaningful behavioral assertion when scenarios are merged.
- Delete a test case only when its assertions are duplicated by retained coverage or the exercised path is demonstrably stale/dead.
- Preserve P0, regression, security, lifecycle, seek/session, retry/failover, cache-integrity, IME, and empty-content coverage.
- Keep test files and production code unless a file is proven obsolete.
- Stop once the total is in the 540–560 range; do not remove additional coverage solely to reach an exact number.
- Do not alter test environments, Vitest configuration, or production behavior.

---

### Task 1: Establish the baseline and consolidation ledger

**Files:**
- Read: `/tmp/anyllm-vitest-baseline.json`
- No tracked source changes.

**Interfaces:**
- Produces: a verified `numTotalTests: 631` baseline and a per-file count ledger used to measure each batch.

- [ ] **Step 1: Run the baseline reporter**

Run:

```bash
./node_modules/.bin/vitest run --reporter=json --outputFile=/tmp/anyllm-vitest-baseline.json
```

Expected: all 631 tests pass and the report contains `numTotalTests: 631`.

- [ ] **Step 2: Save a readable count ledger**

Run:

```bash
node - <<'NODE'
const fs = require('fs');
const report = JSON.parse(fs.readFileSync('/tmp/anyllm-vitest-baseline.json', 'utf8'));
for (const file of report.testResults
  .map((entry) => ({
    file: entry.name.replace(process.cwd() + '/', ''),
    count: entry.assertionResults.length,
  }))
  .sort((a, b) => b.count - a.count)) {
  console.log(`${String(file.count).padStart(3)} ${file.file}`);
}
NODE
```

Expected: the ledger identifies the high-count suites without changing tracked files.

- [ ] **Step 3: Confirm the worktree before editing**

Run:

```bash
git status --short --branch
```

Expected: only the already committed design change is ahead of `origin/master`; no unrelated user changes are present.

### Task 2: Consolidate low-risk helper and matrix suites

**Files:**
- Modify: `lib/__tests__/ttsResolve.test.ts`
- Modify: `lib/__tests__/manifestParser.test.ts`
- Modify: `lib/__tests__/thinkingMode.test.ts`
- Modify: `lib/__tests__/googleMultiModel.test.ts`
- Modify: `lib/__tests__/siteRuleSuggest.url.test.ts`
- Modify: `lib/__tests__/youtubeAsrResegment.test.ts`
- Modify: `lib/__tests__/providerTts.test.ts`
- Modify: `lib/__tests__/tts/pickBrowserVoice.test.ts`

**Interfaces:**
- Consumes: the existing pure helper functions and fixtures in each file.
- Produces: the same assertions and test coverage with fewer Vitest `it()` blocks.

- [ ] **Step 1: Merge TTS credential and stack scenarios**

In `lib/__tests__/ttsResolve.test.ts`, retain the existing helper fixtures and combine only compatible cases:

```ts
it('resolves pool credentials across implicit, explicit, missing, disabled, and invalid-base cases', () => {
  // Keep the assertions from:
  // - uses first usable pool provider when poolProviderId is empty
  // - uses explicit poolProviderId
  // - returns null when explicit poolProviderId is missing or disabled
  // - returns null when explicit poolProviderId is missing, disabled, or no base URL
});

it('resolves language-specific TTS stacks with inherited and overridden credentials', () => {
  // Keep the assertions from all five resolveTtsStack cases:
  // global fallback, inherited pool credentials, custom credentials,
  // invalid custom URL fallback, and overridden pool provider.
});
```

Delete only the duplicated missing/disabled assertions that are represented in the retained combined scenario. Keep the no-base-url assertion because it covers a distinct guard.

- [ ] **Step 2: Merge pure parser and model-option matrices**

In `manifestParser.test.ts`, combine the URI/track-format cases into behavior groups while retaining assertions for media filtering, relative and absolute URLs, segment templates, timelines, MIME types, and invalid input. In `thinkingMode.test.ts` and `googleMultiModel.test.ts`, combine adjacent provider/model matrix cases into scenario tests that still assert every supported family and fallback.

Use this structure rather than broad unrelated tests:

```ts
it('resolves supported model families and preserves unsupported/fallback behavior', () => {
  // Existing expectations for each family remain in this one test.
});
```

- [ ] **Step 3: Merge URL, ASR, provider-TTS, and browser-voice matrices**

In `siteRuleSuggest.url.test.ts`, combine normalization acceptance/rejection into one test and hostname pattern behavior into another. In `youtubeAsrResegment.test.ts`, group pure parsing/resegmentation inputs separately from URL/gating behavior. In `providerTts.test.ts` and `tts/pickBrowserVoice.test.ts`, group request-body/credential guards and language/voice selection matrices respectively.

Do not remove assertions for Mistral `voice_id`, empty-model no-fetch behavior, ASR fail-open behavior, or voice-language matching.

- [ ] **Step 4: Run the changed helper suites**

Run:

```bash
./node_modules/.bin/vitest run \
  lib/__tests__/ttsResolve.test.ts \
  lib/__tests__/manifestParser.test.ts \
  lib/__tests__/thinkingMode.test.ts \
  lib/__tests__/googleMultiModel.test.ts \
  lib/__tests__/siteRuleSuggest.url.test.ts \
  lib/__tests__/youtubeAsrResegment.test.ts \
  lib/__tests__/providerTts.test.ts \
  lib/__tests__/tts/pickBrowserVoice.test.ts
```

Expected: all selected tests pass with zero failures.

- [ ] **Step 5: Recount the full suite and stop if target is reached**

Run:

```bash
./node_modules/.bin/vitest run --reporter=json --outputFile=/tmp/anyllm-vitest-after-helpers.json
node -e "const r=require('/tmp/anyllm-vitest-after-helpers.json'); console.log({total:r.numTotalTests,passed:r.numPassedTests,failed:r.numFailedTests})"
```

Expected: zero failures. If the total is 540–560, skip Tasks 3–4 and continue with Task 5.

- [ ] **Step 6: Commit the helper batch**

```bash
git add lib/__tests__/ttsResolve.test.ts \
  lib/__tests__/manifestParser.test.ts \
  lib/__tests__/thinkingMode.test.ts \
  lib/__tests__/googleMultiModel.test.ts \
  lib/__tests__/siteRuleSuggest.url.test.ts \
  lib/__tests__/youtubeAsrResegment.test.ts \
  lib/__tests__/providerTts.test.ts \
  lib/__tests__/tts/pickBrowserVoice.test.ts
git commit -m "test: consolidate helper matrix cases"
```

### Task 3: Consolidate provider and service scenarios

**Files:**
- Modify: `services/__tests__/openaiCompatible.test.ts`
- Modify: `services/__tests__/providerTester.thinking.test.ts`
- Modify: `services/__tests__/providerPool.test.ts`
- Modify: `services/__tests__/background.test.ts`
- Modify: `services/__tests__/background.translate.test.ts`
- Modify: `services/__tests__/openaiCompatibleRetry.test.ts`
- Modify: `services/__tests__/base.test.ts`

**Interfaces:**
- Consumes: existing service fixtures, mock fetch responses, pool reset helpers, and per-test setup.
- Produces: unchanged provider, retry, failover, cache, and prompt assertions with fewer scenario blocks.

- [ ] **Step 1: Consolidate OpenAI-compatible request matrices**

In `services/__tests__/openaiCompatible.test.ts`, merge only tests with the same `OpenAICompatibleService` lifecycle:

```ts
it('covers request headers, response parsing, and partial-result diagnostics', async () => {
  // Preserve the successful batch, empty-content, auth-header,
  // malformed-response, and partial-ID back-fill expectations.
});

it('covers provider-specific thinking and response-format fallbacks', async () => {
  // Preserve the top-level/nested thinking fields, Gemini effort mapping,
  // rejected-thinking retry, and response_format memory assertions.
});
```

Keep subtitle/web prompt routing, RPM behavior, acquire-before-fetch order, and each specialized page/PDF/ASR path distinct unless they already share all setup and lifecycle. Do not merge away any assertion that verifies a thrown error versus a returned failed result.

- [ ] **Step 2: Consolidate provider tester and pool behavior**

In `providerTester.thinking.test.ts`, merge the equivalent disable-detection cases while retaining distinct assertions for `reasoning_content`, `<think>` stripping, auto mode, DeepSeek Official, OpenCode Zen model gating, rejected controls, empty content, reasoning-budget diagnostics, and the minimum token budget.

In `providerPool.test.ts`, combine only adjacent state-matrix cases with the same coordinator setup. Preserve empty-pool errors, 429/5xx/401 failover, cooldown rejoin, all-open diagnostics, targeted connection testing, throttle/concurrency, busy-key selection, same-key retry policy, and preferred/round-robin behavior.

- [ ] **Step 3: Consolidate background translation and retry matrices**

In `background.test.ts` and `background.translate.test.ts`, merge scenarios that use the same mock storage and reset lifecycle. Preserve named-glossary resolution, prompt/profile routing, context seeding, rolling glossary, cache behavior, pool failover, retry failure signaling, partial back-fill cache protection, hot-path rebuild tracking, negative-cache bypass, article/sidebar partitioning, deduplication, and concurrent batches.

In `openaiCompatibleRetry.test.ts`, group Retry-After parsing variants separately from retry policy behavior. In `base.test.ts`, group prompt construction and validation/parser matrices without dropping invalid-input or logging assertions.

- [ ] **Step 4: Run the changed service suites**

Run:

```bash
./node_modules/.bin/vitest run \
  services/__tests__/openaiCompatible.test.ts \
  services/__tests__/providerTester.thinking.test.ts \
  services/__tests__/providerPool.test.ts \
  services/__tests__/background.test.ts \
  services/__tests__/background.translate.test.ts \
  services/__tests__/openaiCompatibleRetry.test.ts \
  services/__tests__/base.test.ts
```

Expected: all selected tests pass with zero failures and no real retry sleep introduced.

- [ ] **Step 5: Recount the full suite and stop if target is reached**

Run:

```bash
./node_modules/.bin/vitest run --reporter=json --outputFile=/tmp/anyllm-vitest-after-services.json
node -e "const r=require('/tmp/anyllm-vitest-after-services.json'); console.log({total:r.numTotalTests,passed:r.numPassedTests,failed:r.numFailedTests})"
```

Expected: zero failures. If the total is 540–560, skip Task 4 and continue with Task 5.

- [ ] **Step 6: Commit the service batch**

```bash
git add services/__tests__/openaiCompatible.test.ts \
  services/__tests__/providerTester.thinking.test.ts \
  services/__tests__/providerPool.test.ts \
  services/__tests__/background.test.ts \
  services/__tests__/background.translate.test.ts \
  services/__tests__/openaiCompatibleRetry.test.ts \
  services/__tests__/base.test.ts
git commit -m "test: consolidate provider and service scenarios"
```

### Task 4: Consolidate content behavior scenarios

**Files:**
- Modify: `content/__tests__/inlineTranslate.test.ts`
- Modify: `content/__tests__/inlineTranslate.parity.test.ts`
- Modify: `content/__tests__/subtitleCoordinator.test.ts`
- Modify: `content/__tests__/translationDisplay.test.ts`
- Modify: `content/__tests__/domWalker.test.ts`
- Modify: `content/__tests__/mutationWatcher.test.ts`

**Interfaces:**
- Consumes: existing DOM fixtures, fake-timer setup, coordinator module resets, and message mocks.
- Produces: unchanged content behavior and regression coverage with fewer test cases.

- [ ] **Step 1: Consolidate inline translation guards and feedback**

In `inlineTranslate.test.ts`, merge compatible pure DOM guard cases, gesture configuration cases, visual feedback cases, and cleanup/listener cases. Keep separate recognizable coverage for:

- editable/password/code-editor/contenteditable classification;
- triple-space timing and configurable triggers;
- disabled, empty, detached-target, and active-translation guards;
- ProseMirror nested targets;
- translation success, failure, undo, loading, and auto-dismiss behavior;
- duplicate listener prevention and cleanup.

In `inlineTranslate.parity.test.ts`, merge only adjacent IME/input-event matrices and write-back/configuration matrices. Preserve `isComposing`, repeat, `event.code`, composition lifecycle, dual input/keydown de-duplication, idle debounce, write abort, undo/retranslate, language prefix, blocklist, and disabled behavior.

- [ ] **Step 2: Consolidate translation display and DOM walker matrices**

In `translationDisplay.test.ts`, combine style/placeholder insertion cases and state cleanup cases while retaining the XSS assertion and P0 protection against unmarking unrelated translations.

In `domWalker.test.ts`, combine the selector-cache and article-context matrices, and combine whitelist/cap variants only where every on/off assertion remains in the same behavior test. Keep excluded-inline handling, block skips, and rich-placeholder extraction assertions.

- [ ] **Step 3: Consolidate subtitle coordinator and mutation watcher scenarios**

In `subtitleCoordinator.test.ts`, merge only scenarios that share the same coordinator reset and message fixture:

```ts
it('handles intercepted subtitle translation, fallback, overlay setup, and response updates', async () => {
  // Preserve handler resolution, language fallback, native-player blanking,
  // overlay configuration, disabled/empty/no-handler passthrough,
  // translation failure, and successful cue update assertions.
});
```

Keep these independently recognizable and independently asserted: stale/matching session chunks, chunk-delta merge regression, seek cancellation and in-range seek, `SUBTITLE_CHUNK_FAILED` toast idempotency, Youku ASS blanking, ASR cache hit/miss/fail-open, proactive category detection, and native caption hiding.

In `mutationWatcher.test.ts`, combine normal mutation queueing cases and body-swap deduplication cases only when observer setup and teardown remain isolated.

- [ ] **Step 4: Run the changed content suites**

Run:

```bash
./node_modules/.bin/vitest run \
  content/__tests__/inlineTranslate.test.ts \
  content/__tests__/inlineTranslate.parity.test.ts \
  content/__tests__/subtitleCoordinator.test.ts \
  content/__tests__/translationDisplay.test.ts \
  content/__tests__/domWalker.test.ts \
  content/__tests__/mutationWatcher.test.ts
```

Expected: all selected tests pass with zero failures, fake timers are restored, and no cross-test singleton state leaks.

- [ ] **Step 5: Recount the full suite and stop within the target range**

Run:

```bash
./node_modules/.bin/vitest run --reporter=json --outputFile=/tmp/anyllm-vitest-after-content.json
node -e "const r=require('/tmp/anyllm-vitest-after-content.json'); console.log({total:r.numTotalTests,passed:r.numPassedTests,failed:r.numFailedTests})"
```

Expected: zero failures and `540 <= total <= 560`. If the count is below 540, restore the least valuable merge from the last batch rather than deleting more coverage.

- [ ] **Step 6: Commit the content batch**

```bash
git add content/__tests__/inlineTranslate.test.ts \
  content/__tests__/inlineTranslate.parity.test.ts \
  content/__tests__/subtitleCoordinator.test.ts \
  content/__tests__/translationDisplay.test.ts \
  content/__tests__/domWalker.test.ts \
  content/__tests__/mutationWatcher.test.ts
git commit -m "test: consolidate content behavior scenarios"
```

### Task 5: Update verified counts and run quality gates

**Files:**
- Modify: `conductor/product.md`
- Modify: `docs/superpowers/specs/2026-08-01-test-suite-prune-550-design.md` only if the verified final count requires a factual correction.
- Modify: `docs/superpowers/plans/2026-08-01-test-suite-prune-550.md` by checking off completed steps and recording the final count.
- Update: Beads issue `AnyLLMTranslate-5kb`.

**Interfaces:**
- Consumes: the final Vitest JSON report and quality-gate output.
- Produces: accurate project history, a closed Beads issue, and a pushed green branch.

- [ ] **Step 1: Run the complete final Vitest suite**

Run:

```bash
./node_modules/.bin/vitest run --reporter=json --outputFile=/tmp/anyllm-vitest-final.json
node - <<'NODE'
const fs = require('fs');
const report = JSON.parse(fs.readFileSync('/tmp/anyllm-vitest-final.json', 'utf8'));
console.log({
  total: report.numTotalTests,
  passed: report.numPassedTests,
  failed: report.numFailedTests,
  suites: report.numTotalTestSuites,
});
if (report.numFailedTests !== 0 || report.numTotalTests < 540 || report.numTotalTests > 560) {
  process.exit(1);
}
NODE
```

Expected: zero failures and a total between 540 and 560.

- [ ] **Step 2: Run compile, lint, and build**

Run:

```bash
npm run compile
npm run lint
npm run build
```

Expected: TypeScript exits 0, ESLint reports 0 errors, and the production build completes successfully.

- [ ] **Step 3: Update the project count documentation**

In `conductor/product.md`, update the current-state count and the latest suite-history entry to the exact final Vitest count, preserving the historical 682/631 entries as history. Do not rewrite unrelated product history.

- [ ] **Step 4: Review the final diff**

Run:

```bash
BASE_REF="$(git merge-base HEAD origin/master)"
git diff --check
git diff "$BASE_REF"...HEAD --check
git diff "$BASE_REF"...HEAD --stat
git diff "$BASE_REF"...HEAD --name-only
```

Expected: only the design/plan documentation, selected test consolidation, and count documentation are changed. No production source, Vitest configuration, or unrelated user work is present.

- [ ] **Step 5: Update and close the Beads issue**

Run:

```bash
FINAL_COUNT="$(node -p "require('/tmp/anyllm-vitest-final.json').numTotalTests")"
bd update AnyLLMTranslate-5kb \
  --title="Consolidate test suite: reduce 631 -> ${FINAL_COUNT} test cases" \
  --notes="Reduced the Vitest suite to ${FINAL_COUNT} passing cases using assertion-preserving merges and justified duplicate removal. Full Vitest, compile, lint, and build gates passed."
bd close AnyLLMTranslate-5kb --reason="Test suite consolidated to ${FINAL_COUNT} passing Vitest cases with quality gates green."
```

Expected: the issue title and closure reason contain the exact count read from the final JSON report.

- [ ] **Step 6: Commit documentation and final changes**

```bash
git add conductor/product.md \
  docs/superpowers/plans/2026-08-01-test-suite-prune-550.md
git commit -m "docs: record final consolidated test count"
```

- [ ] **Step 7: Push and verify**

Run:

```bash
git pull --rebase
bd dolt push
git push
git status --short --branch
```

Expected: Beads and Git pushes succeed, and the branch reports that it is up to date with `origin/master`.
