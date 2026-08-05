# Test Suite Prune to Approximately 500 Cases Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reduce the verified 586-case Vitest suite to 490–510 passing cases through assertion-preserving test consolidation and justified duplicate removal.

**Architecture:** Keep production code, test-file boundaries, Vitest configuration, and test environments unchanged. Within selected test files, replace compatible `it()`/`it.each()` blocks with behavior-oriented scenario tests that retain every meaningful assertion and explicitly reset state where the original cases were isolated. Recount after every batch and stop as soon as the full-suite `numTotalTests` is in range.

**Tech Stack:** Vitest 3, TypeScript, React Testing Library/jsdom, Node test environment, npm scripts, JSON reporter, and Beads.

## Global Constraints

- Baseline is the fresh Vitest JSON report at `numTotalTests: 586`, `numPassedTests: 586`, and `numFailedTests: 0`.
- The target range is 490–510; stop immediately when the full suite enters that range.
- Count only Vitest `numTotalTests`; Python scientific-PDF tests are out of scope.
- Do not change production behavior, Vitest configuration, test environments, or dependencies.
- Prefer merging compatible cases; delete only exact duplicates or demonstrably stale/dead cases.
- Preserve subtitle ownership/seek/session, YouTube/Coursera lifecycle, provider retry/failover/cache, backup security, inline IME/race, XSS, empty-content, and negative-cache coverage.
- Use the Beads issue `AnyLLMTranslate-68m` for durable status; do not use markdown TODOs as task tracking.
- Do not commit, push, or sync Git/Dolt without explicit authorization.

---

### Task 1: Establish the live ledger and consolidation guard

**Files:**
- Read: `/tmp/anyllm-vitest-current.json`
- Modify: none

**Interfaces:**
- Consumes: the current checked-out test suite.
- Produces: a fresh baseline/ledger and an explicit stop condition for the following batches.

- [x] **Step 1: Verify the clean starting state and active issue**

Run:

```bash
git status --short --branch
bd show AnyLLMTranslate-68m
```

Expected: no unrelated worktree changes and the issue remains `IN_PROGRESS`.

- [x] **Step 2: Re-run the JSON baseline**

Run:

```bash
./node_modules/.bin/vitest run --reporter=json --outputFile=/tmp/anyllm-vitest-prune-500-baseline.json
node -e "const r=require('/tmp/anyllm-vitest-prune-500-baseline.json'); if(r.numFailedTests!==0) process.exit(1); console.log({total:r.numTotalTests,passed:r.numPassedTests,failed:r.numFailedTests})"
```

Expected: `total: 586`, `passed: 586`, `failed: 0`. If the live baseline differs, record the actual count in the Beads notes and recalculate the remaining reduction before editing.

- [x] **Step 3: Generate the per-file ledger**

Run:

```bash
node - <<'NODE'
const fs = require('fs');
const report = JSON.parse(fs.readFileSync('/tmp/anyllm-vitest-prune-500-baseline.json', 'utf8'));
for (const entry of report.testResults
  .map((entry) => ({
    file: entry.name.replace(process.cwd() + '/', ''),
    count: entry.assertionResults.length,
  }))
  .sort((a, b) => b.count - a.count)) {
  console.log(`${String(entry.count).padStart(3)} ${entry.file}`);
}
NODE
```

Expected: the ledger is used only to choose compatible groups; it is not itself a tracked task list.

---

### Task 2: Consolidate low-risk pure and DOM-builder matrices

**Files:**
- Modify, only where the live ledger still needs these cases: `content/__tests__/playerChrome/widgets.test.ts`, `content/__tests__/playerChrome/miniStudioView.test.ts`, `content/__tests__/playerChrome/visibility.test.ts`
- Modify, only where compatible: `lib/__tests__/youtubeWatchPage.test.ts`, `lib/__tests__/manifestParser.test.ts`, `lib/__tests__/providerTts.test.ts`, `lib/__tests__/thinkingMode.test.ts`, `lib/__tests__/tts/pickBrowserVoice.test.ts`, `lib/__tests__/googleMultiModel.test.ts`, `lib/__tests__/siteRuleSuggest.url.test.ts`, `lib/__tests__/youtubeAsrResegment.test.ts`

