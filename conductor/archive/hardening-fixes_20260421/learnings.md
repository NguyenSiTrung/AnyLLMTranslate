# Learnings: Hardening & Fixes

Track: `hardening-fixes_20260421`

- **AES-GCM encryption for extension storage**
  - Use PBKDF2 (SHA-256, 100k iterations) with `chrome.runtime.id` + static salt to derive a stable per-install key
  - AES-GCM with random 12-byte IV; prepend IV to ciphertext and base64-encode
  - Prefix encrypted values with `enc:` so `decrypt` can distinguish encrypted vs plaintext (backward compat)
  - Keep encrypt/decrypt in a single `lib/crypto.ts` module; wire into `lib/config.ts` at load/save boundaries
  - Refactor all direct `chrome.storage.local` accesses (store, popup) to go through `lib/config.ts` so encryption is always applied
  - `chrome.storage.onChanged` listeners should do synchronous merge for immediate UI, then async reload for decryption

- **deepMerge for extension settings**
  - Chrome storage partial updates require deep merging of nested objects (provider, subtitleSettings, inlineTranslate)
  - A generic `deepMerge` utility that recursively merges objects while overwriting arrays is sufficient
  - Apply at both `loadSettings()` (merge stored partials into defaults) and `updateSettings()` (merge partial updates into current)
  - `chrome.storage.onChanged` listeners also need deepMerge so UI updates don't drop sibling nested fields

- **Rate limiting via in-process semaphore**
  - In MV3, an in-memory semaphore in the background script is sufficient for rate limiting (only one SW instance runs at a time)
  - Pattern: `maxConcurrent` active slots + `maxQueue` waiting promises; queue entries are functions that resolve the pending promise
  - Always release in `finally` block; wrap `try` body inside semaphore acquisition
  - Queue timeout prevents stalled requests when SW restarts and semaphore state resets

- **Strict platform detection for subtitle auto-activate**
  - Generic video-element heuristics (`document.querySelectorAll('video')`) are unreliable on listing/search pages with autoplay thumbnails
  - For subtitle coordination, only known platforms should auto-activate; unknown platforms should return `false` from `isOnWatchPage`

- **chrome.storage.onChanged listener cleanup**
  - Store the listener function in a module-level variable so it can be removed later
  - Remove it in `stopTranslation()` or equivalent cleanup to prevent duplicate listeners on SPA re-routes

- **Content-script re-injection guard**
  - WXT content scripts can be re-injected on SPA navigations; set a `window.__anyllmTranslateInitialized` flag and return early if already set

- **Safe DOM construction (avoid innerHTML)**
  - Never use `innerHTML` with dynamic text; use `document.createElement` + `textContent` for all user-facing strings
  - Static SVG templates in innerHTML are acceptable if they contain no user data

- **Subtitle fetch allow-list**
  - Background CORS bypass for subtitle fetch must validate URL against a regex allow-list before calling `fetch()`
  - Include common subtitle/CDN domains: `youtube.com`, `udemycdn.com`, `coursera.org`, `cloudfront.net`, `akamaized.net`, etc.

- **React error boundaries**
  - Wrap popup and options entrypoints with a minimal class component error boundary
  - Provide a reload button; log to console for debugging

- **Clipboard API error handling**
  - `navigator.clipboard.writeText()` is async and can throw (permissions, non-secure context)
  - Always `await` it and wrap in try/catch; show visual feedback on failure

<!-- Append new learnings as tasks complete. Promote reusable patterns to patterns.md at track completion. -->

