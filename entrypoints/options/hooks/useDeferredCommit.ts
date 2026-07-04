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
 * the cache-settings-ui_20260416 pattern). NFR-5: React fires `onBlur`
 * before unmount in normal navigation, so the deferred commit lands before
 * the input disappears; verify with a test.
 */

import { useCallback, useEffect, useState } from 'react';

export interface UseDeferredCommitResult<T> {
  /** Local value — bind to the input's `value`. Updates immediately. */
  value: T;
  /** Set the local value (no commit). Bind to `onChange`. */
  setValue: (next: T) => void;
  /** Commit the current local value if dirty. Bind to `onBlur`. */
  commit: () => void;
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

  // Sync local state when the upstream value changes externally (reset to
  // defaults, settings import, cross-context chrome.storage.onChanged).
  useEffect(() => {
    setValue(initial);
    setCommitted(initial);
  }, [initial]);

  const setLocal = useCallback((next: T) => {
    setValue(next);
  }, []);

  const commit = useCallback(() => {
    // Only fire the write when the value actually changed since the last commit.
    setCommitted((prevCommitted) => {
      if (value !== prevCommitted) {
        onCommit(value);
        return value;
      }
      return prevCommitted;
    });
  }, [value, onCommit]);

  return { value, setValue: setLocal, commit };
}
