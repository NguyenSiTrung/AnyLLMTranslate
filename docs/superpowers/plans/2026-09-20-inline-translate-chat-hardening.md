# Inline Translate (Space×3) — Chat-Site Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop inline translate from damaging chat drafts, make reads/writes structure-correct where the platform allows it, and fail safely with a usable translation everywhere else.

**Architecture:** Keep the gesture + orchestration pipeline, but (a) read contentEditable content block-aware and placeholder-safe, (b) never mutate the draft before the LLM answers, (c) verify writes exactly and never stack write strategies over a partially-changed field, (d) refuse to write into framework-owned composers (ProseMirror/Lexical/Slate/Draft/Quill) where DOM-level writes are reverted or corrupt the model, offering the translation through a copy affordance instead, and (e) fix focus/cancel/undo-identity/prefix/shadow-DOM/timeout defects.

**Tech Stack:** TypeScript, WXT (MV3), Vitest + jsdom, Chrome for Testing (real-browser verification harness in `.amp/in/artifacts/inline-translate-probe/`).

**Spec:** This plan implements the findings in the analysis recorded at `.amp/in/artifacts/inline-translate-probe/RESULTS.md` (inline translate × chat sites, 2026-09-20).

## Global Constraints

- No new runtime dependencies.
- Named exports only; TypeScript strict (no `any` leaks).
- Tests: Vitest, AAA pattern, jsdom for DOM behaviour.
- Framework-owned editors must never be written to via DOM mutation or synthetic input dispatch (measured: ProseMirror reverts/ignores; Lexical duplicates text 4×).
- A failed write must leave the field exactly as the user typed it (no restore-write, no pre-write).
- Never dispatch both `beforeinput` and `input` for one insertion (Lexical double-insert).
- Keep existing public exports of `@/content/inlineTranslate` working; update tests when a contract changes.

## Evidence that drives the design (measured, Chrome 153 + real libraries)

| Probe | Result |
|---|---|
| PM read | `<p>Hello world</p><p>Second paragraph</p>` → `"Hello worldSecond paragraph"` |
| PM write (all 5 strategies) | `writeElementTextAsync` → `{success:false}`; draft untouched |
| PM sync write | false success (`execCommand+events`) with model desync; reverts on next keystroke |
| PM execCommand | returns `true`, DOM unchanged (observer active); works only with `domObserver.stop()` |
| PM synthetic paste / beforeinput / DOM insert | ignored, or reverted |
| Lexical `ce-event-only` | `beforeinput` prevented **and** `input` dispatched → text inserted **twice** |
| Lexical full pipeline | `{success:false}` after **4× duplicated** text in DOM + model |
| Placeholder-in-editable | empty composer reads `"Message #general"`, `isCaretAtEnd === true` |
| Whitespace-only write | `{success:true}` with the DOM unchanged (`trim()` fallback) |

---

### Task 1: Block-aware, placeholder-safe editable reads

**Files:**
- Modify: `content/inlineTranslate/editable.ts`
- Test: `content/__tests__/inlineTranslate.chatHardening.test.ts` (new)

**Interfaces:**
- Produces:
  - `readContentEditableText(root: Node): string` — DFS text with `\n` at block boundaries, `alt` for `img`, `\n` for `br`, skips placeholder/`aria-hidden` subtrees, trims outer blank lines.
  - `isPlaceholderNode(el: Element): boolean`
  - `getElementText(el: HTMLElement): string` — inputs/textarea unchanged (`value`); CE uses `readContentEditableText`.
  - `isCaretAtEnd(el: HTMLElement): boolean` — collapsed selection **and** no meaningful text after the caret.

- [ ] Step 1: Write failing tests