**Interfaces:**
- Consumes: existing pure helper APIs and local DOM fixtures.
- Produces: the same assertions grouped into small behavior-oriented scenarios with no production changes.

- [x] **Step 1: Group player-chrome builder scenarios by widget**

In `widgets.test.ts`, keep one `it()` for each builder (`buildToggle`, `buildSegmented`, `buildSlider`, `buildSelect`). Within each test, retain construction assertions and state/fallback assertions from the original cases. For example, the segmented scenario must still assert radio count/name/action, matching-value selection, and unknown-value fallback; the slider scenario must still assert attributes, programmatic fill, and input-event fill.

- [x] **Step 2: Group pure parser and URL matrices without dropping negative paths**

Merge only cases that exercise the same helper. Keep separate assertions for standard parsing, variant syntax, filtering, malformed/empty input, URL normalization, and ASR gating. Do not combine unrelated parser families into one oversized test.

- [x] **Step 3: Run the changed low-risk files**

Run:

```bash
./node_modules/.bin/vitest run \
  content/__tests__/playerChrome/widgets.test.ts \
  content/__tests__/playerChrome/miniStudioView.test.ts \
  content/__tests__/playerChrome/visibility.test.ts \
  lib/__tests__/youtubeWatchPage.test.ts \
  lib/__tests__/manifestParser.test.ts \
  lib/__tests__/providerTts.test.ts \
  lib/__tests__/thinkingMode.test.ts \
  lib/__tests__/tts/pickBrowserVoice.test.ts \
  lib/__tests__/googleMultiModel.test.ts \
  lib/__tests__/siteRuleSuggest.url.test.ts \
  lib/__tests__/youtubeAsrResegment.test.ts
```

Expected: zero failures and all original assertions still execute.

- [x] **Step 4: Recount and apply the range guard**

Run:

```bash
./node_modules/.bin/vitest run --reporter=json --outputFile=/tmp/anyllm-vitest-prune-500-after-pure.json
node -e "const r=require('/tmp/anyllm-vitest-prune-500-after-pure.json'); console.log({total:r.numTotalTests,passed:r.numPassedTests,failed:r.numFailedTests})"
```

If the total is 490–510, skip later consolidation tasks and proceed to final validation. If it is above 510, continue. If it is below 490, restore the smallest last merge before proceeding.

---

### Task 3: Consolidate recent UI and backup matrices

**Files:**
- Modify: `entrypoints/options/sections/subtitles/__tests__/PrealignFromLinkCard.test.tsx`
- Modify, only as needed to reach the range: `lib/__tests__/backup.test.ts`, `entrypoints/options/components/__tests__/BackupDialogs.test.tsx`, `entrypoints/options/sections/__tests__/AdvancedSection.backup.test.tsx`

**Interfaces:**
- Consumes: existing React Testing Library fixtures, runtime message mocks, and backup helpers.
- Produces: isolated scenario tests that preserve URL variants, typed errors, disabled state, encryption/tamper checks, and import/export safety assertions.

- [x] **Step 1: Merge pre-align URL variants into one scenario**

Replace the four independent valid-URL cases with one table-driven `it()` that loops over watch, youtu.be, shorts, and embed URLs. For each row, render a fresh card, submit the URL, await the matching `REALIGN_YOUTUBE_URL` call, and assert the saved status. Keep the invalid-URL no-message test separate.

- [x] **Step 2: Merge typed pre-align error mappings into one scenario**

Use one scenario table for all typed error codes. Before each row, clear the mock and render fresh state (or unmount/cleanup explicitly); submit `WATCH_URL`; assert the exact existing message pattern. Keep progress, already-saved, control-disabled, and invalid-client-input behavior independently asserted.

