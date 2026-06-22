/**
 * Tests for message types — PDF_DETECTED.
 */

import { describe, it, expect } from 'vitest';
import type { PdfDetectedMessage, ExtensionMessage } from '../messages';

describe('PdfDetectedMessage type', () => {
  it('shapes a PDF_DETECTED message', () => {
    const msg: PdfDetectedMessage = {
      action: 'PDF_DETECTED',
      url: 'https://arxiv.org/pdf/2606.20543',
      tabId: 42,
    };
    expect(msg.action).toBe('PDF_DETECTED');
    expect(msg.url).toContain('arxiv');
  });

  it('works without a tabId (background resolves from sender.tab.id)', () => {
    const msg: PdfDetectedMessage = { action: 'PDF_DETECTED', url: 'https://x/y.pdf' };
    expect(msg.tabId).toBeUndefined();
  });

  it('is assignable to ExtensionMessage', () => {
    const msg: ExtensionMessage = { action: 'PDF_DETECTED', url: 'https://x/y.pdf', tabId: 1 };
    expect((msg as PdfDetectedMessage).url).toBe('https://x/y.pdf');
  });
});
