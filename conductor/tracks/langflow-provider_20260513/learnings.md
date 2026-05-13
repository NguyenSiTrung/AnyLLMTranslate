# Track Learnings: langflow-provider_20260513

Patterns, gotchas, and context discovered during implementation.

## Codebase Patterns (Inherited)

- `TranslationService` interface is provider-agnostic: `translate()`, `testConnection()`, `detectPageCategory?()`
- `initService()` in `background.ts` is currently typed to return `Promise<OpenAICompatibleService>` — needs broadening to `TranslationService`
- Provider readiness state machine in `lib/providerReadiness.ts` checks `baseUrl` and `model` — Langflow uses `endpointUrl` and `componentId` instead
- `providerTester.ts` has hardcoded 3-step flow (ping, models, translation) — Langflow has no `/models` endpoint
- `ProviderSection.tsx` renders fields unconditionally — needs conditional rendering per preset
- Tests use `preset: 'ollama'` in 4 test files — all need updating to `'custom'`
- `buildSystemPrompt()` and `buildUserPrompt()` from `base.ts` are reusable across providers
- `parseTranslationResponse()` from `base.ts` handles JSON extraction from LLM text — reusable after we extract the raw text from Langflow's response envelope

---

<!-- Learnings from implementation will be appended below -->
