import { describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { BridgeSetupCard } from '@/entrypoints/pdf-viewer/components/BridgeSetupCard';
import {
  availableFormats,
  defaultFormat,
  formatCardCopy,
  openResultPrefer,
  isRecommended,
  compareArtifactKind,
} from '@/entrypoints/pdf-viewer/components/scientificJobModalFormats';
import { ViewerLayout } from '@/entrypoints/pdf-viewer/components/ViewerLayout';
import { ScientificJobModal } from '@/entrypoints/pdf-viewer/components/ScientificJobModal';
import type { ScientificJobProgress } from '../hooks/useScientificPdfJob';
import {
  initialSessionState,
  applyOpenTranslated,
  applyOpenCompare,
  applyShellMode,
  compareRightLabel,
  readerPaneLabel,
} from '@/entrypoints/pdf-viewer/lib/pdfShellMode';
import { PDFDocument } from 'pdf-lib';
import {
  computeSideBySidePageSize,
  buildAlternatingPageOrder,
  resolveDualPagePair,
  resolveSubsetPagePairs,
  buildSideBySideDualPdf,
  buildMergedMonoPdf,
  dualExportFilename,
} from '@/entrypoints/pdf-viewer/lib/pdfDualExport';

describe('BridgeSetupCard', () => {
  it('covers offline setup copy and configured setup, refresh, and dismiss actions', () => {
    render(
      <BridgeSetupCard
        status="offline"
        onRefresh={vi.fn()}
        onOpenSetup={vi.fn()}
      />,
    );
    expect(screen.getByText(/not available/i)).toBeTruthy();
    expect(screen.getByText(/scientific-pdf-docker\.sh up/)).toBeTruthy();
    const guideLink = screen.getByRole('link', { name: /full setup guide/i });
    expect(guideLink).toHaveAttribute('href', 'https://nguyensitrung.github.io/AnyLLMTranslate/guide/');
    expect(guideLink).toHaveAttribute('target', '_blank');
    expect(screen.queryByRole('button', { name: /^Translate$/i })).toBeNull();
    expect(screen.queryByText(/fast translation/i)).toBeNull();
    cleanup();

    const onOpenSetup = vi.fn();
    const onRefresh = vi.fn();
    const configured = render(
      <BridgeSetupCard
        status="not_configured"
        onRefresh={onRefresh}
        onOpenSetup={onOpenSetup}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Set up/i }));
    expect(onOpenSetup).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: /Check connection/i }));
    expect(onRefresh).toHaveBeenCalledTimes(1);
    configured.unmount();

    const onDismiss = vi.fn();
    render(
      <BridgeSetupCard
        status="offline"
        onRefresh={vi.fn()}
        onOpenSetup={vi.fn()}
        onDismiss={onDismiss}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Not now/i }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});

describe('scientificJobModalFormats', () => {
  it('compares artifacts and derives availability, defaults, copy, and open preferences', () => {
    expect(compareArtifactKind({ hasMono: true, hasDual: true })).toBe('mono');
    expect(compareArtifactKind({ hasMono: false, hasDual: true })).toBe('dual');
    expect(compareArtifactKind({ hasMono: false, hasDual: false })).toBe(null);
    expect(availableFormats({ hasMono: true, hasDual: true })).toEqual([
      'side-by-side',
      'dual',
      'mono',
    ]);
    expect(availableFormats({ hasMono: true, hasDual: false })).toEqual(['side-by-side', 'mono']);
    expect(availableFormats({ hasMono: false, hasDual: true })).toEqual(['dual']);
    expect(availableFormats({ hasMono: false, hasDual: false })).toEqual([]);

    expect(defaultFormat({ hasMono: true, hasDual: true })).toBe('side-by-side');
    expect(defaultFormat({ hasMono: true, hasDual: false })).toBe('side-by-side');
    expect(defaultFormat({ hasMono: false, hasDual: true })).toBe('dual');
    expect(defaultFormat({ hasMono: false, hasDual: false })).toBe(null);

    for (const f of ['mono', 'dual', 'side-by-side'] as const) {
      const c = formatCardCopy(f);
      const blob = `${c.title} ${c.hint} ${c.downloadLabel}`;
      expect(blob.toLowerCase()).not.toMatch(/pdf2zh/);
      expect(blob).not.toMatch(/L\|R/i);
    }
    expect(formatCardCopy('side-by-side').downloadLabel).toMatch(/side-by-side/i);
    expect(formatCardCopy('dual').title.toLowerCase()).toMatch(/bilingual|bridge/);
    expect(formatCardCopy('mono').title.toLowerCase()).toMatch(/translated/);

    expect(openResultPrefer('dual', { hasMono: true, hasDual: true })).toBe('dual');
    expect(openResultPrefer('side-by-side', { hasMono: true, hasDual: true })).toBe('mono');
    expect(openResultPrefer('mono', { hasMono: true, hasDual: false })).toBe('mono');
    expect(openResultPrefer('dual', { hasMono: false, hasDual: false })).toBe(null);
    expect(openResultPrefer(null, { hasMono: true, hasDual: true })).toBe('mono');

    expect(isRecommended('side-by-side', { hasMono: true, hasDual: true })).toBe(true);
    expect(isRecommended('dual', { hasMono: true, hasDual: true })).toBe(false);
    expect(isRecommended('dual', { hasMono: false, hasDual: true })).toBe(true);
  });
});

