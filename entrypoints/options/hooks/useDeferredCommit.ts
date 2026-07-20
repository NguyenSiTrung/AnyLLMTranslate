/**
 * useDeferredCommit — text-input commit-on-blur hook (FR-10).
 *
 * Every text `onChange` in the Providers tab today fires
 * `updateSettings → chrome.storage.local` with AES-GCM encryption on every
 * keystroke (a 40-char API key triggers 40 encrypted writes). This hook
 * generalizes the existing `maxRpm` commit-on-blur pattern: local state
 * updates immediately for responsiveness; the (encrypted) store write fires
 * only on blur.
 *
 * Syncs local state when the upstream `initial` changes (reset/import per
 * the cache-settings-ui_20260416 pattern) **only when the field is not dirty**.
 * Mid-edit external store updates (storage sync, sibling field saves) must not
 * clobber what the user is typing — that looked like "input won't take focus /
 * can't type" for list-derived and API-key fields.
 *
 * NFR-5: React fires `onBlur` before unmount in normal navigation, so the
 * deferred commit lands before the input disappears; verify with a test.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

export interface UseDeferredCommitResult<T> {
  /** Local value — bind to the input's `value`. Updates immediately. */
  value: T;
  /** Set the local value (no commit). Bind to `onChange`. */
  setValue: (next: T) => void;
  /** Commit the current local value if dirty. Bind to `onBlur`. */
  commit: () => void;
  /**
   * Replace local + committed baseline without marking dirty (e.g. Reset button
   * already wrote the store). Next external `initial` syncs normally.
   */
  adopt: (next: T) => void;
}

export function useDeferredCommit<T>(
  initial: T,
  onCommit: (value: T) => void,
): UseDeferredCommitResult<T> {
  const [value, setValue] = useState<T>(initial);
  // `committed` is the last value written via onCommit. We only need the
  // setter to read the previous committed value inside the commit callback
  // (React queues state updates, so we can't read it from a closure). The
  // underscore prefix flags it as intentionally write-only to ESLint.
  const [, setCommitted] = useState<T>(initial);
  const dirtyRef = useRef(false);

  // Sync local state when the upstream value changes externally (reset to
  // defaults, settings import, cross-context chrome.storage.onChanged) —
  // but never while the user has uncommitted edits.
  useEffect(() => {
    if (dirtyRef.current) return;
    setValue(initial);
    setCommitted(initial);
  }, [initial]);

  const setLocal = useCallback((next: T) => {
    dirtyRef.current = true;
    setValue(next);
  }, []);

  const adopt = useCallback((next: T) => {
    dirtyRef.current = false;
    setValue(next);
    setCommitted(next);
  }, []);

  const commit = useCallback(() => {
    // Only fire the write when the value actually changed since the last commit.
    setCommitted((prevCommitted) => {
      if (value !== prevCommitted) {
        onCommit(value);
        dirtyRef.current = false;
        return value;
      }
      dirtyRef.current = false;
      return prevCommitted;
    });
  }, [value, onCommit]);

  return { value, setValue: setLocal, commit, adopt };
}
