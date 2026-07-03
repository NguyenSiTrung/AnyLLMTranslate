/**
 * Tests: PDF viewer keep-alive session registration.
 *
 * Phase 1 Task 2 of pdf-perf-ux_20260703. Verifies that:
 * - REGISTER_PDF_SESSION arms the keep-alive alarm
 * - UNREGISTER_PDF_SESSION deregisters; alarm clears when none remain
 * - chrome.tabs.onRemoved deregisters a PDF session
 * - re-registering is idempotent
 * - multiple concurrent viewers keep the alarm armed until the last closes
 *
 * Mirrors the subtitle keep-alive test pattern (background.subtitleSession.test.ts).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const alarmsCreate = vi.fn();
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
      addListener: vi.fn((cb: (tabId: number) => void) => {
        tabRemovedListener = cb;
      }),
    },
  },
  alarms: {
    create: alarmsCreate,
    get: vi.fn(),
    clear: alarmsClear,
    onAlarm: { addListener: vi.fn(), removeListener: vi.fn() },
  },
});

import {
  handleMessage,
  initSubtitleSessionCleanup,
  __resetPdfSessionsForTest,
  __getPdfSessionCountForTest,
  __isKeepaliveArmedForTest,
} from '../background';

const fakeSender = (tabId?: number) =>
  ({ tab: tabId ? { id: tabId } : undefined }) as chrome.runtime.MessageSender;

describe('PDF viewer keep-alive session', () => {
  beforeEach(() => {
    __resetPdfSessionsForTest();
    alarmsCreate.mockClear();
    alarmsClear.mockClear();
  });

  it('REGISTER_PDF_SESSION registers the tab and arms the keep-alive alarm', async () => {
    await handleMessage({ action: 'REGISTER_PDF_SESSION' }, fakeSender(100));
    expect(__getPdfSessionCountForTest()).toBe(1);
    expect(__isKeepaliveArmedForTest()).toBe(true);
    expect(alarmsCreate).toHaveBeenCalledTimes(1);
  });

  it('UNREGISTER_PDF_SESSION deregisters and clears the alarm when none remain', async () => {
    await handleMessage({ action: 'REGISTER_PDF_SESSION' }, fakeSender(100));
    await handleMessage({ action: 'UNREGISTER_PDF_SESSION' }, fakeSender(100));
    expect(__getPdfSessionCountForTest()).toBe(0);
    expect(__isKeepaliveArmedForTest()).toBe(false);
    expect(alarmsClear).toHaveBeenCalled();
  });

  it('re-registering the same tab is idempotent (alarm armed once)', async () => {
    await handleMessage({ action: 'REGISTER_PDF_SESSION' }, fakeSender(100));
    await handleMessage({ action: 'REGISTER_PDF_SESSION' }, fakeSender(100));
    expect(__getPdfSessionCountForTest()).toBe(1);
    // ensureKeepaliveAlarm short-circuits when already armed.
    expect(alarmsCreate).toHaveBeenCalledTimes(1);
  });

  it('keeps the alarm armed while ≥1 viewer is open (multi-session)', async () => {
    await handleMessage({ action: 'REGISTER_PDF_SESSION' }, fakeSender(100));
    await handleMessage({ action: 'REGISTER_PDF_SESSION' }, fakeSender(200));
    expect(__getPdfSessionCountForTest()).toBe(2);

    // Closing one does not clear the alarm.
    await handleMessage({ action: 'UNREGISTER_PDF_SESSION' }, fakeSender(100));
    expect(__getPdfSessionCountForTest()).toBe(1);
    expect(__isKeepaliveArmedForTest()).toBe(true);

    // Closing the last clears it.
    await handleMessage({ action: 'UNREGISTER_PDF_SESSION' }, fakeSender(200));
    expect(__getPdfSessionCountForTest()).toBe(0);
    expect(__isKeepaliveArmedForTest()).toBe(false);
  });

  it('ignores register/unregister from senders without a tab id', async () => {
    await handleMessage({ action: 'REGISTER_PDF_SESSION' }, fakeSender(undefined));
    expect(__getPdfSessionCountForTest()).toBe(0);
    expect(__isKeepaliveArmedForTest()).toBe(false);
  });

  it('chrome.tabs.onRemoved deregisters a PDF viewer session', async () => {
    initSubtitleSessionCleanup();
    expect(tabRemovedListener).toBeDefined();

    await handleMessage({ action: 'REGISTER_PDF_SESSION' }, fakeSender(300));
    expect(__isKeepaliveArmedForTest()).toBe(true);

    // Simulate the tab closing.
    if (tabRemovedListener) tabRemovedListener(300);
    expect(__getPdfSessionCountForTest()).toBe(0);
    expect(__isKeepaliveArmedForTest()).toBe(false);
  });

  it('UNREGISTER for an unknown tab id is safe', async () => {
    await handleMessage({ action: 'UNREGISTER_PDF_SESSION' }, fakeSender(999));
    expect(__getPdfSessionCountForTest()).toBe(0);
    expect(__isKeepaliveArmedForTest()).toBe(false);
  });
});
