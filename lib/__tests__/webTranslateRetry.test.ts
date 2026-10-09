import { describe, expect, it } from 'vitest';
import { isProviderPauseError, isRetryableWebTranslationError } from '../webTranslateRetry';
import { isTransientTranslationError } from '../translationErrors';

const AUTH_OR_QUOTA = [
  'HTTP 401 Unauthorized',
  'Request failed with status 403',
  'Forbidden',
  'Invalid API key provided: sk-****',
  'Incorrect API key provided',
  'You exceeded your current quota, please check your plan and billing details.',
  'insufficient_quota',
  'Billing hard limit has been reached',
  'Payment required (402)',
  'All providers failed: 401 Unauthorized',
];

const RETRYABLE = [
  'HTTP 429 Too Many Requests',
  'Rate limit reached for requests',
  '503 Service Unavailable',
  'Bad gateway',
  '500 Internal Server Error',
  'Request timeout (408)',
  'Request timed out',
  'Failed to fetch',
  'network error',
  'Failed to parse translation response',
  'Empty response from provider',
  'Provider pool exhausted: all providers failed',
  'Model is overloaded, try again later',
];

describe('isRetryableWebTranslationError (FR-10)', () => {
  it.each(RETRYABLE)('retries %s', (error) => {
    expect(isRetryableWebTranslationError(error)).toBe(true);
  });

  it.each(AUTH_OR_QUOTA)('never retries %s', (error) => {
    expect(isRetryableWebTranslationError(error)).toBe(false);
  });

  it('does not retry text-scoped or unknown failures', () => {
    expect(isRetryableWebTranslationError('Content blocked by policy')).toBe(false);
    expect(isRetryableWebTranslationError('400 Bad Request: context length exceeded')).toBe(false);
    expect(isRetryableWebTranslationError('')).toBe(false);
  });

  it('leaves the negative-cache classifier unchanged (auth/quota stay transient there)', () => {
    expect(isTransientTranslationError('HTTP 401 Unauthorized')).toBe(true);
    expect(isTransientTranslationError('insufficient quota')).toBe(true);
  });
});

describe('isProviderPauseError (FR-10)', () => {
  it.each(AUTH_OR_QUOTA)('pauses on %s', (error) => {
    expect(isProviderPauseError(error)).toBe(true);
  });

  it('pauses on pool exhaustion and rate limits, not on single transient blips', () => {
    expect(isProviderPauseError('Provider pool exhausted: all providers failed')).toBe(true);
    expect(isProviderPauseError('Rate limit reached')).toBe(true);
    expect(isProviderPauseError('503 Service Unavailable')).toBe(false);
    expect(isProviderPauseError('Request timed out')).toBe(false);
    expect(isProviderPauseError('Content blocked by policy')).toBe(false);
  });
});
