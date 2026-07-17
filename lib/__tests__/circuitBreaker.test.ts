import { describe, it, expect, beforeEach } from 'vitest';
import { createCircuitBreaker } from '../circuitBreaker';

const NOW = 1_000_000;

describe('createCircuitBreaker', () => {
  let now: number;
  const clock = () => now;

  beforeEach(() => {
    now = NOW;
  });

  it('health, rateLimit escalation, auth, clientError, isolation, and classify', () => {
    const breaker = createCircuitBreaker({ clock });
    expect(breaker.isHealthy('k1', now)).toBe(true);
    expect(breaker.getState('k1').consecutiveFailures).toBe(0);
    breaker.recordFailure('k1', 'rateLimit', now);
    breaker.recordSuccess('k1');
    expect(breaker.getState('k1').consecutiveFailures).toBe(0);
    expect(breaker.isHealthy('k1', now)).toBe(true);

    breaker.recordFailure('k1', 'rateLimit', now);
    expect(breaker.getState('k1').openUntil).toBe(now + 60_000);
    expect(breaker.isHealthy('k1', now)).toBe(false);
    breaker.recordFailure('k1', 'rateLimit', now + 10_000);
    expect(breaker.getState('k1').openUntil).toBe(now + 10_000 + 120_000);
    breaker.recordFailure('k1', 'rateLimit', now + 20_000);
    expect(breaker.getState('k1').openUntil).toBe(now + 20_000 + 300_000);
    breaker.recordFailure('k1', 'rateLimit', now + 30_000);
    expect(breaker.getState('k1').openUntil).toBe(now + 30_000 + 300_000);
    expect(breaker.isHealthy('k1', now + 30_000 + 300_000)).toBe(true);
    breaker.recordSuccess('k1');
    breaker.recordFailure('k1', 'rateLimit', now + 30_000 + 300_000 + 5_000);
    expect(breaker.getState('k1').openUntil).toBe(now + 30_000 + 300_000 + 5_000 + 60_000);

    const auth = createCircuitBreaker({ clock });
    auth.recordFailure('k1', 'auth', now);
    expect(auth.getState('k1').openUntil).toBe(now + 60 * 60_000);
    expect(auth.getState('k1').credentialInvalid).toBe(true);
    auth.recordFailure('k1', 'auth', now + 1_000);
    expect(auth.getState('k1').openUntil).toBe(now + 1_000 + 60 * 60_000);
    auth.recordSuccess('k1');
    expect(auth.getState('k1').credentialInvalid).toBe(false);

    const client = createCircuitBreaker({ clock });
    client.recordFailure('k1', 'rateLimit', now);
    const before = client.getState('k1').consecutiveFailures;
    client.recordFailure('k1', 'clientError', now);
    expect(client.getState('k1').consecutiveFailures).toBe(before);
    const b2 = createCircuitBreaker({ clock });
    b2.recordFailure('k2', 'clientError', now);
    expect(b2.isHealthy('k2', now)).toBe(true);

    const iso = createCircuitBreaker({ clock });
    iso.recordFailure('k1', 'rateLimit', now);
    iso.recordFailure('k1', 'auth', now);
    expect(iso.isHealthy('k2', now)).toBe(true);
    expect(iso.getState('k2').credentialInvalid).toBe(false);
    expect(iso.classifyFailure(429)).toBe('rateLimit');
    expect(iso.classifyFailure(503)).toBe('serverError');
    expect(iso.classifyFailure(401)).toBe('auth');
    expect(iso.classifyFailure(404)).toBe('clientError');
    expect(iso.classifyFailure(undefined)).toBe('network');
    iso.__resetForTest();
    expect(iso.getState('k1').open).toBe(false);
    iso.openLong('k1', now + 999_999);
    expect(iso.isHealthy('k1', now)).toBe(false);
  });
});
