/**
 * DictionaryEmptyHero — empty-state CTAs.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { DictionaryEmptyHero } from '../DictionaryEmptyHero';

describe('DictionaryEmptyHero', () => {
  it('renders copy and fires CTAs', () => {
    const onAddFirst = vi.fn();
    const onImport = vi.fn();
    const onUseExamples = vi.fn();
    render(
      <DictionaryEmptyHero
        onAddFirst={onAddFirst}
        onImport={onImport}
        onUseExamples={onUseExamples}
      />,
    );
    expect(screen.getByRole('heading', { name: 'No custom terms yet' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Add first term' }));
    expect(onAddFirst).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole('button', { name: 'Import file' }));
    expect(onImport).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole('button', { name: 'Use examples' }));
    expect(onUseExamples).toHaveBeenCalledOnce();
  });

  it('shows glossary import format hint', () => {
    render(
      <DictionaryEmptyHero onAddFirst={vi.fn()} onImport={vi.fn()} />,
    );
    expect(screen.getByText(/Supports/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /See format/i })).toBeInTheDocument();
  });
});
