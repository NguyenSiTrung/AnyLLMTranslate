import { describe, expect, it } from 'vitest';
import {
  isTranslatablePageUrl,
  providerPatchInvalidatesTest,
  resolveWizardEntryStep,
  wizardStepIndex,
  WIZARD_STEPS,
} from '@/lib/setupWizard';

describe('setupWizard helpers', () => {
  it('resolves entry step for completed, skipped, incomplete, and invalid done', () => {
    expect(
      resolveWizardEntryStep({ completed: true, skipped: false, lastStep: 'done' }),
    ).toBe('provider');
    expect(
      resolveWizardEntryStep({ completed: false, skipped: true, lastStep: 'test' }),
    ).toBe('test');
    expect(resolveWizardEntryStep({ completed: false, skipped: false })).toBe('welcome');
    expect(
      resolveWizardEntryStep({ completed: false, skipped: true, lastStep: 'done' }),
    ).toBe('welcome');
    expect(wizardStepIndex('welcome')).toBe(1);
    expect(wizardStepIndex('done')).toBe(WIZARD_STEPS.length);
  });

  it('invalidates tests only on credential-relevant provider patches', () => {
    expect(providerPatchInvalidatesTest({ baseUrl: 'https://x' })).toBe(true);
    expect(providerPatchInvalidatesTest({ apiKey: 'k' })).toBe(true);
    expect(providerPatchInvalidatesTest({ model: 'm' })).toBe(true);
    expect(providerPatchInvalidatesTest({ connectionStatus: 'unknown' })).toBe(true);
    expect(providerPatchInvalidatesTest({ connectionStatus: 'success' })).toBe(false);
  });

  it('accepts only http(s) page URLs', () => {
    expect(isTranslatablePageUrl('https://example.com')).toBe(true);
    expect(isTranslatablePageUrl('http://localhost:3000')).toBe(true);
    expect(isTranslatablePageUrl('chrome-extension://abc/options.html')).toBe(false);
    expect(isTranslatablePageUrl('chrome://extensions')).toBe(false);
    expect(isTranslatablePageUrl(undefined)).toBe(false);
  });
});
