# Track Learnings: pdf-translation_20260612

Patterns, gotchas, and context discovered during implementation.

## Codebase Patterns (Inherited)

- **Architecture:** WXT uses the `entrypoints/` directory for background.ts, content.ts, popup/. Other code lives at the project root (`lib/`, `types/`, `services/`, `content/`).
- **Options / Configuration:** WXT auto-discovers `entrypoints/options/` as the options page. Custom pages must be defined in `wxt.config.ts`.
- **State Management:** Zustand + `chrome.storage` bidirectional sync: write on mutation, listen via `chrome.storage.onChanged` for cross-context updates.
- **Gotchas:** `npx -y pnpm@latest exec` or `npx -y pnpm@latest install` must be used for pnpm commands since pnpm is not installed globally.
- **Testing:** DOM-dependent tests using MutationObserver or event listeners in Vitest/jsdom require an async event loop tick (e.g., `await Promise.resolve()`) to allow handlers to register before asserting results.

---

<!-- Learnings from implementation will be appended below -->

## Implementation Learnings

- **WXT unlisted page name conflict:** `entrypoints/foo.html` + `entrypoints/foo/` triggers "Multiple entrypoints with the same name" because the directory name matches the entrypoint name. Use the directory-only form `entrypoints/foo/index.html` (with the script as `entrypoints/foo/index.tsx`) so there's no top-level sibling file with the same name as the directory.
- **pdfjs-dist v4 worker import:** `import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';` is the right pattern — Vite emits the file under `assets/` and the URL string is used as `pdfjs.GlobalWorkerOptions.workerSrc`. The emitted file path is covered by `web_accessible_resources: [{ resources: ['assets/*'], matches: ['<all_urls>'] }]`.
- **pdfjs-dist `TextItem` deep import:** `TextItem` is exported from `pdfjs-dist/types/src/display/api` but is not re-exported from the package root. Use `import type { TextItem } from 'pdfjs-dist/types/src/display/api';` for tests and helpers.
- **PDF.js DPI sizing:** Use `page.getViewport({ scale: cssScale * devicePixelRatio })` then set `canvas.width/height` to the viewport (physical pixels) and `canvas.style.width/height` to the CSS-pixel dimensions — keeps canvases sharp on hi-DPI without layout shift.
- **Extension page (popup/viewer) message path:** Popup-style entrypoints call `chrome.runtime.sendMessage` directly; content scripts call `chrome.tabs.sendMessage`. PDF viewer reuses the popup path because it's an unlisted extension page, not a content script.
- **Message-passing fan-out for redirects:** When a popup wants to open another extension page (like `pdf-viewer.html`), prefer going through the background service worker with a dedicated `OPEN_PDF_VIEWER` action that validates the URL. Direct `chrome.tabs.create(chrome.runtime.getURL(...))` from the popup also works, but centralizing validation prevents a future popup/options page from accidentally forwarding attacker-controlled URLs to the viewer.
- **IntersectionObserver for progressive translation:** Using `IntersectionObserver` on right-pane slot elements (with the right container as the scroll root) keeps the intersection math correct inside the pane — much simpler than tracking `scrollTop` + element offsets. Pages are translated lazily as they scroll into view, which avoids the LLM-token-storm problem for long PDFs.
- **In-memory cache + indexedDB-backed cache layering:** Per-session `Map<key, Map<key, value>>` caches layered on top of the existing `chrome.runtime.sendMessage` (which already does IndexedDB-backed `getCachedTranslation`/`cacheTranslation` write-through) give us a two-tier cache: hot pages stay in memory (instant re-translate on scroll back), cold pages hit IndexedDB on next visit. No need to add a new IDB schema.
- **PDF paragraph grouping heuristic:** `page.getTextContent()` returns a flat list of `TextItem`s. Group into lines by `transform[5]` (y) within `Y_TOLERANCE=1.5` PDF units, then into paragraphs by checking that the vertical gap between consecutive lines is less than `LINE_GAP_FACTOR * lineHeight` (we use 1.6). Hyphen-terminated line continuations get rejoined without a space; otherwise insert a single space.
- **Heading detection by page-level median font height:** Compute the median `TextItem.height` across all items on a page; paragraphs whose average height is ≥ 1.4 × median are flagged `isHeading`. This survives mixed pages with both body and heading text and avoids setting arbitrary per-document thresholds.
- **`chrome.extension.isAllowedFileSchemeAccess()` is the only API** for detecting whether the user has enabled "Allow access to file URLs". Wrap in a feature check (`typeof ext?.isAllowedFileSchemeAccess === 'function'`) because Firefox doesn't expose it — false-positive is better than crashing on Firefox.
- **vitest fake-timers for scroll handlers:** Any hook test that uses `requestAnimationFrame` in scroll handlers must call `vi.useFakeTimers()` + `vi.advanceTimersByTime(0)` inside `act()` to flush the rAF callback before asserting on `scrollTop`.
- **PDF viewer IntersectionObserver root must be the scroll pane:** Observing right-pane slots with the inner content wrapper as `root` makes every page appear visible because the wrapper is as tall as the full document. Use the actual scroll container (`[data-pane="right"]`) as the `IntersectionObserver` root, otherwise a PDF can trigger translations for every page at once.
- **PDF translation must split uncached paragraphs before `chrome.runtime.sendMessage`:** The background `translate` handler forwards each message payload as one provider call. PDF viewer callers must split uncached paragraphs by `settings.maxBatchChars` and send batches sequentially, mirroring page translation's smaller visible-content behavior and preventing provider request storms.
