import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ViewerLayout } from '../ViewerLayout';

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
