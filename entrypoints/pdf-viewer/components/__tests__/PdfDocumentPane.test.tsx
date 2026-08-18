/**
 * PdfDocumentPane — onNumPages lifting (page-range selection needs the total).
 */

import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import type { RefObject } from 'react';

const mocks = vi.hoisted(() => ({
  usePdfDocument: vi.fn(),
  useVisiblePages: vi.fn(),
}));

vi.mock('../../hooks/usePdfDocument', () => ({ usePdfDocument: mocks.usePdfDocument }));
vi.mock('../../hooks/useVisiblePages', () => ({ useVisiblePages: mocks.useVisiblePages }));
vi.mock('../PdfCanvasRenderer', () => ({ PdfCanvasRenderer: () => null }));

import { PdfDocumentPane } from '../PdfDocumentPane';

const containerRef: RefObject<HTMLDivElement | null> = { current: null };

function stubDocument(over: Record<string, unknown> = {}): void {
  mocks.useVisiblePages.mockReturnValue({ visiblePages: new Set([1]) });
  mocks.usePdfDocument.mockReturnValue({
    loadState: 'loaded',
    pages: [null],
    numPages: 7,
    bytesLoaded: 0,
    bytesTotal: 0,
    error: null,
    ...over,
  });
}

describe('PdfDocumentPane', () => {
  it('reports numPages through onNumPages once loaded', () => {
    stubDocument();
    const onNumPages = vi.fn();
    render(
      <PdfDocumentPane url="https://example.com/a.pdf" containerRef={containerRef} onNumPages={onNumPages} />,
    );
    expect(onNumPages).toHaveBeenCalledWith(7);
  });

  it('reports changes but not repeated identical counts', () => {
    stubDocument({ numPages: 7 });
    const onNumPages = vi.fn();
    const view = render(
      <PdfDocumentPane url="https://example.com/a.pdf" containerRef={containerRef} onNumPages={onNumPages} />,
    );
    expect(onNumPages).toHaveBeenCalledTimes(1);

    stubDocument({ numPages: 42 });
    view.rerender(
      <PdfDocumentPane url="https://example.com/a.pdf" containerRef={containerRef} onNumPages={onNumPages} />,
    );
    expect(onNumPages).toHaveBeenCalledTimes(2);
    expect(onNumPages).toHaveBeenLastCalledWith(42);
  });
});
