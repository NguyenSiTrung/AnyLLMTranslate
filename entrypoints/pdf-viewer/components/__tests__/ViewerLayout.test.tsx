/**
 * Tests for ViewerLayout — split vs translation-only rendering.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ViewerLayout } from '../ViewerLayout';

// useSynchronizedScroll is irrelevant to layout assertions; stub it so it
// never touches refs or adds listeners in jsdom.
vi.mock('../../hooks/useSynchronizedScroll', () => ({
  useSynchronizedScroll: vi.fn(),
}));

describe('ViewerLayout', () => {
  it('renders both panes in split mode (default)', () => {
    render(
      <ViewerLayout
        left={<div data-testid="left-content">L</div>}
        right={<div data-testid="right-content">R</div>}
      />,
    );
    // Both labels present
    expect(screen.getByText('Original')).toBeTruthy();
    expect(screen.getByText('Translation')).toBeTruthy();
    // Both panes' content present
    expect(screen.getByTestId('left-content')).toBeTruthy();
    expect(screen.getByTestId('right-content')).toBeTruthy();
  });

  it('hides the left pane and applies single-column layout in translation-only mode', () => {
    const { container } = render(
      <ViewerLayout
        viewMode="translation-only"
        left={<div data-testid="left-content">L</div>}
        right={<div data-testid="right-content">R</div>}
      />,
    );
    // Left pane content not rendered
    expect(screen.queryByTestId('left-content')).toBeNull();
    // Original label not rendered
    expect(screen.queryByText('Original')).toBeNull();
    // Right pane still present
    expect(screen.getByText('Translation')).toBeTruthy();
    expect(screen.getByTestId('right-content')).toBeTruthy();
    // Single-column class applied to <main>
    const main = container.querySelector('.pdf-viewer-main');
    expect(main?.className).toContain('pdf-viewer-main--single');
  });

  it('explicit viewMode="split" renders both panes', () => {
    render(
      <ViewerLayout
        viewMode="split"
        left={<div data-testid="left-content">L</div>}
        right={<div data-testid="right-content">R</div>}
      />,
    );
    expect(screen.getByTestId('left-content')).toBeTruthy();
    expect(screen.getByTestId('right-content')).toBeTruthy();
  });
});
