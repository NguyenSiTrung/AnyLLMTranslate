/**
 * Tests for the useDeferredCommit hook (FR-10).
 */

import { describe, it, expect, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useDeferredCommit } from '../useDeferredCommit';

describe('useDeferredCommit', () => {
  it('exposes the initial value', () => {
    const { result } = renderHook(() => useDeferredCommit<string>('hello', vi.fn()));
    expect(result.current.value).toBe('hello');
  });

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

  it('does not commit again if commit() is called twice with no intervening change', () => {
    const onCommit = vi.fn();
    const { result } = renderHook(() => useDeferredCommit<string>('hello', onCommit));
    act(() => result.current.setValue('world'));
    act(() => result.current.commit());
    act(() => result.current.commit()); // already committed → no-op
    expect(onCommit).toHaveBeenCalledTimes(1);
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

  it('does not fire onCommit during the external-sync effect', () => {
    const onCommit = vi.fn();
    const { result, rerender } = renderHook(
      ({ initial }) => useDeferredCommit(initial, onCommit),
      { initialProps: { initial: 'a' } },
    );
    act(() => result.current.setValue('a-edited'));
    rerender({ initial: 'b' });
    // The sync should NOT call onCommit — it's an external change, already
    // reflected upstream; calling onCommit would be redundant + could loop.
    expect(onCommit).not.toHaveBeenCalled();
  });

  it('supports a number type (e.g. for numeric inputs)', () => {
    const onCommit = vi.fn();
    const { result } = renderHook(() => useDeferredCommit<number>(0, onCommit));
    act(() => result.current.setValue(42));
    act(() => result.current.commit());
    expect(onCommit).toHaveBeenCalledWith(42);
  });

  it('marks the dirty flag correctly across commit-then-edit cycles', () => {
    const onCommit = vi.fn();
    const { result } = renderHook(() => useDeferredCommit<string>('x', onCommit));
    // Edit + commit.
    act(() => result.current.setValue('y'));
    act(() => result.current.commit());
    expect(onCommit).toHaveBeenLastCalledWith('y');
    // Edit back to the committed value and commit → no new write.
    act(() => result.current.setValue('y'));
    act(() => result.current.commit());
    expect(onCommit).toHaveBeenCalledTimes(1);
  });
});
