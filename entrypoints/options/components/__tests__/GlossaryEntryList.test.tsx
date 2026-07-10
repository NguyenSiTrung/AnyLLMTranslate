/**
 * GlossaryEntryList — mismatch sort and search miss.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { GlossaryEntryList } from '../GlossaryEntryList';
import type { GlossaryEntry } from '@/types/config';

const entries: GlossaryEntry[] = [
  { id: '1', source: 'Alpha', target: 'A1' },
  { id: '2', source: 'Beta', target: 'B1' },
  { id: '3', source: 'Gamma', target: 'G1' },
];

const noopHandlers = {
  editSource: '',
  editTarget: '',
  onEditSourceChange: vi.fn(),
  onEditTargetChange: vi.fn(),
  onStartEdit: vi.fn(),
  onSaveEdit: vi.fn(),
  onCancelEdit: vi.fn(),
  onRequestDelete: vi.fn(),
  onClearSearch: vi.fn(),
};

describe('GlossaryEntryList', () => {
  it('shows footer count and mismatch chip; sorts mismatches first', () => {
    render(
      <GlossaryEntryList
        entries={entries}
        searchQuery=""
        mismatchedIds={new Set(['3'])}
        editingId={null}
        {...noopHandlers}
      />,
    );
    expect(screen.getByText('3 terms')).toBeInTheDocument();
    expect(screen.getByText('Not honoured')).toBeInTheDocument();
    const items = screen.getAllByRole('listitem');
    expect(items[0]).toHaveAttribute('aria-label', expect.stringContaining('Gamma'));
  });

  it('shows search miss empty state', () => {
    const onClearSearch = vi.fn();
    render(
      <GlossaryEntryList
        entries={entries}
        searchQuery="zzz"
        mismatchedIds={new Set()}
        editingId={null}
        {...noopHandlers}
        onClearSearch={onClearSearch}
      />,
    );
    expect(screen.getByText(/No terms match/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Clear search' }));
    expect(onClearSearch).toHaveBeenCalled();
  });
});
