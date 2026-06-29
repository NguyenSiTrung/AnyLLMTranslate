import { describe, it, expect, beforeEach } from 'vitest';
import { readMaxActiveSubtitleLanguage, MAX_LABEL_TO_LANGUAGE } from '@/lib/maxSubtitleLanguages';

describe('readMaxActiveSubtitleLanguage', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('returns empty string when no track buttons exist', () => {
    expect(readMaxActiveSubtitleLanguage()).toBe('');
  });

  it('returns empty string when Off is selected', () => {
    document.body.innerHTML = `
      <button data-testid="player-ux-text-track-button" aria-label="Off" aria-checked="true"></button>
    `;
    expect(readMaxActiveSubtitleLanguage()).toBe('');
  });

  it('returns English code for English label', () => {
    document.body.innerHTML = `
      <button data-testid="player-ux-text-track-button" aria-label="English" aria-checked="true"></button>
    `;
    expect(readMaxActiveSubtitleLanguage()).toBe('en');
  });

  it('returns zh-Hans for Chinese (Simplified) label', () => {
    document.body.innerHTML = `
      <button data-testid="player-ux-text-track-button" aria-label="Chinese (Simplified)" aria-checked="true"></button>
    `;
    expect(readMaxActiveSubtitleLanguage()).toBe('zh-Hans');
  });

  it('falls back to lang attribute when label is localized (Spanish UI)', () => {
    document.body.innerHTML = `
      <button data-testid="player-ux-text-track-button" aria-label="Inglés" aria-checked="true" lang="en"></button>
    `;
    expect(readMaxActiveSubtitleLanguage()).toBe('en');
  });

  it('falls back to data-language attribute', () => {
    document.body.innerHTML = `
      <button data-testid="player-ux-text-track-button" aria-label="某言語" aria-checked="true" data-language="ja"></button>
    `;
    expect(readMaxActiveSubtitleLanguage()).toBe('ja');
  });

  it('resolves localized Spanish label "Inglés" without lang attribute', () => {
    document.body.innerHTML = `
      <button data-testid="player-ux-text-track-button" aria-label="Inglés" aria-checked="true"></button>
    `;
    expect(readMaxActiveSubtitleLanguage()).toBe('en');
  });

  it('resolves localized French label "Anglais"', () => {
    document.body.innerHTML = `
      <button data-testid="player-ux-text-track-button" aria-label="Anglais" aria-checked="true"></button>
    `;
    expect(readMaxActiveSubtitleLanguage()).toBe('en');
  });

  it('resolves localized Portuguese label "Chinês (Simplificado)"', () => {
    document.body.innerHTML = `
      <button data-testid="player-ux-text-track-button" aria-label="Chinês (Simplificado)" aria-checked="true"></button>
    `;
    expect(readMaxActiveSubtitleLanguage()).toBe('zh-Hans');
  });

  it('converts ISO 639-2 code via attribute fallback', () => {
    document.body.innerHTML = `
      <button data-testid="player-ux-text-track-button" aria-label="Unknown" aria-checked="true" data-language="vie"></button>
    `;
    expect(readMaxActiveSubtitleLanguage()).toBe('vi');
  });

  it('ignores unchecked buttons', () => {
    document.body.innerHTML = `
      <button data-testid="player-ux-text-track-button" aria-label="English" aria-checked="false"></button>
      <button data-testid="player-ux-text-track-button" aria-label="Spanish" aria-checked="true"></button>
    `;
    expect(readMaxActiveSubtitleLanguage()).toBe('es');
  });
});

describe('MAX_LABEL_TO_LANGUAGE', () => {
  it('includes common languages', () => {
    expect(MAX_LABEL_TO_LANGUAGE['English']).toBe('en');
    expect(MAX_LABEL_TO_LANGUAGE['Spanish']).toBe('es');
    expect(MAX_LABEL_TO_LANGUAGE['Japanese']).toBe('ja');
    expect(MAX_LABEL_TO_LANGUAGE['Korean']).toBe('ko');
  });
});
