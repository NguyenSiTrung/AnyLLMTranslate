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
  /** Optional: pool sets same-key 429 retry budget before dispatch. */
  setMax429Retries?(n?: number | null): void;
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
        { id: 'k1', apiKey: 'sk-1', maxRpm: 0, concurrencyLimit: 0, interval: 0,enabled: true },
        { id: 'k2', apiKey: 'sk-2', maxRpm: 0, concurrencyLimit: 0, interval: 0,enabled: true },
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
        { id: 'k1', apiKey: 'sk-1', maxRpm: 0, concurrencyLimit: 0, interval: 0,enabled: true },
        { id: 'k2', apiKey: 'sk-2', maxRpm: 0, concurrencyLimit: 0, interval: 0,enabled: true },
        { id: 'k3', apiKey: 'sk-3', maxRpm: 0, concurrencyLimit: 0, interval: 0,enabled: true },
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
      (
        config: ProviderConfig,
        identity: { keyId: string; providerId: string; slotId?: string },
      ) => {
        const id = identity.slotId ?? identity.keyId;
        const s = makeStub(id, config);
        stubs.set(id, s);
        return s;
      },
    );
  });

  describe('rebuild + member ownership', () => {
    it('constructs, preserves, adds/drops, and live-reconfigures members', () => {
      const coord = new ProviderPoolCoordinator({
        serviceFactory: factory,
        clock: () => clockNow,
      });
      coord.rebuild(twoKeySettings());
      expect(stubs.size).toBe(2);
      expect(stubs.has('k1')).toBe(true);
      expect(stubs.has('k2')).toBe(true);

      const k1Before = stubs.get('k1');
      coord.rebuild(twoKeySettings());
      expect(stubs.get('k1')).toBe(k1Before);
      expect(factory).toHaveBeenCalledTimes(2);

      // Drop k2, add k3.
      const settings = twoKeySettings();
      const firstProvider = settings.providers[0];
      if (firstProvider) {
        firstProvider.keys = [
          { id: 'k1', apiKey: 'sk-1', maxRpm: 0, concurrencyLimit: 0, interval: 0, enabled: true },
          { id: 'k3', apiKey: 'sk-3', maxRpm: 0, concurrencyLimit: 0, interval: 0, enabled: true },
        ];
      }
      coord.rebuild(settings);
      expect(factory).toHaveBeenCalledTimes(3);
      expect(coord.getAllKeyStatuses()['k2']).toBeUndefined();
      expect(coord.getAllKeyStatuses()['k1']).toBeDefined();
      expect(coord.getAllKeyStatuses()['k3']).toBeDefined();

      // Fresh pool for FR-6 live-reconfigure.
      stubs.clear();
      factory.mockClear();
      const coord2 = new ProviderPoolCoordinator({
        serviceFactory: factory,
        clock: () => clockNow,
      });
      coord2.rebuild(twoKeySettings());
      const k1Live = stubs.get('k1');
      expect(k1Live?.config.baseUrl).toBe('https://a/v1');
      const updated = twoKeySettings();
      const updatedProvider = updated.providers[0];
      if (updatedProvider) {
        updatedProvider.baseUrl = 'https://new-endpoint/v1';
        updatedProvider.keys = [
          { id: 'k1', apiKey: 'sk-1-NEW', maxRpm: 0, concurrencyLimit: 0, interval: 0, enabled: true },
          { id: 'k2', apiKey: 'sk-2', maxRpm: 0, concurrencyLimit: 0, interval: 0, enabled: true },
        ];
      }
      coord2.rebuild(updated);
      const k1After = stubs.get('k1');
      expect(k1After).toBe(k1Live);
      expect(k1After?.updateConfigCalls).toHaveLength(1);
      expect(k1After?.config.baseUrl).toBe('https://new-endpoint/v1');
      expect(k1After?.config.apiKey).toBe('sk-1-NEW');
      expect(factory).toHaveBeenCalledTimes(2);
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

    it('even distribution across healthy slots and no re-select in failover chain', async () => {
      const coord = new ProviderPoolCoordinator({
        serviceFactory: factory,
        clock: () => clockNow,
      });
      coord.rebuild(threeKeySettings());

      setOutcome('k1', { kind: 'fail', error: new ApiError('429', 429) });
      await coord.translate(baseRequest()).catch(() => null);
      expect(coord.getKeyStatus('k1').open).toBe(true);

      const resetStub = (keyId: string): void => {
        const s = stubs.get(keyId);
        if (s) s.callCount = 0;
      };
      resetStub('k1');
      resetStub('k2');
      resetStub('k3');

      const seen: string[] = [];
      for (let i = 0; i < 4; i++) {
        const r = await coord.translate(baseRequest());
        seen.push(keyOf(r));
      }
      expect(stubs.get('k1')?.callCount).toBe(0);
      expect(stubs.get('k2')?.callCount).toBe(2);
      expect(stubs.get('k3')?.callCount).toBe(2);
      for (let i = 1; i < seen.length; i++) {
        expect(seen[i]).not.toBe(seen[i - 1]);
      }
      expect(seen.every((k) => k === 'k2' || k === 'k3')).toBe(true);

      // Fresh pool: never re-select failing slot within one chain.
      stubs.clear();
      factory.mockClear();
      const coord2 = new ProviderPoolCoordinator({
        serviceFactory: factory,
        clock: () => clockNow,
      });
      coord2.rebuild(threeKeySettings());
      let k1Failed = false;
      const k1Stub = stubs.get('k1');
      if (!k1Stub) throw new Error('k1 stub missing');
      k1Stub.translate = async () => {
        k1Stub.callCount++;
        if (!k1Failed) {
          k1Failed = true;
          throw new ApiError('rate limited', 429);
        }
        return { success: true, translations: new Map([['id1', `from-k1`]]) };
      };
      const r1 = await coord2.translate(baseRequest());
      expect(r1.success).toBe(true);
      expect(keyOf(r1)).not.toBe('k1');
      expect(stubs.get('k1')?.callCount).toBe(1);
    });
  });

  describe('circuit-breaker failover', () => {
    it('429/5xx/401 failover, cooldown rejoin, and 400 no-trip', async () => {
      const coord = new ProviderPoolCoordinator({
        serviceFactory: factory,
        clock: () => clockNow,
      });
      coord.rebuild(twoKeySettings());

      setOutcome('k1', { kind: 'fail', error: new ApiError('rate limited', 429) });
      const result = await coord.translate(baseRequest());
      expect(stubs.get('k1')?.callCount).toBe(1);
      expect(stubs.get('k2')?.callCount).toBe(1);
      expect(result.success).toBe(true);
      expect(result.translations.get('id1')).toBe('from-k2');
      const result2 = await coord.translate(baseRequest());
      expect(stubs.get('k1')?.callCount).toBe(1);
      expect(stubs.get('k2')?.callCount).toBe(2);
      expect(result2.translations.get('id1')).toBe('from-k2');

      // Fresh pool for 5xx.
      stubs.clear();
      factory.mockClear();
      const coord5xx = new ProviderPoolCoordinator({
        serviceFactory: factory,
        clock: () => clockNow,
      });
      coord5xx.rebuild(twoKeySettings());
      setOutcome('k1', { kind: 'fail', error: new ApiError('server error', 503) });
      const r5 = await coord5xx.translate(baseRequest());
      expect(r5.success).toBe(true);
      expect(r5.translations.get('id1')).toBe('from-k2');

      // Auth.
      stubs.clear();
      factory.mockClear();
      const coordAuth = new ProviderPoolCoordinator({
        serviceFactory: factory,
        clock: () => clockNow,
      });
      coordAuth.rebuild(twoKeySettings());
      setOutcome('k1', { kind: 'fail', error: new ApiError('unauthorized', 401) });
      const rAuth = await coordAuth.translate(baseRequest());
      expect(rAuth.success).toBe(true);
      expect(coordAuth.getKeyStatus('k1').credentialInvalid).toBe(true);
      expect(coordAuth.getKeyStatus('k1').open).toBe(true);

      // Cooldown rejoin.
      stubs.clear();
      factory.mockClear();
      clockNow = 1_000_000;
      const coordCool = new ProviderPoolCoordinator({
        serviceFactory: factory,
        clock: () => clockNow,
      });
      coordCool.rebuild(twoKeySettings());
      setOutcome('k1', { kind: 'fail', error: new ApiError('rate limited', 429) });
      await coordCool.translate(baseRequest());
      setOutcome('k1', {
        kind: 'success',
        result: { success: true, translations: new Map([['id1', 'from-k1']]) },
      });
      clockNow += 61_000;
      const rCool = await coordCool.translate(baseRequest());
      expect(stubs.get('k1')?.callCount).toBe(2);
      expect(rCool.translations.get('id1')).toBe('from-k1');

      // 400 surfaces without failover.
      stubs.clear();
      factory.mockClear();
      const coord400 = new ProviderPoolCoordinator({
        serviceFactory: factory,
        clock: () => clockNow,
      });
      coord400.rebuild(twoKeySettings());
      setOutcome('k1', { kind: 'fail', error: new ApiError('bad request', 400) });
      await expect(coord400.translate(baseRequest())).rejects.toThrow(/bad request/);
      expect(stubs.get('k1')?.callCount).toBe(1);
      expect(stubs.get('k2')?.callCount).toBe(0);
      expect(coord400.getKeyStatus('k1').open).toBe(false);
    });

    it('all-open throws PoolExhaustedError with descriptive lastError (during and before dispatch)', async () => {
      const coord = new ProviderPoolCoordinator({
        serviceFactory: factory,
        clock: () => clockNow,
      });
      coord.rebuild(twoKeySettings());
      setOutcome('k1', { kind: 'fail', error: new ApiError('rate limited', 429) });
      setOutcome('k2', { kind: 'fail', error: new ApiError('server error', 500) });
      try {
        await coord.translate(baseRequest());
        throw new Error('expected translate to throw');
      } catch (error) {
        expect(error).toBeInstanceOf(PoolExhaustedError);
        const exhausted = error as PoolExhaustedError;
        expect(exhausted.lastError).toBeInstanceOf(Error);
        expect(exhausted.lastError.message).toBeTruthy();
        expect(typeof exhausted.lastError.message).toBe('string');
      }

      stubs.clear();
      factory.mockClear();
      const coord2 = new ProviderPoolCoordinator({
        serviceFactory: factory,
        clock: () => clockNow,
      });
      coord2.rebuild(twoKeySettings());
      setOutcome('k1', { kind: 'fail', error: new ApiError('429', 429) });
      setOutcome('k2', { kind: 'fail', error: new ApiError('429', 429) });
      await coord2.translate(baseRequest()).catch(() => null);
      expect(coord2.getKeyStatus('k1').open).toBe(true);
      expect(coord2.getKeyStatus('k2').open).toBe(true);
      setOutcome('k1', {
        kind: 'success',
        result: { success: true, translations: new Map([['id1', 'from-k1']]) },
      });
      setOutcome('k2', {
        kind: 'success',
        result: { success: true, translations: new Map([['id1', 'from-k2']]) },
      });
      try {
        await coord2.translate(baseRequest());
        throw new Error('expected translate to throw');
      } catch (error) {
        expect(error).toBeInstanceOf(PoolExhaustedError);
        const exhausted = error as PoolExhaustedError;
        expect(exhausted.lastError).toBeInstanceOf(Error);
        expect(exhausted.lastError.message.length).toBeGreaterThan(0);
        expect(exhausted.openUntil).toBeDefined();
        expect(exhausted.openUntil!).toBeGreaterThan(clockNow);
        expect(exhausted.openUntil).toBe(coord2.getKeyStatus('k1').openUntil);
      }
    });
  });

  describe('delegated methods + getKeyStatus', () => {
    it('testConnection round-robin, keyId target, unknown, and skips open slots', async () => {
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

      stubs.clear();
      factory.mockClear();
      const coord2 = new ProviderPoolCoordinator({
        serviceFactory: factory,
        clock: () => clockNow,
      });
      coord2.rebuild(twoKeySettings());
      await coord2.testConnection({ keyId: 'k2' });
      expect(stubs.get('k1')?.callCount).toBe(0);
      expect(stubs.get('k2')?.callCount).toBe(1);
      expect((await coord2.testConnection({ keyId: 'nope' })).success).toBe(false);

      stubs.clear();
      factory.mockClear();
      const coord3 = new ProviderPoolCoordinator({
        serviceFactory: factory,
        clock: () => clockNow,
      });
      coord3.rebuild(twoKeySettings());
      setOutcome('k1', { kind: 'fail', error: new ApiError('429', 429) });
      await coord3.translate(baseRequest()).catch(() => null);
      expect(coord3.getKeyStatus('k1').open).toBe(true);
      setOutcome('k1', {
        kind: 'success',
        result: { success: true, translations: new Map([['id1', 'from-k1']]) },
      });
      setOutcome('k2', {
        kind: 'success',
        result: { success: true, translations: new Map([['id1', 'from-k2']]) },
      });
      const k1Stub = stubs.get('k1');
      const k2Stub = stubs.get('k2');
      if (k1Stub) k1Stub.callCount = 0;
      if (k2Stub) k2Stub.callCount = 0;
      const r = await coord3.testConnection();
      expect(r.success).toBe(true);
      expect(stubs.get('k1')?.callCount).toBe(0);
      expect(stubs.get('k2')?.callCount).toBe(1);
    });

    it('detectPageCategory/classifyPdfParagraphs failover and key status badges', async () => {
      const coord = new ProviderPoolCoordinator({
        serviceFactory: factory,
        clock: () => clockNow,
      });
      coord.rebuild(twoKeySettings());
      setOutcome('k1', { kind: 'fail', error: new ApiError('rate limited', 429) });
      const cat = await coord.detectPageCategory({ title: 't', description: 'd', domain: 'x.com' });
      expect(cat.success).toBe(true);
      expect(cat.category).toBe('tech');
      expect(stubs.get('k2')?.callCount).toBe(1);

      stubs.clear();
      factory.mockClear();
      const coord2 = new ProviderPoolCoordinator({
        serviceFactory: factory,
        clock: () => clockNow,
      });
      coord2.rebuild(twoKeySettings());
      setOutcome('k1', { kind: 'fail', error: new ApiError('rate limited', 429) });
      const pdf = await coord2.classifyPdfParagraphs([{ id: 'p1', text: 'hi' }]);
      expect(pdf.success).toBe(true);
      expect(stubs.get('k2')?.callCount).toBe(1);

      stubs.clear();
      factory.mockClear();
      const coord3 = new ProviderPoolCoordinator({
        serviceFactory: factory,
        clock: () => clockNow,
      });
      coord3.rebuild(twoKeySettings());
      const st = coord3.getKeyStatus('k1');
      expect(st.open).toBe(false);
      expect(st.credentialInvalid).toBe(false);
      expect(Object.keys(coord3.getAllKeyStatuses()).sort()).toEqual(['k1', 'k2']);

      const settings = twoKeySettings();
      const key = settings.providers[0]?.keys[0];
      if (key) key.enabled = false;
      const coord4 = new ProviderPoolCoordinator({
        serviceFactory: factory,
        clock: () => clockNow,
      });
      coord4.rebuild(settings);
      expect(coord4.getKeyStatus('k1').disabled).toBe(true);
    });
  });

  describe('FR-5: per-key concurrencyLimit + throttle interval', () => {
    /** Build settings with a single key carrying the given concurrencyLimit + interval. */
    function singleKeySettings(concurrencyLimit: number, interval: number): ExtensionSettings {
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
          keys: [{ id: 'k1', apiKey: 'sk-1', maxRpm: 0, concurrencyLimit, interval, enabled: true }],
        },
      ];
      return { ...DEFAULT_SETTINGS, providers };
    }

    it('throttle interval, concurrency cap, and slot release on failure', async () => {
      const delays0: number[] = [];
      const coord0 = new ProviderPoolCoordinator({
        serviceFactory: factory,
        clock: () => clockNow,
        delay: (ms) => {
          delays0.push(ms);
          return Promise.resolve();
        },
      });
      coord0.rebuild(singleKeySettings(0, 0));
      await coord0.translate({
        texts: new Map([['id1', 't']]),
        targetLanguage: 'vi',
        sourceLanguage: 'en',
      });
      expect(delays0).toEqual([]);

      stubs.clear();
      factory.mockClear();
      const delays: number[] = [];
      let tick = 1000;
      const coord = new ProviderPoolCoordinator({
        serviceFactory: factory,
        clock: () => tick,
        delay: (ms) => {
          delays.push(ms);
          tick += ms;
          return Promise.resolve();
        },
      });
      coord.rebuild(singleKeySettings(0, 200));
      await coord.translate({
        texts: new Map([['id1', 'a']]),
        targetLanguage: 'vi',
        sourceLanguage: 'en',
      });
      await coord.translate({
        texts: new Map([['id1', 'b']]),
        targetLanguage: 'vi',
        sourceLanguage: 'en',
      });
      expect(delays.length).toBeGreaterThanOrEqual(1);
      expect(delays.every((d) => d > 0 && d <= 200)).toBe(true);

      stubs.clear();
      factory.mockClear();
      const coordCap = new ProviderPoolCoordinator({
        serviceFactory: factory,
        clock: () => clockNow,
      });
      coordCap.rebuild(singleKeySettings(1, 0));
      const k1 = stubs.get('k1');
      if (!k1) throw new Error('stub k1 not found');
      let releaseFirst: () => void = () => {};
      const firstBlocked = new Promise<void>((resolve) => {
        releaseFirst = resolve;
      });
      let firstCallStarted = false;
      const callOrder: string[] = [];
      k1.translate = async () => {
        callOrder.push('start');
        if (!firstCallStarted) {
          firstCallStarted = true;
          await firstBlocked;
        }
        callOrder.push('end');
        return { success: true, translations: new Map([['id1', 'x']]) };
      };
      const first = coordCap.translate({
        texts: new Map([['id1', 'a']]),
        targetLanguage: 'vi',
        sourceLanguage: 'en',
      });
      await Promise.resolve();
      await Promise.resolve();
      const second = coordCap.translate({
        texts: new Map([['id1', 'b']]),
        targetLanguage: 'vi',
        sourceLanguage: 'en',
      });
      await Promise.resolve();
      await Promise.resolve();
      expect(callOrder.filter((c) => c === 'start')).toHaveLength(1);
      releaseFirst();
      await first;
      await second;
      expect(callOrder.filter((c) => c === 'end')).toHaveLength(2);

      stubs.clear();
      factory.mockClear();
      const coordFail = new ProviderPoolCoordinator({
        serviceFactory: factory,
        clock: () => clockNow,
      });
      coordFail.rebuild(singleKeySettings(1, 0));
      const k1b = stubs.get('k1');
      if (!k1b) throw new Error('stub k1 not found');
      k1b.nextOutcome = { kind: 'fail', error: new ApiError('bad request', 400) };
      await expect(
        coordFail.translate({
          texts: new Map([['id1', 'a']]),
          targetLanguage: 'vi',
          sourceLanguage: 'en',
        }),
      ).rejects.toThrow();
      k1b.nextOutcome = {
        kind: 'success',
        result: { success: true, translations: new Map([['id1', 'ok']]) },
      };
      const result = await coordFail.translate({
        texts: new Map([['id1', 'b']]),
        targetLanguage: 'vi',
        sourceLanguage: 'en',
      });
      expect(result.success).toBe(true);
    });
  });

  describe('skip saturated keys (load-spread)', () => {
    function twoKeyConcurrency(limit: number): ExtensionSettings {
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
            { id: 'k1', apiKey: 'sk-1', maxRpm: 0, concurrencyLimit: limit, interval: 0, enabled: true },
            { id: 'k2', apiKey: 'sk-2', maxRpm: 0, concurrencyLimit: limit, interval: 0, enabled: true },
          ],
        },
      ];
      return { ...DEFAULT_SETTINGS, providers };
    }

    it('skips a busy key and uses a free sibling instead of queuing', async () => {
      // Scenario: k1 held by req1; req2 uses k2 and finishes; req3's RR lands on
      // busy k1 — must skip to free k2 rather than queue behind k1.
      const coord = new ProviderPoolCoordinator({
        serviceFactory: factory,
        clock: () => clockNow,
      });
      coord.rebuild(twoKeyConcurrency(1));

      const k1 = stubs.get('k1');
      const k2 = stubs.get('k2');
      if (!k1 || !k2) throw new Error('stubs missing');

      let releaseK1: () => void = () => {};
      const k1Blocked = new Promise<void>((resolve) => {
        releaseK1 = resolve;
      });
      k1.translate = async () => {
        k1.callCount++;
        await k1Blocked;
        return { success: true, translations: new Map([['id1', 'from-k1']]) };
      };
      k2.translate = async () => {
        k2.callCount++;
        return { success: true, translations: new Map([['id1', 'from-k2']]) };
      };

      const first = coord.translate(baseRequest()); // → k1, holds
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
      expect(k1.callCount).toBe(1);

      const second = await coord.translate(baseRequest()); // → k2, done
      expect(second.translations.get('id1')).toBe('from-k2');
      expect(k2.callCount).toBe(1);

      // Third: RR would pick k1 again, but k1 is still at concurrency cap.
      const thirdPromise = coord.translate(baseRequest());
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();

      // Without load-spread, third queues on k1 (k2.callCount stays 1 until k1 frees).
      // With load-spread, third uses free k2 immediately.
      expect(k2.callCount).toBe(2);
      const third = await thirdPromise;
      expect(third.translations.get('id1')).toBe('from-k2');

      releaseK1();
      await first;
      expect(k1.callCount).toBe(1); // never double-dispatched while capped
    });
  });

  describe('fast 429 failover when siblings exist', () => {
    it('sets 0 same-key 429 retries with healthy siblings, restores default when one healthy key remains', async () => {
      // Phase 1: 0 same-key 429 retries when other healthy keys exist.
      const max429Sets: Array<{ keyId: string; value: number | null | undefined }> = [];
      factory = vi.fn(
        (config: ProviderConfig, identity: { keyId: string; providerId: string }) => {
          const s = makeStub(identity.keyId, config);
          s.setMax429Retries = (n?: number | null) => {
            max429Sets.push({ keyId: identity.keyId, value: n });
          };
          stubs.set(identity.keyId, s);
          return s;
        },
      );

      const coord = new ProviderPoolCoordinator({
        serviceFactory: factory,
        clock: () => clockNow,
      });
      coord.rebuild(twoKeySettings());

      await coord.translate(baseRequest());
      // First request: 2 healthy keys → prefer fast failover (0 retries)
      expect(max429Sets.some((e) => e.value === 0)).toBe(true);

      // Phase 2: default 429 retries restored when only one healthy key remains.
      max429Sets.length = 0;
      factory = vi.fn(
        (config: ProviderConfig, identity: { keyId: string; providerId: string }) => {
          const s = makeStub(identity.keyId, config);
          s.setMax429Retries = (n?: number | null) => {
            max429Sets.push({ keyId: identity.keyId, value: n });
          };
          stubs.set(identity.keyId, s);
          return s;
        },
      );
      stubs.clear();

      const coord2 = new ProviderPoolCoordinator({
        serviceFactory: factory,
        clock: () => clockNow,
      });
      coord2.rebuild(twoKeySettings());

      // Open k1 so only k2 is healthy
      setOutcome('k1', { kind: 'fail', error: new ApiError('429', 429) });
      await coord2.translate(baseRequest()).catch(() => null);
      max429Sets.length = 0;

      setOutcome('k1', {
        kind: 'success',
        result: { success: true, translations: new Map([['id1', 'from-k1']]) },
      });
      setOutcome('k2', {
        kind: 'success',
        result: { success: true, translations: new Map([['id1', 'from-k2']]) },
      });

      await coord2.translate(baseRequest());
      // Only one healthy → restore default retries (null/undefined)
      const last = max429Sets[max429Sets.length - 1];
      expect(last?.value === null || last?.value === undefined || last?.value === 3).toBe(true);
    });
  });

  describe('Google AI Studio multi-model', () => {
    function googleMultiSettings(
      strategy: 'preferred_failover' | 'round_robin' = 'preferred_failover',
    ): ExtensionSettings {
      const providers: PoolProvider[] = [
        {
          id: 'g1',
          displayName: 'Google',
          baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
          catalogId: 'google-ai-studio',
          model: 'gemini-2.5-flash',
          models: ['gemini-2.5-flash', 'gemini-2.5-flash-lite'],
          modelStrategy: strategy,
          requiresApiKey: true,
          temperature: 0.3,
          maxTokens: 4096,
          enabled: true,
          keys: [
            {
              id: 'k1',
              apiKey: 'sk-1',
              maxRpm: 0,
              concurrencyLimit: 0,
              interval: 0,
              enabled: true,
            },
            {
              id: 'k2',
              apiKey: 'sk-2',
              maxRpm: 0,
              concurrencyLimit: 0,
              interval: 0,
              enabled: true,
            },
          ],
        },
      ];
      return { ...DEFAULT_SETTINGS, providers };
    }

    it('preferred uses primary model when healthy, fails over to lite on 429; round_robin spreads', async () => {
      // preferred: always uses primary model when healthy (order A)
      let coord = new ProviderPoolCoordinator({
        serviceFactory: factory,
        clock: () => clockNow,
      });
      coord.rebuild(googleMultiSettings('preferred_failover'));
      for (let i = 0; i < 4; i++) {
        await coord.translate(baseRequest());
      }
      const flashCalls =
        (stubs.get('k1::gemini-2.5-flash')?.callCount ?? 0) +
        (stubs.get('k2::gemini-2.5-flash')?.callCount ?? 0);
      const liteCalls =
        (stubs.get('k1::gemini-2.5-flash-lite')?.callCount ?? 0) +
        (stubs.get('k2::gemini-2.5-flash-lite')?.callCount ?? 0);
      expect(flashCalls).toBe(4);
      expect(liteCalls).toBe(0);

      // preferred: fails over to lite when flash slots 429
      coord = new ProviderPoolCoordinator({
        serviceFactory: factory,
        clock: () => clockNow,
      });
      coord.rebuild(googleMultiSettings('preferred_failover'));
      setOutcome('k1::gemini-2.5-flash', {
        kind: 'fail',
        error: new ApiError('rl', 429),
      });
      setOutcome('k2::gemini-2.5-flash', {
        kind: 'fail',
        error: new ApiError('rl', 429),
      });
      const result = await coord.translate(baseRequest());
      expect(result.success).toBe(true);
      const liteUsed =
        (stubs.get('k1::gemini-2.5-flash-lite')?.callCount ?? 0) +
        (stubs.get('k2::gemini-2.5-flash-lite')?.callCount ?? 0);
      expect(liteUsed).toBeGreaterThan(0);
      expect(coord.getKeyStatus('k1::gemini-2.5-flash-lite').open).toBe(false);
      expect(coord.getKeyStatus('k1::gemini-2.5-flash').open).toBe(true);

      // round_robin: spreads across models
      coord = new ProviderPoolCoordinator({
        serviceFactory: factory,
        clock: () => clockNow,
      });
      coord.rebuild(googleMultiSettings('round_robin'));
      for (let i = 0; i < 4; i++) {
        await coord.translate(baseRequest());
      }
      const modelsUsed = [...stubs.values()].filter((s) => s.callCount > 0).length;
      expect(modelsUsed).toBeGreaterThanOrEqual(2);
    });
  });
});
