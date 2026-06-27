/**
 * Tests for ProviderPoolCoordinator — round-robin distribution + circuit-breaker
 * failover across multiple (provider, key) slots.
 *
 * Member services are stubbed via a factory so we can observe WHICH slot each
 * call dispatched to and inject failures (ApiError) to exercise failover.
 */

import { vi, describe, it, expect, beforeEach } from 'vitest';
import { ProviderPoolCoordinator } from '../providerPool';
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

      await expect(coord.translate(baseRequest())).rejects.toThrow();
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
