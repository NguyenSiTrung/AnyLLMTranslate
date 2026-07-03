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

  it('positions boxes and masks at the original paragraph coordinates', async () => {
    const page = makeTranslatedPage();
    const pdfPage = createPageMock();
    await renderLayout(page, pdfPage);
    const box = getLayoutBoxes()[0];
    // x=50, y=50, scale=1 → left/top 50px; width=120 → 120px
    expect(box.style.left).toBe('50px');
    expect(box.style.top).toBe('50px');
    expect(box.style.width).toBe('120px');

    const mask = document.querySelector<HTMLElement>('.pdf-viewer-layout-para-mask');
    expect(mask).not.toBeNull();
    if (mask) {
      // width=120+2=122, height=14+2=16; left=50-1=49, top=50-1=49
      expect(mask.style.left).toBe('49px');
      expect(mask.style.top).toBe('49px');
      expect(mask.style.width).toBe('122px');
      expect(mask.style.height).toBe('16px');
    }
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

  it('shifts subsequent boxes down when a translation is longer than the original', async () => {
    const page: PageTranslations = {
      state: 'translated',
      paragraphs: new Map([
        ['1-0', 'Đây là một đoạn văn bản dịch dài hơn nhiều so với bản gốc.'],
        ['1-1', 'Second box.'],
      ]),
      originalParagraphs: [
        { id: '1-0', text: 'Short.', fontSize: 12, isHeading: false, x: 50, y: 50, width: 100, height: 14 },
        { id: '1-1', text: 'Second.', fontSize: 12, isHeading: false, x: 50, y: 100, width: 100, height: 14 },
      ],
    };
    const pdfPage = createPageMock();
    await renderLayout(page, pdfPage);
    const boxes = getLayoutBoxes();
    expect(boxes.length).toBe(2);
    // First box stays at its original position.
    expect(boxes[0].style.top).toBe('50px');
    // Second box is pushed below the first box's estimated bottom rather than
    // overlapping at its original 100px position.
    expect(parseInt(boxes[1].style.top, 10)).toBeGreaterThan(100);
  });

  it('reflows from measured DOM heights so headings never overlap the paragraph above (regression for Giới Thiệu overlap)', async () => {
    // Reproduces the screenshot bug: a long abstract paragraph whose measured
    // height exceeds the conservative estimate, followed by a heading at its
    // original y. The heading must be pushed below the paragraph's real bottom.
    const page: PageTranslations = {
      state: 'translated',
      paragraphs: new Map([
        ['1-0', 'TÓM TẮT — một đoạn tóm tắt dài bằng tiếng Việt với nhiều dấu phụ.'],
        ['1-1', 'Giới Thiệu'],
      ]),
      originalParagraphs: [
        { id: '1-0', text: 'Abstract.', fontSize: 12, isHeading: false, x: 50, y: 50, width: 100, height: 14 },
        { id: '1-1', text: 'Intro', fontSize: 22, isHeading: true, x: 50, y: 100, width: 100, height: 26 },
      ],
    };

    // Stub getBoundingClientRect on the layout boxes so the reflow uses a tall,
    // measured height (200px) that exceeds the estimate — the scenario where a
    // pure estimate-based reflow would under-flow and overlap.
    const realGetBCR = Element.prototype.getBoundingClientRect;
    const bcrSpy = vi
      .spyOn(Element.prototype, 'getBoundingClientRect')
      .mockImplementation(function (this: HTMLElement) {
        if (this.classList?.contains('pdf-viewer-layout-para-box')) {
          return { ...realGetBCR.call(this), height: 200, width: 100, top: 0, left: 0, bottom: 200, right: 100, x: 0, y: 0, toJSON: () => ({}) };
        }
        return realGetBCR.call(this);
      });

    try {
      const pdfPage = createPageMock();
      await renderLayout(page, pdfPage);
      const boxes = getLayoutBoxes();
      expect(boxes.length).toBe(2);
      // First paragraph sits at its original 50px.
      expect(boxes[0].style.top).toBe('50px');
      // Heading must be pushed below 50 + measured 200 + gap(4) = 254px,
      // NOT left at its original 100px (which would overlap the abstract).
      expect(parseInt(boxes[1].style.top, 10)).toBeGreaterThanOrEqual(254);
      bcrSpy.mockRestore();
    } finally {
      bcrSpy.mockRestore();
    }
  });

  it('does NOT render masks or boxes for untranslated (verbatim) paragraphs', async () => {
    const page: PageTranslations = {
      state: 'translated',
      paragraphs: new Map([
        ['1-0', 'Translated text.'],
        ['1-1', 'Untranslated verbatim text.'], // translatedText === original text
      ]),
      originalParagraphs: [
        { id: '1-0', text: 'Original text.', fontSize: 12, isHeading: false, x: 50, y: 50, width: 100, height: 14 },
        { id: '1-1', text: 'Untranslated verbatim text.', fontSize: 12, isHeading: false, x: 50, y: 100, width: 100, height: 14 },
      ],
    };
    const pdfPage = createPageMock();
    await renderLayout(page, pdfPage);

    const boxes = getLayoutBoxes();
    // Only '1-0' is translated, so only 1 box should render
    expect(boxes.length).toBe(1);
    expect(boxes[0].textContent).toBe('Translated text.');

    const masks = Array.from(document.querySelectorAll<HTMLElement>('.pdf-viewer-layout-para-mask'));
    // Only 1 mask should render for the translated paragraph
    expect(masks.length).toBe(1);
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

describe('PdfTranslationPane font-metrics pre-paint sizing', () => {
  // These tests verify that the canvas-based font-metrics helper drives
  // accurate pre-paint box heights — the headline improvement of Phase 5
  // Task 1. With a real `measureText`, the first-paint `top` of the second
  // box already accounts for the first box's wrapped height, so there's no
  // collision flash before the reflow effect runs.

  it('uses font metrics to push the second box below a wrapping first box on first paint', async () => {
    // measureText returns width = chars × 8px. With width=100 (effectiveWidth=94),
    // a 30-char text wraps into multiple lines, pushing box 2 down even before
    // the getBoundingClientRect reflow runs.
    const measureText = vi.fn((s: string) => ({ width: s.length * 8 }));
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(
      () => ({ font: '', measureText }) as unknown as CanvasRenderingContext2D,
    );
    // Suppress the reflow effect so we observe the PRE-PAINT estimate only.
    const realGetBCR = Element.prototype.getBoundingClientRect;
    vi
      .spyOn(Element.prototype, 'getBoundingClientRect')
      .mockImplementation(function (this: HTMLElement) {
        // Return 0 height so the measured value never exceeds the estimate —
        // isolates the font-metrics path from the DOM-measurement path.
        return { ...realGetBCR.call(this), height: 0, bottom: 0 };
      });

    const page: PageTranslations = {
      state: 'translated',
      paragraphs: new Map([
        // 30 chars → at 8px/char that's 240px; effectiveWidth=94 → ~3 lines.
        ['1-0', 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'],
        ['1-1', 'translated-b'],
      ]),
      originalParagraphs: [
        { id: '1-0', text: 'short', fontSize: 12, isHeading: false, x: 50, y: 50, width: 100, height: 14 },
        { id: '1-1', text: 'orig', fontSize: 12, isHeading: false, x: 50, y: 70, width: 100, height: 14 },
      ],
    };
    const pdfPage = createPageMock();
    await renderLayout(page, pdfPage);
    const boxes = getLayoutBoxes();
    expect(boxes.length).toBe(2);
    // Box 1 at its original 50px; box 2 pushed below 50 + ~3 wrapped lines.
    expect(boxes[0].style.top).toBe('50px');
    expect(parseInt(boxes[1].style.top, 10)).toBeGreaterThan(70);
    expect(measureText).toHaveBeenCalled();
  });

  it('falls back to a heuristic when measureText is unavailable without throwing', async () => {
    // No measureText on the context (e.g. jsdom stub) — must not throw, and
    // the boxes still render with sane positions.
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({} as CanvasRenderingContext2D);
    const page: PageTranslations = {
      state: 'translated',
      paragraphs: new Map([
        ['1-0', 'A long translated paragraph that should still wrap sanely.'],
        ['1-1', 'Second box.'],
      ]),
      originalParagraphs: [
        { id: '1-0', text: 'short', fontSize: 12, isHeading: false, x: 50, y: 50, width: 100, height: 14 },
        { id: '1-1', text: 'b', fontSize: 12, isHeading: false, x: 50, y: 70, width: 100, height: 14 },
      ],
    };
    const pdfPage = createPageMock();
    await renderLayout(page, pdfPage);
    const boxes = getLayoutBoxes();
    expect(boxes.length).toBe(2);
    // Heuristic still pushes box 2 down (it errs toward more lines).
    expect(parseInt(boxes[1].style.top, 10)).toBeGreaterThan(70);
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

describe('PdfTranslationPane streaming tail spinner (Phase 2)', () => {
  it('shows streaming tail spinner when translating with partial paragraphs', () => {
    const page: PageTranslations = {
      state: 'translating',
      paragraphs: new Map([
        ['p1', 'Xin chào'],
        ['p2', 'Thế giới'],
      ]),
    };
    render(
      <PdfTranslationPane pageNumber={1} page={page} paragraphCount={3} />,
    );
    // Partial paragraphs are visible
    expect(screen.getByText('Xin chào')).toBeInTheDocument();
    expect(screen.getByText('Thế giới')).toBeInTheDocument();
    // Streaming tail spinner is rendered
    expect(document.querySelector('.pdf-viewer-streaming-tail')).not.toBeNull();
    expect(document.querySelector('.pdf-viewer-spinner')).not.toBeNull();
  });

  it('shows loading skeleton when translating with no paragraphs (no stream yet)', () => {
    const page: PageTranslations = {
      state: 'translating',
      paragraphs: new Map(),
    };
    render(
      <PdfTranslationPane pageNumber={1} page={page} paragraphCount={3} />,
    );
    // No streaming tail spinner — falls back to skeleton
    expect(document.querySelector('.pdf-viewer-streaming-tail')).toBeNull();
    // Skeleton lines should be present
    expect(document.querySelectorAll('.pdf-viewer-skeleton').length).toBeGreaterThan(0);
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

  it('renders the original above the translation for each paragraph (reading order)', () => {
    const page: PageTranslations = {
      state: 'translated',
      paragraphs: new Map([['1-0', 'Translated text.']]),
      originalParagraphs: [
        { id: '1-0', text: 'Original text.', fontSize: 12, isHeading: false, x: 50, y: 50, width: 100, height: 14 },
      ],
    };
    const { container } = render(
      <PdfTranslationPane pageNumber={1} page={page} paragraphCount={1} viewMode="bilingual" />,
    );
    const groups = container.querySelectorAll('.pdf-viewer-bilingual-group');
    expect(groups.length).toBe(1);
    // Within the group, original comes before translation in DOM order.
    const children = Array.from(groups[0].children);
    expect(children[0].textContent).toBe('Original text.');
    expect(children[1].textContent).toBe('Translated text.');
    // Original carries the "original" modifier; translation the "translation" one.
    expect(children[0].className).toContain('pdf-viewer-bilingual-original');
    expect(children[1].className).toContain('pdf-viewer-bilingual-translation');
  });

  it('marks heading originals with the heading modifier in bilingual mode', () => {
    const page: PageTranslations = {
      state: 'translated',
      paragraphs: new Map([['1-0', 'Tiêu đề dịch']]),
      originalParagraphs: [
        { id: '1-0', text: 'Heading', fontSize: 22, isHeading: true, x: 50, y: 50, width: 200, height: 26 },
      ],
    };
    render(
      <PdfTranslationPane pageNumber={1} page={page} paragraphCount={1} viewMode="bilingual" />,
    );
    const original = document.querySelector('.pdf-viewer-bilingual-original');
    expect(original?.className).toContain('pdf-viewer-bilingual-original--heading');
  });

  it('shows idle status in bilingual mode when not translated', () => {
    const page: PageTranslations = { state: 'idle', paragraphs: new Map() };
    render(
      <PdfTranslationPane pageNumber={3} page={page} paragraphCount={0} viewMode="bilingual" />,
    );
    expect(screen.getByText(/Page 3 — Scroll to translate/)).toBeInTheDocument();
  });

  it('shows empty status in bilingual mode for scanned pages', () => {
    const page: PageTranslations = { state: 'translated', paragraphs: new Map() };
    render(
      <PdfTranslationPane pageNumber={3} page={page} paragraphCount={0} viewMode="bilingual" />,
    );
    expect(screen.getByText(/No extractable text on page 3/)).toBeInTheDocument();
  });
});
