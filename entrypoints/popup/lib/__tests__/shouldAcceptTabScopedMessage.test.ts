import { describe, it, expect } from 'vitest';
import { shouldAcceptTabScopedMessage } from '../shouldAcceptTabScopedMessage';

describe('shouldAcceptTabScopedMessage', () => {
  it('accepts only when fromTabId equals a valid activeTabId (rejects mismatch, unknown, and placeholder ids)', () => {
    expect(shouldAcceptTabScopedMessage(42, 42)).toBe(true);
    expect(shouldAcceptTabScopedMessage(42, 99)).toBe(false);
    expect(shouldAcceptTabScopedMessage(null, 42)).toBe(false);
    expect(shouldAcceptTabScopedMessage(undefined, 42)).toBe(false);
    expect(shouldAcceptTabScopedMessage(null, null)).toBe(false);
    expect(shouldAcceptTabScopedMessage(42, 0)).toBe(false);
    expect(shouldAcceptTabScopedMessage(42, null)).toBe(false);
    expect(shouldAcceptTabScopedMessage(42, undefined)).toBe(false);
    expect(shouldAcceptTabScopedMessage(42, -1)).toBe(false);
  });
});
