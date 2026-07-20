import { describe, it, expect } from 'vitest';
import {
  initialSessionState,
  applyOpenTranslated,
  applyOpenCompare,
  applyShellMode,
  compareRightLabel,
  readerPaneLabel,
} from '../pdfShellMode';

describe('pdfShellMode', () => {
  it('starts in reader focused on source', () => {
    expect(initialSessionState()).toEqual({
      shellMode: 'reader',
      readerFocus: 'source',
      resultKind: null,
    });
  });

  it('open translated → reader + result focus', () => {
    const next = applyOpenTranslated(initialSessionState(), 'mono');
    expect(next).toEqual({
      shellMode: 'reader',
      readerFocus: 'result',
      resultKind: 'mono',
    });
  });

  it('open compare → compare mode + stores kind', () => {
    const next = applyOpenCompare(initialSessionState(), 'mono');
    expect(next.shellMode).toBe('compare');
    expect(next.resultKind).toBe('mono');
  });

  it('compare with dual uses bilingual label', () => {
    expect(compareRightLabel('dual')).toMatch(/bilingual/i);
    expect(compareRightLabel('mono')).toBe('Translated');
  });

  it('reader label follows focus', () => {
    expect(readerPaneLabel('source', null)).toBe('Original');
    expect(readerPaneLabel('result', 'mono')).toBe('Translated');
    expect(readerPaneLabel('result', 'dual')).toMatch(/bilingual/i);
  });

  it('switching to reader from compare keeps result focus if result exists', () => {
    const compared = applyOpenCompare(initialSessionState(), 'mono');
    const back = applyShellMode(compared, 'reader');
    expect(back.shellMode).toBe('reader');
    expect(back.readerFocus).toBe('result');
    expect(back.resultKind).toBe('mono');
  });
});
