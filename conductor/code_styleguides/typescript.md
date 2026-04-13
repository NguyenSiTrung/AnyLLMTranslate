# TypeScript Style Guide — AnyLLMTranslate

## General Rules

- **Strict mode**: `"strict": true` in tsconfig
- **No `any`**: Use `unknown` + type narrowing instead
- **Prefer `const`** over `let`; never use `var`
- **Explicit return types** on exported functions
- **No default exports** — use named exports only

## Naming Conventions

| Entity | Convention | Example |
|--------|-----------|---------|
| Variables / functions | camelCase | `translateBatch`, `cacheResult` |
| Types / Interfaces | PascalCase | `TranslationResult`, `ProviderConfig` |
| Constants | UPPER_SNAKE_CASE | `MAX_BATCH_SIZE`, `DEFAULT_TIMEOUT` |
| Files (modules) | camelCase | `domWalker.ts`, `translationEngine.ts` |
| Files (components) | PascalCase | `PopupApp.tsx`, `SettingsForm.tsx` |
| Enums | PascalCase (members too) | `TranslationStatus.Pending` |

## Type Patterns

```typescript
// ✅ Discriminated unions over string enums for state
type TranslationState =
  | { status: 'idle' }
  | { status: 'translating'; progress: number }
  | { status: 'done'; result: string }
  | { status: 'error'; error: Error };

// ✅ Extract reusable types
type MessageHandler<T = unknown> = (message: T, sender: chrome.runtime.MessageSender) => Promise<unknown>;

// ✅ Use branded types for IDs
type TabId = number & { __brand: 'TabId' };
```

## Error Handling

```typescript
// ✅ Custom error classes for each domain
class TranslationError extends Error {
  constructor(message: string, public readonly code: string) {
    super(message);
    this.name = 'TranslationError';
  }
}

// ✅ Result pattern for fallible operations
type Result<T, E = Error> = { ok: true; value: T } | { ok: false; error: E };
```

## Import Order

1. Node/browser built-ins
2. External packages
3. Internal aliases (`@/`)
4. Relative imports
5. Type-only imports (`import type`)

## Extension-Specific

- Message types defined in a shared `types/messages.ts`
- Each Chrome context (background, content, inject) has its own entry point
- Shared utilities go in `src/shared/`
- Never import background-only code from content scripts
