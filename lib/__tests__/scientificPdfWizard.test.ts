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
  it('lists five steps in order', () => {
    expect(SCIENTIFIC_PDF_WIZARD_STEPS).toEqual([
      'intro',
      'install',
      'poll',
      'test',
      'done',
    ]);
    expect(scientificPdfWizardStepIndex('intro')).toBe(1);
    expect(scientificPdfWizardStepIndex('done')).toBe(5);
  });

  it('advances intro → install → poll on NEXT', () => {
    let s = initialScientificPdfWizardState();
    s = reduceScientificPdfWizard(s, { type: 'NEXT' });
    expect(s.step).toBe('install');
    s = reduceScientificPdfWizard(s, { type: 'NEXT' });
    expect(s.step).toBe('poll');
  });

  it('poll requires HEALTH_OK to reach test; counts failures', () => {
    let s = initialScientificPdfWizardState('poll');
    s = reduceScientificPdfWizard(s, { type: 'NEXT' });
    expect(s.step).toBe('poll');
    s = reduceScientificPdfWizard(s, { type: 'HEALTH_FAIL' });
    expect(s.step).toBe('poll');
    expect(s.healthFailCount).toBe(1);
    expect(s.lastError).toMatch(/offline/i);
    s = reduceScientificPdfWizard(s, { type: 'HEALTH_OK' });
    expect(s.step).toBe('test');
    expect(s.healthFailCount).toBe(0);
  });

  it('test success marks completed and moves to done', () => {
    let s = initialScientificPdfWizardState('test');
    s = reduceScientificPdfWizard(s, { type: 'TEST_OK' });
    expect(s.step).toBe('done');
    expect(s.completed).toBe(true);
  });

  it('health-only path: NEXT on test after poll still completes', () => {
    let s = initialScientificPdfWizardState('test');
    s = reduceScientificPdfWizard(s, { type: 'NEXT' });
    expect(s.step).toBe('done');
    expect(s.completed).toBe(true);
  });

  it('TEST_FAIL stays on test with error', () => {
    let s = initialScientificPdfWizardState('test');
    s = reduceScientificPdfWizard(s, { type: 'TEST_FAIL' });
    expect(s.step).toBe('test');
    expect(s.lastError).toMatch(/failed/i);
  });

  it('BACK walks backward; RESET clears to intro', () => {
    let s = initialScientificPdfWizardState('test');
    s = reduceScientificPdfWizard(s, { type: 'BACK' });
    expect(s.step).toBe('poll');
    s = reduceScientificPdfWizard(s, { type: 'BACK' });
    expect(s.step).toBe('install');
    s = reduceScientificPdfWizard(s, { type: 'RESET' });
    expect(s).toEqual(initialScientificPdfWizardState('intro'));
  });

  it('resolveScientificPdfWizardEntry reopens at poll when already set up', () => {
    expect(resolveScientificPdfWizardEntry({})).toBe('intro');
    expect(resolveScientificPdfWizardEntry({ enabled: true })).toBe('poll');
    expect(
      resolveScientificPdfWizardEntry({ setupCompletedAt: '2026-07-17T00:00:00Z' }),
    ).toBe('poll');
  });

  it('scientificPdfSetupCompletedAt returns ISO string', () => {
    const ts = scientificPdfSetupCompletedAt(new Date('2026-07-17T12:00:00.000Z'));
    expect(ts).toBe('2026-07-17T12:00:00.000Z');
  });
});
