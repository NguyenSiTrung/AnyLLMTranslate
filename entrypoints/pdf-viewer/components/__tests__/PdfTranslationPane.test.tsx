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

  it('reserves layout space for math paragraphs so prose boxes never overlap the canvas formula', async () => {
    // Layout: prose above (y=50), display-math in the middle (y=100, h=30),
    // prose below (y=160). The math is kept verbatim (kind 'math') and stays
    // visible on the background canvas. When the UPPER prose grows tall
    // (translation expansion), the math's original height must still be
    // reserved in the reflow so the lower prose is pushed BELOW the math's
    // reserved slot — not collapsed up against the upper prose, which would
    // jam the lower prose over the canvas-painted formula.
    //
    // Upper prose measured height stubbed to 100 → bottom at 150 (past the
    // math's top at 100). With the math spacer reserved (origHeight 30 at
    // top max(100, 150+4)=154, bottom 184), the lower prose must land at
    // >= 184+4 = 188. Without the spacer, the lower prose would collapse to
    // max(160, 154) = 160 — jammed against the upper prose and overlapping
    // the math's canvas slot.
    const page: PageTranslations = {
      state: 'translated',
      paragraphs: new Map([
        ['1-0', 'First prose paragraph translated.'],
        ['1-1', 'f(x) = x² + 2x + 1'],
        ['1-2', 'Second prose paragraph translated.'],
      ]),
      paragraphKinds: new Map([
        ['1-0', 'prose'],
        ['1-1', 'math'],
        ['1-2', 'prose'],
      ]),
      originalParagraphs: [
        { id: '1-0', text: 'First prose.', fontSize: 12, isHeading: false, x: 50, y: 50, width: 100, height: 14 },
        { id: '1-1', text: 'f(x) = x² + 2x + 1', fontSize: 12, isHeading: false, x: 50, y: 100, width: 100, height: 30 },
        { id: '1-2', text: 'Second prose.', fontSize: 12, isHeading: false, x: 50, y: 160, width: 100, height: 14 },
      ],
    };

    const realGetBCR = Element.prototype.getBoundingClientRect;
    const bcrSpy = vi
      .spyOn(Element.prototype, 'getBoundingClientRect')
      .mockImplementation(function (this: HTMLElement) {
        if (this.classList?.contains('pdf-viewer-layout-para-box')) {
          // Upper prose (1-0) grows to 100px; lower prose (1-2) is short.
          const text = this.textContent ?? '';
          const h = text.startsWith('First') ? 100 : 18;
          return { ...realGetBCR.call(this), height: h, width: 100, top: 0, left: 0, bottom: h, right: 100, x: 0, y: 0, toJSON: () => ({}) };
        }
        return realGetBCR.call(this);
      });

    try {
      const pdfPage = createPageMock();
      await renderLayout(page, pdfPage);

      const boxes = getLayoutBoxes();
      // Only the two prose paragraphs render LayoutOverlayBox; the math is a
      // transparent spacer, not a box.
      expect(boxes.length).toBe(2);
      expect(boxes.map((b) => b.textContent)).toEqual([
        'First prose paragraph translated.',
        'Second prose paragraph translated.',
      ]);

      // No white mask over the math — the canvas formula must stay visible.
      const masks = Array.from(document.querySelectorAll<HTMLElement>('.pdf-viewer-layout-para-mask'));
      expect(masks.length).toBe(2);

      // Lower prose pushed below the math's reserved slot. Upper bottom = 50 +
      // 100 = 150; math spacer top = max(100, 154) = 154, bottom = 184; lower
      // prose top = max(160, 188) = 188. Assert >= 188 (tolerance for the gap).
      const lowerBoxTop = parseInt(boxes[1].style.top, 10);
      expect(lowerBoxTop).toBeGreaterThanOrEqual(184);
    } finally {
      bcrSpy.mockRestore();
    }
  });

  it('reserves layout space for figure paragraphs so prose boxes never overlap the canvas figure', async () => {
    const page: PageTranslations = {
      state: 'translated',
      paragraphs: new Map([
        ['1-0', 'Translated prose.'],
        ['1-1', 'Figure 1: accuracy chart'],
      ]),
      paragraphKinds: new Map([
        ['1-0', 'prose'],
        ['1-1', 'figure'],
      ]),
      originalParagraphs: [
        { id: '1-0', text: 'Original prose.', fontSize: 12, isHeading: false, x: 50, y: 50, width: 100, height: 14 },
        { id: '1-1', text: 'Figure 1: accuracy chart', fontSize: 12, isHeading: false, x: 50, y: 100, width: 100, height: 60 },
      ],
    };
    const pdfPage = createPageMock();
    await renderLayout(page, pdfPage);

    const boxes = getLayoutBoxes();
    expect(boxes.length).toBe(1);
    expect(boxes[0].textContent).toBe('Translated prose.');

    const masks = Array.from(document.querySelectorAll<HTMLElement>('.pdf-viewer-layout-para-mask'));
    expect(masks.length).toBe(1);
  });

  it('drops verbatim prose paragraphs (preserves fdef86b) — only math/figure get the un-masked spacer', async () => {
    // Regression guard for the 51e28ef revert: the un-masked transparent
    // spacer must apply ONLY to math/figure kinds, NOT to prose that the LLM
    // happened to return unchanged. Verbatim prose stays dropped (fdef86b):
    // no box, no mask, no spacer — its English text shows on the canvas as
    // before. This prevents re-exposing hidden OCR metadata / untranslated
    // English that fdef86b was written to suppress.
    const page: PageTranslations = {
      state: 'translated',
      paragraphs: new Map([
        ['1-0', 'Translated prose.'],
        ['1-1', 'Unchanged prose.'], // translatedText === originalText, kind prose
      ]),
      paragraphKinds: new Map([
        ['1-0', 'prose'],
        ['1-1', 'prose'],
      ]),
      originalParagraphs: [
        { id: '1-0', text: 'Original prose.', fontSize: 12, isHeading: false, x: 50, y: 50, width: 100, height: 14 },
        { id: '1-1', text: 'Unchanged prose.', fontSize: 12, isHeading: false, x: 50, y: 100, width: 100, height: 14 },
      ],
    };
    const pdfPage = createPageMock();
    await renderLayout(page, pdfPage);

    const boxes = getLayoutBoxes();
    // Only the translated prose renders a box; the verbatim prose is dropped
    // (fdef86b behavior preserved), NOT turned into a spacer.
    expect(boxes.length).toBe(1);
    expect(boxes[0].textContent).toBe('Translated prose.');
    const masks = Array.from(document.querySelectorAll<HTMLElement>('.pdf-viewer-layout-para-mask'));
    expect(masks.length).toBe(1);
  });

  it('renders math/figure spacer even when no paragraphKinds are provided (legacy results)', async () => {
    // Backward-compat: older cached results may not carry paragraphKinds. In
    // that case the renderer falls back to the text-equality predicate —
    // verbatim text is dropped (never a spacer). This keeps legacy cached
    // pages rendering as before, with no regression.
    const page: PageTranslations = {
      state: 'translated',
      paragraphs: new Map([
        ['1-0', 'Translated prose.'],
        ['1-1', 'f(x) = x²'], // verbatim, no kind → legacy drop path
      ]),
      originalParagraphs: [
        { id: '1-0', text: 'Original prose.', fontSize: 12, isHeading: false, x: 50, y: 50, width: 100, height: 14 },
        { id: '1-1', text: 'f(x) = x²', fontSize: 12, isHeading: false, x: 50, y: 100, width: 100, height: 30 },
      ],
    };
    const pdfPage = createPageMock();
    await renderLayout(page, pdfPage);

    const boxes = getLayoutBoxes();
    expect(boxes.length).toBe(1);
    expect(boxes[0].textContent).toBe('Translated prose.');
    const masks = Array.from(document.querySelectorAll<HTMLElement>('.pdf-viewer-layout-para-mask'));
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
