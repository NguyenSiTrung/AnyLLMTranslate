# Track Learnings: youtube-asr-resegment_20260709

Patterns, gotchas, and context discovered during implementation.

## Codebase Patterns (Inherited)

### Subtitle & Interception (from patterns.md)
- YouTube dual format: srv3 XML via DOMParser, JSON3 via JSON.parse; format from URL `fmt` or content sniffing.
- Subtitle handlers must be registered in both ISOLATED (coordination/UI) and MAIN (XHR/fetch) worlds.
- Fetch interceptor must `response.clone()` before `.text()`.
- postMessage bridge uses channel `'anyllm-translate'` with origin validation.
- Coordinator tests: `vi.resetModules()` before dynamic import; call `startCoordinator()` explicitly.

### Architecture
- Pure libs under `lib/` with no Chrome APIs — preferred for TDD.
- Settings: Zustand + chrome.storage deep-merge for nested `subtitleSettings`.
- Cache keys must include final source text after any pre-translate transform.

### Immersive reference (session research)
- Gate: `kind=asr` on timedtext URL; requires `preTranslation` + `ytAsrConfig.enable|aiEnable`.
- Local pipeline: flatten segs → split (gap/breakWords/maxWords) → merge (endWords/startWords) → endCompatible → cues.
- Pro AI path: `POST subtitles/yt-asr-subs` (out of scope for AnyLLM v1; BYOK hook only).
- English-heavy word lists under `langsConfig.en`; `base` for other languages.

### Related archived tracks
- `phase2-subtitles_20260409` — YouTube handler foundation
- `subtitle-hardening_20260410` — JSON3 segment join fix
- `subtitles-ux-refactor_20260706` — SubtitlesSection presentation patterns

---

<!-- Learnings from implementation will be appended below -->
