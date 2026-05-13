# Spec: Custom Endpoint Provider — Langflow Support

## Overview

Add support for non-OpenAI-compatible APIs by introducing a dedicated Langflow provider preset. This enables users connecting to Langflow-based LLM deployments to use AnyLLMTranslate without needing an OpenAI-compatible proxy.

Additionally, remove the `ollama` preset since Ollama natively speaks the OpenAI-compatible protocol — it's redundant with the existing `custom` preset.

## Functional Requirements

### FR1: Langflow Provider Service
- Create a `LangflowService` class implementing the existing `TranslationService` interface (`translate()` + `testConnection()`)
- Request format:
  - Full URL (no path appending, unlike OpenAI which appends `/chat/completions`)
  - Auth via `x-api-key` header (not `Authorization: Bearer`)
  - Body: `{ input_type: "text", output_type: "text", input_value: <user_prompt>, component_inputs: { <componentId>: { system_message: <system_prompt>, parameters: <JSON string>, stream: false, remove_think_text: true } } }`
- Response parsing: Extract text via configurable JSONPath (default: `outputs[0].outputs[0].results.text.text`), then pass to existing `parseTranslationResponse()` for JSON translation extraction
- Non-streaming only (`stream: false` hardcoded in request)

### FR2: Provider Preset Changes
- Remove `ollama` from `ProviderPreset` type and `PROVIDER_PRESETS` array
- Rename existing `custom` preset display label to `Custom (OpenAI Compatible)` for clarity
- Add `langflow` preset with:
  - Display name: "Langflow"
  - Description: "Connect to Langflow-based LLM endpoints"
  - Default values: temperature 0.3, stream false, remove_think_text true

### FR3: Configuration Schema
- Add new fields to `ProviderConfig`:
  - `endpointUrl: string` — full API URL (e.g., `https://your-langflow-server/api/v1/run/your-flow`)
  - `componentId: string` — Langflow component key (e.g., `model-component-id`)
  - `responseTextPath: string` — JSONPath for response text extraction (default: `outputs[0].outputs[0].results.text.text`)
- Existing fields reused: `apiKey`, `temperature`, `maxTokens`, `requestTimeoutMs`
- `model` field: not used by Langflow (component ID replaces it), optional/hidden

### FR4: Settings UI
- When `langflow` preset selected, show:
  - **Always visible:** Endpoint URL, API Key, Component ID, Temperature
  - **Advanced toggle:** Response Text Path (with default pre-filled), Max Tokens, Request Timeout
- When `custom` preset selected: existing UI unchanged (baseUrl, apiKey, model, temperature, etc.)
- Connection test button works for both presets

### FR5: Service Factory
- Update `initService()` in `background.ts` to check `provider.preset`:
  - If `'langflow'` → instantiate `LangflowService`
  - Otherwise → instantiate `OpenAICompatibleService` (covers `custom` and any legacy `ollama` configs)
- Category detection (`detectPageCategory()`) must also route through the correct service

### FR6: Migration / Backwards Compatibility
- Existing users with `preset: 'ollama'` must continue working — treat as `custom` with their saved `baseUrl`/`model`/`apiKey` values
- New installs default to `custom` preset (same as current behavior)

## Non-Functional Requirements

- No streaming support needed (simplifies implementation)
- Response text path resolution must handle missing/null intermediate keys gracefully (no crash on unexpected response shapes)
- All existing tests must continue passing (no breaking changes to OpenAI flow)
- New service must have ≥80% test coverage

## Acceptance Criteria

1. User can select "Langflow" preset in Options → Provider
2. User can enter Endpoint URL, API Key, Component ID, Temperature
3. Connection test succeeds against a Langflow endpoint
4. Page translation works end-to-end via Langflow provider
5. LLM category detection works via Langflow provider
6. Existing `custom` (OpenAI-compatible) users are unaffected
7. Former `ollama` users continue working without reconfiguration
8. Response Text Path override works when the default path doesn't match

## Out of Scope

- Streaming/SSE support
- Generic template-based custom endpoint (future track)
- Multiple simultaneous providers
- Custom header configuration beyond `x-api-key`
