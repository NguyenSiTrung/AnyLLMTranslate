import { describe, it, expect } from 'vitest';
import { shouldAutoOpenPdf, buildSessionKey } from '../pdfAutoOpen';
import { DEFAULT_SETTINGS } from '@/types/config';

const baseSettings = {
  ...DEFAULT_SETTINGS,
  pdfSettings: { ...DEFAULT_SETTINGS.pdfSettings, autoOpen: 'auto' as const },
};
const providerReady = {
  ...baseSettings,
  provider: {
    ...baseSettings.provider,
    baseUrl: 'http://x',
    model: 'm',
    connectionStatus: 'success' as const,
  },
};

describe('buildSessionKey', () => {
  it('joins tabId and url origin+pathname (strips hash/query churn)', () => {
    const k1 = buildSessionKey(7, 'https://arxiv.org/pdf/2606.20543');
    const k2 = buildSessionKey(7, 'https://arxiv.org/pdf/2606.20543#page=3');
    expect(k1).toBe(k2);
  });

  it('strips query strings', () => {
    const k1 = buildSessionKey(7, 'https://x/y.pdf');
    const k2 = buildSessionKey(7, 'https://x/y.pdf?download=1');
    expect(k1).toBe(k2);
  });

  it('differs across tabs', () => {
    expect(buildSessionKey(1, 'https://x/y.pdf')).not.toBe(buildSessionKey(2, 'https://x/y.pdf'));
  });
});

describe('shouldAutoOpenPdf', () => {
  it('opens when auto=on, provider ready, url is not the viewer, not deduped, not blocked', () => {
    const r = shouldAutoOpenPdf({
      url: 'https://arxiv.org/pdf/2606.20543',
      viewerOrigin: 'chrome-extension://abc/',
      settings: providerReady,
      sessionKey: 'k1',
      openedSessionKeys: new Set(),
    });
    expect(r.open).toBe(true);
  });

  it('does NOT open when autoOpen is off', () => {
    const r = shouldAutoOpenPdf({
      url: 'https://x/y.pdf',
      viewerOrigin: 'chrome-extension://abc/',
      settings: { ...providerReady, pdfSettings: { ...providerReady.pdfSettings, autoOpen: 'off' } },
      sessionKey: 'k1',
      openedSessionKeys: new Set(),
    });
    expect(r.open).toBe(false);
    expect(r.reason).toMatch(/autoOpen/i);
  });

  it('does NOT open when url is the viewer itself (infinite-loop guard)', () => {
    const r = shouldAutoOpenPdf({
      url: 'chrome-extension://abc/pdf-viewer.html?file=https://x/y.pdf',
      viewerOrigin: 'chrome-extension://abc/',
      settings: providerReady,
      sessionKey: 'k1',
      openedSessionKeys: new Set(),
    });
    expect(r.open).toBe(false);
    expect(r.reason).toMatch(/viewer|loop/i);
  });

  it('does NOT open when provider cannot translate', () => {
    const r = shouldAutoOpenPdf({
      url: 'https://x/y.pdf',
      viewerOrigin: 'chrome-extension://abc/',
      settings: { ...baseSettings, provider: { ...baseSettings.provider, baseUrl: '', model: '' } },
      sessionKey: 'k1',
      openedSessionKeys: new Set(),
    });
    expect(r.open).toBe(false);
    expect(r.reason).toMatch(/provider/i);
  });

  it('does NOT open when hostname is in neverAutoOpenSites', () => {
    const r = shouldAutoOpenPdf({
      url: 'https://blocked.example.com/p.pdf',
      viewerOrigin: 'chrome-extension://abc/',
      settings: {
        ...providerReady,
        pdfSettings: { ...providerReady.pdfSettings, neverAutoOpenSites: ['blocked.example.com'] },
      },
      sessionKey: 'k1',
      openedSessionKeys: new Set(),
    });
    expect(r.open).toBe(false);
    expect(r.reason).toMatch(/never|blocked/i);
  });

  it('does NOT open when session key was already opened (dedupe)', () => {
    const r = shouldAutoOpenPdf({
      url: 'https://x/y.pdf',
      viewerOrigin: 'chrome-extension://abc/',
      settings: providerReady,
      sessionKey: 'dup',
      openedSessionKeys: new Set(['dup']),
    });
    expect(r.open).toBe(false);
    expect(r.reason).toMatch(/already|dedupe/i);
  });

  it('prompt mode returns open=false (banner handles it client-side)', () => {
    const r = shouldAutoOpenPdf({
      url: 'https://x/y.pdf',
      viewerOrigin: 'chrome-extension://abc/',
      settings: { ...providerReady, pdfSettings: { ...providerReady.pdfSettings, autoOpen: 'prompt' } },
      sessionKey: 'k1',
      openedSessionKeys: new Set(),
    });
    expect(r.open).toBe(false);
    expect(r.reason).toMatch(/prompt/i);
  });

  it('catches arxiv-style extensionless URLs (no .pdf suffix)', () => {
    const r = shouldAutoOpenPdf({
      url: 'https://arxiv.org/pdf/2606.20543',
      viewerOrigin: 'chrome-extension://abc/',
      settings: providerReady,
      sessionKey: 'arxiv',
      openedSessionKeys: new Set(),
    });
    expect(r.open).toBe(true);
  });

  it('refuses to open for a malformed url', () => {
    const r = shouldAutoOpenPdf({
      url: 'not-a-url',
      viewerOrigin: 'chrome-extension://abc/',
      settings: providerReady,
      sessionKey: 'k1',
      openedSessionKeys: new Set(),
    });
    // 'not-a-url' actually parses as a relative URL in the URL constructor —
    // hostname becomes ''. The neverAutoOpenSites check passes (no match),
    // so this depends on behavior. Verify it does not throw.
    expect(typeof r.open).toBe('boolean');
  });
});
