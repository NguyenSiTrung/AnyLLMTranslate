# Test Suite Prune to Approximately 500 Cases

## Goal

Reduce the current Vitest suite from the verified baseline of 586 passing cases
to approximately 500 cases, treating 490–510 as the acceptable range. The
separate Python scientific-PDF tests remain out of scope.

The reduction is about test-case organization and value, not production
behavior. A case may be removed only when it is an exact duplicate, exercises
dead behavior, or is replaced by an equivalent retained scenario. Related
cases should normally be merged while preserving their meaningful assertions.

## Approaches considered

1. **Delete lower-value cases until the count is near 500.** This reaches the
   numeric target quickly but makes coverage loss difficult to review and risks
   removing the only assertion for a failure mode.
2. **Merge every remaining case into large umbrella tests.** This retains most
   assertions, but weakens failure locality and can make stateful async tests
   brittle.
3. **Recommended — staged, assertion-preserving consolidation.** Merge pure
   input matrices, compatible UI state matrices, and compatible request/error
   matrices. Remove only confirmed duplicates or dead paths. Keep lifecycle and
   race-sensitive scenarios separate unless their fixtures can be reset inside
   the merged test. Recount after every batch and stop immediately in the
   target range.

## Coverage boundaries

The following behaviors remain independently recognizable in retained test
names or scenario comments:

- subtitle session ownership, seek cancellation, stale-chunk rejection,
  renderer attachment, source takeover, and failure recovery;
- YouTube and Coursera caption discovery, fallback, navigation, and lifecycle
  regressions;
- provider pool round-robin, circuit-breaker failover, retry, empty-pool
  diagnostics, rate limiting, cache integrity, and response-format memory;
- backup encryption/tamper rejection, import sanitization, prototype-pollution
  protection, and exact-restore behavior;
- inline translation IME, gesture, detached-element, race, undo, and error
  recovery behavior;
- XSS/HTML safety, empty-content handling, and negative-cache semantics.

Recent feature suites are eligible for matrix consolidation when assertions are
retained, but are not eligible for arbitrary deletion merely because they are
new. Production files, Vitest configuration, environments, and dependency
versions are not changed.

## Consolidation shape

The work is divided into independently verifiable batches:

1. **Low-risk pure and DOM-builder matrices.** Combine adjacent cases that
   exercise one helper's supported values and fallback behavior. Candidate
   files include the player-chrome widget/view helpers, YouTube watch-page
   parsing, manifest/provider-TTS matrices, and small pure helper suites.
2. **Recent UI/request matrices.** Combine YouTube pre-align URL variants and
   typed error-message mappings, plus compatible backup-dialog state matrices.
   Each scenario gets fresh render state and mock state.
3. **Provider/background request scenarios.** Merge only compatible request
   setup/lifecycle cases while keeping dialect-specific fields, retries,
   failover, cache, empty-response, and error assertions visible.
4. **Content/coordinator low-risk groups.** Merge only URL/category and
   directly related state cases after the first three batches. Stateful
   subtitle lifecycle and seek/ownership cases stay separate when isolation
   would be unclear.

The exact file set is governed by the live count after each batch; no batch is
allowed to overshoot below 490. A merged test must reset mutable state between
scenarios or use independent local fixtures, retain negative and call-order
assertions, and keep a behavior-oriented name.

## Validation and handoff

The authoritative count is Vitest's `numTotalTests` from its JSON reporter.
After each batch, run the changed files and a full JSON-reporter run. At the
end, run the full Vitest suite, `npm run compile`, `npm run lint`, and
`npm run build`. Review the diff to ensure it contains only intentional test
consolidation and count documentation. Update the active Beads issue and
current suite-history documentation with the verified final count. Do not
commit or push without explicit authorization.

## Final result (2026-08-05)

The staged consolidation reached **509 Vitest cases** across **196 files**. The
serial full-suite gate passed **509/509**; TypeScript, ESLint, and the Chrome
production build also passed. A default-parallel diagnostic still reports the
known two load-sensitive failures in `services/__tests__/background.test.ts`
(`507/509`), while that file passes in isolation. No production files,
configuration, environments, or dependencies changed.
