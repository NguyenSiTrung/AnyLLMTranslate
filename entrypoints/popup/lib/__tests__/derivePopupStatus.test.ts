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

  it('prioritizes setup over blocked over error over translating', () => {
    const setup = derivePopupStatus({ ...base, needsSetup: true, unsupported: true });
    expect(setup.kind).toBe('setup');
    expect(setup.chipLabel).toBe('Setup');

    const blocked = derivePopupStatus({ ...base, unsupported: true, hasError: true, status: 'error' });
    expect(blocked.kind).toBe('blocked');
    expect(blocked.chipLabel).toBe('Unavailable');

    const error = derivePopupStatus({
      ...base,
      hasError: true,
      status: 'error',
      isTranslating: true,
    });
    expect(error.kind).toBe('error');
    expect(error.chipLabel).toBe('Error');
    expect(error.showProgress).toBe(false);
  });

  it('returns translating when in flight', () => {
    const v = derivePopupStatus({ ...base, isTranslating: true, status: 'translating' });
    expect(v.kind).toBe('translating');
    expect(v.chipLabel).toBe('Translating');
    expect(v.showProgress).toBe(true);
  });

  it('returns active when done or reading area ready', () => {
    const done = derivePopupStatus({ ...base, status: 'done' });
    expect(done.kind).toBe('active');
    expect(done.chipLabel).toBe('Active');
    expect(done.showProgress).toBe(true);

    const readingReady = derivePopupStatus({ ...base, status: 'done', readingAreaReady: true });
    expect(readingReady.kind).toBe('active');
    expect(readingReady.chipLabel).toBe('Active');
    expect(readingReady.showProgress).toBe(true);
  });
});