```ts
it('reads multi-paragraph drafts with newline separators', () => {
  const ce = composer('<p>Hello world</p><p>Second paragraph</p>');
  expect(getElementText(ce)).toBe('Hello world\nSecond paragraph');
});
it('reads <br> separated drafts with newlines', () => {
  expect(getElementText(composer('Hello<br>World'))).toBe('Hello\nWorld');
});
it('ignores placeholder text rendered inside the editable', () => {
  const ce = composer('<span contenteditable="false" data-slate-placeholder="true">Message #general</span><p><br></p>');
  expect(getElementText(ce)).toBe('');
});
it('keeps mention text and emoji alt text', () => {
  const ce = composer('<p>Hi <span data-slate-void="true">@alice</span> <img alt="🎉" src="x"></p>');
  expect(getElementText(ce)).toBe('Hi @alice 🎉');
});
it('treats a caret with only trailing trigger spaces after it as at-end', () => {
  const ce = composer('<p>Hello</p>');
  placeCaretAt(ce, 'Hello'.length);
  expect(isCaretAtEnd(ce)).toBe(true);
});
it('rejects a caret in the middle of a paragraph', () => {
  const ce = composer('<p>Hello world</p>');
  placeCaretAt(ce, 5);
  expect(isCaretAtEnd(ce)).toBe(false);
});
```

- [ ] Step 2: Run `npx vitest run content/__tests__/inlineTranslate.chatHardening.test.ts` → FAIL
- [ ] Step 3: Implement the reader + caret check in `editable.ts`
- [ ] Step 4: Re-run → PASS; run `npx vitest run content/__tests__/inlineTranslate.test.ts content/__tests__/inlineTranslate.parity.test.ts` → no regressions (update any test that asserted glued text)
- [ ] Step 5: Commit `fix(inline-translate): read contentEditable content block-aware and skip placeholders`

---

### Task 2: Exact verification + safe strategy chain + framework-editor refusal

**Files:**
- Modify: `content/inlineTranslate/writeback.ts`, `content/inlineTranslate/editable.ts`
- Test: `content/__tests__/inlineTranslate.chatHardening.test.ts`

**Interfaces:**
- Produces:
  - `isFrameworkOwnedEditor(el: HTMLElement): boolean` (markers: `.ProseMirror`, `[data-lexical-editor]`, `[data-lexical-text]`, `[data-slate-editor]`, `[data-slate-node]`, `[data-slate-void]`, `.ql-editor`, `[data-block="true"]`)
  - `WriteBackResult` gains `reason?: 'framework-editor' | 'partial-change' | 'verify-failed'`
  - `verifyWrite` exact: only `\r\n` → `\n` normalization (no `trim()`)
  - `ce-event-only` dispatch order: `beforeinput` → if **not** prevented → DOM insert + `input`; if prevented → stop, verify
  - `writeElementTextAsync`: returns `{success:false, reason:'framework-editor'}` **before any mutation** when `isFrameworkOwnedEditor(el)`
  - no `direct-assign` for contentEditable (inputs/textarea keep it)
  - chain stops with `reason:'partial-change'` when the field text changed but verification failed

- [ ] Step 1: Write failing tests

```ts
it('does not write into a framework-owned composer', async () => {
  const ce = composer('<p>Hello</p>'); ce.classList.add('ProseMirror');
  const res = await writeElementTextAsync(ce, 'Xin chào');
  expect(res).toEqual({ success: false, reason: 'framework-editor' });
  expect(ce.textContent).toBe('Hello');
});
it('does not dispatch input after a prevented beforeinput', () => {
  const ce = composer('<p>Hello</p>');
  ce.addEventListener('beforeinput', (e) => e.preventDefault());
  const inputs: string[] = []; ce.addEventListener('input', () => inputs.push('input'));
  writeElementText(ce, 'Xin chào');
  expect(inputs).toEqual([]);
});
it('does not accept a whitespace-only difference as success', () => {
  const ta = document.createElement('textarea'); ta.value = 'Hello world   ';
  expect(writeElementText(ta, 'Hello world').success).toBe(false); // nothing actually changed
});
it('stops the chain after a partial change instead of stacking strategies', () => {
  const ce = composer('<p>Hello</p>');
  ce.addEventListener('beforeinput', (e) => { e.preventDefault(); ce.firstChild!.textContent = 'PARTIAL'; });
  const res = writeElementText(ce, 'Xin chào');
  expect(res.success).toBe(false);
  expect(res.reason).toBe('partial-change');
  expect(ce.textContent).toBe('PARTIAL');
});
```

- [ ] Step 2: Run → FAIL
- [ ] Step 3: Implement
- [ ] Step 4: Run → PASS + `npx vitest run content/__tests__/inlineTranslate.parity.test.ts` (the Discord-style test stubs execCommand; update it to reflect the new chain)
- [ ] Step 5: Commit `fix(inline-translate): verify writes exactly and never mutate framework-owned composers`

