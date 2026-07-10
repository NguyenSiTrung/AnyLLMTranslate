/**
 * DictionaryCommandBar — search visibility and export disable.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { DictionaryCommandBar } from '../DictionaryCommandBar';

const base = {
  searchQuery: '',
  onSearchChange: vi.fn(),
  showSearch: true,
  onAddClick: vi.fn(),
  addOpen: false,
  onImportClick: vi.fn(),
  onExportJson: vi.fn(),
  onExportCsv: vi.fn(),
  exportDisabled: false,
  termCount: 3,
};

describe('DictionaryCommandBar', () => {
  it('hides search when showSearch is false; disables export when empty', () => {
    const { rerender } = render(<DictionaryCommandBar {...base} showSearch={false} />);
    expect(screen.queryByLabelText('Search terms')).not.toBeInTheDocument();
    rerender(<DictionaryCommandBar {...base} exportDisabled />);
    expect(screen.getByRole('button', { name: /Export/i })).toBeDisabled();
  });

  it('fires add and import', () => {
    const onAddClick = vi.fn();
    const onImportClick = vi.fn();
    render(
      <DictionaryCommandBar {...base} onAddClick={onAddClick} onImportClick={onImportClick} />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Add term' }));
    expect(onAddClick).toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Import' }));
    expect(onImportClick).toHaveBeenCalled();
  });
});
