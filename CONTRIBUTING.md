# Contributing to LinguaLens

Thank you for your interest in contributing! This guide covers the development setup, architecture overview, and contribution workflow.

## 🚀 Getting Started

### Prerequisites
- **Node.js** ≥ 18
- **pnpm** (recommended) or npm
- **Chrome** (for testing the extension)

### Setup

```bash
# Clone the repo
git clone https://github.com/NguyenSiTrung/AnyLLMTranslate.git
cd AnyLLMTranslate

# Install dependencies
pnpm install

# Start development server (with hot reload)
pnpm dev

# Load the extension:
# 1. Open chrome://extensions/
# 2. Enable Developer Mode
# 3. Load unpacked → select .output/chrome-mv3
```

## 🏗️ Architecture Overview

LinguaLens is a Chrome Manifest V3 extension built with WXT, React, and TypeScript.

### Extension Contexts

```
┌──────────────────────────────────────────────────┐
│                   Background                      │
│  (Service Worker — always-on message router)      │
│  • Translation orchestration                      │
│  • Cache management (IndexedDB)                   │
│  • Context menus & keyboard commands              │
└────────────────┬─────────────────────────────────┘
                 │ chrome.runtime.sendMessage
┌────────────────┴─────────────────────────────────┐
│              Content Script (ISOLATED)            │
│  • DOM walker (piece extraction)                  │
│  • Viewport observer (lazy loading)               │
│  • Translation display (theme injection)          │
│  • Text selection & hover translate               │
│  • Subtitle coordinator                           │
└────────────────┬─────────────────────────────────┘
                 │ postMessage bridge
┌────────────────┴─────────────────────────────────┐
│              Inject Script (MAIN world)           │
│  • Subtitle interception (YouTube/Udemy/Coursera) │
│  • TextTrack monitoring                           │
└──────────────────────────────────────────────────┘
```

### Key Directories

| Directory | Purpose |
|-----------|---------|
| `entrypoints/` | WXT entry points (background, content, popup, options) |
| `content/` | Content script modules (DOM, viewport, translation, subtitles) |
| `services/` | Background services (translation, cache, API client) |
| `stores/` | Zustand state management |
| `styles/` | CSS (themes, subtitles, tooltips) |
| `types/` | Shared TypeScript interfaces |
| `lib/` | Utilities (constants, config, performance) |

### Communication Flow

1. **Popup** → `chrome.runtime.sendMessage` → **Background** → response
2. **Content Script** → `chrome.runtime.sendMessage` → **Background** → translation → response
3. **MAIN world** → `window.postMessage` → **Content Script (ISOLATED)** → processes subtitle data

### Settings Architecture

Settings flow through Zustand stores synced to `chrome.storage.local`:

```
User changes setting in Popup/Options
  → Zustand store updates
    → chrome.storage.local.set()
      → chrome.storage.onChanged fires
        → All contexts receive update
```

## 🧪 Testing

### Running Tests

```bash
# Run all tests
pnpm test

# Watch mode
pnpm test:watch

# With coverage
pnpm test:coverage

# Run specific test file
pnpm test -- content/__tests__/textSelection.test.ts
```

### Testing Patterns

- **Environment:** Vitest with jsdom
- **Chrome API Mocks:** Custom mocks in `tests/mocks/chrome.ts`
- **Structure:** Tests colocated with source (`__tests__/`) or in `tests/unit/`
- **Pattern:** AAA (Arrange → Act → Assert)

### Writing Tests

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('module/feature', () => {
  beforeEach(() => {
    // Reset state between tests
    vi.clearAllMocks();
  });

  it('describes the expected behavior', () => {
    // Arrange
    const input = 'test';

    // Act
    const result = someFunction(input);

    // Assert
    expect(result).toBe('expected');
  });
});
```

## 📦 Building & Packaging

```bash
# Development build (with source maps)
pnpm dev

# Production build
pnpm build

# Create distributable ZIP for Chrome Web Store
pnpm zip
```

## 🔀 Contribution Workflow

### Branch Strategy

| Branch | Purpose |
|--------|---------|
| `main` | Stable release branch |
| `feat/<name>` | Feature development |
| `fix/<name>` | Bug fixes |

### Steps

1. **Fork** the repository
2. **Create a branch**: `git checkout -b feat/your-feature`
3. **Implement** with tests (maintain ≥80% coverage on modified files)
4. **Verify**:
   ```bash
   pnpm test        # All tests pass
   pnpm build       # Build succeeds
   pnpm lint        # No lint errors
   ```
5. **Commit** with conventional commits:
   ```
   feat(scope): add new feature
   fix(scope): fix specific bug
   perf(scope): performance improvement
   docs: update documentation
   ```
6. **Push** and create a **Pull Request**

### PR Requirements

- [ ] All tests pass
- [ ] Build succeeds (<500KB total)
- [ ] New features include unit tests
- [ ] Code follows existing patterns
- [ ] No console.log statements (use `console.warn` for expected warnings)

## 🎨 Adding Themes

Themes are defined in `styles/inject.css` using CSS attribute selectors:

```css
[data-lingua-theme="my-theme"] .lingua-lens-translation {
  /* Your theme styles */
  border-bottom: 2px solid #1a73e8;
  color: #1a73e8;
}
```

Register the theme in `types/config.ts`:
1. Add to `ThemeName` union type
2. Add to `AVAILABLE_THEMES` array
3. Add display metadata

## 📝 Code Style

- **TypeScript** — strict mode, no `any` types
- **Functional style** — prefer pure functions, minimize side effects
- **Self-documenting** — clear names over comments
- **JSDoc** — for exported functions and complex logic

---

Questions? Open an issue on GitHub!
