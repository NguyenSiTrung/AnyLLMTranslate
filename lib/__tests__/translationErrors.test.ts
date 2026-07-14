import { describe, it, expect } from 'vitest';
import {
  isTransientTranslationError,
  shouldNegativeCacheFailure,
} from '../translationErrors';

describe('isTransientTranslationError', () => {
  it('classifies pool/rate/network/auth failures as transient and content blocks as not', () => {
    const transient = [
      'All provider pool slots failed during this request.',
      'All provider pool slots are currently open (rate-limited or errored).',
      'Translation pool is empty — no providers configured.',
      'Provider pool dispatch exhausted all attempts.',
      'Rate limit exceeded',
      'HTTP 429 Too Many Requests',
      'Network error: fetch failed',
      'Request timeout',
      'Failed to parse translation response as JSON',
      'Empty streaming response',
      'Streaming port disconnected',
      'Invalid API key (401)',
    ];
    for (const msg of transient) {
      expect(isTransientTranslationError(msg), msg).toBe(true);
    }
    expect(isTransientTranslationError('Content blocked by safety filter')).toBe(false);
  });
});

describe('shouldNegativeCacheFailure', () => {
  it('negative-caches only content/moderation failures (never pool/rate/unknown)', () => {
    expect(
      shouldNegativeCacheFailure('All provider pool slots failed during this request.'),
    ).toBe(false);
    expect(shouldNegativeCacheFailure('Rate limit exceeded')).toBe(false);
    expect(shouldNegativeCacheFailure('Blocked by content filter')).toBe(true);
    expect(shouldNegativeCacheFailure('Safety moderation refused to translate')).toBe(true);
    expect(shouldNegativeCacheFailure('Something weird happened')).toBe(false);
  });
});
