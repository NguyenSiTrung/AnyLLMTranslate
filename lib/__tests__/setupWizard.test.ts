import { describe, expect, it } from 'vitest';
import {
  WIZARD_STEPS,
  WIZARD_STEP_LABELS,
  normalizeWizardStep,
  resolveWizardEntryStep,
  wizardStepIndex,
} from '@/lib/setupWizard';

describe('setupWizard steps', () => {
  it('exposes four steps in order', () => {
    expect(WIZARD_STEPS).toEqual(['welcome', 'connect', 'verify', 'ready']);
    expect(WIZARD_STEP_LABELS.welcome).toBe('Welcome');
    expect(WIZARD_STEP_LABELS.connect).toBe('Connect');
    expect(WIZARD_STEP_LABELS.verify).toBe('Verify');
    expect(WIZARD_STEP_LABELS.ready).toBe('Ready');
  });

  it('normalizeWizardStep maps legacy and new ids', () => {
    expect(normalizeWizardStep('welcome')).toBe('welcome');
    expect(normalizeWizardStep('connect')).toBe('connect');
    expect(normalizeWizardStep('verify')).toBe('verify');
    expect(normalizeWizardStep('ready')).toBe('ready');
    expect(normalizeWizardStep('provider')).toBe('connect');
    expect(normalizeWizardStep('test')).toBe('verify');
    expect(normalizeWizardStep('language')).toBe('verify');
    expect(normalizeWizardStep('done')).toBe('ready');
    expect(normalizeWizardStep('nope')).toBeNull();
    expect(normalizeWizardStep(undefined)).toBeNull();
  });

  it('wizardStepIndex is 1-based', () => {
    expect(wizardStepIndex('welcome')).toBe(1);
    expect(wizardStepIndex('ready')).toBe(4);
  });

  it('resolveWizardEntryStep: first run defaults to welcome', () => {
    expect(resolveWizardEntryStep({ completed: false, skipped: false })).toBe('welcome');
  });

  it('resolveWizardEntryStep: completed reopens at connect', () => {
    expect(
      resolveWizardEntryStep({
        completed: true,
        skipped: false,
        lastStep: 'ready',
      }),
    ).toBe('connect');
  });

  it('resolveWizardEntryStep: resumes lastStep when incomplete', () => {
    expect(
      resolveWizardEntryStep({
        completed: false,
        skipped: false,
        lastStep: 'connect',
      }),
    ).toBe('connect');
    expect(
      resolveWizardEntryStep({
        completed: false,
        skipped: false,
        lastStep: 'verify',
      }),
    ).toBe('verify');
  });

  it('resolveWizardEntryStep: normalizes legacy lastStep', () => {
    expect(
      resolveWizardEntryStep({
        completed: false,
        skipped: false,
        // Storage may still hold legacy ids
        lastStep: 'provider',
      } as Parameters<typeof resolveWizardEntryStep>[0]),
    ).toBe('connect');
  });

  it('resolveWizardEntryStep: lastStep ready without complete', () => {
    expect(
      resolveWizardEntryStep({
        completed: false,
        skipped: true,
        lastStep: 'ready',
      }),
    ).toBe('welcome');
    expect(
      resolveWizardEntryStep({
        completed: false,
        skipped: false,
        lastStep: 'ready',
      }),
    ).toBe('verify');
  });
});
