import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { DEFAULT_SETTINGS } from '@/types/config';
import { useSettingsStore } from '@/stores/settingsStore';
import { ToastProvider } from '@/ui/ToastProvider';
import { AdvancedSection } from '../AdvancedSection';

vi.mock('@/entrypoints/options/hooks/useCacheStats', () => ({
  useCacheStats: () => ({
    entryCount: 0,
    totalSizeBytes: 0,
    sizeMb: 0,
    sizeLabel: '0 B',
    loading: false,
    refresh: vi.fn(),
  }),
}));

describe('AdvancedSection input focus', () => {
  beforeEach(() => {
    useSettingsStore.setState({
      ...DEFAULT_SETTINGS,
      isLoaded: true,
    });
  });

  it('keeps the system-prompt edit local until blur', () => {
    const updateSettings = vi.fn();
    useSettingsStore.setState({ updateSettings });
    render(
      <ToastProvider>
        <AdvancedSection />
      </ToastProvider>,
    );
    const textarea = screen.getByLabelText('Custom prompt template') as HTMLTextAreaElement;

    textarea.focus();
    fireEvent.change(textarea, { target: { value: 'Keep {{targetLanguage}} focused' } });

    expect(textarea).toHaveFocus();
    expect(textarea.value).toBe('Keep {{targetLanguage}} focused');
    expect(updateSettings).not.toHaveBeenCalled();

    fireEvent.blur(textarea);
    expect(updateSettings).toHaveBeenCalledWith({
      customSystemPrompt: 'Keep {{targetLanguage}} focused',
    });
  });
});
