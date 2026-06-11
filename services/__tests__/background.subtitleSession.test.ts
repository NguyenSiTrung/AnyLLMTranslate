/**
 * Tests: active subtitle session cleanup on restore / cancel / tab removal
 *
 * Phase 2 Task 5 of deep-analysis-hardening. Verifies that in-progress
 * progressive subtitle sessions are torn down (and the keep-alive alarm
 * cleared) when a tab is restored, explicitly cancelled, or closed.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const alarmsClear = vi.fn();
let tabRemovedListener: ((tabId: number) => void) | undefined;

vi.stubGlobal('chrome', {
  storage: {
    local: { get: vi.fn(), set: vi.fn() },
    onChanged: { addListener: vi.fn(), removeListener: vi.fn() },
  },
  runtime: { sendMessage: vi.fn().mockResolvedValue(undefined) },
  tabs: {
    onRemoved: {
      addListener: vi.fn((cb: (tabId: number) => void) => { tabRemovedListener = cb; }),
    },
  },
  alarms: {
    create: vi.fn(),
    get: vi.fn(),
    clear: alarmsClear,
    onAlarm: { addListener: vi.fn(), removeListener: vi.fn() },
  },
});

import {
  handleMessage,
  initSubtitleSessionCleanup,
  __seedSubtitleSessionForTest,
  __getActiveSessionCountForTest,
} from '../background';

const fakeSender = (tabId?: number) =>
  ({ tab: tabId ? { id: tabId } : undefined }) as chrome.runtime.MessageSender;

describe('subtitle session cleanup', () => {
  beforeEach(() => {
    alarmsClear.mockClear();
  });

  it('stops the session and drains its queue on restore', () => {
    const session = __seedSubtitleSessionForTest(7);
    expect(__getActiveSessionCountForTest()).toBe(1);

    handleMessage({ action: 'restore' }, fakeSender(7));

    expect(__getActiveSessionCountForTest()).toBe(0);
    expect(session.queue.length).toBe(0);
    expect(alarmsClear).toHaveBeenCalled();
  });

  it('stops the session on CANCEL_SUBTITLE_SESSION', () => {
    __seedSubtitleSessionForTest(8);
    expect(__getActiveSessionCountForTest()).toBe(1);

    handleMessage({ action: 'CANCEL_SUBTITLE_SESSION' }, fakeSender(8));

    expect(__getActiveSessionCountForTest()).toBe(0);
  });

  it('honours an explicit tabId on the cancel message', () => {
    __seedSubtitleSessionForTest(9);

    handleMessage({ action: 'CANCEL_SUBTITLE_SESSION', tabId: 9 }, fakeSender());

    expect(__getActiveSessionCountForTest()).toBe(0);
  });

  it('cleans up the session when its tab is removed', () => {
    initSubtitleSessionCleanup();
    expect(tabRemovedListener).toBeTypeOf('function');

    __seedSubtitleSessionForTest(10);
    expect(__getActiveSessionCountForTest()).toBe(1);

    tabRemovedListener?.(10);

    expect(__getActiveSessionCountForTest()).toBe(0);
  });

  it('is a no-op when no session exists for the tab', () => {
    expect(() => handleMessage({ action: 'restore' }, fakeSender(999))).not.toThrow();
    expect(__getActiveSessionCountForTest()).toBe(0);
  });
});
