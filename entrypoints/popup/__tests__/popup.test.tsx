/**
 * ActionZone — CTA / recovery / progress strip smoke tests.
 */


import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import { ActionZone } from '@/entrypoints/popup/components/ActionZone';
import { NamedGlossarySuggestionsModal } from '@/entrypoints/popup/components/NamedGlossarySuggestionsModal';
import { QuickSettings } from '@/entrypoints/popup/components/QuickSettings';
import type { ComponentProps } from 'react';
import { CategoryPicker } from '@/entrypoints/popup/components/CategoryPicker';
import { derivePopupStatus } from '@/entrypoints/popup/lib/derivePopupStatus';
import { shouldAcceptTabScopedMessage } from '@/entrypoints/popup/lib/shouldAcceptTabScopedMessage';
import { getUnsupportedPageInfo } from '@/entrypoints/popup/lib/unsupportedPage';
import { openOptionsWindow } from '@/entrypoints/popup/lib/openOptions';

describe('ActionZone', () => {
  it('renders ready, setup-recovery, and progress states', () => {
    // ready
    const onToggle = vi.fn();
    const ready = render(
      <ActionZone
        kind="ready"
        onTranslateToggle={onToggle}
        progressLabel=""
        progressDetail=""
        progressPercent={0}
        showProgress={false}
        isActive={false}
        unsupported={null}
      />,
    );
    const btn = screen.getByRole('button', { name: /translate page/i });
    expect(btn).toBeTruthy();
    fireEvent.click(btn);
    expect(onToggle).toHaveBeenCalled();
    ready.unmount();

    // setup-recovery
    const setupRender = render(
      <ActionZone
        kind="setup"
        onTranslateToggle={() => {}}
        progressLabel=""
        progressDetail=""
        progressPercent={0}
        showProgress={false}
        isActive={false}
        unsupported={null}
        recovery={{
          title: 'Provider not ready',
          description: 'Add a provider',
          action: 'Enter URL',
          canTest: false,
          onSetup: () => {},
          onTest: () => {},
          setupLabel: 'Set up provider',
        }}
      />,
    );
    expect(screen.getByText('Provider not ready')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /translate page/i })).toBeNull();
    setupRender.unmount();

    // progress
    render(
      <ActionZone
        kind="translating"
        onTranslateToggle={() => {}}
        progressLabel="Translating..."
        progressDetail="3 of 10 completed"
        progressPercent={30}
        showProgress
        isActive
        unsupported={null}
      />,
    );
    expect(screen.getByRole('button', { name: /restore original/i })).toBeTruthy();
    expect(screen.getByText(/3 of 10/i)).toBeTruthy();
    expect(screen.getByText('30%')).toBeTruthy();
  });
});

