# Specification: Subtitle Handling Reliability and Hardening

## Overview

Fix and improve the current video subtitle handling pipeline so intercepted, discovered, translated, and overlay-rendered subtitles remain reliable across concurrent subtitle sessions, parser fallbacks, page navigation, BFCache restores, manual commands, and multi-video pages.

This track covers all issues identified in the deep analysis of subtitle handling.

## Functional Requirements

1. Prevent stale subtitle translation sessions from updating newer overlays.
   - Add session identity to progressive subtitle translation.
   - Stop or invalidate any previous per-tab subtitle session before starting a new one.
   - Drop stale `SUBTITLE_CHUNK_TRANSLATED` messages in content.

2. Always unblock intercepted subtitle requests.
   - If no handler exists, parsing returns zero cues, subtitles are disabled, or translation setup fails, return original subtitle body to the interceptor.
   - Avoid 30-second native subtitle stalls.

3. Do not blank native subtitles unless the custom overlay is successfully attached.
   - Ensure overlay initialization reports success or failure.
   - Only send empty `WEBVTT` after a confirmed overlay attachment.

4. Restore or preserve MAIN-world interceptors across BFCache restore.
   - Handle `pageshow` after `pagehide` when a page is restored from BFCache.
   - Ensure XHR/fetch interception remains active after back/forward navigation.

5. Harden background subtitle URL fetching.
   - Validate parsed URL protocol and hostname, not raw URL substrings.
   - Reject localhost, private IPs, and non-HTTP(S) protocols.
   - Preserve required subtitle CDN support.

6. Wire manual subtitle translation entry points.
   - Implement content handling for `startSubtitleTranslation`.
   - Use discovered preferred tracks when available.
   - Fail gracefully when no subtitle track is available.

7. Keep subtitle coordinator lifecycle independent from page translation restore.
   - Avoid permanently disabling subtitle coordination after `stopTranslation()`.
   - Ensure restore cancels in-progress subtitle sessions without breaking future subtitle handling.

8. Cancel subtitle sessions during full document navigation/unload.
   - Add best-effort cleanup for non-SPA navigations.

9. Remove playback watcher listener leaks.
   - Store and remove `play`/`pause` listener references on cleanup.

10. Improve HTML5 text track discovery.
    - Detect pre-existing unloaded videos after metadata loads.
    - Avoid missing subtitle tracks on multi-video pages.

11. Clean up or wire dead/unused subtitle timeout state.
    - Either connect `translationTimeout` to runtime interceptors or remove obsolete coordinator timeout fields.

12. Improve multi-video overlay selection where feasible.
    - Prefer the primary/active video instead of blindly using the first `<video>`.

## Non-Functional Requirements

- Preserve current extension architecture: WXT, TypeScript, MV3 service worker, MAIN-world interception, isolated content coordination.
- Keep subtitle overlay text XSS-safe by continuing to render user/LLM subtitle text with `textContent`.
- Avoid breaking YouTube, Udemy, Coursera, LinkedIn Learning, and HTML5 fallback subtitle flows.
- Use project test conventions and add regression tests for each fixed issue.
- Keep behavior resilient when `chrome.runtime.sendMessage` fails during unload or service worker wakeup.

## Acceptance Criteria

- Stale progressive subtitle chunks from old sessions cannot update the current overlay.
- Matched but unsupported or unparseable subtitle requests are released immediately with original content.
- Native subtitles are not blanked when overlay initialization fails.
- Subtitle interception works after BFCache back/forward restore.
- Background subtitle fetch rejects forged allow-list bypass URLs such as `http://127.0.0.1:9/x?youtube.com`.
- `startSubtitleTranslation` from context menu/keyboard has a working content-side path.
- Restoring page translation does not permanently disable subtitle handling.
- Full navigation and tab close do not leave background subtitle sessions running.
- Playback watcher cleanup removes event listeners.
- HTML5 fallback discovers tracks from pre-existing videos once metadata loads.
- Unit tests cover the above regressions.
- Final validators pass: relevant subtitle tests, `pnpm test`, `pnpm lint`, and `pnpm compile`.

## Out of Scope

- Redesigning subtitle UI/UX.
- Adding new video platforms beyond existing handler support.
- Changing translation provider behavior.
- Replacing the custom overlay architecture.
- Large E2E browser automation unless needed to validate BFCache behavior.
