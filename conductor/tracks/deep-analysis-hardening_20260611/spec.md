# Spec: Deep Analysis Hardening & Improvements

## Overview

Address actionable issues identified during the deep codebase analysis to improve runtime security, reliability, privacy, maintainability, and edge-case behavior while preserving the current green baseline: 858 passing tests, 0 lint errors, and successful TypeScript compilation.

## Functional Requirements

1. Strengthen API key encryption-at-rest
   - Replace static-salt-only key derivation with a per-install random salt persisted in extension storage.
   - Preserve backward compatibility with existing plaintext and `enc:` values.
   - Detect undecryptable encrypted values and surface a recoverable state instead of treating ciphertext as a usable API key.
   - Add tests covering salt generation, round-trip encryption, migration/backward compatibility, and changed extension IDs.

2. Harden MAIN-world postMessage subtitle bridge handling
   - Add origin validation to inline `SUBTITLE_TRANSLATED` listeners in fetch and XHR interceptors.
   - Keep requestId correlation behavior intact.
   - Add tests proving forged cross-origin or malformed messages are ignored.

3. Improve interceptor lifecycle robustness
   - Make XHR/fetch monkey-patching idempotent and safer across enable/disable cycles.
   - Add teardown on page unload where feasible.
   - Preserve current subtitle interception behavior.

4. Reduce privacy leakage from debug logging
   - Gate full LLM request/response prompt logging behind `debugMode`.
   - Avoid logging full prompt/user text by default.
   - Keep useful operational logs for troubleshooting where they do not expose page content or API data.

5. Remove or justify dead memory captures
   - Audit `TranslationPiece.originalHTML`.
   - Remove unused capture if not required, or wire it into restore behavior if needed.
   - Add or adjust tests for restore behavior.

6. Tighten cache and semaphore edge-case behavior
   - Review queued semaphore timeout race behavior and make it deterministic.
   - Preserve max concurrency, max queue, and release-in-finally behavior.
   - Add tests for timed-out queued requests and slot handoff.

7. Improve parsing and ordering edge cases
   - Preserve expected ID ordering in parsed translation maps where relevant.
   - Harden glossary CSV header detection.
   - Review WebVTT metadata/timing edge cases and add targeted tests where useful.

8. Clean up subtitle/session state leaks
   - Ensure restore/navigation cleanup handles active subtitle sessions and keepalive alarms correctly.
   - Preserve progressive chunk behavior and priority queue behavior.

## Non-Functional Requirements

- Maintain TypeScript strictness and lint cleanliness.
- Maintain or increase test coverage around modified modules.
- Preserve current UX and settings schema compatibility for existing users.
- Do not introduce external dependencies unless strongly justified.
- Avoid host-page unsafe DOM insertion; continue using `textContent` and safe DOM construction.

## Acceptance Criteria

- `npm run compile` passes.
- `npm run lint` passes.
- `npm run test` passes.
- Existing settings with plaintext API keys still load.
- Existing settings with current `enc:` API keys are either migrated safely or show a recoverable provider-not-ready state.
- Subtitle interception tests pass for XHR and fetch, including origin validation.
- Default console output no longer includes full LLM prompts/responses unless debug mode is enabled.
- No regression in page translation, subtitle translation, settings load/save, or provider test flows.

## Out of Scope

- Full redesign of provider settings UI.
- New translation providers.
- End-to-end browser automation beyond targeted manual verification notes.
- Changing public extension branding or permissions unless required for security.
