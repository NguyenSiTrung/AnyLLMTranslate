# Tech Stack — AnyLLMTranslate

## Core Language

| Technology | Version | Rationale |
|-----------|---------|-----------|
| **TypeScript** | 5.x | Type safety across all extension contexts (background, content, inject, UI) |

## Build & Tooling

| Technology | Version | Rationale |
|-----------|---------|-----------|
| **WXT** | 0.20.20 | Modern Chrome Extension framework with Manifest V3 native support, multi-entry builds, hot reload |
| **@wxt-dev/module-react** | 1.x | WXT React integration module for React entrypoints |
| **Vite** | 6.x | Bundled with WXT — fast builds, HMR, ESBuild-powered |
| **pnpm** | 9.x | Fast, disk-efficient package manager |

## UI Layer

| Technology | Version | Rationale |
|-----------|---------|-----------|
| **React** | 19.x | Component-based UI for popup, options page, side panel |
| **Tailwind CSS** | 4.x | Utility-first styling for extension UI components |
| **Lucide React** | latest | Consistent, lightweight icon set |
| **Zustand** | 5.x | Lightweight reactive state management, synced with chrome.storage |

## Extension APIs

| API | Usage |
|-----|-------|
| **chrome.storage.local** | Settings persistence, provider config |
| **chrome.runtime** | Message passing between background ↔ content ↔ popup |
| **chrome.tabs** | Tab-level translation state management |
| **chrome.sidePanel** | Side panel reading view |
| **chrome.contextMenus** | Right-click translation actions |
| **chrome.commands** | Keyboard shortcuts |

## Data Layer

| Technology | Usage |
|-----------|-------|
| **IndexedDB** (via idb-keyval) | Translation result caching, glossary storage |
| **chrome.storage.local** | User settings, provider configuration |

## CSS Strategy

| Approach | Context |
|----------|---------|
| **CSS Custom Properties + inject.css** | Translation themes on host pages — avoids shadow DOM conflicts |
| **Tailwind CSS** | Extension-owned UI only (popup, options, side panel) |

## Testing

| Technology | Version | Usage |
|-----------|---------|-------|
| **Vitest** | 3.x | Unit tests for DOM walker, translation engine, parsers |
| **@vitest/coverage-v8** | 3.x | V8-based code coverage provider for Vitest |
| **jsdom** | 29.x | DOM environment for unit tests (Vitest environment) |
| **Playwright** | - | E2E testing with Chrome extension loading |
| **Testing Library** | latest | React component tests |

## Code Quality

| Technology | Version | Usage |
|-----------|---------|-------|
| **ESLint** | 10.x | Flat config with TypeScript rules |
| **Prettier** | 3.x | Code formatting |

## Developer Scripts

| Script | Command | Purpose |
|--------|---------|----------|
| `dev` | `wxt` | Start dev server with hot reload |
| `dev:firefox` | `wxt -b firefox` | Dev server for Firefox |
| `build` | `wxt build` | Production build for Chrome MV3 |
| `build:firefox` | `wxt build -b firefox` | Production build for Firefox |
| `zip` | `wxt zip` | Package for Chrome Web Store |
| `zip:firefox` | `wxt zip -b firefox` | Package for Firefox Add-ons |
| `compile` | `tsc --noEmit` | Type-check without emitting |
| `test` | `vitest run` | Run test suite once |
| `test:watch` | `vitest` | Run tests in watch mode |
| `test:coverage` | `vitest run --coverage` | Run tests with V8 coverage report |
| `lint` | `eslint .` | Check for lint errors |
| `lint:fix` | `eslint . --fix` | Auto-fix lint errors |
| `format` | `prettier --write '**/*.{ts,tsx,css,json,md}'` | Format all source files |

## CI/CD

| Technology | Usage |
|-----------|-------|
| **Chrome Web Store API** | Manual extension publishing via `pnpm zip` |

## Architecture Decisions

### Why WXT over CRXJS?
- WXT is actively maintained and purpose-built for MV3
- Built-in support for content scripts, background workers, and UI pages
- Better TypeScript integration and developer experience

### Why Zustand over Redux/Jotai?
- Minimal boilerplate for extension state management
- Easy synchronization with chrome.storage.local
- Tiny bundle size (~1KB)

### Why IndexedDB for cache?
- No storage limits (unlike chrome.storage.local 10MB cap)
- Structured data with indexed queries
- Async, non-blocking operations

### Why CSS Custom Properties for themes?
- Works seamlessly with host page styles
- No shadow DOM complexity
- Theme switching is instant (CSS variable update)
- 15+ themes achievable with variable swapping
