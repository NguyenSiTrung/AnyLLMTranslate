/**
 * SubtitlesSection — Subtitle Studio shell, cards, ASR nesting, knobs.
 */


import { beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { DEFAULT_SETTINGS, DEFAULT_SUBTITLE_SETTINGS, type PoolProvider, DEFAULT_INLINE_TRANSLATE_SETTINGS } from '@/types/config';
import { useSettingsStore } from '@/stores/settingsStore';
import { SubtitlesSection } from '../SubtitlesSection';
import { GeneralSection } from '../GeneralSection';
import { ToastProvider } from '@/ui/ToastProvider';
import { ProvidersSection } from '../ProvidersSection';
import { InlineTranslateSection } from '../InlineTranslateSection';
import { ThemesSection } from '../ThemesSection';
import { ZERO_COUNTERS, type DailyStatRecord, type StatCounters } from '@/types/stats';
import { buildChartDays, buildLast30Days, formatCompactDate, formatCompactNumber, formatDelta, formatFullDate, getCacheEfficiency, hasDailyActivity } from '../statisticsDisplay';

const mockStorageData: Record<string, unknown> = {};

vi.stubGlobal('chrome', {
  storage: {
    local: {
      get: vi.fn(async (key: string) => ({ [key]: mockStorageData[key] })),
      set: vi.fn(async (data: Record<string, unknown>) => {
        Object.assign(mockStorageData, data);
      }),
    },
    onChanged: {
      addListener: vi.fn(),
      removeListener: vi.fn(),
    },
  },
  runtime: {
    sendMessage: vi.fn(async (msg: { action?: string }) => {
      if (msg?.action === 'ASR_REALIGN_CACHE_STATS') {
        return { success: true, entryCount: 0, totalBytes: 0 };
      }
      if (msg?.action === 'LIST_ASR_REALIGN_CACHE') {
        return { success: true, entries: [] };
      }
      return { success: true, statuses: {} };
    }),
    onMessage: {
      addListener: vi.fn(),
      removeListener: vi.fn(),
    },
  },
});

// The settings store is a module-level singleton shared by every describe in
// this merged file. Some tests replace the updateSettings *action* with a
// vi.fn() — capture the real one now and restore it each test so later
// describes still commit through real config/storage.
const realUpdateSettings = useSettingsStore.getState().updateSettings;

beforeEach(() => {
  useSettingsStore.setState({
    ...DEFAULT_SETTINGS,
    isLoaded: true,
    updateSettings: realUpdateSettings,
  });
  for (const k of Object.keys(mockStorageData)) {
    Reflect.deleteProperty(mockStorageData, k);
  }
});

describe('SubtitlesSection (Subtitle Studio)', () => {
  beforeEach(() => {
    useSettingsStore.setState({
      ...DEFAULT_SETTINGS,
      isLoaded: true,
      targetLanguage: 'vi',
      subtitleSettings: { ...DEFAULT_SUBTITLE_SETTINGS, enabled: true },
    });
    for (const k of Object.keys(mockStorageData)) {
      Reflect.deleteProperty(mockStorageData, k);
    }
    vi.clearAllMocks();
  });

  it('covers studio cards, display toggles, ASR disable behavior, and profile reset', async () => {
    render(<SubtitlesSection />);
    expect(screen.getByRole('heading', { name: 'Subtitle Studio', level: 2 })).toBeInTheDocument();
    expect(screen.getByRole('switch', { name: /Enable Subtitles/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Live preview', level: 3 })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Appearance', level: 3 })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Source track', level: 3 })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Platforms', level: 3 })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Caption quality', level: 3 })).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Re-align from link', level: 3 }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Saved caption re-aligns', level: 3 }),
    ).toBeInTheDocument();

    // Card order: Caption quality → Re-align from link → Saved caption re-aligns.
    const captionQuality = screen.getByRole('heading', { name: 'Caption quality', level: 3 });
    const prealign = screen.getByRole('heading', { name: 'Re-align from link', level: 3 });
    const saved = screen.getByRole('heading', { name: 'Saved caption re-aligns', level: 3 });
    expect(
      captionQuality.compareDocumentPosition(prealign) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      prealign.compareDocumentPosition(saved) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Translation style', level: 3 })).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByTestId('asr-realign-summary')).toHaveTextContent(/No saved re-aligns yet/i);
    });
    expect(screen.getByTestId('subtitle-preview')).toBeInTheDocument();
    expect(screen.getByTestId('subtitle-preview-summary')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('radio', { name: /Translated/i }));
    await waitFor(() => {
      expect(useSettingsStore.getState().subtitleSettings.displayMode).toBe('translation-only');
    });

    fireEvent.click(screen.getByRole('switch', { name: /Enable Subtitles/i }));
    await waitFor(() => {
      expect(useSettingsStore.getState().subtitleSettings.enabled).toBe(false);
    });
    cleanup();
    {
    useSettingsStore.setState({
      subtitleSettings: {
        ...DEFAULT_SUBTITLE_SETTINGS,
        enabled: true,
        youtubeAsrResegment: { enable: true, aiEnable: true },
        knobOverrides: { register: 'casual', brevity: 'terse' },
      },
    });
    render(<SubtitlesSection />);
    fireEvent.click(screen.getByRole('switch', { name: /Improve auto-generated captions/i }));
    await waitFor(() => {
      const asr = useSettingsStore.getState().subtitleSettings.youtubeAsrResegment;
      expect(asr?.enable).toBe(false);
      expect(asr?.aiEnable).toBe(false);
    });

    fireEvent.click(screen.getByRole('button', { name: /Reset to profile defaults/i }));
    await waitFor(() => {
      expect(useSettingsStore.getState().subtitleSettings.knobOverrides).toEqual({});
    });
    }
});
});

