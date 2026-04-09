# Testing Style Guide — LinguaLens

## Framework

- **Unit Tests**: Vitest
- **Component Tests**: Vitest + Testing Library
- **E2E Tests**: Playwright with Chrome extension loading

## File Naming

- Test files colocated: `domWalker.test.ts` next to `domWalker.ts`
- E2E tests in `e2e/` directory at project root

## AAA Pattern (Mandatory)

```typescript
describe('DOMWalker', () => {
  it('should detect translatable paragraphs', () => {
    // Arrange
    const html = '<article><p>Hello world</p><p>Second paragraph</p></article>';
    document.body.innerHTML = html;

    // Act
    const nodes = walkDOM(document.body);

    // Assert
    expect(nodes).toHaveLength(2);
    expect(nodes[0].textContent).toBe('Hello world');
  });
});
```

## Rules

- **One assertion concept per test** — multiple `expect` OK if testing same behavior
- **Descriptive test names**: `should [expected behavior] when [condition]`
- **No test interdependence** — each test stands alone
- **Mock at boundaries**: Mock `chrome.*` APIs, fetch calls, not internal functions
- **Coverage target**: ≥ 80% for core modules (DOM walker, translation engine, cache)

## Chrome API Mocking

```typescript
// ✅ Use vitest-chrome or manual mocks
import { chrome } from 'vitest-chrome';

beforeEach(() => {
  chrome.storage.local.get.mockResolvedValue({ apiKey: 'test-key' });
  chrome.runtime.sendMessage.mockResolvedValue({ translated: 'Hola' });
});
```

## What to Test

| Module | Test Type | Priority |
|--------|----------|----------|
| DOM Walker | Unit | P0 |
| Translation Engine | Unit | P0 |
| WebVTT Parser | Unit | P0 |
| Cache Manager | Unit | P0 |
| React Components | Component | P1 |
| Message Passing | Integration | P1 |
| Full Translation Flow | E2E | P1 |
