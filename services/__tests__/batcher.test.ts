import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TranslationBatcher } from '../batcher';
import type { TranslationService } from '../base';
import type { TranslationRequest, TranslationResult } from '../../types/translation';

function createMockService(
  translateFn?: (req: TranslationRequest) => Promise<TranslationResult>,
): TranslationService {
  return {
    translate: translateFn ?? (async (req: TranslationRequest) => ({
      success: true,
      translations: new Map(
        Array.from(req.texts.entries()).map(([id, text]) => [id, `translated:${text}`]),
      ),
    })),
    testConnection: async () => ({ success: true }),
  };
}

describe('TranslationBatcher', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  describe('add', () => {
    it('translates a single item after flush', async () => {
      const service = createMockService();
      const batcher = new TranslationBatcher(service, {
        sourceLanguage: 'en',
        targetLanguage: 'vi',
        flushDelayMs: 10,
      });

      const promise = batcher.add('p1', 'Hello');
      expect(batcher.queueSize).toBe(1);

      await batcher.flush();
      const result = await promise;
      expect(result).toBe('translated:Hello');
    });

    it('deduplicates identical texts', async () => {
      const translateFn = vi.fn(async (req: TranslationRequest) => ({
        success: true as const,
        translations: new Map(
          Array.from(req.texts.entries()).map(([id]) => [id, 'Xin chào']),
        ),
      }));
      const service = createMockService(translateFn);
      const batcher = new TranslationBatcher(service, {
        sourceLanguage: 'en',
        targetLanguage: 'vi',
        flushDelayMs: 10,
      });

      const p1 = batcher.add('p1', 'Hello');
      const p2 = batcher.add('p2', 'Hello');

      await batcher.flush();

      const [r1, r2] = await Promise.all([p1, p2]);
      expect(r1).toBe('Xin chào');
      expect(r2).toBe('Xin chào');

      // Should only make one API call since both texts are identical
      expect(translateFn).toHaveBeenCalledTimes(1);
      const callTexts = translateFn.mock.calls[0][0].texts;
      expect(callTexts.size).toBe(1);
    });
  });

  describe('batch splitting', () => {
    it('splits batches that exceed maxBatchChars', async () => {
      const translateFn = vi.fn(async (req: TranslationRequest) => ({
        success: true as const,
        translations: new Map(
          Array.from(req.texts.entries()).map(([id, text]) => [id, `t:${text}`]),
        ),
      }));
      const service = createMockService(translateFn);
      const batcher = new TranslationBatcher(service, {
        sourceLanguage: 'en',
        targetLanguage: 'vi',
        maxBatchChars: 20,
        flushDelayMs: 10,
      });

      // Each text is 15 chars, so they can't fit in one batch of 20
      const p1 = batcher.add('p1', 'Hello World 123');
      const p2 = batcher.add('p2', 'Goodbye World!!');

      await batcher.flush();
      await Promise.all([p1, p2]);

      expect(translateFn).toHaveBeenCalledTimes(2);
    });
  });

  describe('addBatch', () => {
    it('translates multiple items at once', async () => {
      const service = createMockService();
      const batcher = new TranslationBatcher(service, {
        sourceLanguage: 'en',
        targetLanguage: 'vi',
        flushDelayMs: 0,
      });

      const resultPromise = batcher.addBatch([
        { id: 'p1', text: 'Hello' },
        { id: 'p2', text: 'World' },
      ]);

      await batcher.flush();
      const result = await resultPromise;

      expect(result.get('p1')).toBe('translated:Hello');
      expect(result.get('p2')).toBe('translated:World');
    });
  });

  describe('error handling', () => {
    it('rejects all items on translation failure', async () => {
      const service = createMockService(async () => ({
        success: false,
        translations: new Map(),
        error: 'API error',
      }));
      const batcher = new TranslationBatcher(service, {
        sourceLanguage: 'en',
        targetLanguage: 'vi',
        flushDelayMs: 10,
      });

      const promise = batcher.add('p1', 'Hello');
      await batcher.flush();

      await expect(promise).rejects.toThrow('API error');
    });

    it('rejects items when service throws', async () => {
      const service = createMockService(async () => {
        throw new Error('Network failure');
      });
      const batcher = new TranslationBatcher(service, {
        sourceLanguage: 'en',
        targetLanguage: 'vi',
        flushDelayMs: 10,
      });

      const promise = batcher.add('p1', 'Hello');
      await batcher.flush();

      await expect(promise).rejects.toThrow('Network failure');
    });

    it('rejects items with missing translations', async () => {
      const service = createMockService(async () => ({
        success: true,
        translations: new Map(), // empty — no translations returned
      }));
      const batcher = new TranslationBatcher(service, {
        sourceLanguage: 'en',
        targetLanguage: 'vi',
        flushDelayMs: 10,
      });

      const promise = batcher.add('p1', 'Hello');
      await batcher.flush();

      await expect(promise).rejects.toThrow('No translation');
    });
  });

  describe('in-flight tracking', () => {
    it('tracks in-flight count', async () => {
      const service = createMockService();
      const batcher = new TranslationBatcher(service, {
        sourceLanguage: 'en',
        targetLanguage: 'vi',
        flushDelayMs: 10,
      });

      batcher.add('p1', 'Hello');
      expect(batcher.inFlightCount).toBe(1);

      batcher.add('p2', 'Hello'); // same text, reuses in-flight
      expect(batcher.inFlightCount).toBe(1);

      batcher.add('p3', 'World'); // different text
      expect(batcher.inFlightCount).toBe(2);
    });
  });
});
