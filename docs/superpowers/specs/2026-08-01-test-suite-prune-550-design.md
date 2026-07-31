# Test Suite Prune to Approximately 550 Cases

## Goal

Reduce the Vitest suite from the verified baseline of 631 passing test cases to
approximately 550, with an acceptable final range of 540–560 cases.

The count is the Vitest runner's `numTotalTests` value. The separate Python
scientific-PDF tests are out of scope.

## Design decisions

- Prefer consolidating related `it()` blocks over deleting coverage.
- Keep every meaningful behavioral assertion when scenarios are merged.
- Delete a test case only when its assertions are duplicated by retained
  coverage or the exercised path is demonstrably stale/dead.
- Preserve P0, regression, security, lifecycle, seek/session, retry/failover,
  cache-integrity, IME, and empty-content coverage.
- Keep test files and production code unless a file is proven obsolete.
- Stop once the total is in the 540–560 range; do not remove additional
  coverage solely to reach an exact number.

## Candidate order

Changes will be made in small batches, with a test recount after each batch.

### 1. Pure and helper matrix suites

Start with low-risk cases in suites such as:

- `lib/__tests__/ttsResolve.test.ts`
- `lib/__tests__/manifestParser.test.ts`
- `lib/__tests__/thinkingMode.test.ts`
- `lib/__tests__/googleMultiModel.test.ts`
- `lib/__tests__/siteRuleSuggest.url.test.ts`

Cases that exercise one pure function's input matrix can become one
scenario-oriented test while retaining all assertions. Confirmed duplicate
null/disabled cases, such as overlapping `ttsResolve` pool-provider cases, may
be removed rather than merged.

### 2. Provider and service scenario suites

Next consolidate cases in:

- `services/__tests__/openaiCompatible.test.ts`
- `services/__tests__/providerTester.thinking.test.ts`
- `services/__tests__/providerPool.test.ts`
- `services/__tests__/background.test.ts`
- `services/__tests__/background.translate.test.ts`

Only cases with compatible setup and lifecycle will be merged. Provider
dialect behavior, retry and failover behavior, empty-content diagnostics,
cache-integrity guarantees, and distinct pool state transitions remain
recognizable and independently asserted.

### 3. Content and UI suites

Use the remaining reduction budget in:

- `content/__tests__/inlineTranslate.test.ts`
- `content/__tests__/inlineTranslate.parity.test.ts`
- `content/__tests__/subtitleCoordinator.test.ts`
- `content/__tests__/translationDisplay.test.ts`
- `content/__tests__/domWalker.test.ts`
- `content/__tests__/mutationWatcher.test.ts`

Merge adjacent scenarios that share fixtures and setup. Keep P0 session/seek
and stale-chunk behavior, XSS protection, IME handling, and lifecycle
regressions independently recognizable in test names or scenario comments.

Recent player-chrome and LLM Site Rule suggestion tests are protected from
pruning unless the target cannot be reached through older/general suites.

## Test organization rules

Each merged test will:

1. Retain a clear behavior-oriented name.
2. Reset mutable state between scenarios when the original tests had isolated
   setup.
3. Preserve the strongest assertion from each original case, including
   negative assertions and call-count/order checks.
4. Use scenario comments only to separate genuinely related cases, not to hide
   unrelated behaviors in a single oversized test.

## Validation

1. Record the 631-case baseline using Vitest's JSON reporter.
2. After each batch, run the changed test files and recount the full suite.
3. Run the final full Vitest suite and require zero failures.
4. Run:
   - `npm run compile`
   - `npm run lint`
   - `npm run build`
5. Review the diff for accidental assertion loss, broad unrelated merges, and
   production-code changes.
6. Update the active Beads issue and current suite-count documentation with the
   verified final count.

Success means the final suite is green, counts 540–560 Vitest cases, and the
diff contains only intentional test consolidation, justified duplicate removal,
and accurate count documentation.
