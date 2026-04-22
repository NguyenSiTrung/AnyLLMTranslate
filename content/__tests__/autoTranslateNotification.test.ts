/**
 * Tests for autoTranslateNotification — notification bar module.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  showAutoTranslateNotification,
  hideAutoTranslateNotification,
} from '@/content/autoTranslateNotification';

const SELECTOR = '[data-anyllm-role="auto-translate-notification"]';

beforeEach(() => {
  document.body.innerHTML = '';
  vi.restoreAllMocks();
});

describe('showAutoTranslateNotification', () => {
  it('creates a notification with the correct text', () => {
    showAutoTranslateNotification(vi.fn());

    const el = document.querySelector(SELECTOR);
    expect(el).not.toBeNull();
    expect(el?.textContent).toContain('Auto-translating this page');
  });

  it('dismiss button removes the notification', () => {
    showAutoTranslateNotification(vi.fn());

    const closeBtn = document.querySelector(`${SELECTOR} .anyllm-notification-close`) as HTMLElement;
    expect(closeBtn).not.toBeNull();
    closeBtn.click();

    expect(document.querySelector(SELECTOR)).toBeNull();
  });

  it('disable button calls onDisable and removes notification', () => {
    const onDisable = vi.fn();
    showAutoTranslateNotification(onDisable);

    const buttons = document.querySelectorAll(`${SELECTOR} button`);
    // First button is "Disable for this site"
    const disableBtn = Array.from(buttons).find(
      (b) => b.textContent === 'Disable for this site',
    ) as HTMLElement;
    expect(disableBtn).toBeDefined();
    disableBtn.click();

    expect(onDisable).toHaveBeenCalledOnce();
    expect(document.querySelector(SELECTOR)).toBeNull();
  });

  it('auto-dismisses after 5 seconds with fade-out', () => {
    vi.useFakeTimers();
    showAutoTranslateNotification(vi.fn());

    expect(document.querySelector(SELECTOR)).not.toBeNull();

    // Advance to auto-dismiss trigger
    vi.advanceTimersByTime(5000);
    const el = document.querySelector(SELECTOR);
    expect(el?.classList.contains('anyllm-notification-hiding')).toBe(true);

    // Advance past fade duration
    vi.advanceTimersByTime(300);
    expect(document.querySelector(SELECTOR)).toBeNull();

    vi.useRealTimers();
  });

  it('does not create duplicate notifications on multiple calls', () => {
    showAutoTranslateNotification(vi.fn());
    showAutoTranslateNotification(vi.fn());

    const all = document.querySelectorAll(SELECTOR);
    expect(all.length).toBe(1);
  });
});

describe('hideAutoTranslateNotification', () => {
  it('removes the notification from DOM', () => {
    showAutoTranslateNotification(vi.fn());
    expect(document.querySelector(SELECTOR)).not.toBeNull();

    hideAutoTranslateNotification();
    expect(document.querySelector(SELECTOR)).toBeNull();
  });

  it('is safe to call when no notification exists', () => {
    expect(() => hideAutoTranslateNotification()).not.toThrow();
  });
});