/**
 * GeneralSection — four-card IA, swap, disabled position, browse themes.
 */




// Import after chrome stub

describe('GeneralSection', () => {
  beforeEach(() => {
    useSettingsStore.setState({
      ...DEFAULT_SETTINGS,
      isLoaded: true,
      sourceLanguage: 'en',
      targetLanguage: 'vi',
      displayMode: 'bilingual-below',
      translationPosition: 'below',
      theme: 'blockquote',
      darkMode: 'auto',
      enableCompactInlineForShortText: false,
    });
    for (const k of Object.keys(mockStorageData)) {
      Reflect.deleteProperty(mockStorageData, k);
    }
    vi.clearAllMocks();
  });

  it('covers four-card IA, language/layout controls, and theme/contrast/compact settings', async () => {
    const { unmount } = render(<GeneralSection />);
    expect(screen.getByRole('heading', { name: 'Language', level: 3 })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Layout', level: 3 })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Style', level: 3 })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Advanced display', level: 3 })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Display & Appearance' })).not.toBeInTheDocument();
    expect(screen.getByText('Page contrast')).toBeInTheDocument();
    expect(screen.queryByText('Host Page Mode')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Swap languages' }));
    await waitFor(() => {
      const state = useSettingsStore.getState();
      expect(state.sourceLanguage).toBe('vi');
      expect(state.targetLanguage).toBe('en');
    });
    unmount();

    useSettingsStore.setState({ sourceLanguage: 'auto', targetLanguage: 'vi' });
    const { unmount: unmount2 } = render(<GeneralSection />);
    expect(screen.getByRole('button', { name: 'Swap languages' })).toBeDisabled();
    unmount2();

    useSettingsStore.setState({ sourceLanguage: 'en', displayMode: 'translation-only' });
    render(<GeneralSection />);
    const positionGroup = document.getElementById('general-translation-position');
    expect(positionGroup).toHaveAttribute('aria-disabled', 'true');
    for (const radio of within(positionGroup as HTMLElement).getAllByRole('radio')) {
      expect(radio).toBeDisabled();
    }
    cleanup();
    useSettingsStore.setState({
      ...DEFAULT_SETTINGS,
      isLoaded: true,
      sourceLanguage: 'en',
      targetLanguage: 'vi',
      displayMode: 'bilingual-below',
      translationPosition: 'below',
      theme: 'blockquote',
      darkMode: 'auto',
      enableCompactInlineForShortText: false,
    });
    {
    const onNavigate = vi.fn();
    const { unmount } = render(<GeneralSection onNavigateToThemes={onNavigate} />);
    fireEvent.click(screen.getByRole('button', { name: /Browse themes/i }));
    expect(onNavigate).toHaveBeenCalledTimes(1);
    unmount();

    render(<GeneralSection />);
    expect(screen.queryByRole('button', { name: /Browse themes/i })).not.toBeInTheDocument();

    const select = document.getElementById('general-theme') as HTMLSelectElement;
    fireEvent.change(select, { target: { value: 'bubble' } });
    await waitFor(() => {
      expect(useSettingsStore.getState().theme).toBe('bubble');
    });

    const group = document.getElementById('general-host-page-mode') as HTMLElement;
    fireEvent.click(within(group).getByRole('radio', { name: /Dark/i }));
    await waitFor(() => {
      expect(useSettingsStore.getState().darkMode).toBe('dark');
    });

    fireEvent.click(screen.getByRole('switch', { name: /Compact inline for short text/i }));
    await waitFor(() => {
      expect(useSettingsStore.getState().enableCompactInlineForShortText).toBe(true);
    });
    }
  });
});

