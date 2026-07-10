/**
 * DictionarySection — empty hero, add/prepend, duplicate block.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { DEFAULT_SETTINGS } from '@/types/config';
import { ToastProvider } from '@/ui/ToastProvider';

vi.stubGlobal('chrome', {
  runtime: { sendMessage: vi.fn() },
  storage: {
    local: {
      get: vi.fn(async () => ({})),
      set: vi.fn(async () => {}),
    },
    onChanged: { addListener: vi.fn(), removeListener: vi.fn() },
  },
});

import { useSettingsStore } from '@/stores/settingsStore';
import { DictionarySection } from '../DictionarySection';

function renderSection() {
  return render(
    <ToastProvider>
      <DictionarySection />
    </ToastProvider>,
  );
}

describe('DictionarySection', () => {
  beforeEach(() => {
    useSettingsStore.setState({
      ...DEFAULT_SETTINGS,
      isLoaded: true,
      glossary: [],
    });
    vi.clearAllMocks();
  });

  it('shows empty hero and custom terms header', () => {
    renderSection();
    expect(screen.getByRole('heading', { name: 'Custom terms' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'No custom terms yet' })).toBeInTheDocument();
    expect(screen.queryByText('Verify terms')).not.toBeInTheDocument();
  });

  it('opens add form from empty hero and prepends a term', async () => {
    renderSection();
    fireEvent.click(screen.getByRole('button', { name: 'Add first term' }));
    fireEvent.change(screen.getByLabelText('Source term'), { target: { value: 'Foo' } });
    fireEvent.change(screen.getByLabelText('Preferred translation'), {
      target: { value: 'Bar' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    await waitFor(() => {
      const g = useSettingsStore.getState().glossary;
      expect(g).toHaveLength(1);
      expect(g[0].source).toBe('Foo');
      expect(g[0].target).toBe('Bar');
    });
    expect(screen.getByText('Verify terms')).toBeInTheDocument();
  });

  it('blocks duplicate source terms', async () => {
    useSettingsStore.setState({
      glossary: [{ id: '1', source: 'Foo', target: 'Bar' }],
    });
    renderSection();
    fireEvent.click(screen.getByRole('button', { name: 'Add term' }));
    fireEvent.change(screen.getByLabelText('Source term'), { target: { value: 'foo' } });
    fireEvent.change(screen.getByLabelText('Preferred translation'), {
      target: { value: 'Other' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'This source term already exists',
    );
    expect(useSettingsStore.getState().glossary).toHaveLength(1);
  });
});