- [x] **Step 3: Consolidate only compatible backup assertions**

Keep tamper/password/prototype-pollution and exact-restore behavior recognizable. Merge only matrix cases with identical setup and no reliance on cross-test module state. Do not remove security assertions merely to reduce the count.

- [x] **Step 4: Run and recount the changed UI files**

Run:

```bash
./node_modules/.bin/vitest run \
  entrypoints/options/sections/subtitles/__tests__/PrealignFromLinkCard.test.tsx \
  lib/__tests__/backup.test.ts \
  entrypoints/options/components/__tests__/BackupDialogs.test.tsx \
  entrypoints/options/sections/__tests__/AdvancedSection.backup.test.tsx
./node_modules/.bin/vitest run --reporter=json --outputFile=/tmp/anyllm-vitest-prune-500-after-ui.json
node -e "const r=require('/tmp/anyllm-vitest-prune-500-after-ui.json'); console.log({total:r.numTotalTests,passed:r.numPassedTests,failed:r.numFailedTests})"
```

Expected: zero failures; stop subsequent tasks if the count is in range.

---

### Task 4: Consolidate provider and background scenarios only if still above range

**Files:**
- Modify, only as needed: `services/__tests__/openaiCompatible.test.ts`, `services/__tests__/providerPool.test.ts`, `services/__tests__/background.test.ts`, `services/__tests__/background.translate.test.ts`, `services/__tests__/providerTester.thinking.test.ts`, `services/__tests__/openaiCompatibleRetry.test.ts`, `services/__tests__/openaiCompatibleStreaming.test.ts`

**Interfaces:**
- Consumes: existing service fixtures, pool stubs, retry controls, and cache mocks.
- Produces: compact request-oriented scenarios that retain distinct provider dialect, retry/failover, empty-content, cache, and rate-limit behavior.

- [x] **Step 1: Group request-field matrices in `openaiCompatible.test.ts`**

Merge only compatible request-field assertions. Keep response-format rejection memory, thinking-field retry, glossary/prompt redaction, auth/empty/partial responses, rate limiter ordering, and thrown-vs-content failure contracts distinguishable in scenario names or comments.

- [x] **Step 2: Review provider-pool transitions without collapsing failure modes**

Combine compatible round-robin/delegated-method matrices, but retain separate assertions for empty pools, healthy-slot fairness, 429/5xx/401 behavior, all-open exhaustion, concurrency/throttle, saturated-key skipping, and multi-model fallback. Do not share mutable breaker state between scenarios.

- [x] **Step 3: Review background translation setup matrices without merging protected lifecycle cases**

Merge only tests sharing the same translation lifecycle. Preserve glossary selection/re-resolution, prompt/profile/knob routing, context accumulation, source-text cache keys, retry/failover, failure events, partial-cache prevention, and unrelated message handlers as separate behavior groups.

- [x] **Step 4: Run changed service files and recount**

Run:

```bash
./node_modules/.bin/vitest run \
  services/__tests__/openaiCompatible.test.ts \
  services/__tests__/providerPool.test.ts \
  services/__tests__/background.test.ts \
  services/__tests__/background.translate.test.ts \
  services/__tests__/providerTester.thinking.test.ts \
  services/__tests__/openaiCompatibleRetry.test.ts \
  services/__tests__/openaiCompatibleStreaming.test.ts
./node_modules/.bin/vitest run --reporter=json --outputFile=/tmp/anyllm-vitest-prune-500-after-services.json
node -e "const r=require('/tmp/anyllm-vitest-prune-500-after-services.json'); console.log({total:r.numTotalTests,passed:r.numPassedTests,failed:r.numFailedTests})"
```

Expected: zero failures and a count in range or a clear remaining reduction for Task 5.

---

### Task 5: Use the remaining reduction budget only on low-risk content groups (skipped)