/**
 * ProvidersSection ops dashboard shell smoke tests.
 */





function sampleProvider(): PoolProvider {
  return {
    id: 'p1',
    displayName: 'OpenRouter',
    baseUrl: 'https://openrouter.ai/api/v1',
    model: 'test-model',
    requiresApiKey: true,
    catalogId: 'openrouter',
    temperature: 0.3,
    maxTokens: 4096,
    enabled: true,
    keys: [
      {
        id: 'k1',
        apiKey: 'sk-test',
        maxRpm: 0,
        concurrencyLimit: 0,
        interval: 0,
        enabled: true,
        lastTestResult: { success: true, at: Date.now(), latencyMs: 100 },
      },
    ],
  };
}

function renderSection() {
  return render(
    <ToastProvider>
      <ProvidersSection />
    </ToastProvider>,
  );
}

describe('ProvidersSection', () => {
  beforeEach(() => {
    useSettingsStore.setState({
      ...DEFAULT_SETTINGS,
      isLoaded: true,
      providers: [],
      targetLanguage: 'vi',
    });
    for (const k of Object.keys(mockStorageData)) {
      Reflect.deleteProperty(mockStorageData, k);
    }
    vi.clearAllMocks();
  });

  it('empty hero, configured list, and Edit opens drawer', () => {
    const { unmount } = renderSection();
    expect(screen.getByText(/Connect your first LLM/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Add provider/i })).toBeInTheDocument();
    unmount();

    useSettingsStore.setState({ providers: [sampleProvider()] });
    renderSection();
    expect(screen.getByText('OpenRouter')).toBeInTheDocument();
    expect(screen.getByText(/preferred in rotation/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Test all keys/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Edit/i }));
    expect(screen.getByRole('dialog', { name: 'OpenRouter' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Connection' })).toBeInTheDocument();
  });
});

/**
 * InlineTranslateSection — hero, cards, dual mode segments, dimmer.
 */





describe('InlineTranslateSection', () => {
  beforeEach(() => {
    useSettingsStore.setState({
      ...DEFAULT_SETTINGS,
      isLoaded: true,
      inlineTranslate: { ...DEFAULT_INLINE_TRANSLATE_SETTINGS, enabled: true },
    });
    for (const k of Object.keys(mockStorageData)) {
      Reflect.deleteProperty(mockStorageData, k);
    }
    vi.clearAllMocks();
  });

  it('renders cards/preview, dual mode, toggle, blocklist badge, collapsed timing', async () => {
    render(<InlineTranslateSection />);
    expect(
      screen.getByRole('switch', { name: /Enable Inline Translation/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Preview', level: 3 })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Trigger', level: 3 })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Write & language', level: 3 })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Site blocklist', level: 3 })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Advanced', level: 3 })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'How it works', level: 3 })).toBeInTheDocument();
    expect(screen.getByTestId('inline-translate-preview')).toBeInTheDocument();
    expect(screen.getByText(/After gesture/i)).toBeInTheDocument();

    const n = DEFAULT_INLINE_TRANSLATE_SETTINGS.blocklistPatterns.length;
    expect(screen.getByText(new RegExp(`${n}\\s+patterns?`, 'i'))).toBeInTheDocument();

    const btn = screen.getByRole('button', { name: /Gesture timing/i });
    expect(btn).toHaveAttribute('aria-expanded', 'false');

    fireEvent.click(screen.getByRole('radio', { name: /Original \+ translation/i }));
    await waitFor(() => {
      expect(useSettingsStore.getState().inlineTranslate.dualMode).toBe(true);
    });

    fireEvent.click(screen.getByRole('switch', { name: /Enable Inline Translation/i }));
    await waitFor(() => {
      expect(useSettingsStore.getState().inlineTranslate.enabled).toBe(false);
    });
  });

  it('shows enable-to-preview message when disabled', () => {
    useSettingsStore.setState({
      inlineTranslate: { ...DEFAULT_INLINE_TRANSLATE_SETTINGS, enabled: false },
    });
    render(<InlineTranslateSection />);
    expect(screen.getByText(/Enable inline translation to preview/i)).toBeInTheDocument();
  });

  it('keeps blocklist and language-prefix drafts local until blur', async () => {
    // blocklist: keeps draft while typing (newlines/spaces) and commits on blur
    useSettingsStore.setState({
      inlineTranslate: {
        ...DEFAULT_INLINE_TRANSLATE_SETTINGS,
        enabled: true,
        blocklistPatterns: ['*.figma.com'],
      },
    });
    const blocklistRender = render(<InlineTranslateSection />);
    const ta = screen.getByLabelText('Blocklist patterns') as HTMLTextAreaElement;

    fireEvent.change(ta, { target: { value: '*.figma.com\n' } });
    expect(ta.value).toBe('*.figma.com\n');
    // Not yet committed — store still has the single pattern
    expect(useSettingsStore.getState().inlineTranslate.blocklistPatterns).toEqual([
      '*.figma.com',
    ]);

    fireEvent.change(ta, { target: { value: '*.figma.com\n*.notion.so' } });
    expect(ta.value).toBe('*.figma.com\n*.notion.so');

    fireEvent.blur(ta);
    await waitFor(() => {
      expect(useSettingsStore.getState().inlineTranslate.blocklistPatterns).toEqual([
        '*.figma.com',
        '*.notion.so',
      ]);
    });
    blocklistRender.unmount();

    // language prefix: keeps the edit local until blur
    const updateSettings = vi.fn();
    useSettingsStore.setState({ updateSettings });
    render(<InlineTranslateSection />);
    const input = screen.getByLabelText('Language prefix character') as HTMLInputElement;

    input.focus();
    fireEvent.change(input, { target: { value: '#' } });

    expect(input).toHaveFocus();
    expect(input.value).toBe('#');
    expect(updateSettings).not.toHaveBeenCalled();

    fireEvent.blur(input);
    expect(updateSettings).toHaveBeenCalledWith({
      inlineTranslate: expect.objectContaining({ languagePrefix: '#' }),
    });
  });
});

