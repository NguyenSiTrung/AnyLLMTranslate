/**
 * useDeferredCommit — local draft + commit-on-blur; dirty protects mid-edit.
 */

import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useDeferredCommit } from '../useDeferredCommit';

describe('useDeferredCommit', () => {
  it('keeps a local draft until commit/blur, syncs clean upstream changes, preserves dirty drafts, and adopt resets without committing', () => {
    const onCommit = vi.fn();
    const { result, rerender } = renderHook(
      ({ initial }) => useDeferredCommit(initial, onCommit),
      { initialProps: { initial: 'a' } },
    );

    // Local edit without commit.
    act(() => {
      result.current.setValue('ab');
    });
    expect(result.current.value).toBe('ab');
    expect(onCommit).not.toHaveBeenCalled();

    act(() => {
      result.current.commit();
    });
    expect(onCommit).toHaveBeenCalledWith('ab');

    // Clean (not dirty) draft syncs from upstream without committing.
    onCommit.mockClear();
    rerender({ initial: 'two' });
    expect(result.current.value).toBe('two');
    expect(onCommit).not.toHaveBeenCalled();

    // Dirty draft survives an upstream change.
    act(() => {
      // User is mid-type: trailing comma + space must stick
      result.current.setValue('host.com, ');
    });
    expect(result.current.value).toBe('host.com, ');

    rerender({ initial: 'host.com' });
    expect(result.current.value).toBe('host.com, ');

    act(() => {
      result.current.commit();
    });
    expect(onCommit).toHaveBeenCalledWith('host.com, ');
    onCommit.mockClear();

    // adopt resets dirty + baseline without committing.
    act(() => {
      result.current.setValue('typing');
    });
    act(() => {
      result.current.adopt('reset-value');
    });
    expect(result.current.value).toBe('reset-value');
    expect(onCommit).not.toHaveBeenCalled();

    rerender({ initial: 'from-store' });
    expect(result.current.value).toBe('from-store');
  });
});
