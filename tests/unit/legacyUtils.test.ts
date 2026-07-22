// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { isTranslatablePageUrl, resolveWizardEntryStep } from '@/lib/setupWizard';
import { getProviderReadiness, getPoolReadinessStatus } from '@/lib/providerReadiness';
import { DEFAULT_SETTINGS } from '@/types/config';

describe('Legacy Utilities & Readiness Helpers', () => {
  it('validates translatable page URLs and setup wizard entry steps', () => {
    expect(isTranslatablePageUrl('https://example.com')).toBe(true);
    expect(isTranslatablePageUrl('chrome://extensions')).toBe(false);
    expect(resolveWizardEntryStep({ completed: false, skipped: false })).toBe('welcome');
  });

  it('evaluates single provider and pool readiness statuses', () => {
    const missingKey = getProviderReadiness({
      ...DEFAULT_SETTINGS.provider,
      baseUrl: 'https://api.openai.com/v1',
      model: 'gpt-4o-mini',
      requiresApiKey: true,
      apiKey: '',
    });
    expect(missingKey.reason).toBe('missing-api-key');

    const emptyPool = getPoolReadinessStatus({ ...DEFAULT_SETTINGS, providers: [] });
    expect(emptyPool.reason).toBe('pool-empty');
  });
});
