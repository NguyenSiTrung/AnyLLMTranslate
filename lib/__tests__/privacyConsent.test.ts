import { describe, expect, it } from 'vitest';
import {
  DATA_DISCLOSURE_ITEMS,
  DEFAULT_PRIVACY_CONSENT,
  PRIVACY_POLICY_URL,
  PRIVACY_POLICY_VERSION,
  hasValidConsent,
} from '@/lib/privacyConsent';

describe('hasValidConsent', () => {
  it('is false for a missing record', () => {
    expect(hasValidConsent(undefined)).toBe(false);
    expect(hasValidConsent(null)).toBe(false);
  });

  it('is false until the user takes the accept action', () => {
    expect(
      hasValidConsent({ accepted: false, acceptedAt: null, version: PRIVACY_POLICY_VERSION }),
    ).toBe(false);
  });

  it('is false when the accepted disclosure version is stale', () => {
    expect(hasValidConsent({ accepted: true, acceptedAt: 1, version: '2000-01-01' })).toBe(false);
  });

  it('is true only for an acceptance of the current version', () => {
    expect(
      hasValidConsent({ accepted: true, acceptedAt: 1, version: PRIVACY_POLICY_VERSION }),
    ).toBe(true);
  });
});

describe('data disclosure', () => {
  it('starts unaccepted at the current policy version', () => {
    expect(DEFAULT_PRIVACY_CONSENT.accepted).toBe(false);
    expect(DEFAULT_PRIVACY_CONSENT.acceptedAt).toBeNull();
    expect(DEFAULT_PRIVACY_CONSENT.version).toBe(PRIVACY_POLICY_VERSION);
  });

  it('describes a purpose and a destination for every handled data type', () => {
    // The Chrome Web Store user data policy requires the in-product disclosure to
    // say both what is handled and where it goes; a row missing either is a
    // disclosure gap, so the shape is a contract rather than a formality.
    for (const item of DATA_DISCLOSURE_ITEMS) {
      expect(item.data.trim()).not.toBe('');
      expect(item.purpose.trim()).not.toBe('');
      expect(item.destination.trim()).not.toBe('');
    }
  });

  it('points at an https policy URL', () => {
    expect(PRIVACY_POLICY_URL.startsWith('https://')).toBe(true);
  });
});
