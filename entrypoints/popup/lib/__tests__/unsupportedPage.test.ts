import { describe, it, expect } from 'vitest';
import { getUnsupportedPageInfo } from '../unsupportedPage';

describe('getUnsupportedPageInfo', () => {
  it('returns message when tab missing', () => {
    const info = getUnsupportedPageInfo(undefined);
    expect(info?.title).toMatch(/can't be translated/i);
  });

  it('allows normal https pages', () => {
    expect(
      getUnsupportedPageInfo({ id: 1, url: 'https://example.com/page' } as chrome.tabs.Tab),
    ).toBeNull();
  });

  it('blocks chrome:// pages and Chrome Web Store', () => {
    const chromePage = getUnsupportedPageInfo({ id: 1, url: 'chrome://extensions' } as chrome.tabs.Tab);
    expect(chromePage).not.toBeNull();

    const webStore = getUnsupportedPageInfo({
      id: 1,
      url: 'https://chromewebstore.google.com/detail/foo',
    } as chrome.tabs.Tab);
    expect(webStore).not.toBeNull();
  });

  it('returns PDF viewer special copy', () => {
    const info = getUnsupportedPageInfo({
      id: 1,
      url: 'chrome-extension://abcdef/pdf-viewer.html?file=https%3A%2F%2Fx.com%2Fa.pdf',
    } as chrome.tabs.Tab);
    expect(info?.title).toMatch(/PDF translation is active/i);
  });
});
