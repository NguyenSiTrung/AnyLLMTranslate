# Track Learnings: phase5-settings-ux_20260410

Patterns, gotchas, and context discovered during implementation.

## Codebase Patterns (Inherited)

- WXT uses `entrypoints/` dir (not `src/`) for background.ts, content.ts, popup/. Other code lives at project root (lib/, types/, services/, content/).
- Vertical tabbed layout (sidebar + content area) with ARIA `role="tablist"` works well at 8+ sections.
- Zustand + chrome.storage bidirectional sync: write on mutation, listen via `chrome.storage.onChanged` for cross-context updates.
- `isLoaded` flag in store prevents rendering before storage load completes.
- Use string union types (not enums) for discriminated unions — keeps bundle small.
- Deep merge for nested settings objects — handle separately to avoid losing fields on partial updates.
- pnpm not installed globally — use `npx -y pnpm@latest exec` for all pnpm commands.
- WXT build produces ~346KB total for chrome-mv3 output.

## UI/UX Specific Context

- 3 duplicated `FieldGroup` components exist across GeneralSection, ProviderSection, SubtitlesSection — each slightly different API.
- Toggle switch is inline custom HTML in Subtitles + Advanced sections — no shared component.
- `alert()` used in AdvancedSection for import feedback, `confirm()` for reset — must replace with custom UI.
- Settings auto-save silently via Zustand — no user feedback mechanism exists.
- Sidebar is flat 8-tab list with no grouping or animated indicator.
- No transitions on tab switch — content swaps instantly.
- CSS-only animation strategy chosen (no framer-motion) to preserve bundle size.
- Dual save feedback: sidebar badge for micro-changes + toast for macro-actions.

---

<!-- Learnings from implementation will be appended below -->
