import { describe, expect, it, vi } from 'vitest';
import {
  isTransientTranslationError,
  shouldNegativeCacheFailure,
} from '../translationErrors';
import {
  detectPieceQualityIssues,
  detectBatchQualityIssues,
  countZTags,
  validateRichTranslation,
  findMissingTranslationIds,
  areZTagsBalanced,
} from '@/lib/translationQualityCheck';
import {
  isSessionCurrent,
  TranslationSessionRegistry,
  LifecycleMutex,
} from '../translationSession';
import {
  extractTerms,
  mergeTermMemory,
  formatTermMemoryBlock,
} from '@/lib/termMemory';
import {
  buildFingerprintPayload,
  computeCacheFingerprint,
  fnv1aHex,
  hashGlossaryContent,
} from '../cacheFingerprint';

describe('translationErrors', () => {
  it('classifies transient failures and negative-caches only content/moderation failures', () => {
    const transient = [
      'All provider pool slots failed during this request.',
      'All provider pool slots are currently open (rate-limited or errored).',
      'Translation pool is empty — no providers configured.',
      'Provider pool dispatch exhausted all attempts.',
      'Rate limit exceeded',
      'HTTP 429 Too Many Requests',
      'Network error: fetch failed',
      'Request timeout',
      'Failed to parse translation response as JSON',
      'Empty streaming response',
      'Streaming port disconnected',
      'Invalid API key (401)',
    ];
    for (const msg of transient) {
      expect(isTransientTranslationError(msg), msg).toBe(true);
    }
    expect(isTransientTranslationError('Content blocked by safety filter')).toBe(false);

    // shouldNegativeCacheFailure: negative-caches only content/moderation failures
    expect(
      shouldNegativeCacheFailure('All provider pool slots failed during this request.'),
    ).toBe(false);
    expect(shouldNegativeCacheFailure('Rate limit exceeded')).toBe(false);
    expect(shouldNegativeCacheFailure('Blocked by content filter')).toBe(true);
    expect(shouldNegativeCacheFailure('Safety moderation refused to translate')).toBe(true);
    expect(shouldNegativeCacheFailure('Something weird happened')).toBe(false);
  });
});

describe('translationQualityCheck', () => {
  it('counts z tags, detects echo/dropped tags, batch-scans, and validates rich token balance/ids/tags', () => {
    expect(countZTags('Hello <z id="1">world</z> and <z id="2">x</z>')).toBe(2);

    expect(
      detectPieceQualityIssues({
        id: 'p1',
        source: 'This is a long enough English sentence.',
        translated: 'This is a long enough English sentence.',
        sourceLanguage: 'en',
        targetLanguage: 'vi',
      }).some((i) => i.kind === 'source_echo'),
    ).toBe(true);

    expect(
      detectPieceQualityIssues({
        id: 'p1',
        source: 'See <z id="1">docs</z> please',
        translated: 'Xem docs di',
        sourceLanguage: 'en',
        targetLanguage: 'vi',
      }).some((i) => i.kind === 'dropped_z_tags'),
    ).toBe(true);

    expect(
      detectPieceQualityIssues({
        id: 'p1',
        source: 'Hello world today',
        translated: 'Xin chào thế giới hôm nay',
        sourceLanguage: 'en',
        targetLanguage: 'vi',
      }),
    ).toEqual([]);

    const issues = detectBatchQualityIssues(
      new Map([
        ['a', 'This is a long enough English sentence.'],
        ['b', 'Short'],
      ]),
      new Map([
        ['a', 'This is a long enough English sentence.'],
        ['b', 'Ngắn'],
      ]),
      { sourceLanguage: 'en', targetLanguage: 'vi' },
    );
    expect(issues).toHaveLength(1);
    expect(issues[0]!.id).toBe('a');

    // FR-16: validates rich token balance, ids, allowed tags, incomplete maps
    expect(areZTagsBalanced('<z id="1">a</z>')).toBe(true);
    expect(areZTagsBalanced('<z id="1">a')).toBe(false);

    const unbalanced = validateRichTranslation({
      id: 'r1',
      source: 'See <z id="1">docs</z>',
      translated: 'Xem <z id="1">docs',
    });
    expect(unbalanced.some((i) => i.kind === 'unbalanced_z_tags')).toBe(true);

    const unknownId = validateRichTranslation({
      id: 'r2',
      source: 'See <z id="1">docs</z>',
      translated: 'Xem <z id="9">docs</z>',
    });
    expect(unknownId.some((i) => i.kind === 'unknown_z_id')).toBe(true);

    const badTag = validateRichTranslation({
      id: 'r3',
      source: 'See <z id="1">docs</z>',
      translated: 'Xem <script>x</script> <z id="1">docs</z>',
    });
    expect(badTag.some((i) => i.kind === 'disallowed_tag')).toBe(true);

    expect(findMissingTranslationIds(['a', 'b', 'c'], ['a', 'c'])).toEqual(['b']);
    expect(findMissingTranslationIds(['a'], ['a', 'b'])).toEqual([]);
  });
});

