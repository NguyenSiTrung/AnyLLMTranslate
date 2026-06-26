import { describe, it, expect, beforeEach } from 'vitest';
import { createCircuitBreaker } from '../circuitBreaker';

const NOW = 1_000_000;

describe('createCircuitBreaker', () => {
  let now: number;
  const clock = () => now;

  beforeEach(() => {
    now = NOW;
  });

  describe('healthy state (closed)', () => {
    it('a fresh slot is healthy (closed)', () => {
      const breaker = createCircuitBreaker({ clock });
      expect(breaker.isHealthy('k1', now)).toBe(true);
      expect(breaker.getState('k1').open).toBe(false);
    });

    it('a slot that never failed reports zero consecutive failures', () => {
      const breaker = createCircuitBreaker({ clock });
      expect(breaker.getState('k1').consecutiveFailures).toBe(0);
    });

    it('recordSuccess resets the consecutive-failure counter', () => {
      const breaker = createCircuitBreaker({ clock });
      breaker.recordFailure('k1', 'rateLimit', now);
      breaker.recordSuccess('k1');
      expect(breaker.getState('k1').consecutiveFailures).toBe(0);
      expect(breaker.isHealthy('k1', now)).toBe(true);
    });
  });

  describe('429 / 5xx / network → escalating cooldown', () => {
    it('first rateLimit failure opens the slot for the base cooldown (60s)', () => {
      const breaker = createCircuitBreaker({ clock });
      breaker.recordFailure('k1', 'rateLimit', now);
      const st = breaker.getState('k1');
      expect(st.open).toBe(true);
      expect(st.openUntil).toBe(now + 60_000);
      expect(st.credentialInvalid).toBe(false);
    });

    it('consecutive rateLimit failures escalate 60s → 120s → 300s (capped)', () => {
      const breaker = createCircuitBreaker({ clock });
      // 1st: 60s
      breaker.recordFailure('k1', 'rateLimit', now);
      expect(breaker.getState('k1').openUntil).toBe(now + 60_000);

      // 2nd: 120s (measured from a fresh now since the slot must still be open)
      breaker.recordFailure('k1', 'rateLimit', now + 10_000);
      expect(breaker.getState('k1').openUntil).toBe(now + 10_000 + 120_000);

      // 3rd: 300s (cap)
      breaker.recordFailure('k1', 'rateLimit', now + 20_000);
      expect(breaker.getState('k1').openUntil).toBe(now + 20_000 + 300_000);

      // 4th: stays at cap (300s)
      breaker.recordFailure('k1', 'rateLimit', now + 30_000);
      expect(breaker.getState('k1').openUntil).toBe(now + 30_000 + 300_000);
    });

    it('cooldown expires → slot auto-rejoins as healthy', () => {
      const breaker = createCircuitBreaker({ clock });
      breaker.recordFailure('k1', 'rateLimit', now); // open until +60s
      expect(breaker.isHealthy('k1', now)).toBe(false);
      expect(breaker.isHealthy('k1', now + 59_999)).toBe(false);
      expect(breaker.isHealthy('k1', now + 60_000)).toBe(true);
    });

    it('a successful call after cooldown resets the failure counter', () => {
      const breaker = createCircuitBreaker({ clock });
      breaker.recordFailure('k1', 'rateLimit', now);
      now += 60_000; // cooldown expires
      expect(breaker.isHealthy('k1', now)).toBe(true);
      // After expiry, recording a success should reset escalation.
      breaker.recordSuccess('k1');
      now += 5_000;
      breaker.recordFailure('k1', 'rateLimit', now);
      // Back to base 60s cooldown, not 120s.
      expect(breaker.getState('k1').openUntil).toBe(now + 60_000);
    });
  });

  describe('401 / 403 (auth) → long open + credentialInvalid', () => {
    it('auth failure opens for 1 hour and flags credentialInvalid', () => {
      const breaker = createCircuitBreaker({ clock });
      breaker.recordFailure('k1', 'auth', now);
      const st = breaker.getState('k1');
      expect(st.open).toBe(true);
      expect(st.openUntil).toBe(now + 60 * 60_000); // 1 hour
      expect(st.credentialInvalid).toBe(true);
    });

    it('repeated auth failures do not escalate beyond the long-open window', () => {
      const breaker = createCircuitBreaker({ clock });
      breaker.recordFailure('k1', 'auth', now);
      const firstOpenUntil = breaker.getState('k1').openUntil;
      breaker.recordFailure('k1', 'auth', now + 1_000);
      // Still 1h from the latest failure — auth is a fixed long-open.
      expect(breaker.getState('k1').openUntil).toBe(now + 1_000 + 60 * 60_000);
      expect(breaker.getState('k1').openUntil).not.toBe(firstOpenUntil);
    });

    it('credentialInvalid is cleared on recordSuccess', () => {
      const breaker = createCircuitBreaker({ clock });
      breaker.recordFailure('k1', 'auth', now);
      expect(breaker.getState('k1').credentialInvalid).toBe(true);
      breaker.recordSuccess('k1');
      expect(breaker.getState('k1').credentialInvalid).toBe(false);
    });
  });

  describe('other 4xx → no cooldown (request-specific)', () => {
    it('does not open the slot', () => {
      const breaker = createCircuitBreaker({ clock });
      breaker.recordFailure('k1', 'clientError', now);
      expect(breaker.getState('k1').open).toBe(false);
      expect(breaker.isHealthy('k1', now)).toBe(true);
    });

    it('does not increment the consecutive-failure counter', () => {
      const breaker = createCircuitBreaker({ clock });
      breaker.recordFailure('k1', 'rateLimit', now);
      const before = breaker.getState('k1').consecutiveFailures;
      breaker.recordFailure('k1', 'clientError', now);
      expect(breaker.getState('k1').consecutiveFailures).toBe(before);
    });
  });

  describe('multiple slots are isolated', () => {
    it('k1 opening does not affect k2', () => {
      const breaker = createCircuitBreaker({ clock });
      breaker.recordFailure('k1', 'rateLimit', now);
      expect(breaker.isHealthy('k1', now)).toBe(false);
      expect(breaker.isHealthy('k2', now)).toBe(true);
    });

    it('k1 auth-flag does not leak to k2', () => {
      const breaker = createCircuitBreaker({ clock });
      breaker.recordFailure('k1', 'auth', now);
      expect(breaker.getState('k2').credentialInvalid).toBe(false);
    });
  });

  describe('classifyFailure', () => {
    it('maps statusCode 429 → rateLimit', () => {
      const breaker = createCircuitBreaker({ clock });
      expect(breaker.classifyFailure(429)).toBe('rateLimit');
    });

    it('maps statusCode 500/502/503/504 → serverError', () => {
      const breaker = createCircuitBreaker({ clock });
      expect(breaker.classifyFailure(500)).toBe('serverError');
      expect(breaker.classifyFailure(503)).toBe('serverError');
    });

    it('maps statusCode 401/403 → auth', () => {
      const breaker = createCircuitBreaker({ clock });
      expect(breaker.classifyFailure(401)).toBe('auth');
      expect(breaker.classifyFailure(403)).toBe('auth');
    });

    it('maps other 4xx → clientError (no cooldown)', () => {
      const breaker = createCircuitBreaker({ clock });
      expect(breaker.classifyFailure(400)).toBe('clientError');
      expect(breaker.classifyFailure(404)).toBe('clientError');
    });

    it('maps network (undefined statusCode) → network', () => {
      const breaker = createCircuitBreaker({ clock });
      expect(breaker.classifyFailure(undefined)).toBe('network');
    });
  });

  describe('test hooks', () => {
    it('reset clears all slot state', () => {
      const breaker = createCircuitBreaker({ clock });
      breaker.recordFailure('k1', 'rateLimit', now);
      breaker.recordFailure('k2', 'auth', now);
      breaker.__resetForTest();
      expect(breaker.getState('k1').open).toBe(false);
      expect(breaker.getState('k2').open).toBe(false);
      expect(breaker.getState('k1').consecutiveFailures).toBe(0);
    });

    it('explicitly opening a slot works (for UI-driven disable)', () => {
      const breaker = createCircuitBreaker({ clock });
      breaker.openLong('k1', now + 999_999);
      expect(breaker.isHealthy('k1', now)).toBe(false);
    });
  });
});
