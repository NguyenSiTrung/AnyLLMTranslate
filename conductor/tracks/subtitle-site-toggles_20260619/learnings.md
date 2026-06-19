# Track Learnings: subtitle-site-toggles_20260619

Patterns, gotchas, and context discovered during implementation.

## Codebase Patterns (Inherited)

- MAIN world inject script runs at `document_start` with NO access to `chrome.*` APIs — cannot read settings directly. Filtering must happen in the content script (ISOLATED world) which has access to `loadSettings()`.
- Subtitle handlers are registered in BOTH worlds (MAIN + ISOLATED) — the MAIN world does XHR/fetch interception, the content script runs the coordinator/overlay.
- `SubtitleSettings` is part of the nested `subtitleSettings` object in `ExtensionSettings` — deep merge handles partial updates.
- Adding fields to settings types requires updating `DEFAULT_SUBTITLE_SETTINGS` alongside the interface.
- Content script coordinator uses `detectCurrentHandler().platform` to identify the current platform.
- Always-respond pattern: `sendTranslatedSubtitle` with original content must be called even on early return to prevent native subtitle hangs.
- 5 actual subtitle handlers exist: youtube, udemy, coursera, linkedin, hbomax. Netflix is mentioned in product.md but has no handler implementation.

---

<!-- Learnings from implementation will be appended below -->
