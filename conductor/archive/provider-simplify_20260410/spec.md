# Spec: Simplify Provider Support

## Overview

Refactor the provider system to support only two providers: **Ollama** (local LLM) and **Custom** (OpenAI-compatible endpoints). Remove 7 existing providers to simplify codebase and maintenance.

## Functional Requirements

### 1. Type System Updates
- Update `ProviderPreset` type in `types/config.ts` to only include: `'ollama' | 'custom'`
- Remove provider preset identifiers: `'openai'`, `'deepseek'`, `'groq'`, `'lmstudio'`, `'together'`, `'mistral'`, `'openrouter'`

### 2. Configuration Updates
- Reduce `PROVIDER_PRESETS` array in `types/config.ts` to 2 entries:
  - Ollama: `http://localhost:11434/v1`, no API key required
  - Custom: empty baseUrl/model, no API key required (user-configured)

### 3. Test Updates
- Update all test files that reference removed providers
- Update `types/__tests__/config.test.ts` to expect 2 presets instead of 9
- Update any provider-specific tests

### 4. UI Updates
- Update Options page provider dropdown to show only Ollama and Custom
- Remove any provider-specific UI elements (logos, descriptions, etc.)

## Non-Functional Requirements

- No breaking changes to existing user data (migration not required)
- Maintain backward compatibility with chrome.storage schema
- All tests must pass after refactor
- No lint errors

## Acceptance Criteria

- [ ] `ProviderPreset` type contains only `'ollama' | 'custom'`
- [ ] `PROVIDER_PRESETS` array has exactly 2 entries
- [ ] All tests pass (`pnpm test`)
- [ ] Lint passes (`pnpm lint`)
- [ ] Options page dropdown shows only Ollama and Custom
- [ ] No TypeScript errors

## Out of Scope

- Migration of existing user configurations from removed providers
- Documentation updates (can be done separately)
- Provider-specific features (connection testing, etc.) - these should still work generically
