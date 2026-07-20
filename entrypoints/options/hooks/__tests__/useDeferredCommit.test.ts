/**
 * useDeferredCommit — local draft + commit-on-blur; dirty protects mid-edit.
 */

import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useDeferredCommit } from '../useDeferredCommit';

describe('useDeferredCommit', () => {
  it('updates locally without committing until blur', () => {
    const onCommit = vi.fn();
    const { result } = renderHook(
      ({ initial }) => useDeferredCommit(initial, onCommit),
      { initialProps: { initial: 'a' } },
    );

    act(() => {
      result.current.setValue('ab');
    });
    expect(result.current.value).toBe('ab');
    expect(onCommit).not.toHaveBeenCalled();

    act(() => {
      result.current.commit();
    });
    expect(onCommit).toHaveBeenCalledWith('ab');
  });

  it('does not clobber a dirty draft when upstream initial changes', () => {
    const onCommit = vi.fn();
    const { result, rerender } = renderHook(
      ({ initial }) => useDeferredCommit(initial, onCommit),
      { initialProps: { initial: 'host.com' } },
    );

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
  });

  it('syncs from upstream when not dirty', () => {
    const onCommit = vi.fn();
    const { result, rerender } = renderHook(
      ({ initial }) => useDeferredCommit(initial, onCommit),
      { initialProps: { initial: 'one' } },
    );

    rerender({ initial: 'two' });
    expect(result.current.value).toBe('two');
    expect(onCommit).not.toHaveBeenCalled();
  });

  it('adopt resets dirty and baseline without committing', () => {
    const onCommit = vi.fn();
    const { result, rerender } = renderHook(
      ({ initial }) => useDeferredCommit(initial, onCommit),
      { initialProps: { initial: 'old' } },
    );

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
