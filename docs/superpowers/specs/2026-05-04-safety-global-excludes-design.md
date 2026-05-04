# Global Safety Excludes

## Background
The "Global Exclude Selectors" feature allows excluding specific CSS selectors from translation across all websites. However, the initial default list (`['pre', 'code', '.code-block']`) is insufficient for modern web applications. Without further exclusions, the extension risks corrupting user data inside rich text editors (e.g., Notion, Gmail), breaking hydration states in React/Vue SPAs, and creating false positives due to obfuscated utility classes (e.g., Tailwind).

Following technical advisory, we need to enforce a broader, safer set of default global exclude selectors and ensure existing users receive these protections without losing their custom exclusions.

## Architecture & Components

### 1. `CRITICAL_GLOBAL_EXCLUDES` Constant
A new centralized constant will define the strict safety defaults. This prevents duplication between the settings migration script and the options UI.

```typescript
export const CRITICAL_GLOBAL_EXCLUDES = [
  'pre', 'code', '.code-block', // Existing code blocks
  '[contenteditable="true"]', 'textarea', 'input', // Editable user data regions
  '[translate="no"]', '.notranslate', // Standard localization opt-outs
  'script', 'style', 'kbd', // Structural/Semantic tags
  '.mathjax', '.katex' // Math formulas
];
```

### 2. Settings Migration (`lib/config.ts`)
To ensure safety for existing users, we will implement a "Force Merge" migration strategy in `loadSettings()`.
When loading settings, the system will read the user's stored `globalExcludeSelectors`, and perform a mathematical union with `CRITICAL_GLOBAL_EXCLUDES` using a `Set`. This guarantees all safety selectors are present while preserving any custom selectors the user manually added.

### 3. UI Updates (`SiteRulesSection.tsx`)
The `DEFAULT_GLOBAL_EXCLUDES` local constant in the Options UI will be replaced by the shared `CRITICAL_GLOBAL_EXCLUDES` array.
The "Reset to Defaults" button logic will use this centralized array to ensure UI consistency.

## Data Flow
1. **Extension Start**: `loadSettings()` is called.
2. **Merge**: `new Set([...stored.globalExcludeSelectors, ...CRITICAL_GLOBAL_EXCLUDES])` computes the safe array.
3. **Persist/Serve**: The merged array is provided to the `settingsStore` and injected into the content script extraction options.

## Error Handling
- The `Set` ensures no duplicate selectors are created during the force merge.
- The UI handles the empty/falsy state gracefully during component render.

## Testing Strategy
- Verify that fresh installations boot with the complete `CRITICAL_GLOBAL_EXCLUDES` list.
- Mock a legacy storage state `globalExcludeSelectors: ['.my-custom-ignore']` and assert that `loadSettings()` returns `['.my-custom-ignore', 'pre', 'code', ...]`.
- Verify the Options UI "Reset" button clears custom selectors and reverts strictly to the `CRITICAL_GLOBAL_EXCLUDES` list.
