import { describe, it, expect, beforeEach } from 'vitest';
import { createCircuitBreaker } from '../circuitBreaker';

const NOW = 1_000_000;

describe('createCircuitBreaker', () => {
  let now: number;
  const clock = () => now;

  beforeEach(() => {
    now = NOW;
  });

  it('starts healthy and resets consecutive failures on success', () => {
    const breaker = createCircuitBreaker({ clock });
    expect(breaker.isHealthy('k1', now)).toBe(true);
    expect(breaker.getState('k1').consecutiveFailures).toBe(0);
    breaker.recordFailure('k1', 'rateLimit', now);
    breaker.recordSuccess('k1');
    expect(breaker.getState('k1').consecutiveFailures).toBe(0);
    expect(breaker.isHealthy('k1', now)).toBe(true);
  });

  it('escalates rateLimit cooldown 60s → 120s → 300s and auto-rejoins after expiry', () => {
    const breaker = createCircuitBreaker({ clock });
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
  });

  it('auth failures open for 1h with credentialInvalid (cleared on success)', () => {
    const breaker = createCircuitBreaker({ clock });
    breaker.recordFailure('k1', 'auth', now);
    expect(breaker.getState('k1').openUntil).toBe(now + 60 * 60_000);
    expect(breaker.getState('k1').credentialInvalid).toBe(true);
    breaker.recordFailure('k1', 'auth', now + 1_000);
    expect(breaker.getState('k1').openUntil).toBe(now + 1_000 + 60 * 60_000);
    breaker.recordSuccess('k1');
    expect(breaker.getState('k1').credentialInvalid).toBe(false);
  });

  it('clientError does not open the slot or escalate failures', () => {
    const breaker = createCircuitBreaker({ clock });
    breaker.recordFailure('k1', 'rateLimit', now);
    const before = breaker.getState('k1').consecutiveFailures;
    breaker.recordFailure('k1', 'clientError', now);
    expect(breaker.getState('k1').consecutiveFailures).toBe(before);
    const b2 = createCircuitBreaker({ clock });
    b2.recordFailure('k2', 'clientError', now);
    expect(b2.isHealthy('k2', now)).toBe(true);
  });

  it('isolates slots and supports classifyFailure + test hooks', () => {
    const breaker = createCircuitBreaker({ clock });
    breaker.recordFailure('k1', 'rateLimit', now);
    breaker.recordFailure('k1', 'auth', now);
    expect(breaker.isHealthy('k2', now)).toBe(true);
    expect(breaker.getState('k2').credentialInvalid).toBe(false);

    expect(breaker.classifyFailure(429)).toBe('rateLimit');
    expect(breaker.classifyFailure(503)).toBe('serverError');
    expect(breaker.classifyFailure(401)).toBe('auth');
    expect(breaker.classifyFailure(404)).toBe('clientError');
    expect(breaker.classifyFailure(undefined)).toBe('network');

    breaker.__resetForTest();
    expect(breaker.getState('k1').open).toBe(false);
    breaker.openLong('k1', now + 999_999);
    expect(breaker.isHealthy('k1', now)).toBe(false);
  });
});
