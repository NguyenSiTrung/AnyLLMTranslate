# PDF Auto-Detect & Auto-Open Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Automatically detect when a tab is rendering a PDF (including extensionless URLs like `https://arxiv.org/pdf/2606.20543`) and — when the user has enabled it — open the bundled PDF translator for that URL, reusing the existing `openPdfViewer` path.

**Architecture:** A content script detects `document.contentType === 'application/pdf'` and sends a `PDF_DETECTED` message to the background service worker. The background runs a chain of safeguards (infinite-loop guard, setting check, provider-readiness gate, per-site opt-out, dedupe via `chrome.storage.session`) and then calls a single shared `openPdfViewer(url, mode)` helper. Settings are added to `ExtensionSettings.pdfSettings` with a default of `off`. The popup's URL-only heuristic is replaced with a content-script query so the manual "Open current PDF" button also lights up for arxiv-style URLs.

**Tech Stack:** TypeScript, WXT (Chrome MV3), React 19, Vitest + @testing-library/react, zustand, lucide-react.

## Global Constraints

- **No new manifest permissions.** Detection uses `document.contentType` in the existing `<all_urls>` content script — no `webNavigation` or `webRequest`. (See `wxt.config.ts:13` — current permissions are `['storage', 'activeTab', 'contextMenus', 'sidePanel', 'alarms']`.)
- **Default OFF.** `pdfSettings.autoOpen` defaults to `'off'`. Auto-opening tabs is intrusive; users must opt in.
- **Infinite-loop guard is mandatory.** The PDF viewer page itself loads a PDF and would re-trigger detection. Skip when `location.href` starts with `chrome.runtime.getURL('')`.
- **Provider readiness gate is mandatory.** Never auto-open into a viewer that cannot translate (`getProviderReadiness(provider).canTranslate === false`). It would show an empty broken page.
- **Dedupe state lives in `chrome.storage.session`**, not in-memory — service workers are evicted and an in-memory `Map` would silently double-open after eviction.
- **One shared `openPdfViewer` path.** Popup, context menu, and auto-trigger must all funnel through the same helper so URL validation lives in one place.
- **Non-interactive shell flags.** Per `AGENTS.md`, use `cp -f`, `mv -f`, `rm -f` — never bare `cp`/`mv`/`rm`.
- **Test runner:** `pnpm test` (maps to `vitest run`). Lint: `pnpm lint`. Type-check: `pnpm compile`.

---

## File Structure

| File | Responsibility |
|---|---|
| `types/config.ts` (modify) | Add `PdfSettings` interface + `DEFAULT_PDF_SETTINGS` + extend `ExtensionSettings` and `DEFAULT_SETTINGS`. |
| `types/messages.ts` (modify) | Add `'PDF_DETECTED'` to `MessageAction` union + `PdfDetectedMessage` interface + extend `ExtensionMessage` union. |
| `services/pdfAutoOpen.ts` (create) | Pure decision function `shouldAutoOpenPdf({ url, settings, sessionKey, openedSessionKeys })` + `buildSessionKey(tabId, url)` helper. Tested in isolation, no chrome API. |
| `services/__tests__/pdfAutoOpen.test.ts` (create) | Unit tests for `shouldAutoOpenPdf` covering every safeguard branch. |
| `services/background.ts` (modify) | Extract `openPdfViewer(url, mode)` export from existing inline code; add `PDF_DETECTED` case to `handleMessage`. |
| `services/__tests__/background.pdfAutoOpen.test.ts` (create) | Integration test for `PDF_DETECTED` handler via `handleMessage`. |
| `content/pdfDetect.ts` (create) | Tiny module: `detectPdfAndNotify()` reads `document.contentType` and sends `PDF_DETECTED`. Exported for unit test; pure aside from the `sendMessage` call it receives via injection. |
| `content/__tests__/pdfDetect.test.ts` (create) | Unit tests for `detectPdfAndNotify` covering: PDF contentType → sends message; HTML contentType → no message; viewer-origin → no message (defensive). |
| `entrypoints/content.ts` (modify) | Call `detectPdfAndNotify()` at the end of `main()` after the existing auto-translate block. |
| `entrypoints/background.ts` (modify) | Replace inline `openPdfViewer` with import from `services/background.ts`; the context-menu case already delegates correctly. |
| `entrypoints/popup/App.tsx` (modify) | Replace URL-only `activeTabIsPdf` heuristic with a content-script `getPageContentType` query; add compact "Auto-open PDFs" toggle in Advanced area. |
| `entrypoints/options/sections/AdvancedSection.tsx` (modify) | Add a "PDF Translator" card with auto-open mode select, open-mode select, never-open list. |
| `entrypoints/content.ts` message listener | Add a `getPageContentType` action that returns `{ isPdf: boolean }` so the popup button works for arxiv-style URLs. |

---

## Task 1: Add `PdfSettings` to config types

**Files:**
- Modify: `types/config.ts` (insert interface after `InlineTranslateSettings` ~line 167; insert default after `DEFAULT_INLINE_TRANSLATE_SETTINGS` ~line 262; extend `ExtensionSettings` ~line 223; extend `DEFAULT_SETTINGS` ~line 352)

**Interfaces:**
- Produces: `PdfSettings` interface, `PdfAutoOpenMode` type, `PdfOpenMode` type, `DEFAULT_PDF_SETTINGS` constant — consumed by Task 5, 6, 8, 9.

- [ ] **Step 1: Write the failing type test**

Create `types/__tests__/config.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { DEFAULT_SETTINGS, DEFAULT_PDF_SETTINGS } from '../config';

describe('PdfSettings config', () => {
  it('exposes DEFAULT_PDF_SETTINGS with autoOpen off by default', () => {
    expect(DEFAULT_PDF_SETTINGS.autoOpen).toBe('off');
    expect(DEFAULT_PDF_SETTINGS.openMode).toBe('new-tab');
    expect(DEFAULT_PDF_SETTINGS.neverAutoOpenSites).toEqual([]);
  });

  it('embeds pdfSettings in DEFAULT_SETTINGS', () => {
    expect(DEFAULT_SETTINGS.pdfSettings).toBeDefined();
    expect(DEFAULT_SETTINGS.pdfSettings.autoOpen).toBe('off');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test types/__tests__/config.test.ts`
Expected: FAIL with "DEFAULT_PDF_SETTINGS is not exported" or "Cannot read property 'autoOpen' of undefined".

- [ ] **Step 3: Add the types and defaults**

In `types/config.ts`, insert after the `InlineTranslateSettings` interface (before line 169 `/** Extension settings stored in chrome.storage.local */`):

