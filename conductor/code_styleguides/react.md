# React Style Guide — LinguaLens

## Component Structure

```typescript
// ✅ Named export, function declaration
export function TranslationPanel({ text, onTranslate }: TranslationPanelProps): React.ReactElement {
  // 1. Hooks (state, refs, effects)
  // 2. Derived state / computations
  // 3. Event handlers
  // 4. Render
}
```

## Rules

- **Functional components only** — no class components
- **Named exports only** — no `export default`
- **Props interface** colocated above component: `interface XxxProps {}`
- **Hooks** follow Rules of Hooks strictly
- **Custom hooks** prefixed with `use` and in `hooks/` directory
- **No inline styles** — use Tailwind classes or CSS modules

## State Management

- **Local UI state**: `useState` / `useReducer`
- **Shared extension state**: Zustand store synced with `chrome.storage.local`
- **Server state**: Not applicable (no server — direct LLM API calls)

## Patterns

```typescript
// ✅ Extract complex logic into hooks
function useTranslationState(tabId: number) {
  const [state, setState] = useState<TranslationState>({ status: 'idle' });
  // ...
  return { state, startTranslation, stopTranslation };
}

// ✅ Compound components for complex UI
<SettingsForm>
  <SettingsForm.Section title="Provider">
    <ProviderConfig />
  </SettingsForm.Section>
</SettingsForm>

// ✅ Error boundaries around extension UI
<ErrorBoundary fallback={<ErrorFallback />}>
  <PopupApp />
</ErrorBoundary>
```

## File Structure

```
components/
  PopupApp.tsx          # Top-level popup component
  OptionsApp.tsx        # Top-level options component
  ui/                   # Shared UI primitives (Button, Input, Select)
  features/             # Feature-specific components
hooks/
  useTranslation.ts
  useProviderConfig.ts
stores/
  settingsStore.ts      # Zustand store
  translationStore.ts
```

## Performance

- Memoize expensive renders with `React.memo` only when measured
- Use `useCallback` for handlers passed to memoized children
- Lazy load options page and side panel components
