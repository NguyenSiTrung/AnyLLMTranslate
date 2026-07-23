# Selection Bubble TTS — Phase B Implementation Plan

> **For agentic workers:** Phase B of AnyLLMTranslate-cdj. Spec §8 in `docs/superpowers/specs/2026-07-23-selection-bubble-full-redesign-design.md`.

**Goal:** Multi-provider-capable Speak for the selection bubble: settings, OpenAI-compatible `/audio/speech` in background, browser fallback.

**Status:** Implemented on branch `feat/selection-tts-phase-b_20260723`.

## Delivered

| Area | Path |
|------|------|
| Settings schema | `types/config.ts` — `TtsSettings`, `DEFAULT_TTS_SETTINGS` |
| Resolve / credentials | `lib/tts/resolveTtsBackend.ts` |
| Provider fetch | `lib/tts/providerTts.ts` |
| Background | `SYNTHESIZE_SPEECH` in `services/background.ts` |
| Speak controller | `content/selectionBubble/speak.ts` — `speakSmart` |
| Options UI | Advanced → Speech (selection Speak) |
| Tests | `lib/__tests__/ttsResolve.test.ts`, `providerTts.test.ts` |

## Behavior

- `preferredBackend: auto` → provider if pool has baseUrl+key, else browser
- Provider fail → browser + bubble status “Using browser voice”
- API keys only in background (never injected into page)
- Test voice button in Options