describe('translationSession', () => {
  describe('TranslationSessionRegistry', () => {
    it('bumps session and aborts previous ports/controllers; isSessionCurrent matches equal ids only; unregister prevents disconnect on later bump', () => {
      expect(isSessionCurrent(1, 1)).toBe(true);
      expect(isSessionCurrent(2, 1)).toBe(false);
      expect(isSessionCurrent(0, 1)).toBe(false);

      const reg = new TranslationSessionRegistry();
      expect(reg.current).toBe(0);

      const port = { disconnect: vi.fn() };
      const controller = { abort: vi.fn() };
      const s0 = reg.current;
      reg.registerPort(s0, port);
      reg.registerAbort(s0, controller);

      const s1 = reg.bump();
      expect(s1).toBe(1);
      expect(reg.isCurrent(s0)).toBe(false);
      expect(reg.isCurrent(s1)).toBe(true);
      expect(port.disconnect).toHaveBeenCalledTimes(1);
      expect(controller.abort).toHaveBeenCalledTimes(1);

      // Unregistered ports are not disconnected on a later bump
      const reg2 = new TranslationSessionRegistry();
      const port2 = { disconnect: vi.fn() };
      reg2.registerPort(reg2.current, port2);
      reg2.unregisterPort(reg2.current, port2);
      reg2.bump();
      expect(port2.disconnect).not.toHaveBeenCalled();
    });

    it('abortAll disconnects every registered session', () => {
      const reg = new TranslationSessionRegistry();
      const p0 = { disconnect: vi.fn() };
      reg.registerPort(reg.current, p0);
      reg.bump();
      const p1 = { disconnect: vi.fn() };
      reg.registerPort(reg.current, p1);
      reg.abortAll();
      expect(p1.disconnect).toHaveBeenCalled();
    });
  });

  describe('LifecycleMutex', () => {
    it('serializes concurrent start-like work (no dual-observe interleave)', async () => {
      const mutex = new LifecycleMutex();
      const order: string[] = [];
      let concurrent = 0;
      let maxConcurrent = 0;

      const work = (label: string, ms: number) =>
        mutex.run(async () => {
          concurrent++;
          maxConcurrent = Math.max(maxConcurrent, concurrent);
          order.push(`start:${label}`);
          await new Promise((r) => setTimeout(r, ms));
          order.push(`end:${label}`);
          concurrent--;
        });

      await Promise.all([work('a', 30), work('b', 10), work('c', 5)]);

      expect(maxConcurrent).toBe(1);
      expect(order).toEqual([
        'start:a',
        'end:a',
        'start:b',
        'end:b',
        'start:c',
        'end:c',
      ]);
    });

    it('keeps queue alive after a rejected task', async () => {
      const mutex = new LifecycleMutex();
      await expect(
        mutex.run(async () => {
          throw new Error('boom');
        }),
      ).rejects.toThrow('boom');
      await expect(mutex.run(async () => 'ok')).resolves.toBe('ok');
    });
  });
});

