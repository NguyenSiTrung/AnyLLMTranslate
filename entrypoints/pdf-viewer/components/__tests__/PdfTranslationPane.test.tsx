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

describe('PdfTranslationPane layout overlay rendering', () => {
  it('renders translated text boxes overlaid on the canvas', async () => {
    const page = makeTranslatedPage();
    const pdfPage = createPageMock();
    await renderLayout(page, pdfPage);
    const boxes = getLayoutBoxes();
    expect(boxes.length).toBe(1);
    expect(boxes[0].textContent).toContain('Dịch dài hơn bản gốc rất nhiều.');
  });

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

describe('PdfTranslationPane bilingual mode (Phase 5 Task 2)', () => {
  it('renders original + translated paragraphs stacked in bilingual mode', () => {
    const page: PageTranslations = {
      state: 'translated',
      paragraphs: new Map([
        ['1-0', 'Bản dịch thứ nhất.'],
        ['1-1', 'Bản dịch thứ hai.'],
      ]),
      originalParagraphs: [
        { id: '1-0', text: 'First original.', fontSize: 12, isHeading: false, x: 50, y: 50, width: 100, height: 14 },
        { id: '1-1', text: 'Second original.', fontSize: 12, isHeading: false, x: 50, y: 100, width: 100, height: 14 },
      ],
    };
    render(
      <PdfTranslationPane pageNumber={1} page={page} paragraphCount={2} viewMode="bilingual" />,
    );
    // Both originals present
    expect(screen.getByText('First original.')).toBeInTheDocument();
    expect(screen.getByText('Second original.')).toBeInTheDocument();
    // Both translations present
    expect(screen.getByText('Bản dịch thứ nhất.')).toBeInTheDocument();
    expect(screen.getByText('Bản dịch thứ hai.')).toBeInTheDocument();
    // Bilingual container class applied
    expect(document.querySelector('.pdf-viewer-bilingual')).not.toBeNull();
  });
});