---

### Task 3: No pre-write, markup-preserving undo, honest failure with copy affordance

**Files:**
- Modify: `content/inlineTranslate/orchestrate.ts`, `content/inlineTranslate/feedback.ts`, `content/inlineTranslate/index.ts`
- Test: `content/__tests__/inlineTranslate.chatHardening.test.ts`

**Interfaces:**
- Produces:
  - `undoMap: WeakMap<Element, { text: string; html: string | null }>` (was `string`)
  - `lastWrittenMap: WeakMap<Element, { text: string; at: number }>`
  - `showToast(el, message, type, options?: { copyText?: string; timeoutMs?: number })` — renders a “Copy” button when `copyText` is set; copy uses `navigator.clipboard.writeText` with a `document.execCommand('copy')` textarea fallback
  - `runInlineTranslate`: no pre-write; on failure leave the field untouched; on `framework-editor` failure show `⚠ Can't edit this composer — copy the translation` with `copyText`

- [ ] Step 1: Write failing tests

```ts
it('never rewrites the draft before the translation arrives', async () => {
  const ce = composer('<p>Hello   </p>');
  const pending = runInlineTranslate(cfg(), { element: ce, skipStripTrailing: false });
  await Promise.resolve();
  expect(ce.textContent).toBe('Hello   ');           // draft untouched while translating
  resolveResponse({ success: true, translatedText: 'Xin chào' });
  await pending;
  expect(ce.textContent).toBe('Xin chào');
});
it('leaves the draft exactly as typed when the write fails', async () => {
  const ce = composer('<p>Hello   </p>'); ce.classList.add('ProseMirror');
  resolveResponse({ success: true, translatedText: 'Xin chào' });
  await runInlineTranslate(cfg(), { element: ce, skipStripTrailing: false });
  expect(ce.textContent).toBe('Hello   ');
  expect(toastText()).toContain("Can't edit this composer");
  expect(toastCopyText()).toBe('Xin chào');
});
it('undo restores the original markup, not just the text', async () => {
  const ce = composer('<p>Hi <span class="mention">@alice</span></p>');
  resolveResponse({ success: true, translatedText: 'Chào @alice' });
  await runInlineTranslate(cfg(), { element: ce, skipStripTrailing: true });
  expect(tryFallbackUndo(ce)).toBe(true);
  expect(ce.querySelector('.mention')).not.toBeNull();
});
```

- [ ] Step 2: Run → FAIL
- [ ] Step 3: Implement
- [ ] Step 4: Run → PASS + existing inline tests
- [ ] Step 5: Commit `fix(inline-translate): stop pre-writing the draft and make failed writes non-destructive`

---

### Task 4: Draft-aware undo state

**Files:** `content/inlineTranslate/orchestrate.ts`, `content/inlineTranslate/index.ts`
**Interfaces:** `invalidateUndoOnEdit(host: HTMLElement): void`; undo requires `Date.now() - lastWrittenMap.get(el).at < UNDO_WINDOW_MS (5 min)`.

- [ ] Step 1: Test — after a translate, clearing the field (site send) then typing the same text and re-triggering must translate again, not restore the previous original.
- [ ] Step 2: Run → FAIL (reproduces the stale-undo data loss)
- [ ] Step 3: Implement (`input`-listener invalidation + TTL)
- [ ] Step 4: Run → PASS
- [ ] Step 5: Commit `fix(inline-translate): tie fallback undo to the draft, not the element`

---

### Task 5: Focus safety

**Files:** `content/inlineTranslate/editable.ts`, `writeback.ts`, `orchestrate.ts`, `index.ts`
**Interfaces:** `isFocusedWithin(el: HTMLElement): boolean`; `selectAll`/`collapseSelectionAtEnd` no longer call `focus()` when the element is not focused; orchestrator cancels with `focus-lost` when the deep active element leaves the field.

- [ ] Step 1: Tests — (a) write-back does not steal focus from another field; (b) response is dropped when focus moved away mid-flight.
- [ ] Step 2: Run → FAIL
- [ ] Step 3: Implement (incl. `focusin` listener in `index.ts`)
- [ ] Step 4: Run → PASS
- [ ] Step 5: Commit `fix(inline-translate): never steal focus and cancel when focus leaves the field`

