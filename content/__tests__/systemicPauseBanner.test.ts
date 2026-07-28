/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  showSystemicPauseBanner,
  hideSystemicPauseBanner,
  isSystemicPauseBannerVisible,
  showTranslationErrorNotification,
} from '@/content/autoTranslateNotification';

describe('systemic pause sticky banner', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    hideSystemicPauseBanner();
  });

  afterEach(() => {
    hideSystemicPauseBanner();
    document.body.innerHTML = '';
  });

  it('shows sticky banner with message and action buttons', () => {
    const onRetry = vi.fn();
    const onDismiss = vi.fn();
    const onOpenSettings = vi.fn();

    showSystemicPauseBanner({
      message: 'All providers rate-limited',
      onRetry,
      onDismiss,
      onOpenSettings,
    });

    expect(isSystemicPauseBannerVisible()).toBe(true);
    const bar = document.querySelector('[data-anyllm-role="systemic-pause-banner"]');
    expect(bar).toBeTruthy();
    expect(bar?.textContent).toContain('All providers rate-limited');
    expect(bar?.querySelector('.anyllm-systemic-pause-retry')?.textContent).toBe('Retry');
    expect(bar?.querySelector('.anyllm-systemic-pause-dismiss')?.textContent).toBe('Dismiss');
    expect(bar?.querySelector('.anyllm-systemic-pause-settings')?.textContent).toBe(
      'Open settings',
    );

    // hideSystemicPauseBanner removes the bar
    hideSystemicPauseBanner();
    expect(isSystemicPauseBannerVisible()).toBe(false);
    expect(document.querySelector('[data-anyllm-role="systemic-pause-banner"]')).toBeNull();
  });

  it('does not auto-dismiss (sticky until action)', async () => {
    vi.useFakeTimers();
    showSystemicPauseBanner({
      message: 'Pool exhausted',
      onRetry: () => {},
      onDismiss: () => {},
    });
    await vi.advanceTimersByTimeAsync(60_000);
    expect(isSystemicPauseBannerVisible()).toBe(true);
    vi.useRealTimers();
  });

  it('action buttons invoke callbacks — Retry/Dismiss remove the banner, Open settings does not', () => {
    // Retry
    const onRetry = vi.fn();
    showSystemicPauseBanner({
      message: 'err',
      onRetry,
      onDismiss: () => {},
    });
    const retry = document.querySelector(
      '.anyllm-systemic-pause-retry',
    ) as HTMLButtonElement;
    retry.click();
    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(isSystemicPauseBannerVisible()).toBe(false);

    // Dismiss
    const onDismiss = vi.fn();
    showSystemicPauseBanner({
      message: 'err',
      onRetry: () => {},
      onDismiss,
    });
    const dismiss = document.querySelector(
      '.anyllm-systemic-pause-dismiss',
    ) as HTMLButtonElement;
    dismiss.click();
    expect(onDismiss).toHaveBeenCalledTimes(1);
    expect(isSystemicPauseBannerVisible()).toBe(false);

    // Open settings
    const onOpenSettings = vi.fn();
    showSystemicPauseBanner({
      message: 'err',
      onRetry: () => {},
      onDismiss: () => {},
      onOpenSettings,
    });
    const settings = document.querySelector(
      '.anyllm-systemic-pause-settings',
    ) as HTMLButtonElement;
    settings.click();
    expect(onOpenSettings).toHaveBeenCalledTimes(1);
    expect(isSystemicPauseBannerVisible()).toBe(true);
  });

  it('replaces ephemeral error toast when sticky banner is shown', () => {
    showTranslationErrorNotification('temporary');
    expect(
      document.querySelector('[data-anyllm-role="translation-error-notification"]'),
    ).toBeTruthy();

    showSystemicPauseBanner({
      message: 'sticky',
      onRetry: () => {},
      onDismiss: () => {},
    });

    expect(
      document.querySelector('[data-anyllm-role="translation-error-notification"]'),
    ).toBeNull();
    expect(isSystemicPauseBannerVisible()).toBe(true);
  });
});
