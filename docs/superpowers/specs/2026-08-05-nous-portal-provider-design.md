# Nous Portal Provider Design

## Goal

Make Nous Portal selectable as a predefined direct API-key provider in AnyLLMTranslate, without requiring Hermes Agent or a local subscription proxy.

## Scope

- Add one OpenAI-compatible catalog entry named `Nous Portal`.
- Configure its inference base URL as `https://inference-api.nousresearch.com/v1`.
- Mark the provider as API-key based and link users to `https://portal.nousresearch.com/api-keys`.
- Use `Hermes-4-70B` as the initial model suggestion and enable `/v1/models` discovery.
- Add the Nous inference host to the extension's Chrome host permissions.
- Add regression coverage for the catalog metadata and host permission.

## Out of scope

- Hermes Agent installation, OAuth, subscription proxy, or local server support.
- Changes to the generic OpenAI-compatible request client.
- Billing, key validation, or Nous-specific request transformations.

## Design

The provider remains an `OpenAICompatibleCatalogEntry` and keeps the existing `preset: 'custom'` storage behavior. The existing client appends `/chat/completions` to the configured base URL and sends the configured key as a Bearer token, so no provider-specific service is needed.

The extension manifest will allow HTTPS requests to `inference-api.nousresearch.com`. The catalog's model-listing flag will let the existing connection/model picker use the provider's compatible `/v1/models` endpoint.

## Testing

- Assert the catalog resolves the Nous entry by its stable ID.
- Assert the base URL, API-key requirement, default model, API-key URL, and model-listing flag.
- Assert the generated manifest contains the Nous inference host permission.
- Run the focused catalog tests, then the full test suite and production build.
