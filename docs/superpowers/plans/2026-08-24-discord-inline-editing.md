# Discord Inline Translation Editing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep translated Discord-style contenteditable composers fully editable after inline translation while preserving controlled input behavior.

**Architecture:** Treat a successful native contenteditable write as one browser editing transaction. Native `execCommand` events are authoritative; synthetic events are limited to manual fallback paths. Every write path verifies plain text and leaves the composer focused with a collapsed caret at the end.

**Tech Stack:** TypeScript, DOM Selection/Range APIs, Vitest, jsdom, WXT content script.

---

## File map

- Modify `content/inlineTranslate/writeback.ts`: centralize post-write caret restoration and stop duplicate framework notifications after successful native contenteditable edits.
- Modify `content/__tests__/inlineTranslate.parity.test.ts`: add a Discord/Slate-like native contenteditable regression fixture and preserve existing controlled-input assertions.
- Create `docs/superpowers/specs/2026-08-24-discord-inline-editing-design.md`: approved design record (already written; no source behavior).

No Discord-specific adapter, selector, or production dependency is required.

### Task 1: Add a failing native contenteditable regression test

**Files:**
- Modify: `content/__tests__/inlineTranslate.parity.test.ts` near the existing `contentEditable chat composers` test.

- [ ] **Step 1: Add a browser-edit simulation that counts native input notifications**

Add a test immediately after the existing contenteditable write-back test. The test must define `document.execCommand` only for its duration, replace the selected composer contents, collapse the selection at the end, and dispatch the one `input` event that a successful browser command represents:

```ts
it('uses one native edit notification and keeps a Discord-style composer editable', () => {
  const composer = document.createElement('div');
  composer.contentEditable = 'true';
  composer.setAttribute('role', 'textbox');
  composer.setAttribute('data-slate-editor', 'true');
  const block = document.createElement('div');
  block.textContent = 'original chat message';
  composer.appendChild(block);
  document.body.appendChild(composer);

  let inputCount = 0;
  composer.addEventListener('input', () => {
    inputCount += 1;
  });

  const previousExecCommand = (document as Document & {
    execCommand?: (command: string, showUi?: boolean, value?: string) => boolean;
  }).execCommand;
  Object.defineProperty(document, 'execCommand', {
    configurable: true,
    value: (command: string, _showUi?: boolean, value?: string) => {
      if (command !== 'insertText' || value == null) return false;
      const selection = document.getSelection();
      if (!selection || selection.rangeCount === 0) return false;
      const range = selection.getRangeAt(0);
      range.deleteContents();
      const textNode = document.createTextNode(value);
      range.insertNode(textNode);
      range.selectNodeContents(textNode);
      range.collapse(false);
      selection.removeAllRanges();
      selection.addRange(range);
      composer.dispatchEvent(
        new InputEvent('input', {
          bubbles: true,
          inputType: 'insertText',
          data: value,
        }),
      );
      return true;
    },
  });

  try {
    const result = writeElementText(composer, 'translated chat message');

    expect(result.success).toBe(true);
    expect(composer.textContent).toBe('translated chat message');
    expect(document.activeElement).toBe(composer);
    const selection = document.getSelection();
    expect(selection?.rangeCount).toBe(1);
    expect(selection?.isCollapsed).toBe(true);
    expect(inputCount).toBe(1);

    // Model a subsequent Backspace at the caret. A usable post-write
    // selection must allow the normal browser edit to remove one character.
    const range = selection!.getRangeAt(0);
    const textNode = composer.firstChild;
    expect(textNode?.nodeType).toBe(Node.TEXT_NODE);
    range.setStart(textNode!, textNode!.textContent!.length - 1);
    range.setEnd(textNode!, textNode!.textContent!.length);
    range.deleteContents();
    expect(composer.textContent).toBe('translated chat messag');
  } finally {
    if (previousExecCommand) {
      Object.defineProperty(document, 'execCommand', {
        configurable: true,
        value: previousExecCommand,
      });
    } else {
      delete (document as Document & { execCommand?: unknown }).execCommand;
    }
  }
});
```

The native simulation dispatches one input event. The current implementation dispatches an additional synthetic input after `execCommand`, so `inputCount` must fail before the production change.

- [ ] **Step 2: Run only the new test and confirm it fails for duplicate notifications**

Run:

```bash
pnpm vitest run content/__tests__/inlineTranslate.parity.test.ts -t "uses one native edit notification"
```

Expected before implementation: FAIL because `inputCount` is `2`, while the expected browser transaction count is `1`. Do not change production code in this step.

### Task 2: Implement single-transaction contenteditable writeback

