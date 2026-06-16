/**
 * Tests for PdfTranslationPane elastic overlay + text mode rendering.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import type { PDFPageProxy } from 'pdfjs-dist';
import { PdfTranslationPane } from '../PdfTranslationPane';
import type { PageTranslations } from '../../lib/pdfTranslation';

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
  await waitFor(() => expect(document.querySelector('.pdf-viewer-elastic-para')).not.toBeNull());
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

function getElasticParas(): HTMLElement[] {
  return Array.from(document.querySelectorAll<HTMLElement>('.pdf-viewer-elastic-para'));
}

beforeEach(() => {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({} as CanvasRenderingContext2D);
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
    expect(document.querySelector('.pdf-viewer-elastic-para')).toBeNull();
  });

  it('does not render a canvas in elastic layout mode', async () => {
    const page = makeTranslatedPage();
    const pdfPage = createPageMock();
    await renderLayout(page, pdfPage);
    // Elastic overlay replaces the original canvas entirely
    expect(document.querySelector('.pdf-viewer-page-canvas')).toBeNull();
    expect(document.querySelector('.pdf-viewer-elastic-page')).not.toBeNull();
  });
});

describe('PdfTranslationPane elastic layout rendering', () => {
  it('renders translated paragraphs in elastic boxes', async () => {
    const page = makeTranslatedPage();
    const pdfPage = createPageMock();
    await renderLayout(page, pdfPage);
    const paras = getElasticParas();
    expect(paras.length).toBe(1);
    expect(paras[0].textContent).toContain('Dịch dài hơn bản gốc rất nhiều.');
  });

  it('uses natural height (no fixed height) so text is never clipped', async () => {
    const page = makeTranslatedPage();
    const pdfPage = createPageMock();
    await renderLayout(page, pdfPage);
    const para = getElasticParas()[0];
    expect(para.style.height).toBe('');
    // overflow hidden (the clipping mechanism) is gone
    expect(para.style.overflow).toBe('');
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
    const para = getElasticParas()[0];
    // 5 PDF units * scale(1) = 5px, floored to 12px
    expect(para.style.fontSize).toBe('12px');
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
    const para = getElasticParas()[0];
    expect(para.className).toContain('pdf-viewer-elastic-para--heading');
    expect(para.style.fontSize).toBe('22px');
  });

  it('preserves horizontal position via margin and keeps page width', async () => {
    const page = makeTranslatedPage();
    const pdfPage = createPageMock();
    await renderLayout(page, pdfPage);
    const para = getElasticParas()[0];
    // x=50, scale=1 → marginLeft 50px; width=120 → 120px
    expect(para.style.marginLeft).toBe('50px');
    expect(para.style.width).toBe('120px');
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
    const paras = getElasticParas();
    expect(paras.map((p) => p.textContent)).toEqual([
      'First translation.',
      'Second translation.',
      'Third translation.',
    ]);
  });

  it('renders no clipped badge, popover, or hover-scale affordance', async () => {
    const page = makeTranslatedPage();
    const pdfPage = createPageMock();
    await renderLayout(page, pdfPage);
    expect(document.querySelector('.pdf-viewer-layout-para-box')).toBeNull();
    expect(document.querySelector('.pdf-viewer-layout-clipped-badge')).toBeNull();
    expect(document.querySelector('.pdf-viewer-layout-popover')).toBeNull();
    expect(document.querySelector('.pdf-viewer-layout-para-box--clipped')).toBeNull();
  });
});

describe('PdfTranslationPane elastic states', () => {
  it('shows scroll-to-translate status when idle', () => {
    const page: PageTranslations = { state: 'idle', paragraphs: new Map() };
    render(
      <PdfTranslationPane
        pageNumber={2}
        page={page}
        paragraphCount={0}
        layoutMode="original"
        pdfPage={createPageMock()}
        dims={{ width: 720, height: 960 }}
      />,
    );
    expect(screen.getByText(/Page 2 — Scroll to translate/)).toBeInTheDocument();
    expect(document.querySelector('.pdf-viewer-elastic-para')).toBeNull();
  });

  it('shows translating status', () => {
    const page: PageTranslations = { state: 'translating', paragraphs: new Map() };
    render(
      <PdfTranslationPane
        pageNumber={2}
        page={page}
        paragraphCount={1}
        layoutMode="original"
        pdfPage={createPageMock()}
        dims={{ width: 720, height: 960 }}
      />,
    );
    expect(screen.getByText(/Translating page 2/)).toBeInTheDocument();
  });

  it('shows error status with retry button', async () => {
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
        dims={{ width: 720, height: 960 }}
        onRetry={onRetry}
      />,
    );
    expect(screen.getByText('Translation failed')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Retry'));
    expect(onRetry).toHaveBeenCalledWith(2);
  });

  it('shows empty status for scanned pages', () => {
    const page: PageTranslations = { state: 'translated', paragraphs: new Map() };
    render(
      <PdfTranslationPane
        pageNumber={2}
        page={page}
        paragraphCount={0}
        layoutMode="original"
        pdfPage={createPageMock()}
        dims={{ width: 720, height: 960 }}
      />,
    );
    expect(screen.getByText(/No extractable text on page 2/)).toBeInTheDocument();
  });
});