The target range was reached at 509 cases after the low-risk service/UI
batches, so the broader coordinator/content suites were intentionally left
unchanged.

**Files:**
- Modify only if still above 510: `content/__tests__/subtitleCoordinator.test.ts`, `content/__tests__/inlineTranslate.test.ts`, `content/__tests__/inlineTranslate.parity.test.ts`, `content/__tests__/translationDisplay.test.ts`, `content/__tests__/domWalker.test.ts`, `content/__tests__/mutationWatcher.test.ts`

**Interfaces:**
- Consumes: existing content fixtures and lifecycle helpers.
- Produces: small scenario merges that retain critical lifecycle and security assertions.

- [x] **Step 1: Skipped — target range reached before coordinator consolidation**

The only first-choice coordinator candidates are watch-page URL rules, category-resolution variants, and directly related non-session guards. Keep direct-track ownership, manifest takeover, seek cancellation, stale sessions/chunks, native fallback, navigation invalidation, and renderer attachment tests separate unless a fresh fixture/reset proves the merged scenario equivalent.

- [x] **Step 2: Skipped — target range reached before content-helper consolidation**

For inline translation, preserve IME/composition, detached target, undo/error, gesture dedup, and debounce behavior. For DOM/display/mutation suites, preserve XSS, rich placeholders, body/aside caps, stale observer cleanup, and empty-content behavior. Use local fixture builders and clear mocks between scenarios.

- [x] **Step 3: Stopped at the verified 509-case count**

Run the changed files, then a full JSON-reporter run. Do not make an additional reduction if `490 <= numTotalTests <= 510`.

---

### Task 6: Final verification, documentation, and Beads handoff

**Files:**
- Modify: `conductor/product.md`, `conductor/workflow.md`, `conductor/tech-stack.md`, `conductor/tracks.md`, `conductor/patterns.md` only where current suite-count snapshots require correction
- Modify: Beads issue `AnyLLMTranslate-68m` via `bd`

**Interfaces:**
- Consumes: final JSON report and quality-gate output.
- Produces: verified suite count, accurate project history, and a closed Beads issue.

- [x] **Step 1: Run the complete final Vitest gate**

Run:

```bash
./node_modules/.bin/vitest run --no-file-parallelism --reporter=json --outputFile=/tmp/anyllm-vitest-prune-500-final-serial.json
node - <<'NODE'
const r = require('/tmp/anyllm-vitest-prune-500-final-serial.json');
console.log({total:r.numTotalTests, passed:r.numPassedTests, failed:r.numFailedTests});
if (r.numFailedTests !== 0 || r.numTotalTests < 490 || r.numTotalTests > 510) process.exit(1);
NODE
```

Result: `total: 509`, `passed: 509`, `failed: 0`. The default parallel
diagnostic was `507/509` with the two known load-sensitive
`background.test.ts` timeouts; the affected file passed in isolation.

- [x] **Step 2: Run compile, lint, and build**

Run:

```bash
npm run compile
npm run lint
npm run build
```

Expected: all three commands exit 0; no production source files appear in the diff.

- [x] **Step 3: Review the final diff and tracked-file scope**

Run:

```bash
git diff --stat
git diff --name-only
git status --short --branch
```

Confirm every changed test block is intentional, no meaningful assertion was dropped, and documentation reports the exact final `numTotalTests`.

- [x] **Step 4: Update and close Beads**

Run:

```bash
FINAL_COUNT=$(node -e "process.stdout.write(String(require('/tmp/anyllm-vitest-prune-500-final-serial.json').numTotalTests))")
bd update AnyLLMTranslate-68m --notes="Final verified count: ${FINAL_COUNT}; Vitest passed; compile/lint/build passed; test-only consolidation; no production behavior changes."
bd close AnyLLMTranslate-68m --reason="Suite reduced to the verified target range with all quality gates passing and protected coverage retained."
```

The shell variable is read directly from the final JSON report. Do not run Git commit/push or `bd dolt push` without explicit authorization.
