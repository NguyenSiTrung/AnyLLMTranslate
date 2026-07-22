import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { DictionaryAddForm } from '../DictionaryAddForm';
import { DictionaryCommandBar } from '../DictionaryCommandBar';
import { DictionaryEmptyHero } from '../DictionaryEmptyHero';
import { GlossaryEntryList } from '../GlossaryEntryList';
import { GlossaryImportHint } from '../GlossaryImportHint';
import * as templates from '@/lib/glossaryImportTemplates';

vi.mock('@/lib/glossaryImportTemplates', async () => {
  const actual = await vi.importActual<typeof import('@/lib/glossaryImportTemplates')>(
    '@/lib/glossaryImportTemplates',
  );
  return {
    ...actual,
    downloadGlossaryTemplate: vi.fn(),
  };
});

describe('Dictionary UI components', () => {
  beforeEach(() => {
    vi.mocked(templates.downloadGlossaryTemplate).mockClear();
  });

  it('renders DictionaryAddForm with keyboard shortcuts, errors, and button states', () => {
    const onSubmit = vi.fn();
    const onCancel = vi.fn();
    const { rerender } = render(
      <DictionaryAddForm
        source="foo"
        target="bar"
        onSourceChange={vi.fn()}
        onTargetChange={vi.fn()}
        onSubmit={onSubmit}
        onCancel={onCancel}
      />,
    );
    fireEvent.keyDown(screen.getByLabelText('Source term'), { key: 'Enter' });
    expect(onSubmit).toHaveBeenCalledOnce();

    rerender(
      <DictionaryAddForm
        source="foo"
        target="  "
        onSourceChange={vi.fn()}
        onTargetChange={vi.fn()}
        onSubmit={onSubmit}
        onCancel={onCancel}
      />,
    );
    expect(screen.getByRole('button', { name: 'Add' })).toBeDisabled();
  });

  it('renders DictionaryCommandBar, EmptyHero, EntryList, and ImportHint', () => {
    // Command bar
    const onAddClick = vi.fn();
    render(
      <DictionaryCommandBar
        searchQuery=""
        onSearchChange={vi.fn()}
        showSearch={true}
        onAddClick={onAddClick}
        addOpen={false}
        onImportClick={vi.fn()}
        onExportJson={vi.fn()}
        onExportCsv={vi.fn()}
        exportDisabled={false}
        termCount={3}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Add term' }));
    expect(onAddClick).toHaveBeenCalled();

    // Empty Hero
    render(<DictionaryEmptyHero onAddClick={vi.fn()} onImportClick={vi.fn()} />);
    expect(screen.getByText('No custom terms yet')).toBeInTheDocument();

    // Entry List
    render(
      <GlossaryEntryList
        entries={[{ id: '1', source: 'src', target: 'tgt' }]}
        searchQuery=""
        mismatchedIds={new Set()}
        onUpdateEntry={vi.fn()}
        onDeleteEntry={vi.fn()}
      />,
    );
    expect(screen.getByText('src')).toBeInTheDocument();

    // Import Hint
    render(<GlossaryImportHint defaultExpanded />);
    expect(screen.getAllByText(/Supports/i)[0]).toBeInTheDocument();
  });
});
