# Track Learnings: progressive-chunking_20260417

Patterns, gotchas, and context discovered during implementation.

## Codebase Patterns (Inherited)

- See `conductor/patterns.md` for project patterns.

---

<!-- Learnings from implementation will be appended below -->

## Implementation Learnings
1. **Gotcha**: Content scripts running in the ISOLATED world cannot access global registries populated by the MAIN world inject scripts. Handlers must be explicitly re-registered in the content script's entry point to be available for processing.
2. **Gotcha**: Comparing objects with `undefined === undefined` evaluates to true in `findIndex`, which can cause devastating bugs where the first element of an array is repeatedly overwritten. Always verify interface properties (`id`) exist before using them as keys.
3. **Pattern**: When chunking LLM translation requests, deduplicating texts via a Map will alter the output array length and destroy index alignment with the source chunk. If alignment is required, process duplicates gracefully without removing them from the iteration order.
4. **Architecture Pattern**: Use a mutable array queue (e.g., `queue: number[]`) instead of a `for` loop for async background processing loops. This allows other components to re-prioritize processing order dynamically (e.g., handling video `seeked` events to translate the current timestamp first).
