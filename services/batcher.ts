/**
 * Translation request batching and deduplication.
 * Groups translation requests, deduplicates identical texts,
 * and splits large batches by character limit.
 */

import type { TranslationResult } from '@/types/translation';
import type { TranslationService } from './base';

/** A queued translation item */
interface QueuedItem {
  id: string;
  text: string;
  resolve: (translatedText: string) => void;
  reject: (error: Error) => void;
}

export class TranslationBatcher {
  private queue: QueuedItem[] = [];
  private inFlight: Map<string, Promise<string>> = new Map();
  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  private maxBatchChars: number;
  private flushDelayMs: number;
  private service: TranslationService;
  private sourceLanguage: string;
  private targetLanguage: string;

  constructor(
    service: TranslationService,
    options: {
      maxBatchChars?: number;
      flushDelayMs?: number;
      sourceLanguage: string;
      targetLanguage: string;
    },
  ) {
    this.service = service;
    this.maxBatchChars = options.maxBatchChars ?? 2000;
    this.flushDelayMs = options.flushDelayMs ?? 50;
    this.sourceLanguage = options.sourceLanguage;
    this.targetLanguage = options.targetLanguage;
  }

  /** Add a text for translation, returns promise of translated text */
  async add(id: string, text: string): Promise<string> {
    // Dedup: if this exact text is already in-flight, reuse the promise
    const dedupeKey = `${this.sourceLanguage}:${this.targetLanguage}:${text}`;
    const existing = this.inFlight.get(dedupeKey);
    if (existing) {
      return existing;
    }

    const promise = new Promise<string>((resolve, reject) => {
      this.queue.push({ id, text, resolve, reject });
      this.scheduleFlush();
    });

    this.inFlight.set(dedupeKey, promise);

    // Clean up in-flight entry when done — suppress unhandled rejection
    // since the caller's promise handles the error
    promise.finally(() => {
      this.inFlight.delete(dedupeKey);
    }).catch(() => { /* handled by caller */ });

    return promise;
  }

  /** Add multiple texts at once */
  async addBatch(
    items: Array<{ id: string; text: string }>,
  ): Promise<Map<string, string>> {
    const promises = items.map(({ id, text }) => this.add(id, text).then((t) => [id, t] as const));
    const results = await Promise.allSettled(promises);

    const translations = new Map<string, string>();
    for (const result of results) {
      if (result.status === 'fulfilled') {
        const [id, text] = result.value;
        translations.set(id, text);
      }
    }
    return translations;
  }

  /** Force flush the queue immediately */
  async flush(): Promise<void> {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
    await this.processQueue();
  }

  /** Get the current queue size */
  get queueSize(): number {
    return this.queue.length;
  }

  /** Get number of in-flight requests */
  get inFlightCount(): number {
    return this.inFlight.size;
  }

  private scheduleFlush(): void {
    if (this.flushTimer) return;
    this.flushTimer = setTimeout(() => {
      this.flushTimer = null;
      this.processQueue();
    }, this.flushDelayMs);
  }

  private async processQueue(): Promise<void> {
    if (this.queue.length === 0) return;

    // Take all items from the queue
    const items = [...this.queue];
    this.queue = [];

    // Deduplicate by text content
    const uniqueTexts = new Map<string, QueuedItem[]>();
    for (const item of items) {
      const existing = uniqueTexts.get(item.text);
      if (existing) {
        existing.push(item);
      } else {
        uniqueTexts.set(item.text, [item]);
      }
    }

    // Split into batches by character count
    const batches = this.splitIntoBatches(uniqueTexts);

    // Process each batch
    for (const batch of batches) {
      await this.processBatch(batch);
    }
  }

  private splitIntoBatches(
    uniqueTexts: Map<string, QueuedItem[]>,
  ): Array<Map<string, QueuedItem[]>> {
    const batches: Array<Map<string, QueuedItem[]>> = [];
    let currentBatch = new Map<string, QueuedItem[]>();
    let currentChars = 0;

    for (const [text, items] of uniqueTexts) {
      if (currentChars + text.length > this.maxBatchChars && currentBatch.size > 0) {
        batches.push(currentBatch);
        currentBatch = new Map();
        currentChars = 0;
      }
      currentBatch.set(text, items);
      currentChars += text.length;
    }

    if (currentBatch.size > 0) {
      batches.push(currentBatch);
    }

    return batches;
  }

  private async processBatch(batch: Map<string, QueuedItem[]>): Promise<void> {
    // Build the request texts map using the first item's ID for each unique text
    const texts = new Map<string, string>();
    const idToItems = new Map<string, QueuedItem[]>();

    for (const [text, items] of batch) {
      const primaryId = items[0].id;
      texts.set(primaryId, text);
      idToItems.set(primaryId, items);
    }

    let result: TranslationResult;
    try {
      result = await this.service.translate({
        texts,
        sourceLanguage: this.sourceLanguage,
        targetLanguage: this.targetLanguage,
      });
    } catch (error) {
      const err = error instanceof Error ? error : new Error('Translation failed');
      for (const items of idToItems.values()) {
        for (const item of items) {
          item.reject(err);
        }
      }
      return;
    }

    if (!result.success) {
      const err = new Error(result.error ?? 'Translation failed');
      for (const items of idToItems.values()) {
        for (const item of items) {
          item.reject(err);
        }
      }
      return;
    }

    // Distribute results to all waiting items
    for (const [primaryId, items] of idToItems) {
      const translatedText = result.translations.get(primaryId);
      if (translatedText) {
        for (const item of items) {
          item.resolve(translatedText);
        }
      } else {
        for (const item of items) {
          item.reject(new Error(`No translation for piece ${item.id}`));
        }
      }
    }
  }
}
