import { describe, it, expect, vi } from 'vitest';
import { detectPdfAndNotify } from '../pdfDetect';

describe('detectPdfAndNotify', () => {
  it('sends PDF_DETECTED when contentType is application/pdf', () => {
    const send = vi.fn().mockResolvedValue(undefined);
    detectPdfAndNotify({
      contentType: 'application/pdf',
      href: 'https://arxiv.org/pdf/2606.20543',
      viewerOrigin: 'chrome-extension://abc/',
      tabId: 5,
      sendMessage: send,
    });
    expect(send).toHaveBeenCalledWith({
      action: 'PDF_DETECTED',
      url: 'https://arxiv.org/pdf/2606.20543',
      tabId: 5,
    });
  });

  it('does nothing when contentType is text/html', () => {
    const send = vi.fn();
    detectPdfAndNotify({
      contentType: 'text/html',
      href: 'https://example.com/',
      viewerOrigin: 'chrome-extension://abc/',
      tabId: 5,
      sendMessage: send,
    });
    expect(send).not.toHaveBeenCalled();
  });

  it('does nothing inside the viewer page (defensive; background also guards)', () => {
    const send = vi.fn();
    detectPdfAndNotify({
      contentType: 'application/pdf',
      href: 'chrome-extension://abc/pdf-viewer.html?file=https://x/y.pdf',
      viewerOrigin: 'chrome-extension://abc/',
      tabId: 5,
      sendMessage: send,
    });
    expect(send).not.toHaveBeenCalled();
  });

  it('does nothing when contentType is undefined (older browsers)', () => {
    const send = vi.fn();
    detectPdfAndNotify({
      contentType: undefined,
      href: 'https://x/y.pdf',
      viewerOrigin: 'chrome-extension://abc/',
      tabId: 5,
      sendMessage: send,
    });
    expect(send).not.toHaveBeenCalled();
  });

  it('does nothing when contentType is an unrelated type (e.g. image)', () => {
    const send = vi.fn();
    detectPdfAndNotify({
      contentType: 'image/png',
      href: 'https://x/y.png',
      viewerOrigin: 'chrome-extension://abc/',
      tabId: 5,
      sendMessage: send,
    });
    expect(send).not.toHaveBeenCalled();
  });
});
