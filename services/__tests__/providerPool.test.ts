/**
 * Tests for ProviderPoolCoordinator — round-robin distribution + circuit-breaker
 * failover across multiple (provider, key) slots.
 *
 * Member services are stubbed via a factory so we can observe WHICH slot each
 * call dispatched to and inject failures (ApiError) to exercise failover.
 */

import { vi, describe, it, expect, beforeEach } from 'vitest';
import { ProviderPoolCoordinator, PoolExhaustedError } from '../providerPool';
import { ApiError } from '../openaiCompatible';
import type { TranslationService } from '../base';
import type { TranslationRequest, TranslationResult } from '@/types/translation';
import type { PageContext, PoolProvider, ExtensionSettings, ProviderConfig } from '@/types/config';
import type { ClassifyPdfParagraphsResult } from '@/types/messages';
import { DEFAULT_SETTINGS } from '@/types/config';

/** A controllable stub TranslationService used as a pool member. */
interface StubService extends TranslationService {
  keyId: string;
  /** Allow tests to force the next call's outcome. */
  nextOutcome:
    | { kind: 'success'; result: TranslationResult }
    | { kind: 'fail'; error: Error };
  callCount: number;
  /** The config the member currently holds. Updated by updateConfig and at
   *  construction, so tests can assert rebuild propagates changed config. */
  config: ProviderConfig;
  /** Every config handed to updateConfig (excludes the construction config). */
  updateConfigCalls: ProviderConfig[];
  updateConfig(config: ProviderConfig): void;
}

function makeStub(keyId: string, initialConfig: ProviderConfig): StubService {
  const stub: StubService = {
    keyId,
    nextOutcome: {
      kind: 'success',
      result: { success: true, translations: new Map([['id1', `from-${keyId}`]]) },
    },
    callCount: 0,
    config: initialConfig,
    updateConfigCalls: [],
    updateConfig(config: ProviderConfig) {
      stub.config = config;
      stub.updateConfigCalls.push(config);
    },
    async translate(_request: TranslationRequest) {
      stub.callCount++;
      if (stub.nextOutcome.kind === 'fail') throw stub.nextOutcome.error;
      return stub.nextOutcome.result;
    },
    async testConnection() {
      stub.callCount++;
      if (stub.nextOutcome.kind === 'fail') throw stub.nextOutcome.error;
      return { success: true };
    },
    async detectPageCategory(_pageContext: PageContext) {
      stub.callCount++;
      if (stub.nextOutcome.kind === 'fail') throw stub.nextOutcome.error;
      return { success: true, category: 'tech' };
    },
    async classifyPdfParagraphs(_paragraphs: Array<{ id: string; text: string }>) {
      stub.callCount++;
      if (stub.nextOutcome.kind === 'fail') throw stub.nextOutcome.error;
      return { success: true, labels: {} } as ClassifyPdfParagraphsResult;
    },
  };
  return stub;
}

function baseRequest(): TranslationRequest {
  return {
    texts: new Map([['id1', 'hello']]),
    sourceLanguage: 'auto',
    targetLanguage: 'vi',
  };
}

function twoKeySettings(): ExtensionSettings {
  const providers: PoolProvider[] = [
    {
      id: 'p1',
      displayName: 'P1',
      baseUrl: 'https://a/v1',
      model: 'm',
      requiresApiKey: true,
      temperature: 0.3,
      maxTokens: 4096,
      enabled: true,
      keys: [
        { id: 'k1', apiKey: 'sk-1', maxRpm: 0, enabled: true },
        { id: 'k2', apiKey: 'sk-2', maxRpm: 0, enabled: true },
      ],
    },
  ];
  return { ...DEFAULT_SETTINGS, providers };
}

/** Three keys under one provider — for cursor-fairness tests (FR-3, AC2). */
function threeKeySettings(): ExtensionSettings {
  const providers: PoolProvider[] = [
    {
      id: 'p1',
      displayName: 'P1',
      baseUrl: 'https://a/v1',
      model: 'm',
      requiresApiKey: true,
      temperature: 0.3,
      maxTokens: 4096,
      enabled: true,
      keys: [
        { id: 'k1', apiKey: 'sk-1', maxRpm: 0, enabled: true },
        { id: 'k2', apiKey: 'sk-2', maxRpm: 0, enabled: true },
        { id: 'k3', apiKey: 'sk-3', maxRpm: 0, enabled: true },
      ],
    },
  ];
  return { ...DEFAULT_SETTINGS, providers };
}

