# Spec: OpenAI-Compatible Provider Catalog & Model Picker

## Overview

Improve Custom (OpenAI Compatible) provider setup: searchable catalog (OpenRouter, NVIDIA NIM, Groq, Together, Fireworks, Mistral, Ollama, LM Studio) with auto-fill base URL; on-demand GET /models model picker when base URL and API key (if required) are set—without full connection test.

Keep `preset: 'custom'` in storage; catalog uses static IDs, not new enum values.

## Functional Requirements

1. Static catalog in `lib/openAiCompatibleCatalog.ts` (id, displayName, keywords, baseUrl, requiresApiKey, placeholder, defaultModel, supportsModelListing).
2. Searchable picker in ProviderSection and SetupWizard; on select auto-fill baseUrl/metadata; preserve API key by default.
3. Export `listProviderModels` from providerTester; Browse models UI with loading/error/chips.
4. Connection test unchanged.

## Acceptance Criteria

- Search select auto-fills base URL (e.g. OpenRouter).
- Browse models works with URL + key without full test.
- Wizard parity; tests and lint pass; no schema migration.

## Out of Scope

OAuth, remote registry, multiple ProviderPreset enums, popup editor.
