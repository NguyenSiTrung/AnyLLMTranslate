import { describe, it, expect } from 'vitest';
import { shouldAcceptTabScopedMessage } from '../shouldAcceptTabScopedMessage';

describe('shouldAcceptTabScopedMessage', () => {
  it('accepts when fromTabId matches activeTabId', () => {
    expect(shouldAcceptTabScopedMessage(42, 42)).toBe(true);
  });

  it('rejects updates from a different tab', () => {
    expect(shouldAcceptTabScopedMessage(42, 99)).toBe(false);
  });

  it('rejects when active tab is unknown (rely on getStatus query instead)', () => {
    expect(shouldAcceptTabScopedMessage(null, 42)).toBe(false);
    expect(shouldAcceptTabScopedMessage(undefined, 42)).toBe(false);
  });

  it('rejects placeholder / missing origin tab ids (tabId: 0 legacy)', () => {
    expect(shouldAcceptTabScopedMessage(42, 0)).toBe(false);
    expect(shouldAcceptTabScopedMessage(42, null)).toBe(false);
    expect(shouldAcceptTabScopedMessage(42, undefined)).toBe(false);
    expect(shouldAcceptTabScopedMessage(42, -1)).toBe(false);
  });

  it('rejects when both sides are unset', () => {
    expect(shouldAcceptTabScopedMessage(null, null)).toBe(false);
  });
});
