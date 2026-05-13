# Plan: Custom Endpoint Provider — Langflow Support

## Phase 1: Type System & Config Schema
<!-- execution: sequential -->

- [ ] Task 1: Update `ProviderPreset` type and `ProviderConfig` interface
  - Remove `'ollama'` from `ProviderPreset` union type, add `'langflow'`
  - Add optional fields to `ProviderConfig`: `endpointUrl?: string`, `componentId?: string`, `responseTextPath?: string`
  - Update `ProviderPresetDefinition` interface to accommodate Langflow (no `baseUrl`/`defaultModel` for Langflow)
  - Update `PROVIDER_PRESETS` array: remove Ollama entry, rename Custom display name to `Custom (OpenAI Compatible)`, add Langflow entry
  - Update `DEFAULT_SETTINGS` — ensure default preset remains `'custom'`
  - Files: `types/config.ts`

- [ ] Task 2: Update `validateProviderConfig()` for Langflow
  - For `langflow` preset: validate `endpointUrl` (required, valid URL) and `apiKey` (required) — `model` is NOT required
  - For `custom` preset: existing validation unchanged (`baseUrl` + `model` required)
  - Files: `services/base.ts`

- [ ] Task 3: Update `getProviderReadiness()` for Langflow
  - For `langflow` preset: check `endpointUrl` instead of `baseUrl`, check `componentId` instead of `model`
  - Update recovery messages to reference Langflow-specific fields
  - Files: `lib/providerReadiness.ts`

- [ ] Task 4: Write unit tests for config changes
  - Test `validateProviderConfig()` with Langflow config (valid, missing endpointUrl, missing apiKey)
  - Test `validateProviderConfig()` still works with `custom` preset
  - Test `getProviderReadiness()` with Langflow config states
  - Test that legacy `'ollama'` preset in stored config doesn't crash validation
  - Files: `services/__tests__/base.test.ts`, `lib/__tests__/providerReadiness.test.ts`

- [ ] Task: Conductor - User Manual Verification 'Phase 1: Type System & Config Schema' (Protocol in workflow.md)

## Phase 2: Langflow Service Implementation
<!-- execution: sequential -->

- [ ] Task 1: Create `LangflowService` class
  - Implement `TranslationService` interface: `translate()`, `testConnection()`, `detectPageCategory()`
  - `translate()`: build Langflow request body using `buildSystemPrompt()` + `buildUserPrompt()` from `base.ts`, send to `endpointUrl`, extract response text via `responseTextPath`, pass to `parseTranslationResponse()`
  - `testConnection()`: send simple test input to endpoint, verify non-empty response
  - `detectPageCategory()`: build category detection prompt (same as OpenAI service), send via Langflow format, parse category from response
  - Implement `fetchWithRetry()` with retry on 5xx, `AbortController` timeout using `requestTimeoutMs`
  - Auth: `x-api-key` header (not `Authorization: Bearer`)
  - Helper: `resolveTextPath(obj, path)` — traverses response object by dotted path (e.g., `outputs[0].outputs[0].results.text.text`), returns string or throws
  - Files: `services/langflowService.ts`

- [ ] Task 2: Write unit tests for `LangflowService`
  - Test `translate()` with mocked fetch — correct request body shape, correct auth header, correct response extraction
  - Test `translate()` error handling — network error, timeout, invalid response, missing text path
  - Test `testConnection()` — success and failure paths
  - Test `detectPageCategory()` — correct prompt, correct response parsing
  - Test `resolveTextPath()` — happy path, missing keys, array index out of bounds
  - Test retry logic on 5xx
  - Files: `services/__tests__/langflowService.test.ts`

- [ ] Task: Conductor - User Manual Verification 'Phase 2: Langflow Service Implementation' (Protocol in workflow.md)

## Phase 3: Service Factory & Provider Tester
<!-- execution: sequential -->

- [ ] Task 1: Update `initService()` factory in `background.ts`
  - Change return type from `Promise<OpenAICompatibleService>` to `Promise<TranslationService>`
  - Check `config.preset`: if `'langflow'` → create/update `LangflowService`, else → create/update `OpenAICompatibleService`
  - Handle `translationService` type switching (if preset changes, create new instance instead of updating)
  - Migrate legacy `'ollama'` preset: treat as `'custom'` (no code change needed — OpenAICompatibleService handles it)
  - Files: `services/background.ts`

- [ ] Task 2: Update `providerTester.ts` for Langflow
  - Detect `preset === 'langflow'` in `testConnection()` entry point
  - For Langflow: modify `testPing()` to use `endpointUrl` + `x-api-key` header + Langflow request body
  - For Langflow: skip `testModelListing()` step (Langflow has no `/models` endpoint) — mark as "skipped" or auto-pass
  - For Langflow: modify `testTranslation()` to use Langflow request format
  - Keep OpenAI-compatible path unchanged
  - Files: `services/providerTester.ts`

- [ ] Task 3: Update background/providerTester tests
  - Update `background.test.ts` mock configs: replace `preset: 'ollama'` → `preset: 'custom'` in existing tests
  - Add test: `initService()` returns `LangflowService` when preset is `'langflow'`
  - Add test: `initService()` returns `OpenAICompatibleService` for `'custom'` and legacy `'ollama'`
  - Update `providerTester.test.ts`: replace `preset: 'ollama'` → `preset: 'custom'`
  - Add Langflow provider tester tests (ping, skip models, translation)
  - Files: `services/__tests__/background.test.ts`, `services/__tests__/providerTester.test.ts`

- [ ] Task: Conductor - User Manual Verification 'Phase 3: Service Factory & Provider Tester' (Protocol in workflow.md)

## Phase 4: Settings UI — Langflow Provider Section
<!-- execution: sequential -->

- [ ] Task 1: Update `ProviderSection.tsx` for Langflow preset
  - In preset cards: show `Custom (OpenAI Compatible)` and `Langflow` (2 cards)
  - Conditional fields based on `settings.provider.preset`:
    - If `'langflow'`: show Endpoint URL, API Key, Component ID, Temperature (always visible); Response Text Path, Max Tokens, Request Timeout (in Advanced)
    - If `'custom'`: show existing fields (Base URL, API Key, Model, Temperature in Advanced, etc.)
  - `handlePresetChange()`: when switching to `langflow`, set `requiresApiKey: true`, clear `baseUrl`/`model`, set defaults for `endpointUrl`/`componentId`/`responseTextPath`
  - Update connection test UI: for Langflow, show 2 steps (ping + translation) instead of 3 (skip model listing)
  - Files: `entrypoints/options/sections/ProviderSection.tsx`

- [ ] Task 2: Update onboarding wizard for Langflow preset
  - Ensure setup wizard works with Langflow preset if user selects it during onboarding
  - Provider step should show preset selection and conditionally render Langflow fields
  - Test step should use the correct test flow (2-step for Langflow)
  - Files: `entrypoints/options/components/SetupWizard.tsx` (if exists, else identify correct file)

- [ ] Task 3: Run full test suite and fix any regressions
  - `pnpm test` — all existing tests must pass
  - `pnpm lint` — no new lint errors
  - `pnpm build` — build must succeed
  - Fix any TypeScript errors from `ProviderPreset` type change (removing `'ollama'`)

- [ ] Task: Conductor - User Manual Verification 'Phase 4: Settings UI — Langflow Provider Section' (Protocol in workflow.md)