describe('ViewerLayout', () => {
  it('renders reader mode (one pane) and compare mode (two panes)', () => {
    const reader = render(
      <ViewerLayout mode="reader" readerLabel="Original" reader={<div>reader-body</div>} />,
    );
    expect(screen.getByText('Original')).toBeTruthy();
    expect(screen.getByText('reader-body')).toBeTruthy();
    expect(screen.queryByText('Translated')).toBeNull();
    expect(document.querySelectorAll('[data-pane]').length).toBe(1);
    reader.unmount();

    render(
      <ViewerLayout
        mode="compare"
        leftLabel="Original"
        rightLabel="Translated"
        left={<div>left-body</div>}
        right={<div>right-body</div>}
      />,
    );
    expect(screen.getByText('left-body')).toBeTruthy();
    expect(screen.getByText('right-body')).toBeTruthy();
    expect(document.querySelectorAll('[data-pane]').length).toBe(2);
  });
});

function baseProgress(over: Partial<ScientificJobProgress> = {}): ScientificJobProgress {
  return {
    stage: 'done',
    progress: 1,
    message: 'Complete',
    logs: ['18:00:00 Job succeeded'],
    hasMono: true,
    hasDual: true,
    jobId: 'job_test',
    ...over,
  };
}

const noop = () => {};

function setupProgress(over: Partial<ScientificJobProgress> = {}): ScientificJobProgress {
  return {
    stage: 'idle',
    progress: 0,
    message: '',
    logs: [],
    hasMono: false,
    hasDual: false,
    ...over,
  };
}

interface SetupProps {
  numPages?: number;
  hasPreviousRun?: boolean;
  onStart?: (pages?: string, opts?: { mergeWithPrevious?: boolean }) => void;
}

function renderSetup({
  numPages = 42,
  hasPreviousRun = false,
  onStart = vi.fn(),
}: SetupProps = {}) {
  return render(
    <ScientificJobModal
      progress={setupProgress()}
      fileName="paper.pdf"
      numPages={numPages}
      hasPreviousRun={hasPreviousRun}
      onStart={onStart}
      onCancel={noop}
      onClose={noop}
      onRetry={noop}
      onOpenTranslated={noop}
    />,
  );
}

