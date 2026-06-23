# Track Learnings: openai-provider-catalog_20260623

## Codebase Patterns (Inherited)

- providerTester GET {baseUrl}/models — reuse for on-demand picker.
- Single preset custom; catalog IDs not new enum values.
- updateProvider + connectionStatus unknown on URL/model changes.
