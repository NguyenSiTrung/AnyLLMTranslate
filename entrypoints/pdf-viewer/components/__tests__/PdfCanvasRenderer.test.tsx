import { render, screen, waitFor } from '@testing-library/react';
import type { PDFPageProxy } from 'pdfjs-dist';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const textLayerState = vi.hoisted(() => ({
  renderCount: 0,
  cancelCount: 0,
}));

vi.mock('pdfjs-dist', () => ({
  TextLayer: class MockTextLayer {
    textContentSource: { items: Array<{ str: string }> };
    container: HTMLElement;

    constructor({
      textContentSource,
      container,
    }: {
      textContentSource: { items: Array<{ str: string }> };
      container: HTMLElement;
    }) {
      this.textContentSource = textContentSource;
      this.container = container;
    }

    async render() {
      textLayerState.renderCount += 1;
      for (const item of this.textContentSource.items) {
        const span = globalThis.document.createElement('span');
        span.textContent = item.str;
        this.container.appendChild(span);
      }
    }

    cancel() {
      textLayerState.cancelCount += 1;
    }
  },
}));

import { PdfCanvasRenderer } from '../PdfCanvasRenderer';

function createPageMock(): PDFPageProxy {
  const viewport = { width: 720, height: 960 };
  return {
    getViewport: vi.fn(() => viewport),
    getTextContent: vi.fn(async () => ({
      items: [{ str: 'Selectable source text' }],
      styles: {},
    })),
    render: vi.fn(() => ({
      promise: Promise.resolve(),
      cancel: vi.fn(),
    })),
  } as unknown as PDFPageProxy;
}

beforeEach(() => {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({} as CanvasRenderingContext2D);
  textLayerState.renderCount = 0;
  textLayerState.cancelCount = 0;
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('PdfCanvasRenderer', () => {
  it('renders a selectable text layer over the original canvas', async () => {
    const page = createPageMock();

    const { container } = render(
      <PdfCanvasRenderer
        page={page}
        pageNumber={1}
        visible
        devicePixelRatio={1}
      />,
    );

    const textLayer = await waitFor(() => {
      const layer = container.querySelector('.pdf-viewer-text-layer');
      expect(layer).not.toBeNull();
      return layer as HTMLElement;
    });

    expect(textLayer).toHaveAttribute('aria-label', 'Selectable text for PDF page 1');
    expect(textLayer.style.getPropertyValue('--scale-factor')).toBe('1');
    expect(screen.getByText('Selectable source text')).toBeInTheDocument();
    expect(page.getTextContent).toHaveBeenCalledTimes(1);
    expect(textLayerState.renderCount).toBe(1);
  });

  it('can disable the selectable text layer for non-original pane backgrounds', async () => {
    const page = createPageMock();

    const { container } = render(
      <PdfCanvasRenderer
        page={page}
        pageNumber={1}
        visible
        devicePixelRatio={1}
        enableTextLayer={false}
      />,
    );

    await waitFor(() => expect(screen.getByLabelText('PDF page 1')).toHaveAttribute('data-rendered', 'true'));
    expect(container.querySelector('.pdf-viewer-text-layer')).toBeNull();
    expect(page.getTextContent).not.toHaveBeenCalled();
  });
});
