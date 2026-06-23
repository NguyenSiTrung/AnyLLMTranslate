# Plan: OpenAI-Compatible Provider Catalog & Model Picker

## Phase 1: Catalog & model listing API

- [x] Task 1.1: Add lib/openAiCompatibleCatalog.ts + filterCatalog helper
- [x] Task 1.2: Export listProviderModels from services/providerTester.ts
- [x] Task 1.3: Unit tests for catalog and model listing

## Phase 2: Shared UI

- [x] Task 2.1: ProviderCatalogPicker component (search + select)
- [x] Task 2.2: ModelPicker with Browse models + chips
- [x] Task 2.3: Wire ModelPicker to listProviderModels

## Phase 3: Integrate

- [x] Task 3.1: ProviderSection integration
- [x] Task 3.2: SetupWizard integration
- [x] Task 3.3: Tests for ProviderSection if feasible

## Phase 4: Verification

- [x] Task 4.1: pnpm test && pnpm lint
- [ ] Task 4.2: Manual smoke (OpenRouter, browse models, test connection)
- [x] Task 4.3: learnings.md + patterns elevation