describe('ScientificJobModal', () => {
  it('done: defaults to side-by-side, and hides cards/actions conditionally', () => {
    const renderResult = render(
      <ScientificJobModal
        progress={baseProgress()}
        onCancel={noop}
        onClose={noop}
        onRetry={noop}
        onOpenTranslated={noop}
        onDownloadMono={noop}
        onDownloadDual={noop}
        onDownloadSideBySide={noop}
      />,
    );
    expect(screen.getByRole('heading', { name: /translation ready/i })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /side-by-side/i })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    expect(screen.getByText(/recommended/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /download side-by-side/i })).toBeInTheDocument();
    expect(screen.queryByText(/pdf2zh/i)).not.toBeInTheDocument();
    renderResult.unmount();

    // hasDual=false hides the bilingual card; translated-only stays.
    const duallessView = render(
      <ScientificJobModal
        progress={baseProgress({ hasDual: false })}
        onCancel={noop}
        onClose={noop}
        onRetry={noop}
        onOpenTranslated={noop}
        onDownloadMono={noop}
        onDownloadSideBySide={noop}
      />,
    );
    expect(screen.queryByRole('radio', { name: /bilingual/i })).not.toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /translated only/i })).toBeInTheDocument();
    duallessView.unmount();

    // onOpenCompare omitted → no Compare button.
    render(
      <ScientificJobModal
        progress={baseProgress()}
        onCancel={noop}
        onClose={noop}
        onRetry={noop}
        onOpenTranslated={noop}
        onDownloadMono={noop}
        onDownloadDual={noop}
        onDownloadSideBySide={noop}
      />,
    );
    expect(screen.queryByRole('button', { name: /compare side-by-side/i })).toBeNull();
  });

  it('done: selecting mono updates download CTA and downloadMono is called', () => {
    const onDownloadMono = vi.fn();
    render(
      <ScientificJobModal
        progress={baseProgress()}
        onCancel={noop}
        onClose={noop}
        onRetry={noop}
        onOpenTranslated={noop}
        onDownloadMono={onDownloadMono}
        onDownloadDual={noop}
        onDownloadSideBySide={noop}
      />,
    );
    fireEvent.click(screen.getByRole('radio', { name: /translated only/i }));
    fireEvent.click(screen.getByRole('button', { name: /download translated pdf/i }));
    expect(onDownloadMono).toHaveBeenCalledTimes(1);
  });

  it('done: Open translated and Compare call respective handlers', () => {
    const onOpenTranslated = vi.fn();
    const onOpenCompare = vi.fn();
    render(
      <ScientificJobModal
        progress={baseProgress()}
        onCancel={noop}
        onClose={noop}
        onRetry={noop}
        onOpenTranslated={onOpenTranslated}
        onOpenCompare={onOpenCompare}
        onDownloadMono={noop}
        onDownloadDual={noop}
        onDownloadSideBySide={noop}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /open translated/i }));
    expect(onOpenTranslated).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: /compare side-by-side/i }));
    expect(onOpenCompare).toHaveBeenCalledTimes(1);
  });

  it('running: activity log is collapsed by default', () => {
    render(
      <ScientificJobModal
        progress={baseProgress({
          stage: 'running',
          progress: 0.4,
          message: 'Translating…',
          logs: ['line 1', 'line 2'],
          hasMono: false,
          hasDual: false,
        })}
        onCancel={noop}
        onClose={noop}
        onRetry={noop}
        onOpenTranslated={noop}
      />,
    );
    const details = screen.getByText(/activity/i).closest('details');
    expect(details).toBeTruthy();
    expect(details).not.toHaveAttribute('open');
  });

  it('error offline: primary is open setup', () => {
    const onOpenSetup = vi.fn();
    render(
      <ScientificJobModal
        progress={baseProgress({
          stage: 'error',
          progress: 0,
          hasMono: false,
          hasDual: false,
          error: 'Bridge offline',
          errorCode: 'offline',
          logs: ['offline'],
        })}
        onCancel={noop}
        onClose={noop}
        onRetry={noop}
        onOpenTranslated={noop}
        onOpenSetup={onOpenSetup}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /set up|open setup|start server/i }));
    expect(onOpenSetup).toHaveBeenCalled();
  });

  it('setup: defaults to all pages, and selected pages summarize and start with the raw selection', () => {
    const onStart = vi.fn();
    renderSetup({ onStart });
    // facet: defaults to all pages and starts a whole-document job.
    expect(screen.getByRole('radio', { name: /all pages/i })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    fireEvent.click(screen.getByRole('button', { name: /start translation/i }));
    expect(onStart).toHaveBeenCalledWith(undefined, undefined);

    // facet: selected pages summarize and start with the raw selection.
    fireEvent.click(screen.getByRole('radio', { name: /selected pages/i }));
    fireEvent.change(screen.getByRole('textbox', { name: /page selection/i }), {
      target: { value: '1-3, 5' },
    });
    expect(screen.getByText(/4 of 42 pages/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /start translation/i }));
    expect(onStart).toHaveBeenCalledWith('1-3, 5', undefined);
  });

  it('setup: invalid selection disables start and shows the error, and an unknown page count skips the range check', () => {
    const onStart = vi.fn();
    const invalid = renderSetup({ onStart });
    // facet: invalid or out-of-range selection disables start and shows the error.
    fireEvent.click(screen.getByRole('radio', { name: /selected pages/i }));
    const input = screen.getByRole('textbox', { name: /page selection/i });

    fireEvent.change(input, { target: { value: '99' } });
    expect(screen.getByText(/page 99 is out of range \(1-42\)/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /start translation/i })).toBeDisabled();

    fireEvent.change(input, { target: { value: 'abc' } });
    expect(screen.getByText(/"abc" is not a valid page or range/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /start translation/i })).toBeDisabled();
    expect(onStart).not.toHaveBeenCalled();
    invalid.unmount();

    // facet: skips the range check while the page count is still unknown.
    renderSetup({ numPages: 0, onStart });
    fireEvent.click(screen.getByRole('radio', { name: /selected pages/i }));
    fireEvent.change(screen.getByRole('textbox', { name: /page selection/i }), {
      target: { value: '99' },
    });
    expect(screen.queryByText(/out of range/i)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /start translation/i }));
    expect(onStart).toHaveBeenCalledWith('99', undefined);
  });

  it('setup: cancel closes without starting, and the merge toggle follows previous runs', () => {
    // facet: cancel closes the dialog without starting.
    const onStart = vi.fn();
    const onClose = vi.fn();
    const cancelled = render(
      <ScientificJobModal
        progress={setupProgress()}
        fileName="paper.pdf"
        numPages={42}
        onStart={onStart}
        onCancel={noop}
        onClose={onClose}
        onRetry={noop}
        onOpenTranslated={noop}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }));
    expect(onClose).toHaveBeenCalled();
    expect(onStart).not.toHaveBeenCalled();
    cancelled.unmount();

    // facet: merge toggle hidden without a previous run, default-on with one.
    const onStartWithMerge = vi.fn();
    const first = renderSetup({ hasPreviousRun: false, onStart: onStartWithMerge });
    expect(screen.queryByRole('checkbox', { name: /add to previous translation/i })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /start translation/i }));
    expect(onStartWithMerge).toHaveBeenCalledWith(undefined, undefined);
    first.unmount();

    renderSetup({ hasPreviousRun: true, onStart: onStartWithMerge });
    const toggle = screen.getByRole('checkbox', { name: /add to previous translation/i });
    expect(toggle).toHaveProperty('checked', true);
    fireEvent.click(toggle);
    fireEvent.click(screen.getByRole('button', { name: /start translation/i }));
    expect(onStartWithMerge).toHaveBeenCalledWith(undefined, { mergeWithPrevious: false });
  });

  it('done: shows the result summary when provided', () => {
    render(
      <ScientificJobModal
        progress={baseProgress({ resultSummary: '4 pages translated (merged with previous runs)' })}
        onCancel={noop}
        onClose={noop}
        onRetry={noop}
        onOpenTranslated={noop}
        onDownloadMono={noop}
        onDownloadDual={noop}
        onDownloadSideBySide={noop}
      />,
    );
    expect(
      screen.getByText(/4 pages translated \(merged with previous runs\)/i),
    ).toBeInTheDocument();
  });
});

