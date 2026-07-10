import { describe, it, expect } from 'vitest';
import {
  isTransientTranslationError,
  shouldNegativeCacheFailure,
} from '../translationErrors';

describe('isTransientTranslationError', () => {
  it.each([
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
  ])('treats %j as transient', (msg) => {
    expect(isTransientTranslationError(msg)).toBe(true);
  });

  it('does not treat unknown content-specific messages as transient by default', () => {
    expect(isTransientTranslationError('Content blocked by safety filter')).toBe(false);
  });
});

describe('shouldNegativeCacheFailure', () => {
  it('never negative-caches pool / rate-limit failures', () => {
    expect(
      shouldNegativeCacheFailure('All provider pool slots failed during this request.'),
    ).toBe(false);
    expect(shouldNegativeCacheFailure('Rate limit exceeded')).toBe(false);
  });

  it('allows negative cache only for content/moderation style errors', () => {
    expect(shouldNegativeCacheFailure('Blocked by content filter')).toBe(true);
    expect(shouldNegativeCacheFailure('Safety moderation refused to translate')).toBe(true);
  });

  it('does not negative-cache generic unknown errors (fail open)', () => {
    expect(shouldNegativeCacheFailure('Something weird happened')).toBe(false);
  });
});
