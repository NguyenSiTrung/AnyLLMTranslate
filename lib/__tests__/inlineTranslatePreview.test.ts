import { describe, it, expect } from 'vitest';
import {
  INLINE_PREVIEW_SOURCE,
  resolvePreviewTranslation,
  buildPreviewProjection,
} from '@/lib/inlineTranslatePreview';

describe('inlineTranslatePreview', () => {
  it('resolves samples and builds projection for dual/prefix modes', () => {
    expect(resolvePreviewTranslation('vi')).toBeTruthy();
    expect(resolvePreviewTranslation('vi')).not.toContain('translated ·');
    expect(resolvePreviewTranslation('en')).toMatch(/hello/i);
    expect(resolvePreviewTranslation('xx')).toBe('(translated · xx)');

    const only = buildPreviewProjection({
      targetLanguage: 'vi',
      dualMode: false,
      enableLanguagePrefix: false,
      languagePrefix: '/',
    });
    expect(only.before).toBe(INLINE_PREVIEW_SOURCE);
    expect(only.after).toBe(resolvePreviewTranslation('vi'));
    expect(only.meta).toContain('vi');

    const dual = buildPreviewProjection({
      targetLanguage: 'vi',
      dualMode: true,
      enableLanguagePrefix: false,
      languagePrefix: '/',
    });
    expect(dual.after).toBe(`${INLINE_PREVIEW_SOURCE} / ${resolvePreviewTranslation('vi')}`);

    const prefix = buildPreviewProjection({
      targetLanguage: 'vi',
      dualMode: false,
      enableLanguagePrefix: true,
      languagePrefix: '/',
    });
    expect(prefix.before).toBe(`/en ${INLINE_PREVIEW_SOURCE}`);
    expect(prefix.after).toBe(resolvePreviewTranslation('en'));
    expect(prefix.meta.toLowerCase()).toMatch(/prefix|en/);

    const prefixDual = buildPreviewProjection({
      targetLanguage: 'ja',
      dualMode: true,
      enableLanguagePrefix: true,
      languagePrefix: '#',
    });
    expect(prefixDual.before).toBe(`#en ${INLINE_PREVIEW_SOURCE}`);
    expect(prefixDual.after).toBe(`${INLINE_PREVIEW_SOURCE} / ${resolvePreviewTranslation('en')}`);

    const emptyPrefix = buildPreviewProjection({
      targetLanguage: 'en',
      dualMode: false,
      enableLanguagePrefix: true,
      languagePrefix: '',
    });
    expect(emptyPrefix.before.startsWith('/en ')).toBe(true);
  });
});