```typescript
/** PDF auto-open trigger modes */
export type PdfAutoOpenMode = 'off' | 'prompt' | 'auto';

/** How the PDF viewer opens relative to the source tab */
export type PdfOpenMode = 'new-tab' | 'same-tab';

/** PDF translator settings */
export interface PdfSettings {
  /** When to auto-open the bundled viewer after detecting a PDF tab.
   *  - 'off':    never auto-open (default; user must click popup/context menu)
   *  - 'prompt': show an in-page banner button; one click opens the viewer
   *  - 'auto':   open the viewer automatically
   */
  autoOpen: PdfAutoOpenMode;
  /** Whether to open in a new tab (keeps the native viewer) or replace the
   *  current tab (cleaner, but loses the native-viewer tab). */
  openMode: PdfOpenMode;
  /** Hostnames for which auto-open is suppressed even when autoOpen !== 'off'. */
  neverAutoOpenSites: string[];
}
```

Extend `ExtensionSettings` — add this field after `enableSmartExcludes: boolean;` (the last field, ~line 222):

```typescript
  /** PDF translator auto-open behavior */
  pdfSettings: PdfSettings;
```

Insert after `DEFAULT_INLINE_TRANSLATE_SETTINGS` (~line 262):

```typescript
/** Default PDF translator settings — auto-open is OFF by default. */
export const DEFAULT_PDF_SETTINGS: PdfSettings = {
  autoOpen: 'off',
  openMode: 'new-tab',
  neverAutoOpenSites: [],
};
```

Extend `DEFAULT_SETTINGS` — add after `enableSmartExcludes: true,` (~line 352):

```typescript
  pdfSettings: { ...DEFAULT_PDF_SETTINGS },
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test types/__tests__/config.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Type-check the whole project to catch downstream breakage**

Run: `pnpm compile`
Expected: No errors. (`deepMerge` in `lib/config.ts` handles the new nested object automatically.)

- [ ] **Step 6: Commit**

```bash
git add types/config.ts types/__tests__/config.test.ts
git commit -m "feat(pdf): add PdfSettings config (autoOpen defaults off)"
```

---

## Task 2: Add `PDF_DETECTED` message type

**Files:**
- Modify: `types/messages.ts` (extend `MessageAction` union at ~line 46; add interface after `OpenPdfViewerMessage` ~line 195; extend `ExtensionMessage` union ~line 220)

**Interfaces:**
- Produces: `PdfDetectedMessage` interface, `'PDF_DETECTED'` action — consumed by Task 4, 5, 6, 7.

- [ ] **Step 1: Write the failing type test**

Append to `types/__tests__/config.test.ts` (or create a sibling `types/__tests__/messages.test.ts`):

```typescript
import { describe, it, expect } from 'vitest';
import type { PdfDetectedMessage, ExtensionMessage } from '../messages';

