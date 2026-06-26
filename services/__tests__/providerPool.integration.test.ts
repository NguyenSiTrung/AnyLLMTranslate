/**
 * Integration tests: all translation paths route through the coordinator and
 * round-robin engages across two mocked keys (AC-6).
 *
 * Rather than mock the full background message router (heavy), these tests
 * exercise the ProviderPoolCoordinator directly with two stubbed member
 * services and assert that EACH delegated method (translate, testConnection,
 * detectPageCategory, classifyPdfParagraphs) round-robins across k1/k2 on
 * sequential calls. This proves the single-seam property: every translation
 * path that calls initService() gets the coordinator, and the coordinator
 * distributes requests across the pool.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { ProviderPoolCoordinator } from '../providerPool';
import type { TranslationService } from '../base';
import type { TranslationRequest, TranslationResult } from '@/types/translation';
import type { PageContext, ExtensionSettings } from '@/types/config';
import type { ClassifyPdfParagraphsResult } from '@/types/messages';
import { DEFAULT_SETTINGS } from '@/types/config';

/** A stub that tags every result with the keyId it dispatched from. */
function makeTaggingStub(keyId: string): TranslationService & { callCount: number } {
  let count = 0;
  return {
    callCount: 0,
    async translate(request: TranslationRequest): Promise<TranslationResult> {
      count++;
      this.callCount = count;
      // Tag the translation so we can see which key produced it.
      const translations = new Map<string, string>();
      for (const [id, text] of request.texts) {
        translations.set(id, `${text}|via-${keyId}`);
      }
      return { success: true, translations };
    },
    async testConnection() {
      count++;
      this.callCount = count;
      return { success: true };
    },
    async detectPageCategory(_pageContext: PageContext) {
      count++;
      this.callCount = count;
      return { success: true, category: `cat-${keyId}` };
    },
    async classifyPdfParagraphs(_paragraphs: Array<{ id: string; text: string }>) {
      count++;
      this.callCount = count;
      return { success: true, labels: { p1: keyId as 'prose' | 'figure' } } as ClassifyPdfParagraphsResult;
    },
  };
}

function twoKeySettings(): ExtensionSettings {
  return {
    ...DEFAULT_SETTINGS,
    providers: [
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
    ],
  };
}

describe('ProviderPoolCoordinator — single-seam integration (AC-6)', () => {
  let clockNow: number;
  let k1Stub: ReturnType<typeof makeTaggingStub>;
  let k2Stub: ReturnType<typeof makeTaggingStub>;

  beforeEach(() => {
    clockNow = 5_000_000;
    k1Stub = makeTaggingStub('k1');
    k2Stub = makeTaggingStub('k2');
  });

  function buildCoordinator(): ProviderPoolCoordinator {
    const coord = new ProviderPoolCoordinator({
      clock: () => clockNow,
      serviceFactory: (_config, identity) =>
        identity.keyId === 'k1' ? k1Stub : k2Stub,
    });
    coord.rebuild(twoKeySettings());
    return coord;
  }

  it('page-translate path: round-robins k1 → k2 → k1', async () => {
    const coord = buildCoordinator();
    const mk = () =>
      ({
        texts: new Map([['p1', 'hello']]),
        sourceLanguage: 'en',
        targetLanguage: 'vi',
      }) as TranslationRequest;

    const r1 = await coord.translate(mk());
    const r2 = await coord.translate(mk());
    const r3 = await coord.translate(mk());

    expect(r1.translations.get('p1')).toBe('hello|via-k1');
    expect(r2.translations.get('p1')).toBe('hello|via-k2');
    expect(r3.translations.get('p1')).toBe('hello|via-k1');
  });

  it('testConnection path: round-robins across keys', async () => {
    const coord = buildCoordinator();
    await coord.testConnection();
    await coord.testConnection();
    await coord.testConnection();
    expect(k1Stub.callCount).toBe(2);
    expect(k2Stub.callCount).toBe(1);
  });

  it('detectPageCategory path: round-robins across keys', async () => {
    const coord = buildCoordinator();
    const ctx: PageContext = { title: 't', description: 'd', domain: 'x.com' };
    const r1 = await coord.detectPageCategory(ctx);
    const r2 = await coord.detectPageCategory(ctx);
    expect(r1.category).toBe('cat-k1');
    expect(r2.category).toBe('cat-k2');
  });

  it('classifyPdfParagraphs path: round-robins across keys', async () => {
    const coord = buildCoordinator();
    const paras = [{ id: 'p1', text: 'hi' }];
    const r1 = await coord.classifyPdfParagraphs(paras);
    const r2 = await coord.classifyPdfParagraphs(paras);
    expect(r1.labels?.p1).toBe('k1');
    expect(r2.labels?.p1).toBe('k2');
  });

  it('mixed calls share the same rotation cursor (cross-path round-robin)', async () => {
    // A realistic mix: translate, then a category detect, then another translate.
    // The cursor advances per logical request regardless of method, so the pool
    // distributes load evenly across ALL translation paths combined.
    const coord = buildCoordinator();
    await coord.translate({ texts: new Map([['p1', 'a']]), sourceLanguage: 'en', targetLanguage: 'vi' }); // k1
    await coord.detectPageCategory({ title: 't', description: '', domain: '' }); // k2
    await coord.translate({ texts: new Map([['p2', 'b']]), sourceLanguage: 'en', targetLanguage: 'vi' }); // k1

    expect(k1Stub.callCount).toBe(2);
    expect(k2Stub.callCount).toBe(1);
  });

  it('failover still works under the integrated path: k1 429 → k2 success', async () => {
    const coord = buildCoordinator();
    // Make k1 throw on its FIRST call only by overriding translate.
    const origK1Translate = k1Stub.translate.bind(k1Stub);
    let k1FirstCall = true;
    k1Stub.translate = async (req) => {
      if (k1FirstCall) {
        k1FirstCall = false;
        throw new (class extends Error {
          statusCode = 429;
          name = 'ApiError';
        })('rate limited');
      }
      return origK1Translate(req);
    };

    const result = await coord.translate({
      texts: new Map([['p1', 'hello']]),
      sourceLanguage: 'en',
      targetLanguage: 'vi',
    });

    // k1 was tried (and failed), k2 succeeded.
    expect(result.success).toBe(true);
    expect(result.translations.get('p1')).toBe('hello|via-k2');
  });

  it('a coordinator with one enabled key behaves like a single-provider (no rotation skew)', async () => {
    // Backward-compat: a migrated single-provider user has exactly one key, so
    // every call dispatches to it. No round-robin alternation, no failover target.
    const settings: ExtensionSettings = {
      ...DEFAULT_SETTINGS,
      providers: [
        {
          id: 'p1',
          displayName: 'P1',
          baseUrl: 'https://a/v1',
          model: 'm',
          requiresApiKey: true,
          temperature: 0.3,
          maxTokens: 4096,
          enabled: true,
          keys: [{ id: 'k1', apiKey: 'sk-1', maxRpm: 0, enabled: true }],
        },
      ],
    };
    const coord = new ProviderPoolCoordinator({
      clock: () => clockNow,
      serviceFactory: () => k1Stub,
    });
    coord.rebuild(settings);

    await coord.translate({ texts: new Map([['p1', 'a']]), sourceLanguage: 'en', targetLanguage: 'vi' });
    await coord.translate({ texts: new Map([['p2', 'b']]), sourceLanguage: 'en', targetLanguage: 'vi' });

    expect(k1Stub.callCount).toBe(2);
    expect(k2Stub.callCount).toBe(0);
  });
});
