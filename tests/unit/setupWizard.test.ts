import { describe, expect, it } from 'vitest';
import {
  isTranslatablePageUrl,
  providerPatchInvalidatesTest,
  resolveWizardEntryStep,
  wizardStepIndex,
  WIZARD_STEPS,
} from '@/lib/setupWizard';
import type { OnboardingState } from '@/types/config';

describe('resolveWizardEntryStep', () => {
  it('reopens completed setup at provider (not done)', () => {
    const onboarding: OnboardingState = {
      completed: true,
      skipped: false,
      lastStep: 'done',
    };
    expect(resolveWizardEntryStep(onboarding)).toBe('provider');
  });

  it('resumes last step when skipped or incomplete', () => {
    expect(
      resolveWizardEntryStep({
        completed: false,
        skipped: true,
        lastStep: 'test',
      }),
    ).toBe('test');
  });

  it('defaults to welcome when no lastStep', () => {
    expect(
      resolveWizardEntryStep({
        completed: false,
        skipped: false,
      }),
    ).toBe('welcome');
  });

  it('does not land on done without completed', () => {
    expect(
      resolveWizardEntryStep({
        completed: false,
        skipped: true,
        lastStep: 'done',
      }),
    ).toBe('welcome');
  });
});

describe('wizardStepIndex', () => {
  it('is 1-based and covers all steps', () => {
    expect(wizardStepIndex('welcome')).toBe(1);
    expect(wizardStepIndex('done')).toBe(WIZARD_STEPS.length);
  });
});

describe('providerPatchInvalidatesTest', () => {
  it('invalidates on credential / model / base URL changes', () => {
    expect(providerPatchInvalidatesTest({ baseUrl: 'https://x' })).toBe(true);
    expect(providerPatchInvalidatesTest({ apiKey: 'k' })).toBe(true);
    expect(providerPatchInvalidatesTest({ model: 'm' })).toBe(true);
    expect(providerPatchInvalidatesTest({ connectionStatus: 'unknown' })).toBe(true);
  });

  it('does not invalidate on unrelated display-only patches', () => {
    expect(providerPatchInvalidatesTest({ connectionStatus: 'success' })).toBe(false);
  });
});

describe('isTranslatablePageUrl', () => {
  it('accepts http and https only', () => {
    expect(isTranslatablePageUrl('https://example.com')).toBe(true);
    expect(isTranslatablePageUrl('http://localhost:3000')).toBe(true);
    expect(isTranslatablePageUrl('chrome-extension://abc/options.html')).toBe(false);
    expect(isTranslatablePageUrl('chrome://extensions')).toBe(false);
    expect(isTranslatablePageUrl(undefined)).toBe(false);
  });
});