/**
 * ThemesSection — Theme Studio smoke tests.
 */





describe('ThemesSection', () => {
  beforeEach(() => {
    useSettingsStore.setState({
      ...DEFAULT_SETTINGS,
      isLoaded: true,
      theme: 'blockquote',
      displayMode: 'bilingual-below',
      translationPosition: 'below',
      darkMode: 'auto',
    });
    for (const k of Object.keys(mockStorageData)) {
      Reflect.deleteProperty(mockStorageData, k);
    }
    vi.clearAllMocks();
  });

  it('header, commit on click, soft-preview hover, category filter', async () => {
    render(<ThemesSection />);
    expect(screen.getByRole('heading', { name: /Theme Studio/i })).toBeInTheDocument();

    const card = screen.getByRole('radio', { name: /Speech Bubble/i });
    fireEvent.mouseEnter(card);
    expect(useSettingsStore.getState().theme).toBe('blockquote');
    expect(screen.getByText(/Previewing/i)).toBeInTheDocument();

    fireEvent.click(card);
    await waitFor(() => {
      expect(useSettingsStore.getState().theme).toBe('bubble');
    });

    fireEvent.click(screen.getByRole('tab', { name: /^Classic$/i }));
    expect(screen.getByRole('radio', { name: /Blockquote/i })).toBeInTheDocument();
    expect(screen.queryByRole('radio', { name: /Speech Bubble/i })).not.toBeInTheDocument();
  });

  it('custom editor, sample states, and navigate to General', () => {
    useSettingsStore.setState({ theme: 'custom' });
    const nav = vi.fn();
    render(<ThemesSection onNavigateToGeneral={nav} />);
    expect(screen.getByText(/Start from preset/i)).toBeInTheDocument();
    expect(screen.getByText(/Translation Text Color/i)).toBeInTheDocument();

    expect(screen.queryByText(/Translation failed/i)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Show sample states/i }));
    expect(screen.getByText(/Translation failed/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Open General/i }));
    expect(nav).toHaveBeenCalled();
  });

  it('keeps custom color text edits local until blur', () => {
    const updateSettings = vi.fn();
    useSettingsStore.setState({ theme: 'custom', updateSettings });
    render(<ThemesSection />);
    const input = screen.getAllByRole('textbox')[0] as HTMLInputElement;

    input.focus();
    fireEvent.change(input, { target: { value: '#123456' } });

    expect(input).toHaveFocus();
    expect(input.value).toBe('#123456');
    expect(updateSettings).not.toHaveBeenCalled();

    fireEvent.blur(input);
    expect(updateSettings).toHaveBeenCalledWith({
      customTheme: expect.objectContaining({ textColor: '#123456' }),
    });
  });
});

