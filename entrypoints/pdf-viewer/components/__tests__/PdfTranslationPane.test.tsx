/**
 * Tests for PdfTranslationPane layout UX improvements.
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

function createPageMock(): PDFPageProxy {
  const viewport = { width: 720, height: 960, scale: 1, convertToViewportPoint: vi.fn((x: number, y: number) => [x, y]) };
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

  it('switches to layout mode when requested', async () => {
    const page = makeTranslatedPage();
    const pdfPage = createPageMock();
    await renderLayout(page, pdfPage);
    expect(document.querySelector('.pdf-viewer-layout-para-box')).not.toBeNull();
  });
});

describe('PdfTranslationPane layout full-text interaction', () => {
  it('opens full-translation popover on click', async () => {
    const page = makeTranslatedPage();
    const pdfPage = createPageMock();
    await renderLayout(page, pdfPage);
    const box = document.querySelector('.pdf-viewer-layout-para-box') as HTMLElement;
    expect(box).not.toBeNull();
    fireEvent.click(box);
    const popover = document.querySelector('.pdf-viewer-layout-popover') as HTMLElement;
    expect(popover).not.toBeNull();
    expect(popover.textContent).toContain('Dịch dài hơn bản gốc rất nhiều.');
  });

  it('focusable layout box opens popover with Enter key', async () => {
    const page = makeTranslatedPage();
    const pdfPage = createPageMock();
    await renderLayout(page, pdfPage);
    const box = document.querySelector('.pdf-viewer-layout-para-box') as HTMLElement;
    box.focus();
    fireEvent.keyDown(box, { key: 'Enter' });
    expect(document.querySelector('.pdf-viewer-layout-popover')).not.toBeNull();
  });

  it('dismisses popover with Escape key', async () => {
    const page = makeTranslatedPage();
    const pdfPage = createPageMock();
    await renderLayout(page, pdfPage);
    const box = document.querySelector('.pdf-viewer-layout-para-box') as HTMLElement;
    fireEvent.click(box);
    expect(document.querySelector('.pdf-viewer-layout-popover')).not.toBeNull();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(document.querySelector('.pdf-viewer-layout-popover')).toBeNull();
  });

  it('only keeps one popover open at a time', async () => {
    const page: PageTranslations = {
      state: 'translated',
      paragraphs: new Map([
        ['1-0', 'First translation is longer.'],
        ['1-1', 'Second translation is also longer than original text here.'],
      ]),
      originalParagraphs: [
        { id: '1-0', text: 'First.', fontSize: 12, isHeading: false, x: 50, y: 50, width: 60, height: 14 },
        { id: '1-1', text: 'Second.', fontSize: 12, isHeading: false, x: 50, y: 100, width: 70, height: 14 },
      ],
    };
    const pdfPage = createPageMock();
    await renderLayout(page, pdfPage);
    const boxes = document.querySelectorAll('.pdf-viewer-layout-para-box');
    expect(boxes.length).toBe(2);
    fireEvent.click(boxes[0] as HTMLElement);
    expect(document.querySelectorAll('.pdf-viewer-layout-popover').length).toBe(1);
    fireEvent.click(boxes[1] as HTMLElement);
    expect(document.querySelectorAll('.pdf-viewer-layout-popover').length).toBe(1);
  });
});

describe('PdfTranslationPane clipping affordance', () => {
  it('marks blocks with expanded translations as clipped', async () => {
    const page = makeTranslatedPage();
    const pdfPage = createPageMock();
    await renderLayout(page, pdfPage);
    const box = document.querySelector('.pdf-viewer-layout-para-box--clipped') as HTMLElement;
    expect(box).not.toBeNull();
  });

  it('does not mark short translations as clipped', async () => {
    const page: PageTranslations = {
      state: 'translated',
      paragraphs: new Map([['1-0', 'Ok']]),
      originalParagraphs: [
        { id: '1-0', text: 'Ok', fontSize: 12, isHeading: false, x: 50, y: 50, width: 80, height: 14 },
      ],
    };
    const pdfPage = createPageMock();
    await renderLayout(page, pdfPage);
    expect(document.querySelector('.pdf-viewer-layout-para-box--clipped')).toBeNull();
  });
});
