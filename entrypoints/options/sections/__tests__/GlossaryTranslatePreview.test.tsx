/**
 * GlossaryTranslatePreview — default open + Verify flow.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { DEFAULT_SETTINGS } from '@/types/config';

vi.stubGlobal('chrome', {
  runtime: {
    sendMessage: vi.fn(async () => ({
      success: true,
      results: [{ id: 'preview', translatedText: 'hola React' }],
    })),
  },
  storage: {
    local: { get: vi.fn(async () => ({})), set: vi.fn(async () => {}) },
    onChanged: { addListener: vi.fn(), removeListener: vi.fn() },
  },
});

import { useSettingsStore } from '@/stores/settingsStore';
import { GlossaryTranslatePreview } from '../GlossaryTranslatePreview';

describe('GlossaryTranslatePreview', () => {
  beforeEach(() => {
    useSettingsStore.setState({
      ...DEFAULT_SETTINGS,
      isLoaded: true,
      glossary: [{ id: '1', source: 'React', target: 'React' }],
      sourceLanguage: 'en',
      targetLanguage: 'es',
    });
    vi.clearAllMocks();
  });

  it('is expanded by default and uses Verify copy', () => {
    render(<GlossaryTranslatePreview onMismatchUpdate={vi.fn()} />);
    expect(screen.getByText('Verify terms')).toBeInTheDocument();
    expect(screen.getByLabelText('Preview input text')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Verify' })).toBeInTheDocument();
  });

  it('calls onMismatchUpdate after successful verify', async () => {
    const onMismatchUpdate = vi.fn();
    render(<GlossaryTranslatePreview onMismatchUpdate={onMismatchUpdate} />);
    fireEvent.change(screen.getByLabelText('Preview input text'), {
      target: { value: 'I love React' },
    });
    fireEvent.click(screen.getByRole('button', { name: /^Verify$/i }));
    await waitFor(() => {
      expect(chrome.runtime.sendMessage).toHaveBeenCalled();
      expect(onMismatchUpdate).toHaveBeenCalled();
    });
  });
});