function emptyDay(date: string, totals: Partial<StatCounters> = {}): DailyStatRecord {
  return {
    date,
    totals: { ...ZERO_COUNTERS, ...totals },
    byMode: {},
    byProvider: {},
    byHost: {},
    byLanguagePair: {},
  };
}

describe('statisticsDisplay', () => {
  it('builds chart ranges, formats values, detects activity, and calculates cache efficiency', () => {
    const days = buildLast30Days(
      [
        { date: '2026-04-01', chars: 999, apiCalls: 9, cacheHits: 9 },
        { date: '2026-04-08', chars: 100, apiCalls: 1, cacheHits: 2 },
        { date: '2026-05-06', chars: 500, apiCalls: 3, cacheHits: 4 },
      ],
      new Date('2026-05-06T10:00:00Z'),
    );

    expect(days).toHaveLength(30);
    expect(days[0]).toMatchObject({ date: '2026-04-07', chars: 0, apiCalls: 0, cacheHits: 0 });
    expect(days[1]).toMatchObject({ date: '2026-04-08', chars: 100, apiCalls: 1, cacheHits: 2 });
    expect(days[29]).toMatchObject({ date: '2026-05-06', chars: 500, apiCalls: 3, cacheHits: 4 });
    expect(days.some((day) => day.date === '2026-04-01')).toBe(false);

    const now = new Date(2026, 6, 9, 15, 0, 0); // local Jul 9, 2026
    const days7 = buildChartDays(
      [
        emptyDay('2026-06-01', { characters: 999 }),
        emptyDay('2026-07-08', { characters: 42, apiCalls: 2, cacheHits: 1 }),
        emptyDay('2026-07-09', { characters: 1200, apiCalls: 3, cacheHits: 5 }),
      ],
      '7d',
      now,
      'en-US',
    );

    expect(days7).toHaveLength(7);
    expect(days7[0].date).toBe('2026-07-03');
    expect(days7[6].date).toBe('2026-07-09');
    expect(days7.some((d) => d.date === '2026-06-01')).toBe(false);
    expect(days7.find((d) => d.date === '2026-07-08')).toMatchObject({
      chars: 42,
      apiCalls: 2,
      cacheHits: 1,
    });
    expect(days7[6]).toMatchObject({ date: '2026-07-09', chars: 1200, apiCalls: 3, cacheHits: 5 });
    expect(days7[6].label).toBe(formatCompactDate('2026-07-09', 'en-US'));
    expect(days7[6].fullLabel).toBe(formatFullDate('2026-07-09', 'en-US'));

    expect(buildChartDays([], '30d', now)).toHaveLength(30);
    expect(buildChartDays([], '90d', now)).toHaveLength(90);

    const allDays = buildChartDays(
      [
        emptyDay('2026-07-01', { characters: 5, apiCalls: 1 }),
        emptyDay('2026-07-03', { characters: 15, apiCalls: 2 }),
      ],
      'all',
      new Date(2026, 6, 9),
    );
    expect(allDays.map((d) => d.date)).toEqual(['2026-07-01', '2026-07-02', '2026-07-03']);
    expect(allDays.map((d) => d.chars)).toEqual([5, 0, 15]);
    expect(buildChartDays([], 'all', new Date(2026, 6, 9))).toEqual([]);
    expect(formatCompactDate('2026-05-06', 'en-US')).toBe('May 6');
    expect(formatFullDate('2026-05-06', 'en-US')).toBe('May 6, 2026');

    expect(formatCompactNumber(0)).toBe('0');
    expect(formatCompactNumber(999)).toBe('999');
    expect(formatCompactNumber(1000)).toBe('1K');
    expect(formatCompactNumber(1200)).toBe('1.2K');
    expect(formatCompactNumber(1_000_000)).toBe('1M');
    expect(formatCompactNumber(1_500_000)).toBe('1.5M');
    expect(formatCompactNumber(2_300_000_000)).toBe('2.3B');
    expect(formatCompactNumber(-1200)).toBe('-1.2K');

    expect(formatDelta(null)).toBe('—');
    expect(formatDelta(0)).toBe('0%');
    expect(formatDelta(12.4)).toBe('+12%');
    expect(formatDelta(-5.6)).toBe('-6%');

    expect(
      hasDailyActivity([{ date: '2026-07-01', chars: 0, apiCalls: 0, cacheHits: 0 }]),
    ).toBe(false);
    expect(
      hasDailyActivity([{ date: '2026-07-01', chars: 1, apiCalls: 0, cacheHits: 0 }]),
    ).toBe(true);
    expect(
      hasDailyActivity([{ date: '2026-07-01', chars: 0, apiCalls: 1, cacheHits: 0 }]),
    ).toBe(true);

    expect(getCacheEfficiency(0, 0)).toEqual({ totalOps: 0, hitRate: null });
    expect(getCacheEfficiency(-1, 0)).toEqual({ totalOps: 0, hitRate: null });
    expect(getCacheEfficiency(2, 1)).toEqual({ totalOps: 3, hitRate: 67 });
  });
});