---

### Task 6: Synthetic-event marking (cancel-on-type during write-back)

**Files:** `content/inlineTranslate/writeback.ts`, `orchestrate.ts`, `index.ts`
**Interfaces:** `isSyntheticInlineEvent(event: Event): boolean`; `onUserInputDuringTranslate(el, event?)`.

- [ ] Step 1: Test — real `input` during the write-back window cancels; our own dispatched events do not.
- [ ] Step 2: Run → FAIL
- [ ] Step 3: Implement (`WeakSet<Event>` + dispatch helper)
- [ ] Step 4: Run → PASS
- [ ] Step 5: Commit `fix(inline-translate): let real typing cancel during write-back`

---

### Task 7: Shadow-DOM gesture targets

**Files:** `content/inlineTranslate/index.ts`
**Interfaces:** `resolveEventTarget(event: Event): Element | null` using `composedPath()[0]`.

- [ ] Step 1: Test — keydown from a composer inside an open shadow root is accepted.
- [ ] Step 2: Run → FAIL
- [ ] Step 3: Implement
- [ ] Step 4: Run → PASS
- [ ] Step 5: Commit `fix(inline-translate): resolve gesture targets through shadow boundaries`

---

### Task 8: Language prefix must be a real language

**Files:** `lib/inlineTranslatePrefix.ts`
**Interfaces:** `parseLanguagePrefix` bare-code fallback validated against `LANGUAGES` (`lib/languages.ts`).

- [ ] Step 1: Tests — `/en hello` → en; `/zh-CN hello` → zh-CN; `/lol that is funny` → no prefix (body unchanged).
- [ ] Step 2: Run → FAIL
- [ ] Step 3: Implement
- [ ] Step 4: Run → PASS
- [ ] Step 5: Commit `fix(inline-translate): only strip language prefixes that name a supported language`

---

### Task 9: Request timeout (no stuck “Translating…”)

**Files:** `content/inlineTranslate/orchestrate.ts`
**Interfaces:** `INLINE_REQUEST_TIMEOUT_MS = 30_000`; `sendTranslateRequest(message, timeoutMs)`.

- [ ] Step 1: Test with fake timers — a never-settling `chrome.runtime.sendMessage` clears the state and shows the failure toast after 30s.
- [ ] Step 2: Run → FAIL
- [ ] Step 3: Implement
- [ ] Step 4: Run → PASS
- [ ] Step 5: Commit `fix(inline-translate): time out stalled translation requests`

---

### Task 10: Settings-ready gate

**Files:** `entrypoints/content.ts`
**Interfaces:** early `initInlineTranslate()` followed by `setInlineTranslateEnabled(false)` until `initInteractionFeatures()` applies stored settings.

- [ ] Step 1: Test — with the feature disabled, the gesture performs no request (existing coverage extended).
- [ ] Step 2: Run → FAIL
- [ ] Step 3: Implement
- [ ] Step 4: Run → PASS
- [ ] Step 5: Commit `fix(inline-translate): keep the gesture inert until settings load`

---

### Task 11: Real-browser verification + documentation

**Files:** `.amp/in/artifacts/inline-translate-probe/RESULTS.md` (update), `docs/` note if needed.

- [ ] Step 1: Rebuild the probe bundle and re-run the ProseMirror + Lexical + placeholder + focus + undo probes against the fixed modules; record results.
- [ ] Step 2: `pnpm test`, `pnpm compile`, `pnpm lint` (touched files) — all green.
- [ ] Step 3: Commit `test(inline-translate): real-browser verification for chat-composer hardening`.

## Self-review

- Coverage: read (T1), write safety (T2), draft integrity + fallback UX (T3), undo identity (T4), focus (T5), cancel (T6), shadow DOM (T7), prefix (T8), timeout (T9), settings race (T10), verification (T11). All analysis findings mapped except: `allFrames` for iframe chat widgets (deliberate: cross-frame page translation is out of scope and would change unrelated behaviour) and the default blocklist policy (product decision, unchanged).
- No placeholders: each task names exact files, interfaces, and test assertions.
- Type consistency: `undoMap` value type change is applied in T3 and used in T4; `WriteBackResult.reason` is defined in T2 and consumed in T3.