describe('pdfShellMode', () => {
  it('starts in reader focused on source, and open translated moves to result focus', () => {
    // facet: starts in reader focused on source.
    expect(initialSessionState()).toEqual({
      shellMode: 'reader',
      readerFocus: 'source',
      resultKind: null,
    });

    // facet: open translated → reader + result focus.
    const next = applyOpenTranslated(initialSessionState(), 'mono');
    expect(next).toEqual({
      shellMode: 'reader',
      readerFocus: 'result',
      resultKind: 'mono',
    });
  });

  it('open compare stores kind with a bilingual dual label, and switching back keeps result focus', () => {
    // facet: open compare → compare mode + stores kind; dual uses bilingual label.
    const next = applyOpenCompare(initialSessionState(), 'mono');
    expect(next.shellMode).toBe('compare');
    expect(next.resultKind).toBe('mono');

    expect(compareRightLabel('dual')).toMatch(/bilingual/i);
    expect(compareRightLabel('mono')).toBe('Translated');

    // facet: switching to reader from compare keeps result focus if result exists.
    const compared = applyOpenCompare(initialSessionState(), 'mono');
    const back = applyShellMode(compared, 'reader');
    expect(back.shellMode).toBe('reader');
    expect(back.readerFocus).toBe('result');
    expect(back.resultKind).toBe('mono');
  });

  it('reader label follows focus', () => {
    expect(readerPaneLabel('source', null)).toBe('Original');
    expect(readerPaneLabel('result', 'mono')).toBe('Translated');
    expect(readerPaneLabel('result', 'dual')).toMatch(/bilingual/i);
  });
});

