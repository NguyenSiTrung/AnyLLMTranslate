import { describe, it, expect } from 'vitest';
import {
  buildFingerprintPayload,
  computeCacheFingerprint,
  fnv1aHex,
  hashGlossaryContent,
} from '../cacheFingerprint';

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