describe('termMemory', () => {
  it('extracts, merges, and formats document terms safely', () => {
    expect(extractTerms('Welcome to OpenAI Platform and GitHub Actions docs.')).toEqual(
      expect.arrayContaining(['OpenAI Platform', 'GitHub Actions']),
    );
    expect(extractTerms('')).toEqual([]);

    expect(mergeTermMemory(['Alpha', 'Beta'], ['alpha', 'Gamma', 'Delta'], 3)).toEqual([
      'Alpha',
      'Beta',
      'Gamma',
    ]);

    const block = formatTermMemoryBlock(['React', 'Vue']);
    expect(block).toContain('UNTRUSTED DATA');
    expect(block).toContain('<document_terms>');
    expect(block).toContain('<term>React</term>');
    expect(block).toContain('<term>Vue</term>');

    const stripped = formatTermMemoryBlock(['Foo<script>']);
    expect(stripped).not.toContain('<script>');
    expect(stripped).toContain('<term>Fooscript</term>');
    expect(formatTermMemoryBlock([])).toBe('');
  });
});

describe('cacheFingerprint', () => {
  it('builds a stable payload, empty fingerprint when only languages set, and changes fingerprint when glossary/model/prompt change', () => {
    const base = {
      sourceLanguage: 'en',
      targetLanguage: 'vi',
    };
    expect(buildFingerprintPayload(base)).toBe('||en|vi|||||');
    expect(computeCacheFingerprint(base)).toBe('');
    const a = computeCacheFingerprint({
      sourceLanguage: 'en',
      targetLanguage: 'vi',
      model: 'gpt-4o-mini',
      glossaryHash: hashGlossaryContent([{ source: 'AI', target: 'Trí tuệ nhân tạo' }]),
      promptVersion: 'sys-v1',
    });
    const b = computeCacheFingerprint({
      sourceLanguage: 'en',
      targetLanguage: 'vi',
      model: 'gpt-4o-mini',
      glossaryHash: hashGlossaryContent([{ source: 'AI', target: 'AI' }]),
      promptVersion: 'sys-v1',
    });
    const c = computeCacheFingerprint({
      sourceLanguage: 'en',
      targetLanguage: 'vi',
      model: 'other-model',
      glossaryHash: hashGlossaryContent([{ source: 'AI', target: 'Trí tuệ nhân tạo' }]),
      promptVersion: 'sys-v1',
    });
    const d = computeCacheFingerprint({
      sourceLanguage: 'en',
      targetLanguage: 'vi',
      model: 'gpt-4o-mini',
      glossaryHash: hashGlossaryContent([{ source: 'AI', target: 'Trí tuệ nhân tạo' }]),
      promptVersion: 'sys-v2',
    });
    expect(a).toMatch(/^[0-9a-f]{8}$/);
    expect(a).not.toBe(b);
    expect(a).not.toBe(c);
    expect(a).not.toBe(d);
    expect(a).toBe(
      computeCacheFingerprint({
        sourceLanguage: 'en',
        targetLanguage: 'vi',
        model: 'gpt-4o-mini',
        glossaryHash: hashGlossaryContent([{ source: 'AI', target: 'Trí tuệ nhân tạo' }]),
        promptVersion: 'sys-v1',
      }),
    );

    // hashGlossaryContent is order-insensitive
    const h1 = hashGlossaryContent([
      { source: 'b', target: 'B' },
      { source: 'a', target: 'A' },
    ]);
    const h2 = hashGlossaryContent([
      { source: 'a', target: 'A' },
      { source: 'b', target: 'B' },
    ]);
    expect(h1).toBe(h2);
    expect(hashGlossaryContent([])).toBe('');
    expect(hashGlossaryContent('term memory block')).toBe(fnv1aHex('term memory block'));
  });
});