/**
 * Dual PDF export pure helpers — side-by-side geometry + alternating order.
 */


/** Fixture doc whose page i is (100 + i) points wide — width identifies pages. */
async function makeDoc(pageWidths: number[]): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  for (const w of pageWidths) {
    const p = doc.addPage([w, 200]);
    // Blank pages have no content stream and cannot be embedded.
    p.drawRectangle({ x: 0, y: 0, width: 10, height: 10 });
  }
  return doc.save();
}

describe('pdfDualExport', () => {
  it('geometry, alternating order, page pairing, and filenames', () => {
    expect(computeSideBySidePageSize({ width: 100, height: 200 }, { width: 150, height: 180 })).toEqual({
      width: 250,
      height: 200,
    });
    expect(computeSideBySidePageSize({ width: 612, height: 792 }, { width: 612, height: 792 })).toEqual({
      width: 1224,
      height: 792,
    });

    expect(buildAlternatingPageOrder(3)).toEqual([
      { source: 'original', pageIndex: 0 },
      { source: 'translated', pageIndex: 0 },
      { source: 'original', pageIndex: 1 },
      { source: 'translated', pageIndex: 1 },
      { source: 'original', pageIndex: 2 },
      { source: 'translated', pageIndex: 2 },
    ]);
    expect(buildAlternatingPageOrder(0)).toEqual([]);

    expect(resolveDualPagePair(0, 5, 5)).toEqual({
      originalIndex: 0,
      translatedIndex: 0,
      missingTranslated: false,
    });
    expect(resolveDualPagePair(2, 3, 2)).toEqual({
      originalIndex: 2,
      translatedIndex: null,
      missingTranslated: true,
    });
    expect(resolveDualPagePair(1, 2, 4)).toEqual({
      originalIndex: 1,
      translatedIndex: 1,
      missingTranslated: false,
    });

    expect(dualExportFilename('paper', 'vi', 'mono')).toBe('paper_translated_vi.pdf');
    expect(dualExportFilename('paper', 'vi', 'dual-side-by-side')).toBe('paper.dual_vi.pdf');
    expect(dualExportFilename('paper', 'vi', 'dual-alternating')).toBe('paper.dual.alt_vi.pdf');
  });

  describe('resolveSubsetPagePairs — subset translation mapping', () => {
    it('pairs mono pages with mapped originals, marks missing pairs, clamps out-of-range indices, and handles an empty mapping', () => {
      // facet: pairs each mono page with its mapped original page.
      expect(resolveSubsetPagePairs([4, 0, 1], 5, 3)).toEqual([
        { originalIndex: 4, translatedIndex: 0, missingTranslated: false },
        { originalIndex: 0, translatedIndex: 1, missingTranslated: false },
        { originalIndex: 1, translatedIndex: 2, missingTranslated: false },
      ]);

      // facet: marks pairs missing when mono has fewer pages than the mapping.
      expect(resolveSubsetPagePairs([0, 2], 3, 1)).toEqual([
        { originalIndex: 0, translatedIndex: 0, missingTranslated: false },
        { originalIndex: 2, translatedIndex: null, missingTranslated: true },
      ]);

      // facet: clamps out-of-range original indices defensively.
      expect(resolveSubsetPagePairs([7], 3, 1)).toEqual([
        { originalIndex: 2, translatedIndex: 0, missingTranslated: false },
      ]);

      // facet: returns no pairs for an empty mapping.
      expect(resolveSubsetPagePairs([], 3, 2)).toEqual([]);
    });
  });

  it('buildSideBySideDualPdf pairs a subset mono page with its mapped original', async () => {
    // Original: 3 pages — the third is uniquely wide (300pt).
    const original = await PDFDocument.create();
    for (const size of [[100, 200], [100, 200], [300, 200]] as const) {
      const p = original.addPage([size[0], size[1]]);
      // Blank pages have no content stream and cannot be embedded.
      p.drawRectangle({ x: 0, y: 0, width: 10, height: 10 });
    }
    // Mono: single translated page 150pt wide (translation of original page 3).
    const mono = await PDFDocument.create();
    const monoPage = mono.addPage([150, 100]);
    monoPage.drawRectangle({ x: 0, y: 0, width: 10, height: 10 });

    const bytes = await buildSideBySideDualPdf({
      monoBytes: await mono.save(),
      originalBytes: await original.save(),
      monoToOriginalIndex: [2],
    });

    const out = await PDFDocument.load(bytes);
    expect(out.getPageCount()).toBe(1);
    const page = out.getPage(0);
    // Width proves pairing used original page 3 (300) — not page 1 (100).
    expect(page.getWidth()).toBe(450);
    expect(page.getHeight()).toBe(200);
  });

  describe('buildMergedMonoPdf — accumulate translated ranges', () => {
    it('merges runs latest-wins, embeds uncovered originals, ignores out-of-range mappings, and returns the original with no runs', async () => {
      // facet: fills the whole original from two runs, latest wins on overlap.
      {
        // Original: 16 pages, widths 101..116.
        const originalBytes = await makeDoc(Array.from({ length: 16 }, (_, i) => 101 + i));
        // Run 1 translated pages 1-5 (widths 201..205, one per original page).
        const run1 = await makeDoc(Array.from({ length: 5 }, (_, i) => 201 + i));
        // Run 2 translated pages 4-16 (widths 304..316) — overlaps run 1 on 4-5.
        const run2 = await makeDoc(Array.from({ length: 13 }, (_, i) => 304 + i));

        const bytes = await buildMergedMonoPdf({
          originalBytes,
          runs: [
            { monoBytes: run1, monoToOriginalIndex: [0, 1, 2, 3, 4] },
            { monoBytes: run2, monoToOriginalIndex: Array.from({ length: 13 }, (_, i) => 3 + i) },
          ],
        });

        const out = await PDFDocument.load(bytes);
        expect(out.getPageCount()).toBe(16);
        // Pages 1-3 from run 1 (2xx), pages 4-16 from run 2 (3xx, latest wins).
        const widths = Array.from({ length: 16 }, (_, i) => out.getPage(i).getWidth());
        expect(widths.slice(0, 3)).toEqual([201, 202, 203]);
        expect(widths.slice(3)).toEqual(Array.from({ length: 13 }, (_, i) => 304 + i));
      }

      // facet: embeds the original page when no run covered it.
      {
        const originalBytes = await makeDoc([101, 102, 103]);
        const run1 = await makeDoc([201]); // translated page 2 only

        const out = await PDFDocument.load(
          await buildMergedMonoPdf({
            originalBytes,
            runs: [{ monoBytes: run1, monoToOriginalIndex: [1] }],
          }),
        );
        expect(out.getPageCount()).toBe(3);
        expect(out.getPage(0).getWidth()).toBe(101); // original
        expect(out.getPage(1).getWidth()).toBe(201); // translated
        expect(out.getPage(2).getWidth()).toBe(103); // original
      }

      // facet: ignores mappings pointing beyond the mono document.
      {
        const originalBytes = await makeDoc([101]);
        const run1 = await makeDoc([201]);
        const out = await PDFDocument.load(
          await buildMergedMonoPdf({
            originalBytes,
            runs: [{ monoBytes: run1, monoToOriginalIndex: [0, 5, 9] }], // 5, 9 don't exist
          }),
        );
        expect(out.getPageCount()).toBe(1);
        expect(out.getPage(0).getWidth()).toBe(201);
      }

      // facet: returns just the original when there are no runs.
      {
        const originalBytes = await makeDoc([101, 102]);
        const out = await PDFDocument.load(
          await buildMergedMonoPdf({ originalBytes, runs: [] }),
        );
        expect(out.getPageCount()).toBe(2);
      }
    });
  });
});
