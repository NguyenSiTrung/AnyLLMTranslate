# OpenCode Go Provider Preset

## Overview

Add OpenCode Go as a separate predefined entry in the existing OpenAI-compatible provider catalog. Keep the current OpenCode Zen entry unchanged. This gives users a discoverable template for the OpenCode Go subscription endpoint without introducing a new provider preset type, storage migration, or vendor SDK.

## Goals

- Make OpenCode Go selectable from the provider catalog and setup wizard.
- Use the documented Go gateway endpoint and API-key URL.
- Enable the existing model browser for the Go models endpoint.
- Choose a default model that is documented to use the OpenAI-compatible chat-completions endpoint.
- Preserve OpenCode Zen behavior and all existing custom-provider storage semantics.

## Non-goals

- Supporting OpenCode Go's Responses API or Anthropic Messages API in this change.
- Hardcoding the complete Go model list, since OpenCode documents that the list can change and the existing model browser fetches it dynamically.
- Adding a new `ProviderPreset` enum value or changing persisted settings shape.

## Design

### Catalog entry

Add one `OpenAiCompatibleCatalogEntry` to `lib/openAiCompatibleCatalog.ts`:

| Field | Value |
| --- | --- |
| `id` | `opencode-go` |
| `displayName` | `OpenCode Go` |
| `baseUrl` | `https://opencode.ai/zen/go/v1` |
| `requiresApiKey` | `true` |
| `getKeyUrl` | `https://opencode.ai/auth` |
| `supportsModelListing` | `true` |
| `defaultModel` | `deepseek-v4-flash` |
| `category` | `cloud` |

Use OpenCode-specific keywords and a distinct identity badge so searches for `go`, `opencode`, or `zen` find the entry and the UI distinguishes it from OpenCode Zen.

The existing catalog selection flow will continue to persist `preset: 'custom'` and the catalog identifier separately. Existing URL normalization and catalog inference will resolve the Go endpoint without additional helpers.

### Runtime behavior

No runtime request code changes are required. The Go default model and chat-completions-compatible models use the existing `POST {baseUrl}/chat/completions` path. The existing model listing flow requests `GET {baseUrl}/models`, so the Go endpoint is compatible with the current picker.

Models exposed by Go through other protocol endpoints are outside this change and will not be selected by the default template. Users can still select a compatible model returned by the model browser.

### Error handling

Existing provider tester and model-picker errors remain unchanged. Authentication failures, unavailable endpoints, and model-listing failures use the existing connection-test and browse-model error states.

## Testing

Extend `lib/__tests__/openAiCompatibleCatalog.test.ts` to verify:

- The `opencode-go` entry exists with the expected endpoint, key URL, API-key requirement, listing support, and default model.
- Filtering by `opencode` and `go` finds the entry.
- `inferCatalogId` handles the canonical URL and trailing slash.
- `getKeyUrlForProvider` resolves the Go endpoint.
- OpenCode Zen remains present with its existing metadata.

Run the focused catalog tests, the full Vitest suite, TypeScript compilation, and ESLint.

## Acceptance criteria

1. OpenCode Go appears in the catalog and setup/provider selection UI through the existing catalog wiring.
2. Selecting it fills `https://opencode.ai/zen/go/v1`, requires an API key, and points users to `https://opencode.ai/auth`.
3. Browse models uses the existing `/models` integration.
4. OpenCode Zen remains unchanged.
5. Tests, compilation, and lint pass.
