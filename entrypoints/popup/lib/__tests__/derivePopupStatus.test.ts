import { describe, it, expect } from 'vitest';
import { derivePopupStatus } from '../derivePopupStatus';

const base = {
  status: 'idle' as const,
  isTranslating: false,
  hasError: false,
  unsupported: false,
  needsSetup: false,
  readingAreaReady: false,
};

describe('derivePopupStatus', () => {
  it('returns ready by default', () => {
    expect(derivePopupStatus(base)).toEqual({
      kind: 'ready',
      chipLabel: 'Ready',
      showProgress: false,
    });
  });

  it('prioritizes setup over blocked', () => {
    const v = derivePopupStatus({ ...base, needsSetup: true, unsupported: true });
    expect(v.kind).toBe('setup');
    expect(v.chipLabel).toBe('Setup');
  });

  it('prioritizes blocked over error', () => {
    const v = derivePopupStatus({ ...base, unsupported: true, hasError: true, status: 'error' });
    expect(v.kind).toBe('blocked');
    expect(v.chipLabel).toBe('Unavailable');
  });

  it('prioritizes error over translating', () => {
    const v = derivePopupStatus({
      ...base,
      hasError: true,
      status: 'error',
      isTranslating: true,
    });
    expect(v.kind).toBe('error');
    expect(v.chipLabel).toBe('Error');
    expect(v.showProgress).toBe(false);
  });

  it('returns translating when in flight', () => {
    const v = derivePopupStatus({ ...base, isTranslating: true, status: 'translating' });
    expect(v.kind).toBe('translating');
    expect(v.chipLabel).toBe('Translating');
    expect(v.showProgress).toBe(true);
  });

  it('returns active when done', () => {
    const v = derivePopupStatus({ ...base, status: 'done' });
    expect(v.kind).toBe('active');
    expect(v.chipLabel).toBe('Active');
    expect(v.showProgress).toBe(true);
  });

  it('returns active when reading area ready', () => {
    const v = derivePopupStatus({ ...base, status: 'done', readingAreaReady: true });
    expect(v.kind).toBe('active');
    expect(v.chipLabel).toBe('Active');
    expect(v.showProgress).toBe(true);
  });
});
