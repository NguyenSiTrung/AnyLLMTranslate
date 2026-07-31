/** @vitest-environment jsdom */
import { describe, it, expect } from 'vitest';
import { getDomOutlineFromDocument } from '@/content/utils/getDomOutline';

describe('getDomOutlineFromDocument', () => {
  it('returns outline for current-like document', () => {
    const html = `<!doctype html><html><head><title>T</title></head><body><main><p>${'hi '.repeat(30)}</p></main></body></html>`;
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const r = getDomOutlineFromDocument(doc, 'https://example.com/page');
    expect(r.success).toBe(true);
    expect(r.outline?.title).toBe('T');
    expect(r.outline?.hostname).toBe('example.com');
  });
});
