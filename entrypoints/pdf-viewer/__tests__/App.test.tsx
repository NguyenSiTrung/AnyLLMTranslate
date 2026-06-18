/**
 * Tests for App — View mode toggle wiring + persistence + pane mount/unmount.
 *
 * Mocks the PDF + translation hooks so we can assert layout behavior without
 * a real PDF.js document.
 */
import { describe, it, expect, beforeEach, beforeAll, afterAll, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import type { PDFPageProxy } from 'pdfjs-dist';

// --- Hoisted shared mock state ---------------------------------------------
const mockState = vi.hoisted(() => ({
  loadPdfViewModeResult: 'split' as 'split' | 'translation-only',
}));

vi.mock('pdfjs-dist', () => ({
  TextLayer: class {
    async render() {}
    cancel() {}
  },
}));

vi.mock('../hooks/usePdfDocument', () => ({
  usePdfDocument: () => ({
    loadState: 'loaded',
    pages: [{ getViewport: () => ({ width: 720, height: 960 }) } as unknown as PDFPageProxy],
    numPages: 1,
    bytesLoaded: 100,
    bytesTotal: 100,
    error: null,
  }),
}));

vi.mock('../hooks/usePdfPageTranslations', () => ({
  usePdfPageTranslations: () => ({
    pages: new Map([
      [1, { paragraphs: new Map([['p1', 'Bonjour']]), state: 'translated' as const }],
    ]),
    translatedCount: 1,
    totalCount: 1,
    retryPage: vi.fn(),
  }),
}));

vi.mock('../hooks/useVisiblePages', () => ({
  useVisiblePages: () => ({ visiblePages: new Set<number>([1]) }),
}));

vi.mock('../lib/pdfViewMode', () => ({
  loadPdfViewMode: vi.fn(async () => mockState.loadPdfViewModeResult),
  savePdfViewMode: vi.fn(async (mode: 'split' | 'translation-only') => {
    mockState.loadPdfViewModeResult = mode;
  }),
}));

// Stub the URL query param extraction so App goes straight to "loaded".
const originalLocation = window.location;
beforeAll(() => {
  Object.defineProperty(window, 'location', {
    writable: true,
    value: new URL('https://example.com/pdf-viewer.html?file=https://example.com/doc.pdf'),
  });
});
afterAll(() => {
  Object.defineProperty(window, 'location', { writable: true, value: originalLocation });
});

import App from '../App';
import { savePdfViewMode } from '../lib/pdfViewMode';

/**
 * Assert presence/absence of a pane LABEL (scoped to .pdf-viewer-pane-label),
 * which avoids colliding with the toggle buttons that share the same text
 * (e.g. the "Translation" button vs the "Translation" pane label).
 */
function expectPaneLabel(text: string, present: boolean): void {
  const labels = document.querySelectorAll('.pdf-viewer-pane-label');
  const matches = Array.from(labels).filter((el) => el.textContent === text);
  if (present) {
    expect(matches.length).toBeGreaterThan(0);
  } else {
    expect(matches.length).toBe(0);
  }
}

describe('App — View mode toggle', () => {
  beforeEach(() => {
    mockState.loadPdfViewModeResult = 'split';
    vi.clearAllMocks();
  });

  it('renders both "Original" and "Translation" labels by default (split)', async () => {
    render(<App />);
    await waitFor(() => {
      expectPaneLabel('Original', true);
      expectPaneLabel('Translation', true);
    });
  });

  it('shows a View toggle with Split and Translation buttons', async () => {
    render(<App />);
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Split/i })).toBeTruthy();
      expect(screen.getByRole('button', { name: /Translation/i })).toBeTruthy();
    });
  });

  it('hides the Original pane and persists when clicking Translation', async () => {
    render(<App />);
    await waitFor(() => expectPaneLabel('Original', true));

    fireEvent.click(screen.getByRole('button', { name: /^Translation$/i }));

    await waitFor(() => {
      expectPaneLabel('Original', false);
      expectPaneLabel('Translation', true);
    });
    expect(savePdfViewMode).toHaveBeenCalledWith('translation-only');
  });

  it('re-shows the Original pane when clicking Split', async () => {
    mockState.loadPdfViewModeResult = 'translation-only';
    render(<App />);
    await waitFor(() => expectPaneLabel('Original', false));

    fireEvent.click(screen.getByRole('button', { name: /^Split$/i }));

    await waitFor(() => {
      expectPaneLabel('Original', true);
    });
    expect(savePdfViewMode).toHaveBeenCalledWith('split');
  });

  it('the Layout/Text toggle still renders in both view modes', async () => {
    render(<App />);
    await waitFor(() => expectPaneLabel('Original', true));
    expect(screen.getByRole('button', { name: /^Layout$/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /^Text$/i })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /^Translation$/i }));
    await waitFor(() => expectPaneLabel('Original', false));
    // Layout/Text still present after switching to translation-only
    expect(screen.getByRole('button', { name: /^Layout$/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /^Text$/i })).toBeTruthy();
  });
});
