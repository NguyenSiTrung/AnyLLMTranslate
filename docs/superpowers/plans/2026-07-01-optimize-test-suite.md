# Optimize Test Suite Performance & Size

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reduce test execution time and configure a fast-running unit test suite containing around 800–900 TCs (specifically 842 TCs) for local development while keeping full coverage on CI.

**Architecture:** 
1. Configure `package.json` to expose a new `test:fast` command targeting only `lib/` and `tests/unit/` tests.
2. Edit `vitest.config.ts` to default the test environment to `node` and use `environmentMatchGlobs` to surgically load `jsdom` for React components and DOM-bound modules.
3. Update `services/__tests__/background.test.ts` to run slow retry tests using fake timers, resolving the 2.1-second sleep bottleneck.

## Global Constraints
- Do not lose test coverage.
- Preserve existing tests; do not delete files.
- Ensure all tests continue to pass.

---

### Task 1: Expose `test:fast` Script

**Files:**
- Modify: [package.json](file:///home/trung/Documents/ML/Project/AnyLLMTranslate/package.json)

**Interfaces:**
- Produces: `"test:fast"` npm script

- [ ] **Step 1: Update `package.json`**
  Add the new script `"test:fast": "vitest run lib tests/unit"` to the `scripts` block in `package.json`.

  ```json
  "scripts": {
    ...
    "test": "vitest run",
    "test:fast": "vitest run lib tests/unit",
    "test:watch": "vitest",
    ...
  }
  ```

- [ ] **Step 2: Commit**
  ```bash
  git add package.json
  git commit -m "test: add test:fast command targeting unit/lib tests"
  ```

---

### Task 2: Configure Environment Match Globs

**Files:**
- Modify: [vitest.config.ts](file:///home/trung/Documents/ML/Project/AnyLLMTranslate/vitest.config.ts)

- [ ] **Step 1: Modify `vitest.config.ts`**
  Change `environment` to `'node'` and add `environmentMatchGlobs` to assign `jsdom` specifically to directories that rely on React components, chrome extension APIs, or DOM manipulation.

  ```typescript
  export default defineConfig({
    ...
    test: {
      globals: true,
      environment: 'node',
      environmentMatchGlobs: [
        ['entrypoints/**/__tests__/**/*.test.{ts,tsx}', 'jsdom'],
        ['entrypoints/**/*.test.{ts,tsx}', 'jsdom'],
        ['content/**/__tests__/**/*.test.{ts,tsx}', 'jsdom'],
        ['content/**/*.test.{ts,tsx}', 'jsdom'],
        ['tests/**/*.test.{ts,tsx}', 'jsdom'],
        ['inject/**/__tests__/**/*.test.{ts,tsx}', 'jsdom'],
        ['styles/**/__tests__/**/*.test.{ts,tsx}', 'jsdom'],
        ['lib/**/__tests__/domUtils.test.ts', 'jsdom'],
      ],
      setupFiles: ['./vitest.setup.ts'],
      include: ['**/__tests__/**/*.test.{ts,tsx}', '**/*.test.{ts,tsx}'],
      ...
    }
  });
  ```

- [ ] **Step 2: Run test suite to verify matching works**
  Run: `npm run test`
  Expected: All 1895 tests compile, match correct environments, and pass. Verify execution time is significantly reduced.

- [ ] **Step 3: Commit**
  ```bash
  git add vitest.config.ts
  git commit -m "test: configure environmentMatchGlobs to isolate jsdom to UI and content script tests"
  ```

---

### Task 3: Mock Timers in Background Retry Test

**Files:**
- Modify: [services/__tests__/background.test.ts](file:///home/trung/Documents/ML/Project/AnyLLMTranslate/services/__tests__/background.test.ts)

- [ ] **Step 1: Update background retry test to use Fake Timers**
  Modify the `emits SUBTITLE_CHUNK_FAILED to the tab when a background chunk fails all retries` test case (around line 715) to enable fake timers, trigger the execution, run all timers asynchronously, and restore real timers.

  Replace the test starting at line 715:
  ```typescript
  it('emits SUBTITLE_CHUNK_FAILED to the tab when a background chunk fails all retries', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false, status: 500, statusText: 'Server Error',
      json: () => Promise.resolve({}), text: () => Promise.resolve(''),
    }));

    const promise = handleMessage(
      {
        action: 'translateSubtitle',
        cues: [{ startTime: 0, endTime: 2, text: 'Hello' }],
        sourceLanguage: 'en',
        targetLanguage: 'vi',
      },
      { tab: { id: 1 } } as chrome.runtime.MessageSender,
    );

    // Advance all timers asynchronously to resolve retry backoffs
    await vi.runAllTimersAsync();

    const result = await promise;

    // First chunk fails all retries -> overall failure.
    expect(result).toMatchObject({ success: false });
    vi.useRealTimers();
  });
  ```

- [ ] **Step 2: Run background tests to verify execution time is fast**
  Run: `npx vitest run services/__tests__/background.test.ts`
  Expected: All background tests pass, and the retry test finishes in a few milliseconds instead of 2.1 seconds.

- [ ] **Step 3: Run the full test suite**
  Run: `npm run test`
  Expected: All 1895 tests pass successfully.

- [ ] **Step 4: Commit**
  ```bash
  git add services/__tests__/background.test.ts
  git commit -m "test: use fake timers in background retry tests to eliminate 2s sleep delay"
  ```

---
