import { describe, it, expect } from 'vitest';
import {
  INLINE_PREVIEW_SOURCE,
  resolvePreviewTranslation,
  buildPreviewProjection,
} from '@/lib/inlineTranslatePreview';

describe('resolvePreviewTranslation', () => {
  it('returns a mapped sample for known languages', () => {
    expect(resolvePreviewTranslation('vi')).toBeTruthy();
    expect(resolvePreviewTranslation('vi')).not.toContain('translated ·');
    expect(resolvePreviewTranslation('en')).toMatch(/hello/i);
  });

  it('falls back for unknown codes', () => {
    expect(resolvePreviewTranslation('xx')).toBe('(translated · xx)');
  });
});

describe('buildPreviewProjection', () => {
  it('translation-only without prefix uses target sample', () => {
    const p = buildPreviewProjection({
      targetLanguage: 'vi',
      dualMode: false,
      enableLanguagePrefix: false,
      languagePrefix: '/',
    });
    expect(p.before).toBe(INLINE_PREVIEW_SOURCE);
    expect(p.after).toBe(resolvePreviewTranslation('vi'));
    expect(p.meta).toContain('vi');
  });

  it('dual mode joins original and translation with /', () => {
    const p = buildPreviewProjection({
      targetLanguage: 'vi',
      dualMode: true,
      enableLanguagePrefix: false,
      languagePrefix: '/',
    });
    expect(p.after).toBe(`${INLINE_PREVIEW_SOURCE} / ${resolvePreviewTranslation('vi')}`);
  });

  it('prefix mode demos fixed en override and English sample', () => {
    const p = buildPreviewProjection({
      targetLanguage: 'vi',
      dualMode: false,
      enableLanguagePrefix: true,
      languagePrefix: '/',
    });
    expect(p.before).toBe(`/en ${INLINE_PREVIEW_SOURCE}`);
    expect(p.after).toBe(resolvePreviewTranslation('en'));
    expect(p.meta.toLowerCase()).toMatch(/prefix|en/);
  });

  it('prefix dual mode joins source (without prefix) and English sample', () => {
    const p = buildPreviewProjection({
      targetLanguage: 'ja',
      dualMode: true,
      enableLanguagePrefix: true,
      languagePrefix: '#',
    });
    expect(p.before).toBe(`#en ${INLINE_PREVIEW_SOURCE}`);
    expect(p.after).toBe(`${INLINE_PREVIEW_SOURCE} / ${resolvePreviewTranslation('en')}`);
  });

  it('uses custom prefix character when provided; empty falls back to /', () => {
    const empty = buildPreviewProjection({
      targetLanguage: 'en',
      dualMode: false,
      enableLanguagePrefix: true,
      languagePrefix: '',
    });
    expect(empty.before.startsWith('/en ')).toBe(true);
  });
});
