import { describe, it, expect } from 'vitest';
import {
  initialScientificPdfWizardState,
  reduceScientificPdfWizard,
  resolveScientificPdfWizardEntry,
  scientificPdfWizardStepIndex,
  scientificPdfSetupCompletedAt,
  SCIENTIFIC_PDF_WIZARD_STEPS,
} from '@/lib/scientificPdfWizard';

describe('scientificPdfWizard', () => {
  it('steps, navigation, health gate, and completion', () => {
    expect(SCIENTIFIC_PDF_WIZARD_STEPS).toEqual(['intro', 'install', 'poll', 'test', 'done']);
    expect(scientificPdfWizardStepIndex('intro')).toBe(1);
    expect(scientificPdfWizardStepIndex('done')).toBe(5);

    let s = initialScientificPdfWizardState();
    s = reduceScientificPdfWizard(s, { type: 'NEXT' });
    expect(s.step).toBe('install');
    s = reduceScientificPdfWizard(s, { type: 'NEXT' });
    expect(s.step).toBe('poll');

    s = reduceScientificPdfWizard(s, { type: 'NEXT' });
    expect(s.step).toBe('poll');
    s = reduceScientificPdfWizard(s, { type: 'HEALTH_FAIL' });
    expect(s.step).toBe('poll');
    expect(s.healthFailCount).toBe(1);
    expect(s.lastError).toMatch(/offline/i);
    s = reduceScientificPdfWizard(s, { type: 'HEALTH_OK' });
    expect(s.step).toBe('test');
    expect(s.healthFailCount).toBe(0);

    s = reduceScientificPdfWizard(s, { type: 'TEST_OK' });
    expect(s.step).toBe('done');
    expect(s.completed).toBe(true);

    // Entry resolution and setup timestamp
    expect(resolveScientificPdfWizardEntry({})).toBe('intro');
    expect(resolveScientificPdfWizardEntry({ enabled: true })).toBe('poll');
    expect(
      resolveScientificPdfWizardEntry({ setupCompletedAt: '2026-07-17T00:00:00Z' }),
    ).toBe('poll');
    expect(scientificPdfSetupCompletedAt(new Date('2026-07-17T12:00:00.000Z'))).toBe(
      '2026-07-17T12:00:00.000Z',
    );
  });

  it('test fail/next, back, and reset', () => {
    let s = initialScientificPdfWizardState('test');
    s = reduceScientificPdfWizard(s, { type: 'TEST_FAIL' });
    expect(s.step).toBe('test');
    expect(s.lastError).toMatch(/failed/i);

    s = initialScientificPdfWizardState('test');
    s = reduceScientificPdfWizard(s, { type: 'NEXT' });
    expect(s.step).toBe('done');
    expect(s.completed).toBe(true);

    s = initialScientificPdfWizardState('test');
    s = reduceScientificPdfWizard(s, { type: 'BACK' });
    expect(s.step).toBe('poll');
    s = reduceScientificPdfWizard(s, { type: 'BACK' });
    expect(s.step).toBe('install');
    s = reduceScientificPdfWizard(s, { type: 'RESET' });
    expect(s).toEqual(initialScientificPdfWizardState('intro'));
  });
});
