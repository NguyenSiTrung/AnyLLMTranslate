# Track Learnings: llm-category-detection_20260504

Patterns, gotchas, and context discovered during implementation.

## Codebase Patterns (Inherited)

- Nullish coalescing for priority chains: `tabOverride ?? siteRuleCategory ?? autoDetected` is O(1) and readable for N-level fallback hierarchies.
- Feature toggles must be placed inside their parent toggle and conditionally rendered or disabled if parent is off.
- Settings are defined in `types/config.ts` and managed globally via `settingsStore.ts`.

---

<!-- Learnings from implementation will be appended below -->
