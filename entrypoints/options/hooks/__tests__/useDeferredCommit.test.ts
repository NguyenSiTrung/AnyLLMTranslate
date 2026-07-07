/**
 * Tests for the useDeferredCommit hook (FR-10).
 */

import { describe, it, expect, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useDeferredCommit } from '../useDeferredCommit';

describe('useDeferredCommit', () => {
  it('updates local value immediately without committing', () => {
    const onCommit = vi.fn();
    const { result } = renderHook(() => useDeferredCommit<string>('hello', onCommit));
    act(() => result.current.setValue('hel'));
    act(() => result.current.setValue('he'));
    act(() => result.current.setValue('h'));
    expect(result.current.value).toBe('h');
    expect(onCommit).not.toHaveBeenCalled();
  });

  it('commits once on commit() with the latest value', () => {
    const onCommit = vi.fn();
    const { result } = renderHook(() => useDeferredCommit<string>('hello', onCommit));
    act(() => result.current.setValue('h'));
    act(() => result.current.setValue('he'));
    act(() => result.current.setValue('hello world'));
    act(() => result.current.commit());
    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(onCommit).toHaveBeenCalledWith('hello world');
  });

  it('does not commit when value is unchanged since last commit', () => {
    const onCommit = vi.fn();
    const { result } = renderHook(() => useDeferredCommit<string>('hello', onCommit));
    act(() => result.current.commit()); // no change → no commit
    expect(onCommit).not.toHaveBeenCalled();
  });

  it('syncs local state when the upstream initial changes (reset/import)', () => {
    const onCommit = vi.fn();
    const { result, rerender } = renderHook(
      ({ initial }) => useDeferredCommit(initial, onCommit),
      { initialProps: { initial: 'a' } },
    );
    // User types something locally (dirty, not committed).
    act(() => result.current.setValue('a-edited'));
    // External reset/import changes the upstream value.
    rerender({ initial: 'b' });
    expect(result.current.value).toBe('b');
  });
});
