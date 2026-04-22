import { describe, it, expect, vi, beforeEach } from 'vitest';
import { translateSection, removeSectionTranslation, removeAllSectionTranslations, getTranslatedSections } from '@/content/sectionTranslate';

vi.mock('@/lib/config', () => ({
  loadSettings: vi.fn().mockResolvedValue({
    theme: 'blockquote',
    translationPosition: 'below',
    darkMode: 'auto',
    displayMode: 'bilingual-below',
    sourceLanguage: 'en',
    targetLanguage: 'vi',
  }),
}));

vi.mock('@/content/translationDisplay', () => ({
  applyTheme: vi.fn(),
  applyPosition: vi.fn(),
  applyDarkMode: vi.fn(),
  setPageState: vi.fn(),
  showLoadingPlaceholder: vi.fn(),
  setErrorState: vi.fn(),
  applyTranslation: vi.fn(),
  removeAllTranslations: vi.fn(),
}));

vi.mock('@/content/domWalker', () => ({
  extractPieces: vi.fn().mockReturnValue([
    { id: 'p1', text: 'Hello', parentElement: null, isTranslated: false },
    { id: 'p2', text: 'World', parentElement: null, isTranslated: false },
  ]),
}));

vi.stubGlobal('chrome', {
  runtime: {
    sendMessage: vi.fn().mockResolvedValue({
      success: true,
      results: [
        { id: 'p1', translatedText: 'Xin chào' },
        { id: 'p2', translatedText: 'Thế giới' },
      ],
    }),
  },
  storage: {
    local: {
      get: vi.fn().mockResolvedValue({}),
      set: vi.fn().mockResolvedValue(undefined),
    },
    onChanged: {
      addListener: vi.fn(),
      removeListener: vi.fn(),
    },
  },
});

beforeEach(() => {
  document.body.innerHTML = '';
  vi.clearAllMocks();
  removeAllSectionTranslations();
});

describe('sectionTranslate', () => {
  it('translateSection sends pieces to background', async () => {
    const section = document.createElement('div');
    document.body.appendChild(section);

    // Update mock to set parentElement
    const { extractPieces } = await import('@/content/domWalker');
    (extractPieces as ReturnType<typeof vi.fn>).mockReturnValue([
      { id: 'p1', text: 'Hello', parentElement: section, isTranslated: false },
    ]);

    await translateSection(section);

    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'translate' }),
    );
    expect(getTranslatedSections()).toHaveLength(1);
  });

  it('removeSectionTranslation removes only that section', async () => {
    const section1 = document.createElement('div');
    const section2 = document.createElement('div');
    document.body.appendChild(section1);
    document.body.appendChild(section2);

    const { extractPieces } = await import('@/content/domWalker');
    (extractPieces as ReturnType<typeof vi.fn>)
      .mockReturnValueOnce([{ id: 's1', text: 'A', parentElement: section1, isTranslated: false }])
      .mockReturnValueOnce([{ id: 's2', text: 'B', parentElement: section2, isTranslated: false }]);

    await translateSection(section1);
    await translateSection(section2);
    expect(getTranslatedSections()).toHaveLength(2);

    removeSectionTranslation(section1);
    expect(getTranslatedSections()).toHaveLength(1);
    expect(getTranslatedSections()[0].element).toBe(section2);
  });

  it('removeAllSectionTranslations clears all', async () => {
    const section = document.createElement('div');
    document.body.appendChild(section);

    const { extractPieces } = await import('@/content/domWalker');
    (extractPieces as ReturnType<typeof vi.fn>).mockReturnValue([
      { id: 'p1', text: 'Hello', parentElement: section, isTranslated: false },
    ]);

    await translateSection(section);
    expect(getTranslatedSections()).toHaveLength(1);

    removeAllSectionTranslations();
    expect(getTranslatedSections()).toHaveLength(0);
  });

  it('adds dismiss button to section', async () => {
    const section = document.createElement('div');
    document.body.appendChild(section);

    const { extractPieces } = await import('@/content/domWalker');
    (extractPieces as ReturnType<typeof vi.fn>).mockReturnValue([
      { id: 'p1', text: 'Hello', parentElement: section, isTranslated: false },
    ]);

    await translateSection(section);

    const dismissBtn = section.querySelector('[data-anyllm-role="section-dismiss"]');
    expect(dismissBtn).not.toBeNull();
  });
});