**Files:**
- Modify: `content/inlineTranslate/writeback.ts` in the event helpers and native/fallback strategies.

- [ ] **Step 1: Add a focused caret restoration helper**

Add this helper after `selectAll`:

```ts
function collapseSelectionAtEnd(el: HTMLElement): void {
  el.focus();
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
    const end = el.value.length;
    try {
      el.setSelectionRange(end, end);
    } catch {
      // Some input types do not expose a text selection range.
    }
    return;
  }

  const selection = el.ownerDocument?.defaultView?.getSelection() ?? window.getSelection();
  if (!selection) return;
  const range = (el.ownerDocument ?? document).createRange();
  range.selectNodeContents(el);
  range.collapse(false);
  selection.removeAllRanges();
  selection.addRange(range);
}
```

This keeps focus and a collapsed caret explicit across native and fallback browser paths.

- [ ] **Step 2: Stop synthetic duplicate events after native contenteditable success**

Change `strategyExecCommand` so native contenteditable edits return after `execCommand` without calling `dispatchInputEvents`. Keep the current input/textarea behavior unchanged by guarding the contenteditable case:

```ts
function strategyExecCommand(el: HTMLElement, text: string): boolean {
  const hasExec = typeof document.execCommand === 'function';
  if (!hasExec) return false;
  selectAll(el);
  const ok = document.execCommand('insertText', false, text);
  if (ok && isContentEditableTarget(el)) {
    collapseSelectionAtEnd(el);
  } else if (ok) {
    dispatchInputEvents(el, text, false);
  }
  return ok;
}
```

Do not dispatch a synthetic `change` event for a native contenteditable command. The browser-generated input event is the authoritative notification for Discord/Slate.

- [ ] **Step 3: Apply the same native-event rule to HTML fallback command**

Change `strategyExecCommandHtml` to collapse the caret after a successful native command and not emit duplicate synthetic events:

```ts
function strategyExecCommandHtml(el: HTMLElement, text: string): boolean {
  const isCe = isContentEditableTarget(el);
  if (!isCe) return false;
  const hasExec = typeof document.execCommand === 'function';
  if (!hasExec) return false;
  selectAll(el);
  const html = escapeHtml(text).replace(/\n/g, '<br>');
  const ok = document.execCommand('insertHTML', false, html);
  if (ok) collapseSelectionAtEnd(el);
  return ok;
}
```

- [ ] **Step 4: Preserve the caret explicitly for manual and direct contenteditable fallbacks**

After the successful range insertion branch in `strategyInsertTextEvents`, call `collapseSelectionAtEnd(el)` before dispatching its single synthetic input. In `strategyDirectAssign`, replace the duplicated structured-editor caret setup with `collapseSelectionAtEnd(el)` after DOM assignment, then dispatch its existing synthetic input/composition events. Keep the existing structured-editor `<p>` wrappers and input/textarea setter logic unchanged.

The resulting fallback sequence is: mutate once, collapse selection, dispatch one synthetic input, dispatch existing change only where the current strategy already does so. Native command paths emit no extra synthetic events.

- [ ] **Step 5: Run the focused regression test**

Run:

```bash
pnpm vitest run content/__tests__/inlineTranslate.parity.test.ts -t "uses one native edit notification"
```

Expected: PASS, including one input notification, focused collapsed selection, and successful simulated Backspace deletion.

### Task 3: Verify existing inline translation contracts

**Files:**
- No additional source files.

- [ ] **Step 1: Run all inline translation tests**

Run:

```bash
pnpm vitest run content/__tests__/inlineTranslate.test.ts content/__tests__/inlineTranslate.parity.test.ts
```

Expected: all tests pass, including controlled-input value-tracker/send behavior, race cancellation, fallback undo, dual mode, and existing contenteditable coverage.

- [ ] **Step 2: Run type-check and lint**

Run:

```bash
pnpm compile
pnpm lint
```

Expected: TypeScript exits 0 and ESLint exits 0.

- [ ] **Step 3: Run the full test suite**

Run:

```bash
pnpm test
```

Expected: the full Vitest suite passes. If the default parallel run exhibits the repository's known load-sensitive timeout behavior, rerun the affected inline test files in isolation and perform one clean full-suite rerun before classifying the issue.

- [ ] **Step 4: Record final repository state**

Run:

```bash
git status --short
```

Expected changed files: `content/inlineTranslate/writeback.ts`, `content/__tests__/inlineTranslate.parity.test.ts`, and the approved design/plan documents. Do not commit or push without explicit user authorization under the repository's conservative Beads policy.
