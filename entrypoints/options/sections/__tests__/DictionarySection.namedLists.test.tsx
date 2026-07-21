import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { DEFAULT_SETTINGS } from '@/types/config';
import { ToastProvider } from '@/ui/ToastProvider';
import { useSettingsStore } from '@/stores/settingsStore';
import { DictionarySection } from '../DictionarySection';

vi.stubGlobal('chrome', {
  runtime: { sendMessage: vi.fn() },
  storage: {
    local: { get: vi.fn(async () => ({})), set: vi.fn(async () => {}) },
    onChanged: { addListener: vi.fn(), removeListener: vi.fn() },
  },
});

function renderSection() {
  return render(
    <ToastProvider>
      <DictionarySection />
    </ToastProvider>,
  );
}

describe('DictionarySection named lists', () => {
  beforeEach(() => {
    useSettingsStore.setState({
      ...DEFAULT_SETTINGS,
      isLoaded: true,
      glossary: [],
      namedGlossaryLists: [],
      subtitleListBySite: {},
    });
    vi.clearAllMocks();
  });

  it('creates and opens a named list', async () => {
    renderSection();
    expect(screen.getByRole('heading', { name: 'Named lists' })).toBeInTheDocument();
    expect(screen.getByText(/Names you lock here win over auto subtitle glossary/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'New list' }));
    fireEvent.change(screen.getByLabelText('List name'), { target: { value: 'Anime names' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create list' }));

    await waitFor(() => expect(useSettingsStore.getState().namedGlossaryLists).toHaveLength(1));
    expect(screen.getByText('Anime names')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Open Anime names' }));
    expect(screen.getByRole('heading', { name: 'Anime names' })).toBeInTheDocument();
  });

  it('adds, rejects duplicate, edits, and imports entries in list detail', async () => {
    useSettingsStore.setState({
      namedGlossaryLists: [{ id: 'list-1', name: 'Names', entries: [], updatedAt: 1 }],
    });
    renderSection();
    fireEvent.click(screen.getByRole('button', { name: 'Open Names' }));
    fireEvent.click(screen.getByRole('button', { name: 'Add term to Names' }));
    fireEvent.change(screen.getByLabelText('Source term'), { target: { value: 'Frieren' } });
    fireEvent.change(screen.getByLabelText('Preferred translation'), { target: { value: 'Frieren' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    await waitFor(() => expect(useSettingsStore.getState().namedGlossaryLists[0].entries).toHaveLength(1));

    fireEvent.change(screen.getByLabelText('Source term'), { target: { value: 'frieren' } });
    fireEvent.change(screen.getByLabelText('Preferred translation'), { target: { value: 'Other' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('This source term already exists');

    const file = new File(['source,target\nHimmel,Himmel'], 'terms.csv', { type: 'text/csv' });
    fireEvent.change(screen.getByLabelText('Import entries into Names'), { target: { files: [file] } });
    await waitFor(() => expect(useSettingsStore.getState().namedGlossaryLists[0].entries).toHaveLength(2));
  });

  it('renames and deletes a populated list while pruning site selections', async () => {
    useSettingsStore.setState({
      namedGlossaryLists: [{
        id: 'list-1', name: 'Old name', updatedAt: 1,
        entries: [{ id: 'entry-1', source: 'A', target: 'B' }],
      }],
      subtitleListBySite: { 'youtube.com': 'list-1', 'netflix.com': 'other' },
    });
    renderSection();

    fireEvent.click(screen.getByRole('button', { name: 'Rename Old name' }));
    fireEvent.change(screen.getByLabelText('Rename list'), { target: { value: 'New name' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save name' }));
    await waitFor(() => expect(useSettingsStore.getState().namedGlossaryLists[0].name).toBe('New name'));

    fireEvent.click(screen.getByRole('button', { name: 'Delete New name' }));
    expect(screen.getByRole('dialog', { name: 'Delete named list?' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(useSettingsStore.getState().namedGlossaryLists).toEqual([]));
    expect(useSettingsStore.getState().subtitleListBySite).toEqual({});
  });
});
