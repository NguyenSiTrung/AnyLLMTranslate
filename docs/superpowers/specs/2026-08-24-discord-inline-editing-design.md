# Discord Inline Translation Editing

## Problem

After the Space×3 inline translation gesture, Discord chat composers display the translated text but ordinary editing can stop working: typing, Backspace, or Delete does not reliably modify the composer. The affected surface is a framework-managed `contenteditable` editor. The current write-back path performs a native edit and then emits additional synthetic framework events, which can leave the editor's internal selection/model out of sync with the DOM.

## Goal

Keep translated text in the Discord composer while preserving normal editing behavior. After translation, the user must be able to place the caret, insert text, and use Backspace/Delete. Re-triggering inline translation must continue to restore the original only when the translated value is untouched. Controlled `<input>` and `<textarea>` behavior, including submitted translated values, must remain unchanged.

## Non-goals

- No Discord-specific selectors or version-dependent adapter.
- No changes to translation requests, gesture detection, fallback undo semantics, or provider behavior.
- No change to the default translation-only display mode.

## Architecture and data flow

`runInlineTranslate` snapshots the editable value, writes the pre-translation display, requests translation, and calls `writeElementText` for the final value. `writeElementText` owns the editable-type strategy chain and verifies plain-text output.

For `contenteditable` fields, the write-back contract is one browser editing transaction:

1. Focus the existing editing host and select only its contents.
2. Prefer the native `execCommand` replacement path so the browser and framework receive one coherent edit transaction.
3. Do not add duplicate synthetic `input`/`change` events after native success; native editing events are authoritative.
4. Verify the host's plain text.
5. Leave focus on the host with a collapsed caret at the end of the inserted content.

If native editing is unavailable or fails verification, the fallback mutates the selected range once, preserves a collapsed caret, and emits one synthetic `input` event for framework reconciliation. The direct-assignment fallback retains structured-editor block wrappers and also leaves a valid caret.

For inputs and textareas, retain the native prototype setter plus value-tracker reset and existing input/change notifications. This preserves React-controlled send behavior.

## Error handling

- A strategy that cannot write or fails plain-text verification is rejected and the existing strategy chain continues.
- A failed final write causes `runInlineTranslate` to restore the original text and show the existing write-failed feedback.
- Selection/focus restoration is best-effort and must not claim write success when plain-text verification fails.
- No synthetic event from write-back may cancel the in-flight translation request.

## Testing

Add a regression fixture representing a Discord/Slate-like `contenteditable` composer with nested block content. Verify that final write-back:

- writes the translated text;
- leaves the composer focused with a collapsed caret at the end;
- permits a subsequent Backspace/Delete-style range edit to change the translated content;
- permits subsequent text insertion to change the translated content;
- still emits the expected single framework input notification for the fallback path.

Keep existing controlled-input tests and add assertions that their value-tracker/send behavior remains unchanged. Run the affected inline translation tests, then the project test, lint, and type-check gates.

## Decision

Use the generic single-native-transaction approach. It fixes the synchronization boundary without coupling the extension to Discord internals or weakening the existing controlled-input path.
