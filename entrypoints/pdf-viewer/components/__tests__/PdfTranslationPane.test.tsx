/**
 * Tests for PdfTranslationPane layout overlay (canvas + translated boxes) and text mode.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import type { PDFPageProxy } from 'pdfjs-dist';
import { PdfTranslationPane } from '../PdfTranslationPane';
import type { PageTranslations } from '../../lib/pdfTranslation';

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

function createPageMock(viewportWidth = 720): PDFPageProxy {
  const viewport = {
    width: viewportWidth,
    height: 960,
    scale: 1,
    convertToViewportPoint: vi.fn((x: number, y: number) => [x, y]),
  };
  return {
    getViewport: vi.fn((args) => (args && args.scale ? { ...viewport, scale: args.scale } : viewport)),
    getTextContent: vi.fn(async () => ({ items: [], styles: {} })),
    render: vi.fn(() => ({ promise: Promise.resolve(), cancel: vi.fn() })),
  } as unknown as PDFPageProxy;
}

async function renderLayout(page: PageTranslations, pdfPage: PDFPageProxy, dims = { width: 720, height: 960 }) {
  const view = render(
    <PdfTranslationPane
      pageNumber={1}
      page={page}
      paragraphCount={1}
      layoutMode="original"
      pdfPage={pdfPage}
      visible
      dims={dims}
    />,
  );
  await waitFor(() => expect(document.querySelector('.pdf-viewer-layout-para-box')).not.toBeNull());
  return view;
}

function makeTranslatedPage(): PageTranslations {
  return {
    state: 'translated',
    paragraphs: new Map([['1-0', 'Dịch dài hơn bản gốc rất nhiều.']]),
    originalParagraphs: [
      {
        id: '1-0',
        text: 'Original short text.',
        fontSize: 12,
        isHeading: false,
        x: 50,
        y: 50,
        width: 120,
        height: 14,
      },
    ],
  };
}

function getLayoutBoxes(): HTMLElement[] {
  return Array.from(document.querySelectorAll<HTMLElement>('.pdf-viewer-layout-para-box'));
}

beforeEach(() => {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({} as CanvasRenderingContext2D);
  textLayerState.renderCount = 0;
  textLayerState.cancelCount = 0;
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('PdfTranslationPane default mode', () => {
  it('renders text mode by default', () => {
    const page: PageTranslations = {
      state: 'translated',
      paragraphs: new Map([['1-0', 'Bản dịch']]),
    };
    render(<PdfTranslationPane pageNumber={1} page={page} paragraphCount={1} />);
    expect(screen.getByText('Bản dịch')).toBeInTheDocument();
    expect(document.querySelector('.pdf-viewer-layout-para-box')).toBeNull();
  });

  it('renders the original page canvas in layout mode', async () => {
    const page = makeTranslatedPage();
    const pdfPage = createPageMock();
    await renderLayout(page, pdfPage);
    // Canvas (images/tables/blocks) is preserved in layout mode
    expect(document.querySelector('.pdf-viewer-page-canvas')).not.toBeNull();
    expect(document.querySelector('.pdf-viewer-layout-para-box')).not.toBeNull();
  });
});

describe('PdfTranslationPane layout overlay rendering', () => {
  it('renders translated text boxes overlaid on the canvas', async () => {
    const page = makeTranslatedPage();
    const pdfPage = createPageMock();
    await renderLayout(page, pdfPage);
    const boxes = getLayoutBoxes();
    expect(boxes.length).toBe(1);
    expect(boxes[0].textContent).toContain('Dịch dài hơn bản gốc rất nhiều.');
  });

  it('uses natural height (no fixed height) so text is never clipped', async () => {
    const page = makeTranslatedPage();
    const pdfPage = createPageMock();
    await renderLayout(page, pdfPage);
    const box = getLayoutBoxes()[0];
    expect(box.style.height).toBe('');
  });

  it('applies a readable minimum font size for tiny source fonts', async () => {
    const page: PageTranslations = {
      state: 'translated',
      paragraphs: new Map([['1-0', 'Translated.']]),
      originalParagraphs: [
        { id: '1-0', text: 'tiny', fontSize: 5, isHeading: false, x: 40, y: 40, width: 100, height: 6 },
      ],
    };
    const pdfPage = createPageMock();
    await renderLayout(page, pdfPage);
    const box = getLayoutBoxes()[0];
    expect(box.style.fontSize).toBe('12px');
  });

  it('preserves heading styling for headings', async () => {
    const page: PageTranslations = {
      state: 'translated',
      paragraphs: new Map([['1-0', 'Tiêu đề']]),
      originalParagraphs: [
        { id: '1-0', text: 'Heading', fontSize: 22, isHeading: true, x: 40, y: 40, width: 200, height: 26 },
      ],
    };
    const pdfPage = createPageMock();
    await renderLayout(page, pdfPage);
    const box = getLayoutBoxes()[0];
    expect(box.className).toContain('pdf-viewer-layout-para-box--heading');
    expect(box.style.fontSize).toBe('22px');
  });

  it('positions boxes at the original paragraph coordinates', async () => {
    const page = makeTranslatedPage();
    const pdfPage = createPageMock();
    await renderLayout(page, pdfPage);
    const box = getLayoutBoxes()[0];
    // x=50, y=50, scale=1 → left/top 50px; width=120 → 120px
    expect(box.style.left).toBe('50px');
    expect(box.style.top).toBe('50px');
    expect(box.style.width).toBe('120px');
  });

  it('preserves reading order across multiple paragraphs', async () => {
    const page: PageTranslations = {
      state: 'translated',
      paragraphs: new Map([
        ['1-0', 'First translation.'],
        ['1-1', 'Second translation.'],
        ['1-2', 'Third translation.'],
      ]),
      originalParagraphs: [
        { id: '1-0', text: 'First.', fontSize: 12, isHeading: false, x: 50, y: 50, width: 100, height: 14 },
        { id: '1-1', text: 'Second.', fontSize: 12, isHeading: false, x: 50, y: 100, width: 100, height: 14 },
        { id: '1-2', text: 'Third.', fontSize: 12, isHeading: false, x: 50, y: 150, width: 100, height: 14 },
      ],
    };
    const pdfPage = createPageMock();
    await renderLayout(page, pdfPage);
    const boxes = getLayoutBoxes();
    expect(boxes.map((b) => b.textContent)).toEqual([
      'First translation.',
      'Second translation.',
      'Third translation.',
    ]);
  });

  it('renders no clipped badge, popover, or clipped modifier', async () => {
    const page = makeTranslatedPage();
    const pdfPage = createPageMock();
    await renderLayout(page, pdfPage);
    expect(document.querySelector('.pdf-viewer-layout-clipped-badge')).toBeNull();
    expect(document.querySelector('.pdf-viewer-layout-popover')).toBeNull();
    expect(document.querySelector('.pdf-viewer-layout-para-box--clipped')).toBeNull();
  });
});

describe('PdfTranslationPane layout states', () => {
  it('shows scroll-to-translate status over the canvas when idle', () => {
    const page: PageTranslations = { state: 'idle', paragraphs: new Map() };
    render(
      <PdfTranslationPane
        pageNumber={2}
        page={page}
        paragraphCount={0}
        layoutMode="original"
        pdfPage={createPageMock()}
        visible
        dims={{ width: 720, height: 960 }}
      />,
    );
    expect(screen.getByText(/Page 2 — Scroll to translate/)).toBeInTheDocument();
    expect(document.querySelector('.pdf-viewer-layout-para-box')).toBeNull();
  });

  it('shows translating status over the canvas', () => {
    const page: PageTranslations = { state: 'translating', paragraphs: new Map() };
    render(
      <PdfTranslationPane
        pageNumber={2}
        page={page}
        paragraphCount={1}
        layoutMode="original"
        pdfPage={createPageMock()}
        visible
        dims={{ width: 720, height: 960 }}
      />,
    );
    expect(screen.getByText(/Translating page 2/)).toBeInTheDocument();
  });

  it('shows error status with retry button over the canvas', async () => {
    const page: PageTranslations = {
      state: 'error',
      paragraphs: new Map(),
      error: 'boom',
    };
    const onRetry = vi.fn();
    render(
      <PdfTranslationPane
        pageNumber={2}
        page={page}
        paragraphCount={1}
        layoutMode="original"
        pdfPage={createPageMock()}
        visible
        dims={{ width: 720, height: 960 }}
        onRetry={onRetry}
      />,
    );
    expect(screen.getByText('Translation failed')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Retry'));
    expect(onRetry).toHaveBeenCalledWith(2);
  });

  it('shows empty status for scanned pages over the canvas', () => {
    const page: PageTranslations = { state: 'translated', paragraphs: new Map() };
    render(
      <PdfTranslationPane
        pageNumber={2}
        page={page}
        paragraphCount={0}
        layoutMode="original"
        pdfPage={createPageMock()}
        visible
        dims={{ width: 720, height: 960 }}
      />,
    );
    expect(screen.getByText(/No extractable text on page 2/)).toBeInTheDocument();
  });
});
