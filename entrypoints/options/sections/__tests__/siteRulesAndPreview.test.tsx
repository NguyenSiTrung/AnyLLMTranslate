import { beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, fireEvent, waitFor } from '@testing-library/react';
import { DEFAULT_SETTINGS } from '@/types/config';
import { ToastProvider } from '@/ui/ToastProvider';
import { useSettingsStore } from '@/stores/settingsStore';
import { SiteRulesSection } from '../SiteRulesSection';
import { GlossaryTranslatePreview } from '../GlossaryTranslatePreview';

/**
 * SiteRulesSection — Suggest from URL draft merge into form (no auto-save).
 */


const sendMessage = vi.fn();

vi.stubGlobal('chrome', {
  runtime: { sendMessage },
  storage: {
    local: {
      get: vi.fn(async () => ({})),
      set: vi.fn(async () => {}),
    },
    onChanged: { addListener: vi.fn(), removeListener: vi.fn() },
  },
});


function renderSection() {
  return render(
    <ToastProvider>
      <SiteRulesSection />
    </ToastProvider>,
  );
}

describe('SiteRulesSection Suggest from URL', () => {
  beforeEach(() => {
    useSettingsStore.setState({
      ...DEFAULT_SETTINGS,
      isLoaded: true,
      siteRules: [],
    });
    sendMessage.mockReset();
  });

  it('covers successful draft filling, deferred save, and failure feedback', async () => {
    sendMessage.mockResolvedValue({
      success: true,
      draft: {
        hostname: 'example.com',
        includeSelectors: ['main', 'article'],
        excludeSelectors: ['nav'],
        source: 'tab',
        rationale: 'Main column content',
      },
    });

    renderSection();

    fireEvent.click(screen.getByRole('button', { name: /add rule/i }));

    const urlInput = await screen.findByPlaceholderText('https://example.com/article');
    fireEvent.change(urlInput, { target: { value: 'https://example.com/post' } });
    fireEvent.click(screen.getByRole('button', { name: /suggest with ai/i }));

    await waitFor(() => {
      expect(sendMessage).toHaveBeenCalledWith({
        action: 'SUGGEST_SITE_RULE',
        url: 'https://example.com/post',
      });
    });

    await waitFor(() => {
      const hostname = screen.getByPlaceholderText('*.example.com') as HTMLInputElement;
      expect(hostname.value).toBe('example.com');
    });

    expect(screen.getByText('main')).toBeInTheDocument();
    expect(screen.getByText('article')).toBeInTheDocument();
    expect(screen.getByText('nav')).toBeInTheDocument();
    expect(screen.getByText(/Using open tab/i)).toBeInTheDocument();
    expect(screen.getByText(/Main column content/i)).toBeInTheDocument();

    // Not persisted until form save
    expect(useSettingsStore.getState().siteRules).toHaveLength(0);

    // Form footer "Add rule" (not the list toolbar button)
    const saveButtons = screen.getAllByRole('button', { name: /^add rule$/i });
    fireEvent.click(saveButtons[saveButtons.length - 1]);
    await waitFor(() => {
      const rules = useSettingsStore.getState().siteRules;
      expect(rules).toHaveLength(1);
      expect(rules[0].hostname).toBe('example.com');
      expect(rules[0].includeSelectors).toEqual(['main', 'article']);
    });
    cleanup();
    useSettingsStore.setState({
      ...DEFAULT_SETTINGS,
      isLoaded: true,
      siteRules: [],
    });
    sendMessage.mockReset();
    {
    sendMessage.mockResolvedValue({
      success: false,
      error: 'Could not load page',
    });

    renderSection();
    fireEvent.click(screen.getByRole('button', { name: /add rule/i }));
    fireEvent.change(await screen.findByPlaceholderText('https://example.com/article'), {
      target: { value: 'https://blocked.example' },
    });
    fireEvent.click(screen.getByRole('button', { name: /suggest with ai/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Could not load page');
    const hostname = screen.getByPlaceholderText('*.example.com') as HTMLInputElement;
    expect(hostname.value).toBe('');
    expect(useSettingsStore.getState().siteRules).toHaveLength(0);
    }
});
});

/**
 * GlossaryTranslatePreview — default open + Verify flow.
 */





describe('GlossaryTranslatePreview', () => {
  beforeEach(() => {
    sendMessage.mockResolvedValue({
      success: true,
      results: [{ id: 'preview', translatedText: 'hola React' }],
    });
        useSettingsStore.setState({
      ...DEFAULT_SETTINGS,
      isLoaded: true,
      glossary: [{ id: '1', source: 'React', target: 'React' }],
      sourceLanguage: 'en',
      targetLanguage: 'es',
    });
    vi.clearAllMocks();
  });

  it('expanded by default with Verify copy; calls onMismatchUpdate after verify', async () => {
    const onMismatchUpdate = vi.fn();
    render(<GlossaryTranslatePreview onMismatchUpdate={onMismatchUpdate} />);
    expect(screen.getByText('Verify terms')).toBeInTheDocument();
    expect(screen.getByLabelText('Preview input text')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Verify' })).toBeInTheDocument();

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
