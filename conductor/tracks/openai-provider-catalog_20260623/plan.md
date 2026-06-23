# Plan: OpenAI-Compatible Provider Catalog & Model Picker

## Phase 1: Catalog & model listing API

- [ ] Task 1.1: Add lib/openAiCompatibleCatalog.ts + filterCatalog helper
- [ ] Task 1.2: Export listProviderModels from services/providerTester.ts
- [ ] Task 1.3: Unit tests for catalog and model listing

## Phase 2: Shared UI

- [ ] Task 2.1: ProviderCatalogPicker component (search + select)
- [ ] Task 2.2: ModelPicker with Browse models + chips
- [ ] Task 2.3: Wire ModelPicker to listProviderModels

## Phase 3: Integrate

- [ ] Task 3.1: ProviderSection integration
- [ ] Task 3.2: SetupWizard integration
- [ ] Task 3.3: Tests for ProviderSection if feasible

## Phase 4: Verification

- [ ] Task 4.1: pnpm test && pnpm lint
- [ ] Task 4.2: Manual smoke (OpenRouter, browse models, test connection)
- [ ] Task 4.3: learnings.md + patterns elevation