describe('ProviderPoolCoordinator', () => {
  let clockNow: number;
  let stubs: Map<string, StubService>;
  let factory: ReturnType<typeof vi.fn>;

  /** Set the next-outcome on a stub (avoids no-non-null-assertion lint). */
  const setOutcome = (keyId: string, outcome: StubService['nextOutcome']): void => {
    const stub = stubs.get(keyId);
    if (stub) stub.nextOutcome = outcome;
  };

  beforeEach(() => {
    clockNow = 1_000_000;
    stubs = new Map();
    factory = vi.fn(
      (config: ProviderConfig, identity: { keyId: string; providerId: string }) => {
        const s = makeStub(identity.keyId, config);
        stubs.set(identity.keyId, s);
        return s;
      },
    );
  });

  describe('rebuild + member ownership', () => {
    it('constructs one member service per enabled slot', () => {
      const coord = new ProviderPoolCoordinator({
        serviceFactory: factory,
        clock: () => clockNow,
      });
      coord.rebuild(twoKeySettings());

      expect(stubs.size).toBe(2);
      expect(stubs.has('k1')).toBe(true);
      expect(stubs.has('k2')).toBe(true);
    });

    it('rebuild preserves member instances for unchanged key ids (breaker state survives)', () => {
      const coord = new ProviderPoolCoordinator({
        serviceFactory: factory,
        clock: () => clockNow,
      });
      coord.rebuild(twoKeySettings());
      const k1Before = stubs.get('k1');

      // Rebuild with identical settings — member instances must be preserved.
      coord.rebuild(twoKeySettings());
      const k1After = stubs.get('k1');

      expect(k1After).toBe(k1Before);
      expect(factory).toHaveBeenCalledTimes(2); // not re-called for k1/k2
    });

    it('rebuild creates new members for new keys and drops removed ones', () => {
      const coord = new ProviderPoolCoordinator({
        serviceFactory: factory,
        clock: () => clockNow,
      });
      coord.rebuild(twoKeySettings());
      expect(factory).toHaveBeenCalledTimes(2); // k1 + k2 built

      // New settings: drop k2, add k3.
      const settings = twoKeySettings();
      const firstProvider = settings.providers[0];
      if (firstProvider) {
        firstProvider.keys = [
          { id: 'k1', apiKey: 'sk-1', maxRpm: 0, enabled: true },
          { id: 'k3', apiKey: 'sk-3', maxRpm: 0, enabled: true },
        ];
      }
      coord.rebuild(settings);

      // k1's member was preserved (factory not re-called for it); k3 is new.
      expect(factory).toHaveBeenCalledTimes(3); // k1 reused, only k3 newly built
      // k2 was dropped from the coordinator's pool — its key is gone from the
      // status map. (The test's `stubs` map is an accumulating instrumentation
      // log, NOT the source of truth for current membership.)
      expect(coord.getAllKeyStatuses()['k2']).toBeUndefined();
      expect(coord.getAllKeyStatuses()['k1']).toBeDefined();
      expect(coord.getAllKeyStatuses()['k3']).toBeDefined();
    });

    it('rebuild propagates changed config to a preserved member service (FR-6 live-reconfigure)', () => {
      // Regression for AnyLLMTranslate-bfw: when a provider's fields change but
      // its key id stays the same, the preserved member service must receive the
      // NEW config (e.g. a corrected baseUrl/apiKey/model). Otherwise the member
      // keeps dispatching with stale config — translation fails while a fresh
      // Test (built from the current UI state) succeeds.
      const coord = new ProviderPoolCoordinator({
        serviceFactory: factory,
        clock: () => clockNow,
      });
      coord.rebuild(twoKeySettings());
      const k1Before = stubs.get('k1');
      expect(k1Before?.config.baseUrl).toBe('https://a/v1');
      expect(k1Before?.config.apiKey).toBe('sk-1');

      // Same key ids, but k1's provider got a new baseUrl + apiKey.
      const updated = twoKeySettings();
      const firstProvider = updated.providers[0];
      if (firstProvider) {
        firstProvider.baseUrl = 'https://new-endpoint/v1';
        firstProvider.keys = [
          { id: 'k1', apiKey: 'sk-1-NEW', maxRpm: 0, enabled: true },
          { id: 'k2', apiKey: 'sk-2', maxRpm: 0, enabled: true },
        ];
      }
      coord.rebuild(updated);

      const k1After = stubs.get('k1');
      expect(k1After).toBe(k1Before); // member instance preserved
      expect(k1After?.updateConfigCalls).toHaveLength(1);
      expect(k1After?.config.baseUrl).toBe('https://new-endpoint/v1');
      expect(k1After?.config.apiKey).toBe('sk-1-NEW');
      expect(factory).toHaveBeenCalledTimes(2); // not re-constructed for k1/k2
    });
  });

  describe('empty pool', () => {
    it('translate throws a typed error when the pool is empty', async () => {
      const coord = new ProviderPoolCoordinator({
        serviceFactory: factory,
        clock: () => clockNow,
      });
      coord.rebuild({ ...DEFAULT_SETTINGS, providers: [] });

      await expect(coord.translate(baseRequest())).rejects.toThrow(/no.*pool|empty/i);
    });
  });

  describe('round-robin distribution', () => {
    it('alternates between the two keys across sequential translate calls', async () => {
      const coord = new ProviderPoolCoordinator({
        serviceFactory: factory,
        clock: () => clockNow,
      });
      coord.rebuild(twoKeySettings());

      const r1 = await coord.translate(baseRequest());
      const r2 = await coord.translate(baseRequest());
      const r3 = await coord.translate(baseRequest());

      // k1 → k2 → k1
      expect(r1.translations.get('id1')).toBe('from-k1');
      expect(r2.translations.get('id1')).toBe('from-k2');
      expect(r3.translations.get('id1')).toBe('from-k1');
      expect(stubs.get('k1')?.callCount).toBe(2);
      expect(stubs.get('k2')?.callCount).toBe(1);
    });
  });

  // FR-3 / AC2: cursor must index the HEALTHY pool's own space, not the full
  // slots array. Before the fix, dispatchWithFailover used
  // `healthy[cursor.next()]` where the cursor advanced in [0, slots.length) —
  // when any slot was open, healthy was shorter, indices misaligned, and the
  // `?? healthy[attempt % healthy.length]` fallback skewed distribution /
  // re-selected the same failing slot within one failover chain.
  describe('FR-3: cursor fairness when a slot is open', () => {
    /** Tag the result with the key that produced it so we can see distribution. */
    function keyOf(r: { translations: Map<string, string> }): string {
      const v = r.translations.get('id1') ?? '';
      return v.replace('from-', '');
    }

    it('distributes evenly across the 2 healthy slots when k1 is open (3-slot pool)', async () => {
      const coord = new ProviderPoolCoordinator({
        serviceFactory: factory,
        clock: () => clockNow,
      });
      coord.rebuild(threeKeySettings());

      // Open k1's breaker by making it fail a 429 once (FR-1 makes this work).
      setOutcome('k1', { kind: 'fail', error: new ApiError('429', 429) });
      // First translate: cursor lands on k1, it fails → failover to k2.
      // k1 is now open for the cooldown window.
      await coord.translate(baseRequest()).catch(() => null);
      expect(coord.getKeyStatus('k1').open).toBe(true);

      // Reset stubs so only the upcoming distribution counts.
      const resetStub = (keyId: string): void => {
        const s = stubs.get(keyId);
        if (s) s.callCount = 0;
      };
      resetStub('k1');
      resetStub('k2');
      resetStub('k3');

      // 4 sequential translates with k2/k3 healthy — must distribute evenly
      // across the 2 healthy slots (2 each), never touching k1, and never
      // repeating the same slot on consecutive requests (true round-robin).
      const seen: string[] = [];
      for (let i = 0; i < 4; i++) {
        const r = await coord.translate(baseRequest());
        seen.push(keyOf(r));
      }
      // Never dispatched to the open slot.
      expect(stubs.get('k1')?.callCount).toBe(0);
      // Even distribution: 2 each across k2 and k3.
      expect(stubs.get('k2')?.callCount).toBe(2);
      expect(stubs.get('k3')?.callCount).toBe(2);
      // No consecutive repeats within the rotation (FR-3 no-skew).
      for (let i = 1; i < seen.length; i++) {
        expect(seen[i]).not.toBe(seen[i - 1]);
      }
      // Only healthy slots were selected.
      expect(seen.every((k) => k === 'k2' || k === 'k3')).toBe(true);
    });

    it('never re-selects the same failing slot within one failover chain', async () => {
      // 3 slots, k1 fails with 429 on its first call. The failover chain must
      // walk to k2 (or k3) and succeed — it must NOT loop back to k1.
      const coord = new ProviderPoolCoordinator({
        serviceFactory: factory,
        clock: () => clockNow,
      });
      coord.rebuild(threeKeySettings());

      // Make k1 fail exactly once (counting the call), then succeed — so a
      // revisit would be detected by a SECOND k1 call count.
      let k1Failed = false;
      const k1Stub = stubs.get('k1');
      if (!k1Stub) throw new Error('k1 stub missing');
      k1Stub.translate = async () => {
        k1Stub.callCount++; // mirror the base stub's counter so the call is seen
        if (!k1Failed) {
          k1Failed = true;
          throw new ApiError('rate limited', 429);
        }
        return { success: true, translations: new Map([['id1', `from-k1`]]) };
      };

      // First request: cursor lands on k1, it fails, failover walks to the
      // next healthy slot and succeeds.
      const r1 = await coord.translate(baseRequest());
      expect(r1.success).toBe(true);
      // The result came from a slot OTHER than k1 (k2 or k3).
      expect(keyOf(r1)).not.toBe('k1');
      // k1 was hit exactly once (the failure), not revisited in the chain.
      expect(stubs.get('k1')?.callCount).toBe(1);
    });
  });

  describe('circuit-breaker failover', () => {
    it('on 429, opens the slot and fails over to the next healthy key', async () => {
      const coord = new ProviderPoolCoordinator({
        serviceFactory: factory,
        clock: () => clockNow,
      });
      coord.rebuild(twoKeySettings());

      // k1 returns 429 on its next call.
      setOutcome('k1', {
        kind: 'fail',
        error: new ApiError('rate limited', 429),
      });

      const result = await coord.translate(baseRequest());

      // k1 was tried (and failed), then k2 succeeded.
      expect(stubs.get('k1')?.callCount).toBe(1);
      expect(stubs.get('k2')?.callCount).toBe(1);
      expect(result.success).toBe(true);
      expect(result.translations.get('id1')).toBe('from-k2');

      // k1 is now open — the next request must skip it entirely.
      const result2 = await coord.translate(baseRequest());
      expect(stubs.get('k1')?.callCount).toBe(1); // not retried
      expect(stubs.get('k2')?.callCount).toBe(2);
      expect(result2.translations.get('id1')).toBe('from-k2');
    });

    it('on 5xx, opens the slot and fails over', async () => {
      const coord = new ProviderPoolCoordinator({
        serviceFactory: factory,
        clock: () => clockNow,
      });
      coord.rebuild(twoKeySettings());

      setOutcome('k1', {
        kind: 'fail',
        error: new ApiError('server error', 503),
      });

      const result = await coord.translate(baseRequest());
      expect(result.success).toBe(true);
      expect(result.translations.get('id1')).toBe('from-k2');
    });

    it('on 401 (auth), opens long and flags credentialInvalid', async () => {
      const coord = new ProviderPoolCoordinator({
        serviceFactory: factory,
        clock: () => clockNow,
      });
      coord.rebuild(twoKeySettings());

      setOutcome('k1', {
        kind: 'fail',
        error: new ApiError('unauthorized', 401),
      });

      const result = await coord.translate(baseRequest());
      expect(result.success).toBe(true);
      // k1 is flagged invalid.
      const status = coord.getKeyStatus('k1');
      expect(status.credentialInvalid).toBe(true);
      expect(status.open).toBe(true);
    });

    it('a cooled-down slot rejoins after the cooldown window', async () => {
      const coord = new ProviderPoolCoordinator({
        serviceFactory: factory,
        clock: () => clockNow,
      });
      coord.rebuild(twoKeySettings());

      setOutcome('k1', {
        kind: 'fail',
        error: new ApiError('rate limited', 429),
      });
      await coord.translate(baseRequest()); // k1 opens for 60s

      // Reset k1 to success.
      setOutcome('k1', {
        kind: 'success',
        result: { success: true, translations: new Map([['id1', 'from-k1']]) },
      });

      // Advance past the 60s cooldown.
      clockNow += 61_000;

      const result = await coord.translate(baseRequest());
      // k1 has rejoined and is the next slot in rotation.
      expect(stubs.get('k1')?.callCount).toBe(2);
      expect(result.translations.get('id1')).toBe('from-k1');
    });

    it('when ALL slots are open, translate throws the last error', async () => {
      const coord = new ProviderPoolCoordinator({
        serviceFactory: factory,
        clock: () => clockNow,
      });
      coord.rebuild(twoKeySettings());

      setOutcome('k1', {
        kind: 'fail',
        error: new ApiError('rate limited', 429),
      });
      setOutcome('k2', {
        kind: 'fail',
        error: new ApiError('server error', 500),
      });

      // FR-8 #11: lastError is always a non-null Error carrying a message.
      try {
        await coord.translate(baseRequest());
        throw new Error('expected translate to throw');
      } catch (error) {
        expect(error).toBeInstanceOf(PoolExhaustedError);
        const exhausted = error as PoolExhaustedError;
        expect(exhausted.lastError).toBeInstanceOf(Error);
        expect(exhausted.lastError.message).toBeTruthy();
        // Reading .lastError.message never throws (no null deref).
        expect(typeof exhausted.lastError.message).toBe('string');
      }
    });

    it('FR-8 #11: all-open-before-dispatch carries a non-null descriptive lastError', async () => {
      // Open BOTH breakers BEFORE any dispatch this request (no failure
      // observed in this call). lastError must still be a real Error.
      const coord = new ProviderPoolCoordinator({
        serviceFactory: factory,
        clock: () => clockNow,
      });
      coord.rebuild(twoKeySettings());

      // Fail both once to open their breakers.
      setOutcome('k1', { kind: 'fail', error: new ApiError('429', 429) });
      setOutcome('k2', { kind: 'fail', error: new ApiError('429', 429) });
      // First translate opens k1 (failover to k2 which also fails).
      await coord.translate(baseRequest()).catch(() => null);
      expect(coord.getKeyStatus('k1').open).toBe(true);
      expect(coord.getKeyStatus('k2').open).toBe(true);

      // Now BOTH are open before dispatch — no failure observed THIS request.
      setOutcome('k1', { kind: 'success', result: { success: true, translations: new Map([['id1', 'from-k1']]) } });
      setOutcome('k2', { kind: 'success', result: { success: true, translations: new Map([['id1', 'from-k2']]) } });

      try {
        await coord.translate(baseRequest());
        throw new Error('expected translate to throw');
      } catch (error) {
        expect(error).toBeInstanceOf(PoolExhaustedError);
        const exhausted = error as PoolExhaustedError;
        // Non-null descriptive Error — callers can safely read .message.
        expect(exhausted.lastError).toBeInstanceOf(Error);
        expect(exhausted.lastError.message.length).toBeGreaterThan(0);
      }
    });

    it('does NOT trip the breaker on a non-4xx-eligible request error (400 surfaces, no failover)', async () => {
      // Per FR-4: "Other 4xx → no cooldown (treated as request-specific); error
      // surfaces." A 400 is request-specific (bad prompt), so the coordinator
      // re-throws it immediately WITHOUT failing over to k2 and WITHOUT opening
      // k1's breaker. This is correct behavior — a 400 is not k1's fault.
      const coord = new ProviderPoolCoordinator({
        serviceFactory: factory,
        clock: () => clockNow,
      });
      coord.rebuild(twoKeySettings());

      setOutcome('k1', {
        kind: 'fail',
        error: new ApiError('bad request', 400),
      });

      // The 400 surfaces (no failover); k2 is never contacted.
      await expect(coord.translate(baseRequest())).rejects.toThrow(/bad request/);
      expect(stubs.get('k1')?.callCount).toBe(1);
      expect(stubs.get('k2')?.callCount).toBe(0);
      // k1 remains healthy — the breaker did not open.
      expect(coord.getKeyStatus('k1').open).toBe(false);
    });
  });

  describe('delegated methods', () => {
    it('testConnection routes through the round-robin path', async () => {
      const coord = new ProviderPoolCoordinator({
        serviceFactory: factory,
        clock: () => clockNow,
      });
      coord.rebuild(twoKeySettings());

      const r1 = await coord.testConnection();
      const r2 = await coord.testConnection();
      expect(r1.success).toBe(true);
      expect(r2.success).toBe(true);
      expect(stubs.get('k1')?.callCount).toBe(1);
      expect(stubs.get('k2')?.callCount).toBe(1);
    });

    it('testConnection can target a specific keyId (per-key test from UI)', async () => {
      const coord = new ProviderPoolCoordinator({
        serviceFactory: factory,
        clock: () => clockNow,
      });
      coord.rebuild(twoKeySettings());

      await coord.testConnection({ keyId: 'k2' });
      expect(stubs.get('k1')?.callCount).toBe(0);
      expect(stubs.get('k2')?.callCount).toBe(1);
    });

    it('testConnection on an unknown keyId reports failure', async () => {
      const coord = new ProviderPoolCoordinator({
        serviceFactory: factory,
        clock: () => clockNow,
      });
      coord.rebuild(twoKeySettings());

      const r = await coord.testConnection({ keyId: 'nope' });
      expect(r.success).toBe(false);
    });

    // FR-8 #12: a keyId-less testConnection must SKIP open (cooling) slots and
    // dispatch to a healthy one — it routes through dispatchWithFailover, which
    // filters to healthySlots, so a cooling slot is never tested.
    it('FR-8 #12: keyId-less testConnection skips open slots', async () => {
      const coord = new ProviderPoolCoordinator({
        serviceFactory: factory,
        clock: () => clockNow,
      });
      coord.rebuild(twoKeySettings());

      // Open k1's breaker (fail a 429).
      setOutcome('k1', { kind: 'fail', error: new ApiError('429', 429) });
      await coord.translate(baseRequest()).catch(() => null);
      expect(coord.getKeyStatus('k1').open).toBe(true);
      // Reset outcomes + call counts so only the testConnection counts.
      setOutcome('k1', { kind: 'success', result: { success: true, translations: new Map([['id1', 'from-k1']]) } });
      setOutcome('k2', { kind: 'success', result: { success: true } });
      const k1Stub = stubs.get('k1');
      const k2Stub = stubs.get('k2');
      if (k1Stub) k1Stub.callCount = 0;
      if (k2Stub) k2Stub.callCount = 0;

      const r = await coord.testConnection();
      expect(r.success).toBe(true);
      // k1 (open) was NOT tested; only a healthy slot was.
      expect(stubs.get('k1')?.callCount).toBe(0);
      expect(stubs.get('k2')?.callCount).toBe(1);
    });

    it('detectPageCategory delegates with failover', async () => {
      const coord = new ProviderPoolCoordinator({
        serviceFactory: factory,
        clock: () => clockNow,
      });
      coord.rebuild(twoKeySettings());

      setOutcome('k1', {
        kind: 'fail',
        error: new ApiError('rate limited', 429),
      });
      const r = await coord.detectPageCategory({ title: 't', description: 'd', domain: 'x.com' });
      expect(r.success).toBe(true);
      expect(r.category).toBe('tech');
      expect(stubs.get('k2')?.callCount).toBe(1);
    });

    it('classifyPdfParagraphs delegates with failover', async () => {
      const coord = new ProviderPoolCoordinator({
        serviceFactory: factory,
        clock: () => clockNow,
      });
      coord.rebuild(twoKeySettings());

      setOutcome('k1', {
        kind: 'fail',
        error: new ApiError('rate limited', 429),
      });
      const r = await coord.classifyPdfParagraphs([{ id: 'p1', text: 'hi' }]);
      expect(r.success).toBe(true);
      expect(stubs.get('k2')?.callCount).toBe(1);
    });
  });

  describe('getKeyStatus (UI badge source)', () => {
    it('returns healthy state for a key that never failed', () => {
      const coord = new ProviderPoolCoordinator({
        serviceFactory: factory,
        clock: () => clockNow,
      });
      coord.rebuild(twoKeySettings());
      const st = coord.getKeyStatus('k1');
      expect(st.open).toBe(false);
      expect(st.credentialInvalid).toBe(false);
    });

    it('returns disabled for a key that is not enabled', () => {
      const settings = twoKeySettings();
      const key = settings.providers[0]?.keys[0];
      if (key) key.enabled = false;
      const coord = new ProviderPoolCoordinator({
        serviceFactory: factory,
        clock: () => clockNow,
      });
      coord.rebuild(settings);
      expect(coord.getKeyStatus('k1').disabled).toBe(true);
    });

    it('exposes all key statuses for the UI', () => {
      const coord = new ProviderPoolCoordinator({
        serviceFactory: factory,
        clock: () => clockNow,
      });
      coord.rebuild(twoKeySettings());
      const all = coord.getAllKeyStatuses();
      expect(Object.keys(all).sort()).toEqual(['k1', 'k2']);
    });
  });
});