describe('Popup modals and quick settings', () => {
  it('covers glossary selection/editing and QuickSettings subtitle-list behavior', () => {
    const onPush = vi.fn();
    render(
      <NamedGlossarySuggestionsModal
        rows={[
          { source: 'Alice', target: '爱丽丝' },
          { source: 'Bob', target: '鲍勃' },
        ]}
        activeListName="Characters"
        onClose={vi.fn()}
        onPush={onPush}
      />,
    );

    fireEvent.change(screen.getByLabelText('Translation for Alice'), {
      target: { value: '艾丽丝' },
    });
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select Bob' }));
    fireEvent.click(screen.getByRole('button', { name: 'Push selected' }));
    expect(onPush).toHaveBeenCalledWith([{ source: 'Alice', target: '艾丽丝' }]);
    cleanup();

    const onSubtitleListChange = vi.fn();
    const { rerender } = render(
      <QuickSettings
        expanded={true}
        onToggle={vi.fn()}
        theme="dividing-line"
        onThemeChange={vi.fn()}
        displayMode="bilingual-below"
        onDisplayModeChange={vi.fn()}
        subtitlesEnabled={true}
        onSubtitlesToggle={vi.fn()}
        subtitleLists={[
          { id: 'people', name: 'Character names', entries: [], updatedAt: 1 },
          { id: 'terms', name: 'Technical terms', entries: [], updatedAt: 2 },
        ]}
        activeSubtitleListId="people"
        activeHostname="video.example.com"
        onSubtitleListChange={onSubtitleListChange}
        onReviewSuggestions={vi.fn()}
        styleExpanded={false}
        onStyleToggle={vi.fn()}
        tabOverrides={{}}
        onTabKnob={vi.fn()}
        onOpenMoreSettings={vi.fn()}
      />,
    );

    expect(screen.getByText('Using last choice for video.example.com')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /character names/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Technical terms' }));
    expect(onSubtitleListChange).toHaveBeenCalledWith('terms');

    rerender(
      <QuickSettings
        expanded={true}
        onToggle={vi.fn()}
        theme="dividing-line"
        onThemeChange={vi.fn()}
        displayMode="bilingual-below"
        onDisplayModeChange={vi.fn()}
        subtitlesEnabled={false}
        onSubtitlesToggle={vi.fn()}
        subtitleLists={[]}
        activeSubtitleListId={null}
        activeHostname="video.example.com"
        onSubtitleListChange={vi.fn()}
        onReviewSuggestions={vi.fn()}
        styleExpanded={false}
        onStyleToggle={vi.fn()}
        tabOverrides={{}}
        onTabKnob={vi.fn()}
        onOpenMoreSettings={vi.fn()}
      />,
    );
    expect(screen.queryByText('Subtitle dictionary')).toBeNull();
  });
});

/**
 * CategoryPicker — portal menu, search, custom draft, source chip.
 */


function renderPicker(overrides: Partial<ComponentProps<typeof CategoryPicker>> = {}) {
  const props = {
    currentValue: '__auto__',
    isCustomEntry: false,
    detectedCategory: 'News',
    customCategoryInput: '',
    onCategoryChange: vi.fn(),
    onCustomInputChange: vi.fn(),
    onCustomSubmit: vi.fn(),
    showSaveAsRule: false,
    onSaveAsRule: vi.fn(),
    activeHostname: 'example.com',
    sourceKind: 'auto' as const,
    ...overrides,
  };
  const result = render(<CategoryPicker {...props} />);
  return { ...result, props };
}

describe('CategoryPicker', () => {
  beforeEach(() => {
    // jsdom layout: give the trigger a box so portal positioning runs
    Object.defineProperty(HTMLElement.prototype, 'getBoundingClientRect', {
      configurable: true,
      value: () => ({
        top: 40,
        bottom: 80,
        left: 10,
        right: 300,
        width: 290,
        height: 40,
        x: 10,
        y: 40,
        toJSON: () => ({}),
      }),
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('shows source chips for auto and tab overrides when closed', () => {
    const auto = renderPicker({ sourceKind: 'auto', detectedCategory: 'News' });
    expect(screen.getByText('Auto')).toBeTruthy();
    expect(screen.getByText('News')).toBeTruthy();
    auto.unmount();

    renderPicker({
      sourceKind: 'tab',
      currentValue: 'Gaming',
      detectedCategory: undefined,
    });
    expect(screen.getByText('This tab')).toBeTruthy();
    expect(screen.getByText('Gaming')).toBeTruthy();
  });

  it('opens a portaled listbox with Auto/groups and filters with correct search direction', async () => {
    const { unmount } = renderPicker();
    fireEvent.click(screen.getByRole('button', { name: /category/i }));
    await waitFor(() => {
      expect(screen.getByRole('listbox', { name: /page category/i })).toBeTruthy();
    });
    expect(screen.getByRole('option', { name: /auto detect/i })).toBeTruthy();
    expect(screen.getByText('Development')).toBeTruthy();
    expect(screen.getByRole('option', { name: 'Software Development' })).toBeTruthy();

    const input = screen.getByPlaceholderText(/filter categories/i);
    // Old inverted check was `'auto'.includes(q)` — "detect" failed that; label.includes works.
    fireEvent.change(input, { target: { value: 'detect' } });
    expect(screen.getByRole('option', { name: /auto detect/i })).toBeTruthy();
    fireEvent.change(input, { target: { value: 'xyznope' } });
    expect(screen.queryByRole('option', { name: /auto detect/i })).toBeNull();
    fireEvent.change(input, { target: { value: 'soft' } });
    expect(screen.getByRole('option', { name: 'Software Development' })).toBeTruthy();
    unmount();
  });

  it('selects a category and closes, and closes on Escape', async () => {
    const { props, unmount } = renderPicker();
    fireEvent.click(screen.getByRole('button', { name: /category/i }));
    const opt = await screen.findByRole('option', { name: 'News' });
    fireEvent.click(opt);
    expect(props.onCategoryChange).toHaveBeenCalledWith('News');
    await waitFor(() => {
      expect(screen.queryByRole('listbox')).toBeNull();
    });
    unmount();

    renderPicker();
    fireEvent.click(screen.getByRole('button', { name: /category/i }));
    await screen.findByRole('listbox');
    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => {
      expect(screen.queryByRole('listbox')).toBeNull();
    });
  });

  it('keeps custom draft editable inside the panel', async () => {
    const onCustomInputChange = vi.fn();
    renderPicker({
      currentValue: 'My Cat',
      isCustomEntry: true,
      customCategoryInput: 'My Cat',
      onCustomInputChange,
      sourceKind: 'tab',
    });
    fireEvent.click(screen.getByRole('button', { name: /category/i }));
    fireEvent.click(await screen.findByRole('option', { name: /custom category/i }));
    const draft = await screen.findByPlaceholderText(/scientific paper/i);
    expect((draft as HTMLInputElement).value).toBe('My Cat');
    fireEvent.change(draft, { target: { value: 'My Cat edited' } });
    expect(onCustomInputChange).toHaveBeenCalledWith('My Cat edited');
  });

  it('shows save-as-rule with truncated host and flash label', async () => {
    const onSaveAsRule = vi.fn();
    renderPicker({
      showSaveAsRule: true,
      onSaveAsRule,
      activeHostname: 'very-long-subdomain.example-documentation.com',
      sourceKind: 'tab',
      currentValue: 'News',
    });
    const saveBtn = screen.getByRole('button', { name: /save as site rule/i });
    expect(saveBtn.textContent).toMatch(/…/);
    fireEvent.click(saveBtn);
    expect(onSaveAsRule).toHaveBeenCalled();
    expect(screen.getByText(/saved as site rule/i)).toBeTruthy();
  });
});

const base = {
  status: 'idle' as const,
  isTranslating: false,
  hasError: false,
  unsupported: false,
  needsSetup: false,
  readingAreaReady: false,
};

describe('derivePopupStatus', () => {
  it('derives every status kind with correct precedence and chip labels', () => {
    expect(derivePopupStatus(base)).toEqual({
      kind: 'ready',
      chipLabel: 'Ready',
      showProgress: false,
    });

    const setup = derivePopupStatus({ ...base, needsSetup: true, unsupported: true });
    expect(setup.kind).toBe('setup');
    expect(setup.chipLabel).toBe('Setup');

    const blocked = derivePopupStatus({ ...base, unsupported: true, hasError: true, status: 'error' });
    expect(blocked.kind).toBe('blocked');
    expect(blocked.chipLabel).toBe('Unavailable');

    const error = derivePopupStatus({
      ...base,
      hasError: true,
      status: 'error',
      isTranslating: true,
    });
    expect(error.kind).toBe('error');
    expect(error.chipLabel).toBe('Error');
    expect(error.showProgress).toBe(false);

    const translating = derivePopupStatus({ ...base, isTranslating: true, status: 'translating' });
    expect(translating.kind).toBe('translating');
    expect(translating.chipLabel).toBe('Translating');
    expect(translating.showProgress).toBe(true);

    const done = derivePopupStatus({ ...base, status: 'done' });
    expect(done.kind).toBe('active');
    expect(done.chipLabel).toBe('Active');
    expect(done.showProgress).toBe(true);

    const readingReady = derivePopupStatus({ ...base, status: 'done', readingAreaReady: true });
    expect(readingReady.kind).toBe('active');
    expect(readingReady.chipLabel).toBe('Active');
    expect(readingReady.showProgress).toBe(true);
  });
});

describe('shouldAcceptTabScopedMessage', () => {
  it('accepts only when fromTabId equals a valid activeTabId (rejects mismatch, unknown, and placeholder ids)', () => {
    expect(shouldAcceptTabScopedMessage(42, 42)).toBe(true);
    expect(shouldAcceptTabScopedMessage(42, 99)).toBe(false);
    expect(shouldAcceptTabScopedMessage(null, 42)).toBe(false);
    expect(shouldAcceptTabScopedMessage(undefined, 42)).toBe(false);
    expect(shouldAcceptTabScopedMessage(null, null)).toBe(false);
    expect(shouldAcceptTabScopedMessage(42, 0)).toBe(false);
    expect(shouldAcceptTabScopedMessage(42, null)).toBe(false);
    expect(shouldAcceptTabScopedMessage(42, undefined)).toBe(false);
    expect(shouldAcceptTabScopedMessage(42, -1)).toBe(false);
  });
});

describe('getUnsupportedPageInfo', () => {
  it("returns the can't-be-translated message for missing tabs, chrome:// pages, and browser stores", () => {
    const missing = getUnsupportedPageInfo(undefined);
    expect(missing?.title).toMatch(/can't be translated/i);

    const chromePage = getUnsupportedPageInfo({ id: 1, url: 'chrome://extensions' } as chrome.tabs.Tab);
    expect(chromePage).not.toBeNull();

    const webStore = getUnsupportedPageInfo({
      id: 1,
      url: 'https://chromewebstore.google.com/detail/foo',
    } as chrome.tabs.Tab);
    expect(webStore).not.toBeNull();
  });

  it('allows normal https pages', () => {
    expect(
      getUnsupportedPageInfo({ id: 1, url: 'https://example.com/page' } as chrome.tabs.Tab),
    ).toBeNull();
  });

  it('returns PDF viewer special copy', () => {
    const info = getUnsupportedPageInfo({
      id: 1,
      url: 'chrome-extension://abcdef/pdf-viewer.html?file=https%3A%2F%2Fx.com%2Fa.pdf',
    } as chrome.tabs.Tab);
    expect(info?.title).toMatch(/PDF translation is active/i);
  });
});

const BASE = 'chrome-extension://test/options.html';

function mockChrome() {
  const getAll = vi.fn<() => Promise<chrome.windows.Window[]>>();
  const update = vi.fn<(id: number, opts: unknown) => Promise<chrome.windows.Window>>();
  const create = vi.fn<(opts: unknown) => Promise<chrome.windows.Window>>();
  const tabsUpdate = vi.fn<(id: number, opts: unknown) => Promise<chrome.tabs.Tab>>();

  chrome.runtime.getURL = ((path: string) => `chrome-extension://test/${path}`) as typeof chrome.runtime.getURL;
  chrome.windows = {
    getAll,
    update,
    create,
  } as unknown as typeof chrome.windows;
  chrome.tabs = {
    update: tabsUpdate,
  } as unknown as typeof chrome.tabs;

  return { getAll, update, create, tabsUpdate };
}

describe('openOptionsWindow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates a new window when no settings window exists', async () => {
    const { getAll, create } = mockChrome();
    getAll.mockResolvedValue([]);

    await openOptionsWindow();

    expect(create).toHaveBeenCalledTimes(1);
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({ url: BASE, type: 'popup', focused: true }),
    );
  });

  it('focuses the existing settings window instead of creating another', async () => {
    const { getAll, update, create, tabsUpdate } = mockChrome();
    getAll.mockResolvedValue([
      {
        id: 7,
        focused: false,
        tabs: [{ id: 11, url: `${BASE}?section=general` }],
      } as unknown as chrome.windows.Window,
    ]);

    await openOptionsWindow();

    expect(update).toHaveBeenCalledWith(7, { focused: true });
    expect(tabsUpdate).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
  });

  it('navigates the existing tab when a deep link is requested', async () => {
    const { getAll, update, tabsUpdate, create } = mockChrome();
    getAll.mockResolvedValue([
      {
        id: 7,
        focused: false,
        tabs: [{ id: 11, url: BASE }],
      } as unknown as chrome.windows.Window,
    ]);

    await openOptionsWindow('?setup=1&step=connect');

    expect(update).toHaveBeenCalledWith(7, { focused: true });
    expect(tabsUpdate).toHaveBeenCalledWith(11, {
      url: `${BASE}?setup=1&step=connect`,
      active: true,
    });
    expect(create).not.toHaveBeenCalled();
  });

  it('creates a new window when existing windows have no options tab', async () => {
    const { getAll, create } = mockChrome();
    getAll.mockResolvedValue([
      {
        id: 7,
        focused: true,
        tabs: [{ id: 11, url: 'https://example.com/' }],
      } as unknown as chrome.windows.Window,
    ]);

    await openOptionsWindow();

    expect(create).toHaveBeenCalledTimes(1);
  });

  it('falls back to creating a window when getAll rejects', async () => {
    const { getAll, create } = mockChrome();
    getAll.mockRejectedValue(new Error('boom'));

    await openOptionsWindow();

    expect(create).toHaveBeenCalledTimes(1);
  });
});