describe('PdfDetectedMessage type', () => {
  it('shapes a PDF_DETECTED message', () => {
    const msg: PdfDetectedMessage = { action: 'PDF_DETECTED', url: 'https://arxiv.org/pdf/2606.20543', tabId: 42 };
    expect(msg.action).toBe('PDF_DETECTED');
    expect(msg.url).toContain('arxiv');
  });

  it('is assignable to ExtensionMessage', () => {
    const msg: ExtensionMessage = { action: 'PDF_DETECTED', url: 'https://x/y.pdf', tabId: 1 };
    expect((msg as PdfDetectedMessage).url).toBe('https://x/y.pdf');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test types/__tests__/messages.test.ts`
Expected: FAIL — `PdfDetectedMessage` not exported.

- [ ] **Step 3: Add the message type**

In `types/messages.ts`, extend the `MessageAction` union — add `| 'PDF_DETECTED'` after `| 'OPEN_PDF_VIEWER'` (line 46):

```typescript
  | 'OPEN_PDF_VIEWER'
  | 'PDF_DETECTED';
```

Add the interface after `OpenPdfViewerMessage` (after line 195):

```typescript
/** Notification from a content script that the active document is a PDF.
 *  Sent when `document.contentType === 'application/pdf'` on a non-viewer tab. */
export interface PdfDetectedMessage {
  action: 'PDF_DETECTED';
  /** The PDF document's URL (the native viewer's location.href). */
  url: string;
  /** Sending tab id (mirrors sender.tab.id; included for explicit routing). */
  tabId?: number;
}
```

Extend the `ExtensionMessage` union — add `| PdfDetectedMessage` after `| OpenPdfViewerMessage` if present, otherwise after `| ClassifyPdfParagraphsMessage` (~line 220):

```typescript
  | ClassifyPdfParagraphsMessage
  | PdfDetectedMessage;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test types/__tests__/messages.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add types/messages.ts types/__tests__/messages.test.ts
git commit -m "feat(pdf): add PDF_DETECTED message type"
```

---

## Task 3: Pure decision function `shouldAutoOpenPdf`

**Files:**
- Create: `services/pdfAutoOpen.ts`
- Create: `services/__tests__/pdfAutoOpen.test.ts`

**Interfaces:**
- Consumes: `ExtensionSettings`, `PdfSettings` from Task 1.
- Produces: `shouldAutoOpenPdf(input)` returning `{ open: boolean; reason: string }`, plus `buildSessionKey(tabId, url)` — consumed by Task 5.

The decision function is pure (no chrome API) so it can be exhaustively tested without mocking.

- [ ] **Step 1: Write the failing tests**

Create `services/__tests__/pdfAutoOpen.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { shouldAutoOpenPdf, buildSessionKey } from '../pdfAutoOpen';
import { DEFAULT_SETTINGS } from '@/types/config';

const baseSettings = { ...DEFAULT_SETTINGS, pdfSettings: { ...DEFAULT_SETTINGS.pdfSettings, autoOpen: 'auto' as const } };
const providerReady = { ...baseSettings, provider: { ...baseSettings.provider, baseUrl: 'http://x', model: 'm', connectionStatus: 'success' as const } };

describe('buildSessionKey', () => {
  it('joins tabId and url origin+pathname (strips hash/query churn)', () => {
    const k1 = buildSessionKey(7, 'https://arxiv.org/pdf/2606.20543');
    const k2 = buildSessionKey(7, 'https://arxiv.org/pdf/2606.20543#page=3');
    expect(k1).toBe(k2);
  });

  it('differs across tabs', () => {
    expect(buildSessionKey(1, 'https://x/y.pdf')).not.toBe(buildSessionKey(2, 'https://x/y.pdf'));
  });
});

describe('shouldAutoOpenPdf', () => {
  it('opens when auto=on, provider ready, url is not the viewer, not deduped, not blocked', () => {
    const r = shouldAutoOpenPdf({
      url: 'https://arxiv.org/pdf/2606.20543',
      viewerOrigin: 'chrome-extension://abc/',
      settings: providerReady,
      sessionKey: 'k1',
      openedSessionKeys: new Set(),
    });
    expect(r.open).toBe(true);
  });

  it('does NOT open when autoOpen is off', () => {
    const r = shouldAutoOpenPdf({
      url: 'https://x/y.pdf',
      viewerOrigin: 'chrome-extension://abc/',
      settings: { ...providerReady, pdfSettings: { ...providerReady.pdfSettings, autoOpen: 'off' } },
      sessionKey: 'k1',
      openedSessionKeys: new Set(),
    });
    expect(r.open).toBe(false);
    expect(r.reason).toMatch(/autoOpen/i);
  });

  it('does NOT open when url is the viewer itself (infinite-loop guard)', () => {
    const r = shouldAutoOpenPdf({
      url: 'chrome-extension://abc/pdf-viewer.html?file=https://x/y.pdf',
      viewerOrigin: 'chrome-extension://abc/',
      settings: providerReady,
      sessionKey: 'k1',
      openedSessionKeys: new Set(),
    });
    expect(r.open).toBe(false);
    expect(r.reason).toMatch(/viewer|loop/i);
  });

  it('does NOT open when provider cannot translate', () => {
    const r = shouldAutoOpenPdf({
      url: 'https://x/y.pdf',
      viewerOrigin: 'chrome-extension://abc/',
      settings: { ...baseSettings, provider: { ...baseSettings.provider, baseUrl: '', model: '' } },
      sessionKey: 'k1',
      openedSessionKeys: new Set(),
    });
    expect(r.open).toBe(false);
    expect(r.reason).toMatch(/provider/i);
  });

  it('does NOT open when hostname is in neverAutoOpenSites', () => {
    const r = shouldAutoOpenPdf({
      url: 'https://blocked.example.com/p.pdf',
      viewerOrigin: 'chrome-extension://abc/',
      settings: { ...providerReady, pdfSettings: { ...providerReady.pdfSettings, neverAutoOpenSites: ['blocked.example.com'] } },
      sessionKey: 'k1',
      openedSessionKeys: new Set(),
    });
    expect(r.open).toBe(false);
    expect(r.reason).toMatch(/never|blocked/i);
  });

  it('does NOT open when session key was already opened (dedupe)', () => {
    const r = shouldAutoOpenPdf({
      url: 'https://x/y.pdf',
      viewerOrigin: 'chrome-extension://abc/',
      settings: providerReady,
      sessionKey: 'dup',
      openedSessionKeys: new Set(['dup']),
    });
    expect(r.open).toBe(false);
    expect(r.reason).toMatch(/already|dedupe/i);
  });

  it('prompt mode returns open=false (banner handles it client-side)', () => {
    const r = shouldAutoOpenPdf({
      url: 'https://x/y.pdf',
      viewerOrigin: 'chrome-extension://abc/',
      settings: { ...providerReady, pdfSettings: { ...providerReady.pdfSettings, autoOpen: 'prompt' } },
      sessionKey: 'k1',
      openedSessionKeys: new Set(),
    });
    expect(r.open).toBe(false);
    expect(r.reason).toMatch(/prompt/i);
  });

  it('catches arxiv-style extensionless URLs (no .pdf suffix)', () => {
    const r = shouldAutoOpenPdf({
      url: 'https://arxiv.org/pdf/2606.20543',
      viewerOrigin: 'chrome-extension://abc/',
      settings: providerReady,
      sessionKey: 'arxiv',
      openedSessionKeys: new Set(),
    });
    expect(r.open).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test services/__tests__/pdfAutoOpen.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `services/pdfAutoOpen.ts`**

```typescript
/**
 * Pure decision logic for auto-opening the bundled PDF viewer.
 *
 * Extracted from the background service worker so every safeguard branch can
 * be unit-tested without chrome API mocking. The background handler owns all
 * I/O (reading settings, reading/writing the dedupe set in storage.session,
 * calling openPdfViewer); this function only decides.
 */

import type { ExtensionSettings } from '@/types/config';
import { getProviderReadiness } from '@/lib/providerReadiness';

export interface ShouldAutoOpenInput {
  /** The PDF document's URL (native viewer location.href). */
  url: string;
  /** `chrome.runtime.getURL('')` — the extension's own origin. */
  viewerOrigin: string;
  /** Loaded extension settings. */
  settings: ExtensionSettings;
  /** Dedupe key for this tab+url (see buildSessionKey). */
  sessionKey: string;
  /** Set of session keys already auto-opened this browser session. */
  openedSessionKeys: Set<string>;
}

export interface ShouldAutoOpenResult {
  open: boolean;
  /** Why the decision was made — used for debug logging only. */
  reason: string;
}

/** Build a dedupe key from tab id + url origin+pathname.
 *  Strips #hash and ?query so anchor navigation (#page=3) does not re-open. */
export function buildSessionKey(tabId: number, url: string): string {
  let path = url;
  try {
    const u = new URL(url);
    path = `${u.origin}${u.pathname}`;
  } catch {
    // fall through with raw url
  }
  return `${tabId}::${path}`;
}

export function shouldAutoOpenPdf(input: ShouldAutoOpenInput): ShouldAutoOpenResult {
  const { url, viewerOrigin, settings, sessionKey, openedSessionKeys } = input;
  const mode = settings.pdfSettings?.autoOpen ?? 'off';

  // 1. Infinite-loop guard: the PDF viewer page itself loads a PDF.
  if (viewerOrigin && url.startsWith(viewerOrigin)) {
    return { open: false, reason: 'viewer-origin (infinite-loop guard)' };
  }

  // 2. Setting gate.
  if (mode === 'off') {
    return { open: false, reason: 'autoOpen is off' };
  }
  // 'prompt' mode shows an in-page banner handled by the content script; the
  // background never auto-opens in prompt mode.
  if (mode === 'prompt') {
    return { open: false, reason: 'prompt mode — banner handled client-side' };
  }

  // 3. Provider readiness gate — never auto-open into a viewer that can't translate.
  if (!getProviderReadiness(settings.provider).canTranslate) {
    return { open: false, reason: 'provider not ready' };
  }

  // 4. Per-site opt-out.
  try {
    const hostname = new URL(url).hostname;
    if (settings.pdfSettings?.neverAutoOpenSites?.includes(hostname)) {
      return { open: false, reason: `hostname ${hostname} blocked` };
    }
  } catch {
    // Malformed URL — refuse to auto-open rather than guess.
    return { open: false, reason: 'malformed url' };
  }

  // 5. Dedupe — one auto-open per tab+document this browser session.
  if (openedSessionKeys.has(sessionKey)) {
    return { open: false, reason: 'already opened this session' };
  }

  return { open: true, reason: 'auto-open' };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test services/__tests__/pdfAutoOpen.test.ts`
Expected: PASS (all branches).

- [ ] **Step 5: Commit**

```bash
git add services/pdfAutoOpen.ts services/__tests__/pdfAutoOpen.test.ts
git commit -m "feat(pdf): pure shouldAutoOpenPdf decision function + tests"
```

---

## Task 4: Content-script PDF detection module

**Files:**
- Create: `content/pdfDetect.ts`
- Create: `content/__tests__/pdfDetect.test.ts`

**Interfaces:**
- Consumes: `'PDF_DETECTED'` action from Task 2.
- Produces: `detectPdfAndNotify(deps)` — consumed by Task 6 (content script `main()`).

- [ ] **Step 1: Write the failing tests**

Create `content/__tests__/pdfDetect.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest';
import { detectPdfAndNotify } from '../pdfDetect';

describe('detectPdfAndNotify', () => {
  it('sends PDF_DETECTED when contentType is application/pdf', () => {
    const send = vi.fn().mockResolvedValue(undefined);
    const getURL = vi.fn().mockReturnValue('chrome-extension://abc/');
    detectPdfAndNotify({
      contentType: 'application/pdf',
      href: 'https://arxiv.org/pdf/2606.20543',
      viewerOrigin: 'chrome-extension://abc/',
      tabId: 5,
      sendMessage: send,
    });
    expect(getURL).not.toHaveBeenCalled(); // not used in this path
    expect(send).toHaveBeenCalledWith({
      action: 'PDF_DETECTED',
      url: 'https://arxiv.org/pdf/2606.20543',
      tabId: 5,
    });
  });

  it('does nothing when contentType is text/html', () => {
    const send = vi.fn();
    detectPdfAndNotify({
      contentType: 'text/html',
      href: 'https://example.com/',
      viewerOrigin: 'chrome-extension://abc/',
      tabId: 5,
      sendMessage: send,
    });
    expect(send).not.toHaveBeenCalled();
  });

  it('does nothing inside the viewer page (defensive; background also guards)', () => {
    const send = vi.fn();
    detectPdfAndNotify({
      contentType: 'application/pdf',
      href: 'chrome-extension://abc/pdf-viewer.html?file=https://x/y.pdf',
      viewerOrigin: 'chrome-extension://abc/',
      tabId: 5,
      sendMessage: send,
    });
    expect(send).not.toHaveBeenCalled();
  });

  it('does nothing when contentType is undefined (older browsers)', () => {
    const send = vi.fn();
    detectPdfAndNotify({
      contentType: undefined,
      href: 'https://x/y.pdf',
      viewerOrigin: 'chrome-extension://abc/',
      tabId: 5,
      sendMessage: send,
    });
    expect(send).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test content/__tests__/pdfDetect.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `content/pdfDetect.ts`**

```typescript
/**
 * Detect that the active document is a PDF rendered by the browser's native
 * viewer, and notify the background so it can auto-open the bundled translator.
 *
 * Uses `document.contentType === 'application/pdf'` — the only signal that
 * catches extensionless URLs like https://arxiv.org/pdf/2606.20543 without
 * requiring webNavigation/webRequest permissions.
 *
 * Dependencies are injected so the module is pure and unit-testable.
 */

export interface DetectPdfDeps {
  /** `document.contentType` — 'application/pdf' for the native PDF viewer. */
  contentType: string | undefined;
  /** `location.href` of the document. */
  href: string;
  /** `chrome.runtime.getURL('')` — extension's own origin (loop guard). */
  viewerOrigin: string;
  /** Sending tab id. */
  tabId: number;
  /** chrome.runtime.sendMessage (injected). */
  sendMessage: (msg: unknown) => Promise<unknown>;
}

/** Returns true if the document is a PDF that the background should know about. */
export function detectPdfAndNotify(deps: DetectPdfDeps): void {
  const { contentType, href, viewerOrigin, tabId, sendMessage } = deps;
  if (contentType !== 'application/pdf') return;
  // Defensive double-guard: background also checks, but skipping the message
  // entirely avoids a round-trip and a debug-log entry on every viewer load.
  if (viewerOrigin && href.startsWith(viewerOrigin)) return;
  // Fire-and-forget; the background decides whether to actually open.
  sendMessage({ action: 'PDF_DETECTED', url: href, tabId }).catch(() => { /* SW asleep */ });
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test content/__tests__/pdfDetect.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add content/pdfDetect.ts content/__tests__/pdfDetect.test.ts
git commit -m "feat(pdf): content-script PDF detection module"
```

---

## Task 5: Extract shared `openPdfViewer` + add `PDF_DETECTED` handler in background

**Files:**
- Modify: `services/background.ts` (export a shared `openPdfViewer(url, mode)` near the existing `OPEN_PDF_VIEWER` case ~line 817; add a `PDF_DETECTED` case after it)
- Create: `services/__tests__/background.pdfAutoOpen.test.ts`

**Interfaces:**
- Consumes: `shouldAutoOpenPdf`, `buildSessionKey` from Task 3; `PdfDetectedMessage` from Task 2; `loadSettings` from `lib/config`.
- Produces: exported `openPdfViewer(url, mode)` — consumed by Task 7 (`entrypoints/background.ts` will import it instead of defining its own).

- [ ] **Step 1: Write the failing integration test**

Create `services/__tests__/background.pdfAutoOpen.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleMessage } from '../background';

// Shared mock chrome state
const mockStorage: Record<string, unknown> = {};
const sessionStorage: Record<string, unknown> = {};
const mockTabsCreate = vi.fn();
const mockTabsUpdate = vi.fn();

vi.stubGlobal('chrome', {
  storage: {
    local: {
      get: vi.fn(async (key: string) => ({ [key]: mockStorage[key] })),
      set: vi.fn(async (items: Record<string, unknown>) => { Object.assign(mockStorage, items); }),
    },
    session: {
      get: vi.fn(async (key: string) => ({ [key]: sessionStorage[key] })),
      set: vi.fn(async (items: Record<string, unknown>) => { Object.assign(sessionStorage, items); }),
    },
    onChanged: { addListener: vi.fn(), removeListener: vi.fn() },
  },
  runtime: {
    sendMessage: vi.fn().mockResolvedValue(undefined),
    getURL: vi.fn((path: string) => `chrome-extension://abc/${path}`),
  },
  tabs: {
    create: mockTabsCreate,
    update: mockTabsUpdate,
    onRemoved: { addListener: vi.fn() },
  },
  alarms: { create: vi.fn(), get: vi.fn(), clear: vi.fn(), onAlarm: { addListener: vi.fn(), removeListener: vi.fn() } },
});

function settingsWith(overrides: Record<string, unknown>) {
  mockStorage['anyllm-translate-settings'] = {
    provider: { preset: 'custom', baseUrl: 'http://x', apiKey: '', model: 'm', connectionStatus: 'success', requiresApiKey: false },
    pdfSettings: { autoOpen: 'auto', openMode: 'new-tab', neverAutoOpenSites: [] },
    ...overrides,
  };
}

describe('handleMessage — PDF_DETECTED', () => {
  beforeEach(() => {
    for (const k of Object.keys(mockStorage)) delete mockStorage[k];
    for (const k of Object.keys(sessionStorage)) delete sessionStorage[k];
    mockTabsCreate.mockClear();
    mockTabsUpdate.mockClear();
  });

  it('opens viewer in a new tab when auto=on and provider ready', async () => {
    settingsWith({});
    await handleMessage(
      { action: 'PDF_DETECTED', url: 'https://arxiv.org/pdf/2606.20543', tabId: 9 },
      { tab: { id: 9 } } as chrome.runtime.MessageSender,
    );
    expect(mockTabsCreate).toHaveBeenCalledTimes(1);
    const arg = mockTabsCreate.mock.calls[0][0];
    expect(arg.url).toContain('pdf-viewer.html');
    expect(arg.url).toContain(encodeURIComponent('https://arxiv.org/pdf/2606.20543'));
  });

  it('opens same-tab when openMode=same-tab', async () => {
    settingsWith({ pdfSettings: { autoOpen: 'auto', openMode: 'same-tab', neverAutoOpenSites: [] } });
    await handleMessage(
      { action: 'PDF_DETECTED', url: 'https://x/y.pdf', tabId: 9 },
      { tab: { id: 9 } } as chrome.runtime.MessageSender,
    );
    expect(mockTabsUpdate).toHaveBeenCalledWith(9, expect.objectContaining({ url: expect.stringContaining('pdf-viewer.html') }));
    expect(mockTabsCreate).not.toHaveBeenCalled();
  });

  it('does NOT open when autoOpen is off', async () => {
    settingsWith({ pdfSettings: { autoOpen: 'off', openMode: 'new-tab', neverAutoOpenSites: [] } });
    await handleMessage(
      { action: 'PDF_DETECTED', url: 'https://x/y.pdf', tabId: 9 },
      { tab: { id: 9 } } as chrome.runtime.MessageSender,
    );
    expect(mockTabsCreate).not.toHaveBeenCalled();
    expect(mockTabsUpdate).not.toHaveBeenCalled();
  });

  it('does NOT open the viewer for its own pages (loop guard)', async () => {
    settingsWith({});
    await handleMessage(
      { action: 'PDF_DETECTED', url: 'chrome-extension://abc/pdf-viewer.html?file=https://x/y.pdf', tabId: 9 },
      { tab: { id: 9 } } as chrome.runtime.MessageSender,
    );
    expect(mockTabsCreate).not.toHaveBeenCalled();
  });

  it('does NOT open twice for the same tab+url (dedupe via storage.session)', async () => {
    settingsWith({});
    const sender = { tab: { id: 9 } } as chrome.runtime.MessageSender;
    await handleMessage({ action: 'PDF_DETECTED', url: 'https://x/y.pdf', tabId: 9 }, sender);
    await handleMessage({ action: 'PDF_DETECTED', url: 'https://x/y.pdf', tabId: 9 }, sender);
    expect(mockTabsCreate).toHaveBeenCalledTimes(1);
  });

  it('respects neverAutoOpenSites', async () => {
    settingsWith({ pdfSettings: { autoOpen: 'auto', openMode: 'new-tab', neverAutoOpenSites: ['blocked.com'] } });
    await handleMessage(
      { action: 'PDF_DETECTED', url: 'https://blocked.com/p.pdf', tabId: 9 },
      { tab: { id: 9 } } as chrome.runtime.MessageSender,
    );
    expect(mockTabsCreate).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test services/__tests__/background.pdfAutoOpen.test.ts`
Expected: FAIL — `PDF_DETECTED` case returns undefined / `openPdfViewer` not exported.

- [ ] **Step 3: Extract and implement**

In `services/background.ts`, add imports near the top (with the other `@/types` imports):

```typescript
import type { PdfDetectedMessage } from '@/types/messages';
import { shouldAutoOpenPdf, buildSessionKey } from '@/services/pdfAutoOpen';
```

Add the shared helper above the `handleMessage` function (place it near the other module-level helpers, before `export function handleMessage`):

```typescript
/** Storage key for the set of (tabId::url) keys already auto-opened this session. */
const PDF_AUTOOPEN_SESSION_KEY = 'pdf-autoopen-opened';

/** Open the bundled PDF viewer for a URL. Shared by popup, context menu,
 *  and auto-trigger so URL validation lives in one place.
 *  Returns the viewer URL that was navigated to (for logging/tests). */
export function openPdfViewer(url: string, mode: 'new-tab' | 'same-tab' = 'new-tab', sourceTabId?: number): string {
  const viewerUrl = chrome.runtime.getURL(`pdf-viewer.html?file=${encodeURIComponent(url)}`);
  if (mode === 'same-tab' && sourceTabId !== undefined) {
    chrome.tabs.update(sourceTabId, { url: viewerUrl });
  } else {
    chrome.tabs.create({ url: viewerUrl });
  }
  return viewerUrl;
}

/** Read the set of already-auto-opened session keys from storage.session. */
async function readOpenedKeys(): Promise<Set<string>> {
  try {
    const result = await chrome.storage.session.get(PDF_AUTOOPEN_SESSION_KEY);
    const arr = (result[PDF_AUTOOPEN_SESSION_KEY] as string[] | undefined) ?? [];
    return new Set(arr);
  } catch {
    return new Set();
  }
}

/** Persist an updated set of opened keys. */
async function writeOpenedKeys(keys: Set<string>): Promise<void> {
  try {
    await chrome.storage.session.set({ [PDF_AUTOOPEN_SESSION_KEY]: Array.from(keys) });
  } catch {
    // storage.session unavailable (older browser) — best-effort, dedupe degrades to per-SW-instance.
  }
}

/** Handle a PDF_DETECTED message: decide + open + dedupe. */
async function handlePdfDetected(message: PdfDetectedMessage, sender: chrome.runtime.MessageSender): Promise<{ opened: boolean }> {
  const tabId = message.tabId ?? sender.tab?.id;
  if (tabId === undefined) return { opened: false };
  const settings = await loadSettings();
  const viewerOrigin = chrome.runtime.getURL('');
  const sessionKey = buildSessionKey(tabId, message.url);
  const openedKeys = await readOpenedKeys();
  const decision = shouldAutoOpenPdf({
    url: message.url,
    viewerOrigin,
    settings,
    sessionKey,
    openedSessionKeys: openedKeys,
  });
  if (!decision.open) return { opened: false };
  openedKeys.add(sessionKey);
  await writeOpenedKeys(openedKeys);
  openPdfViewer(message.url, settings.pdfSettings?.openMode ?? 'new-tab', tabId);
  return { opened: true };
}
```

Add the `PDF_DETECTED` case inside the `switch` in `handleMessage`, immediately after the `OPEN_PDF_VIEWER` case (after line ~831):

```typescript
    case 'PDF_DETECTED':
      return handlePdfDetected(message as PdfDetectedMessage, _sender).then(() => ({ success: true }));
```

Also refactor the existing `OPEN_PDF_VIEWER` case to call the shared `openPdfViewer`:

```typescript
    case 'OPEN_PDF_VIEWER': {
      // Validate the URL before forwarding to the viewer — file:// links and
      // HTTP(S) links both supported, everything else rejected.
      try {
        const parsed = new URL((message as { url: string }).url);
        if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:' && parsed.protocol !== 'file:') {
          return Promise.resolve({ success: false, error: 'Unsupported protocol' });
        }
      } catch {
        return Promise.resolve({ success: false, error: 'Invalid URL' });
      }
      openPdfViewer((message as { url: string }).url);
      return Promise.resolve({ success: true });
    }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test services/__tests__/background.pdfAutoOpen.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Run the full background test suite to ensure no regression**

Run: `pnpm test services/__tests__/`
Expected: PASS — no regressions in existing background tests.

- [ ] **Step 6: Commit**

```bash
git add services/background.ts services/__tests__/background.pdfAutoOpen.test.ts
git commit -m "feat(pdf): background PDF_DETECTED handler + shared openPdfViewer"
```

---

## Task 6: Wire detection into the content script

**Files:**
- Modify: `entrypoints/content.ts` (import + call in `main()`; add `getPageContentType` action in `setupMessageListener`)

**Interfaces:**
- Consumes: `detectPdfAndNotify` from Task 4.

- [ ] **Step 1: Write the failing test for the message-listener branch**

Append to `entrypoints/__tests__/content.test.ts` (or create `entrypoints/__tests__/content.pdfDetect.test.ts` if the existing file is hard to extend — match whatever pattern the existing file uses):

```typescript
import { describe, it, expect, vi } from 'vitest';
// Note: setupMessageListener is exported from the content script entrypoint.
import { setupMessageListener } from '../content';

describe('content script — getPageContentType action', () => {
  it('responds with isPdf=true when document.contentType is application/pdf', () => {
    const original = Object.getOwnPropertyDescriptor(document, 'contentType');
    Object.defineProperty(document, 'contentType', { configurable: true, value: 'application/pdf' });
    try {
      let captured: unknown;
      // setupMessageListener registers chrome.runtime.onMessage.addListener; the test
      // harness in vitest.setup.ts stubs chrome.runtime.onMessage with a no-op vi.fn,
      // so we capture the registered listener via the mock's last call.
      setupMessageListener();
      const addListener = (chrome.runtime.onMessage.addListener as unknown as ReturnType<typeof vi.fn>);
      const handler = addListener.mock.calls.at(-1)?.[0] as (msg: unknown, sender: unknown, sendResponse: (r: unknown) => void) => void;
      handler({ action: 'getPageContentType' }, {}, (r: unknown) => { captured = r; });
      expect(captured).toEqual({ isPdf: true });
    } finally {
      if (original) Object.defineProperty(document, 'contentType', original);
    }
  });
});
```

> **Note:** If the existing `entrypoints/__tests__/content.test.ts` already tests `setupMessageListener`, mirror its setup exactly. If `vitest.setup.ts` does not stub `chrome.runtime.onMessage.addListener`, add it to the setup file (see Step 3).

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test entrypoints/__tests__/content.pdfDetect.test.ts`
Expected: FAIL — `getPageContentType` branch not handled / not exported.

- [ ] **Step 3: Implement**

In `entrypoints/content.ts`, add the import with the other `@/content` imports near the top:

```typescript
import { detectPdfAndNotify } from '@/content/pdfDetect';
```

In `setupMessageListener`, add a new `else if` branch alongside the other actions (e.g. after the `getStatus` branch, before the closing `});`):

```typescript
    } else if (message.action === 'getPageContentType') {
      // Popup asks whether the active document is a PDF so its "Open current PDF"
      // button works for extensionless URLs (e.g. https://arxiv.org/pdf/2606.20543).
      sendResponse({ isPdf: document.contentType === 'application/pdf' });
      return false; // synchronous
```

In `main()`, after the existing auto-translate `if (!isExtensionPage) { ... }` block (just before the `window.addEventListener('beforeunload', ...)` line), add:

```typescript
    // PDF auto-detect: if the browser is rendering a PDF in its native viewer,
    // notify the background so it can auto-open the bundled translator.
    if (!isExtensionPage) {
      detectPdfAndNotify({
        contentType: document.contentType,
        href: location.href,
        viewerOrigin: chrome.runtime.getURL(''),
        tabId: 0, // background resolves the real tab id from sender.tab.id
        sendMessage: (msg) => chrome.runtime.sendMessage(msg),
      });
    }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test entrypoints/__tests__/content.pdfDetect.test.ts`
Expected: PASS.

Run the full content suite: `pnpm test entrypoints/__tests__/ content/__tests__/`
Expected: PASS — no regressions.

- [ ] **Step 5: Commit**

```bash
git add entrypoints/content.ts entrypoints/__tests__/content.pdfDetect.test.ts
git commit -m "feat(pdf): wire PDF detection + getPageContentType into content script"
```

---

## Task 7: Switch `entrypoints/background.ts` to the shared helper

**Files:**
- Modify: `entrypoints/background.ts` (remove the local `openPdfViewer` function ~lines 11-14; import from `services/background.ts`; the context-menu case already calls a local `openPdfViewer` — point it at the imported one)

**Interfaces:**
- Consumes: `openPdfViewer` exported in Task 5.

This is a refactor with no behavior change — the existing tests in `services/__tests__/background.test.ts` already cover `OPEN_PDF_VIEWER`.

- [ ] **Step 1: Read the current background entrypoint**

Confirm `entrypoints/background.ts:11-14` defines a local `openPdfViewer(url)` and that the context-menu handler at ~line 135 calls `openPdfViewer(pdfUrl)`.

- [ ] **Step 2: Edit the entrypoint**

Replace the local function definition:

```typescript
/** Open the bundled PDF viewer for a given PDF URL. */
function openPdfViewer(url: string): void {
  const viewerUrl = chrome.runtime.getURL(`pdf-viewer.html?file=${encodeURIComponent(url)}`);
  chrome.tabs.create({ url: viewerUrl });
}
```

with an import alongside the existing `@/services/background` import at the top of the file:

```typescript
import { handleMessage, initSettingsListener, scheduleEviction, initEvictionSchedule, initSubtitleSessionCleanup, openPdfViewer } from '@/services/background';
```

The existing call site `openPdfViewer(pdfUrl)` now resolves to the imported helper with default `'new-tab'` mode — behavior identical to the old local function.

- [ ] **Step 3: Type-check and run tests**

Run: `pnpm compile && pnpm test`
Expected: PASS — full suite green, no type errors.

- [ ] **Step 4: Commit**

```bash
git add entrypoints/background.ts
git commit -m "refactor(pdf): entrypoint uses shared openPdfViewer from services"
```

---

## Task 8: Popup — query content script for PDF + add auto-open toggle

**Files:**
- Modify: `entrypoints/popup/App.tsx` (replace URL heuristic ~line 826; add toggle in Advanced area ~line 1198)

**Interfaces:**
- Consumes: `getPageContentType` action added in Task 6; `pdfSettings.autoOpen` from Task 1.

- [ ] **Step 1: Write the failing popup test**

Append to `entrypoints/popup/__tests__/App.test.tsx` (mirror the existing chrome mock setup in that file):

```typescript
import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import App from '../App';

describe('Popup — PDF detection + auto-open toggle', () => {
  it('lights up "Open current PDF" when content script reports isPdf=true (arxiv URL)', async () => {
    // Tab URL is extensionless (no .pdf) — only the content-script query should mark it a PDF.
    (chrome.tabs.query as unknown as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: 1, url: 'https://arxiv.org/pdf/2606.20543' },
    ]);
    (chrome.tabs.sendMessage as unknown as ReturnType<typeof vi.fn>).mockImplementation(async (tabId: number, msg: { action: string }) => {
      if (msg.action === 'getPageContentType') return { isPdf: true };
      if (msg.action === 'getStatus') return { status: 'idle', translatedCount: 0, totalCount: 0 };
      if (msg.action === 'getPageCategory') return null;
      return undefined;
    });

    render(<App />);
    await waitFor(() => {
      expect(screen.getByText('Open current PDF')).toBeInTheDocument();
    });
  });

  it('does not show "Open current PDF" for an HTML tab', async () => {
    (chrome.tabs.query as unknown as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: 1, url: 'https://example.com/' },
    ]);
    (chrome.tabs.sendMessage as unknown as ReturnType<typeof vi.fn>).mockImplementation(async (_t: number, msg: { action: string }) => {
      if (msg.action === 'getPageContentType') return { isPdf: false };
      if (msg.action === 'getStatus') return { status: 'idle', translatedCount: 0, totalCount: 0 };
      return undefined;
    });
    render(<App />);
    await waitFor(() => {
      expect(screen.queryByText('Open current PDF')).not.toBeInTheDocument();
    });
  });
});
```

> **Note:** If the existing `App.test.tsx` already mocks `chrome.tabs.query`/`sendMessage` globally in a `beforeEach`, reuse that setup. Adjust the test to fit.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test entrypoints/popup/__tests__/App.test.tsx`
Expected: FAIL — "Open current PDF" not found for the arxiv URL (because the current heuristic checks for `.pdf` suffix).

- [ ] **Step 3: Implement the popup changes**

In `entrypoints/popup/App.tsx`, add state for the content-script PDF query result near the other `useState` calls (~line 540):

```typescript
  const [activeTabIsPdf, setActiveTabIsPdf] = useState(false);
```

(Replace the derived `const activeTabIsPdf = Boolean(...)` at line 826 — delete that line.)

In the initial `useEffect` (the one that queries the active tab, ~lines 546-559), add after `setActiveTabUrl`:

```typescript
        // Ask the content script whether the document is actually a PDF —
        // catches extensionless URLs (arxiv.org/pdf/2606.20543) the URL
        // heuristic misses. Falls back to URL check if the content script
        // is unavailable (e.g. before it injects on a fresh tab).
        try {
          if (tab?.id) {
            const ct = await chrome.tabs.sendMessage(tab.id, { action: 'getPageContentType' });
            if (ct?.isPdf === true) {
              setActiveTabIsPdf(true);
            } else {
              // Fallback heuristic for tabs where the content script has not loaded yet.
              setActiveTabIsPdf(/\.pdf(?:\?|#|$)/i.test(tab.url ?? ''));
            }
          }
        } catch {
          setActiveTabIsPdf(/\.pdf(?:\?|#|$)/i.test(tab.url ?? ''));
        }
```

Add an auto-open toggle inside the Advanced collapsible section (after the existing Context-Aware toggle block, ~line 1216). Use the existing inline `Toggle` component (the popup-local one defined in this file):

```tsx
                <Toggle
                  checked={settings.pdfSettings?.autoOpen === 'auto'}
                  onChange={() => {
                    const next = settings.pdfSettings?.autoOpen === 'auto' ? 'off' : 'auto';
                    updateSetting({ pdfSettings: { ...(settings.pdfSettings ?? { autoOpen: 'off', openMode: 'new-tab', neverAutoOpenSites: [] }), autoOpen: next } });
                  }}
                  label="Auto-open PDF Translator"
                  icon={FileText}
                />
                {settings.pdfSettings?.autoOpen === 'auto' && (
                  <p className="pl-5 text-[10px] text-zinc-500">
                    PDFs open in the translator automatically. Toggle off to keep manual control.
                  </p>
                )}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test entrypoints/popup/__tests__/App.test.tsx`
Expected: PASS — the arxiv URL now lights up the button via the content-script query.

- [ ] **Step 5: Commit**

```bash
git add entrypoints/popup/App.tsx entrypoints/popup/__tests__/App.test.tsx
git commit -m "feat(pdf): popup queries content script for PDF + auto-open toggle"
```

---

## Task 9: Options page — full PDF settings card

**Files:**
- Modify: `entrypoints/options/sections/AdvancedSection.tsx` (add a "PDF Translator" card)

**Interfaces:**
- Consumes: `PdfSettings`, `PdfAutoOpenMode`, `PdfOpenMode`, `DEFAULT_PDF_SETTINGS` from Task 1.

- [ ] **Step 1: Write the failing options test**

Append to `entrypoints/options/__tests__/AdvancedSection.test.tsx` (mirror its existing chrome/store mock setup):

```typescript
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { AdvancedSection } from '../AdvancedSection';

describe('AdvancedSection — PDF Translator card', () => {
  it('renders the PDF auto-open mode select defaulting to off', () => {
    render(<AdvancedSection />);
    expect(screen.getByText(/PDF Translator/i)).toBeInTheDocument();
    // The Select shows the default 'off' label
    expect(screen.getByText('Off (manual only)')).toBeInTheDocument();
  });

  it('shows never-open list input after choosing auto or prompt', () => {
    render(<AdvancedSection />);
    fireEvent.change(screen.getByLabelText('Auto-open mode'), { target: { value: 'auto' } });
    expect(screen.getByPlaceholderText(/example.com, arxiv.org/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test entrypoints/options/__tests__/AdvancedSection.test.tsx`
Expected: FAIL — no "PDF Translator" card.

- [ ] **Step 3: Add the card**

In `entrypoints/options/sections/AdvancedSection.tsx`, add `FileText` to the lucide-react import (line 6):

```typescript
import { Download, Upload, Trash2, HardDrive, Wrench, Database, BrainCircuit, FileText } from 'lucide-react';
```

Insert a new card after the "Context & Intelligence" card block (after line 274, before the "Data & Developer Tools" card):

```tsx
        {/* PDF Translator */}
        <div className="animate-stagger" style={stagger(2)}>
          <Card title="PDF Translator" icon={<FileText className="w-3.5 h-3.5" />} variant="bordered">
            <div className="space-y-4">
              <FieldGroup
                label="Auto-open mode"
                description="Detect PDF tabs (including extensionless URLs like arxiv.org/pdf/2606.20543) and open the translator automatically. Default is off."
                htmlFor="pdf-auto-open-select"
              >
                <Select
                  id="pdf-auto-open-select"
                  value={settings.pdfSettings?.autoOpen ?? 'off'}
                  onChange={(e) => updateSettings({
                    pdfSettings: {
                      ...(settings.pdfSettings ?? { autoOpen: 'off', openMode: 'new-tab', neverAutoOpenSites: [] }),
                      autoOpen: e.target.value as 'off' | 'prompt' | 'auto',
                    },
                  })}
                  options={[
                    { value: 'off', label: 'Off (manual only)' },
                    { value: 'prompt', label: 'Prompt (show banner button)' },
                    { value: 'auto', label: 'Auto (open immediately)' },
                  ]}
                />
              </FieldGroup>

              <FieldGroup
                label="Open mode"
                description="New tab keeps the native viewer; same tab replaces it in place."
                htmlFor="pdf-open-mode-select"
              >
                <Select
                  id="pdf-open-mode-select"
                  value={settings.pdfSettings?.openMode ?? 'new-tab'}
                  onChange={(e) => updateSettings({
                    pdfSettings: {
                      ...(settings.pdfSettings ?? { autoOpen: 'off', openMode: 'new-tab', neverAutoOpenSites: [] }),
                      openMode: e.target.value as 'new-tab' | 'same-tab',
                    },
                  })}
                  options={[
                    { value: 'new-tab', label: 'New tab' },
                    { value: 'same-tab', label: 'Same tab (replace)' },
                  ]}
                />
              </FieldGroup>

              {settings.pdfSettings?.autoOpen && settings.pdfSettings.autoOpen !== 'off' && (
                <FieldGroup
                  label="Never auto-open these sites"
                  description="Comma-separated hostnames. Auto-open is suppressed for these even when enabled above."
                  htmlFor="pdf-never-open-input"
                >
                  <Input
                    id="pdf-never-open-input"
                    type="text"
                    placeholder="example.com, arxiv.org"
                    value={(settings.pdfSettings?.neverAutoOpenSites ?? []).join(', ')}
                    onChange={(e) => updateSettings({
                      pdfSettings: {
                        ...(settings.pdfSettings ?? { autoOpen: 'off', openMode: 'new-tab', neverAutoOpenSites: [] }),
                        neverAutoOpenSites: e.target.value.split(',').map((s) => s.trim()).filter(Boolean),
                      },
                    })}
                  />
                </FieldGroup>
              )}
            </div>
          </Card>
        </div>
```

Bump the subsequent `stagger()` indices (the "Data & Developer Tools" card moves from `stagger(2)` to `stagger(3)`, and the Reset block from `stagger(3)` to `stagger(4)`).

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test entrypoints/options/__tests__/AdvancedSection.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add entrypoints/options/sections/AdvancedSection.tsx entrypoints/options/__tests__/AdvancedSection.test.tsx
git commit -m "feat(pdf): options page PDF Translator settings card"
```

---

## Task 10: End-to-end manual verification + docs

**Files:**
- Modify: `README.md` (add a short "PDF auto-open" subsection under the existing PDF section — find it via grep for "PDF")

This task has no failing-test step because it is manual verification against a real Chrome instance.

- [ ] **Step 1: Build the extension**

Run: `pnpm build`
Expected: Build succeeds, no type errors, `.output/chrome-mv3/` refreshed.

- [ ] **Step 2: Reload the extension in Chrome**

`chrome://extensions` → reload AnyLLMTranslate.

- [ ] **Step 3: Verify default-OFF behavior**

1. Open `https://arxiv.org/pdf/2606.20543` in a new tab.
2. Confirm: the bundled viewer does NOT auto-open (default is off).
3. Open the popup → confirm the "Open current PDF" button IS lit up (proves the content-script query works for extensionless URLs — the original bug).

- [ ] **Step 4: Verify auto-open**

1. Options → Advanced → PDF Translator → Auto-open mode = "Auto".
2. Open `https://arxiv.org/pdf/2606.20543` in a new tab.
3. Confirm: the bundled translator opens automatically in a new tab.
4. Refresh the arxiv tab → confirm it does NOT open a second time (dedupe via storage.session).

- [ ] **Step 5: Verify same-tab mode + never-open list**

1. Set Open mode = "Same tab". Open a fresh arxiv PDF tab → confirm the current tab is replaced (not a new tab).
2. Add `arxiv.org` to "Never auto-open these sites". Open a fresh arxiv PDF → confirm nothing auto-opens.

- [ ] **Step 6: Verify infinite-loop guard**

1. With auto-open ON, manually open the bundled viewer for any PDF (via popup or context menu).
2. Confirm: the viewer does NOT open another viewer tab for itself.

- [ ] **Step 7: Verify provider-readiness gate**

1. Clear the provider base URL (Options → Provider). Set auto-open = Auto.
2. Open a PDF → confirm nothing auto-opens (provider not ready).

- [ ] **Step 8: Update README**

Find the existing PDF section in `README.md` (grep for `## PDF` or `pdf-viewer`). Add a subsection:

```markdown
### Auto-opening the PDF translator

By default, PDF translation is manual — click the extension popup's **Open current PDF** button, or right-click → **Open in PDF Translator**.

Enable **Options → Advanced → PDF Translator → Auto-open mode** to detect PDF tabs automatically. This also catches extensionless PDF URLs (e.g. `https://arxiv.org/pdf/2606.20543`) that the manual URL heuristic misses.

- **Off** — manual only (default).
- **Prompt** — *(planned)* shows an in-page banner button.
- **Auto** — opens the translator immediately when a PDF tab loads.

You can block specific sites via **Never auto-open these sites**, and choose whether the translator opens in a new tab or replaces the current tab.
```

- [ ] **Step 9: Run full quality gates**

Run: `pnpm compile && pnpm lint && pnpm test`
Expected: All green.

- [ ] **Step 10: Commit**

```bash
git add README.md
git commit -m "docs(pdf): document PDF auto-open feature"
```

---

## Out of Scope (future work)

- **Prompt mode in-page banner UI** — the setting is plumbed through (`'prompt'` returns `open:false` from `shouldAutoOpenPdf`), but the actual banner overlay inside the native PDF viewer is deferred. The native viewer is an `<embed type="application/pdf">` injected by Chrome; content scripts can overlay DOM on top of it but the UX needs design work. Track as a follow-up issue.
- **Embedded PDFs** (`<embed>`/`<iframe type="application/pdf">` inside an HTML page) — `document.contentType` on the host page is `text/html`, so these are not detected by Task 4's approach. Future work would walk the DOM for embedded PDF objects.
- **`file://` PDFs without "Allow access to file URLs"** — content scripts do not run on `file://` unless the user enables that toggle in `chrome://extensions`. Documented limitation; no code fix possible without that toggle.
- **Per-tab undo toast** ("PDF auto-opened — Disable for this site") — the `autoTranslateNotification.ts` pattern is reusable, but since auto-open navigates away from the source tab, the toast would need to render inside the newly-opened viewer. Deferred.
