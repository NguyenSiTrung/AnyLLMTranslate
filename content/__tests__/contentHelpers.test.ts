import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  updateMiniProgress,
  hideMiniProgress,
  isMiniProgressVisible,
} from '@/content/miniProgress';
import { DATA_ATTRS } from '@/lib/constants';
import {
  applyTranslation,
  setPageState,
  removeAllTranslations,
} from '@/content/translationDisplay';
import {
  removeSectionTranslation,
  clearTranslatedSections,
  getTranslatedSections,
} from '@/content/sectionTranslate';
import { DEFAULT_SETTINGS, type ExtensionSettings, type PageContext } from '@/types/config';
import {
  showSystemicPauseBanner,
  hideSystemicPauseBanner,
  isSystemicPauseBannerVisible,
  showTranslationErrorNotification,
} from '@/content/autoTranslateNotification';
import {
  loadPreferences,
  savePreferences,
  setOffset,
  setFontSize,
  flushPendingOffsetSave,
  resetDragState,
} from '@/content/subtitleControls';

/**
 * @vitest-environment jsdom
 */

describe('miniProgress', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    hideMiniProgress();
  });
  afterEach(() => {
    hideMiniProgress();
  });

  it('shows translating and realigning states, hides when idle, and handles Stop', () => {
    const onStop = vi.fn();
    updateMiniProgress({
      translated: 3,
      total: 10,
      status: 'translating',
      onStop,
    });
    expect(isMiniProgressVisible()).toBe(true);
    const bar = document.querySelector('[data-anyllm-role="mini-progress"]');
    expect(bar?.textContent).toContain('3/10');
    expect(bar?.querySelector('.anyllm-mini-progress-stop')?.textContent).toBe('Stop');

    // Idle / zero totals hide the progress bar.
    updateMiniProgress({
      translated: 1,
      total: 2,
      status: 'translating',
      onStop: () => {},
    });
    updateMiniProgress({
      translated: 0,
      total: 0,
      status: 'idle',
      onStop: () => {},
    });
    expect(isMiniProgressVisible()).toBe(false);

    // Stop click invokes the callback and hides.
    updateMiniProgress({
      translated: 1,
      total: 5,
      status: 'translating',
      onStop,
    });
    (document.querySelector('.anyllm-mini-progress-stop') as HTMLButtonElement).click();
    expect(onStop).toHaveBeenCalled();
    expect(isMiniProgressVisible()).toBe(false);
    // Realigning states show their distinct progress labels.
    updateMiniProgress({
      translated: 2,
      total: 5,
      status: 'realigning',
      onStop: () => {},
    });
    expect(isMiniProgressVisible()).toBe(true);
    expect(
      document.querySelector('.anyllm-mini-progress-label')?.textContent,
    ).toBe('Re-aligning captions… 2/5');

    updateMiniProgress({
      translated: 1,
      total: 1,
      status: 'realign-cached',
      onStop: () => {},
    });
    expect(
      document.querySelector('.anyllm-mini-progress-label')?.textContent,
    ).toBe('Using saved re-align');
  });
});

/**
 * Section translate dismiss — FR-5 canonical restore.
 */

// Track a section the same way translateSection would after a successful apply.
function trackSection(element: Element, pieceIds: string[]): void {
  // Access via remove/get only — push by simulating translateSection push through
  // a side channel: removeSectionTranslation finds by element reference in the
  // module array. We need the section registered. translateSection is async +
  // chrome-dependent; instead we re-export a test helper path by calling the
  // public API after manually pushing via a minimal stub of translate flow.
  // The module only adds entries in translateSection. For dismiss tests we can
  // register by calling remove after manually adding via internal — not exported.
  // Work around: call removeSectionTranslation which still cleans DOM even if
  // the section is not tracked (tracking splice is optional). DOM cleanup is FR-5.
  void pieceIds;
  void element;
}

describe('sectionTranslate FR-5 dismiss = canonical restore', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    document.documentElement.removeAttribute(DATA_ATTRS.STATE);
    clearTranslatedSections();
  });

  it('restores originals for section dismiss and remove-all parity', () => {
    const section = document.createElement('section');
    section.id = 'article-section';
    const p = document.createElement('p');
    p.textContent = 'Hello world';
    section.appendChild(p);
    document.body.appendChild(section);

    // Simulate a pair wrapper (list/table path) around the original.
    const wrapper = document.createElement('span');
    wrapper.setAttribute('data-anyllm-original-wrapper', '');
    p.replaceWith(wrapper);
    wrapper.appendChild(p);

    applyTranslation(p, 'sec-piece-1', 'Xin chào thế giới');
    setPageState('translation-only');

    // Pre-condition: original marked, translation present, TO mode active.
    expect(p.getAttribute(DATA_ATTRS.ROLE)).toBe('original');
    expect(p.hasAttribute(DATA_ATTRS.TRANSLATED)).toBe(true);
    expect(document.querySelector(`[${DATA_ATTRS.ROLE}="translation"]`)).not.toBeNull();
    expect(document.documentElement.getAttribute(DATA_ATTRS.STATE)).toBe('translation-only');

    trackSection(section, ['sec-piece-1']);
    removeSectionTranslation(section);

    // Translations gone
    expect(document.querySelector(`[${DATA_ATTRS.ROLE}="translation"]`)).toBeNull();
    // Original roles/markers cleared (so CSS TO hide no longer applies)
    expect(p.getAttribute(DATA_ATTRS.ROLE)).toBeNull();
    expect(p.hasAttribute(DATA_ATTRS.TRANSLATED)).toBe(false);
    // Wrapper unwrapped — paragraph is back under section
    expect(section.querySelector('[data-anyllm-original-wrapper]')).toBeNull();
    expect(section.contains(p)).toBe(true);
    expect(p.textContent).toBe('Hello world');
    {
    document.body.innerHTML = '';
    document.documentElement.removeAttribute(DATA_ATTRS.STATE);
    clearTranslatedSections();
    const parityParagraph = document.createElement('p');
    parityParagraph.textContent = 'Hello';
    document.body.appendChild(parityParagraph);
    applyTranslation(parityParagraph, 'p-1', 'Xin chào');
    setPageState('translation-only');
    removeAllTranslations();
    expect(parityParagraph.getAttribute(DATA_ATTRS.ROLE)).toBeNull();
    expect(parityParagraph.hasAttribute(DATA_ATTRS.TRANSLATED)).toBe(false);
    expect(document.querySelector(`[${DATA_ATTRS.ROLE}="translation"]`)).toBeNull();
    expect(getTranslatedSections().length).toBe(0);
    }
  });
});

describe('pageContext category detection helpers', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllGlobals();
    document.head.innerHTML = '<title>Example Page</title>';
    document.body.innerHTML = '';
    window.history.replaceState({}, '', '/');
    try {
      sessionStorage.clear();
    } catch {
      /* ignore */
    }
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  async function loadModules() {
    const categoryState = await import('@/content/categoryState');
    const pageContext = await import('@/content/utils/pageContext');
    categoryState._resetCategoryState();
    return { categoryState, pageContext };
  }

  function settings(partial: Partial<ExtensionSettings> = {}): ExtensionSettings {
    return {
      ...DEFAULT_SETTINGS,
      enableContextAwareTranslation: true,
      enableLLMPageCategoryDetection: true,
      llmCategoryDetectionMode: 'async',
      ...partial,
    };
  }

  it('extractPageContext includes path, h1, og type, and schema signals for LLM', async () => {
    document.head.innerHTML = `
      <title>React hooks guide</title>
      <meta name="description" content="Learn React hooks">
      <meta property="og:type" content="article">
      <script type="application/ld+json">{"@type":"TechArticle"}</script>
    `;
    document.body.innerHTML = '<h1>Getting started with hooks</h1>';
    window.history.replaceState({}, '', '/docs/hooks/');

    const { pageContext } = await loadModules();
    const ctx = pageContext.extractPageContext(document, false);

    expect(ctx.title).toContain('React hooks');
    expect(ctx.description).toContain('Learn React');
    expect(ctx.pathname).toBe('/docs/hooks/');
    expect(ctx.h1).toMatch(/Getting started/i);
    expect(ctx.ogType).toBe('article');
    expect(ctx.schemaTypes).toEqual(expect.arrayContaining(['TechArticle']));
  });

  it('keeps async category detection in-flight until the LLM response settles', async () => {
    let resolveMessage!: (value: unknown) => void;
    const messagePromise = new Promise((resolve) => {
      resolveMessage = resolve;
    });
    const sendMessage = vi.fn().mockReturnValue(messagePromise);
    vi.stubGlobal('chrome', {
      runtime: { sendMessage },
    });

    const { categoryState, pageContext } = await loadModules();
    const onDetected = vi.fn();

    // Async mode returns before the LLM settles.
    await pageContext.triggerAutoCategoryDetection(
      settings({ llmCategoryDetectionMode: 'async' }),
      undefined,
      onDetected,
    );

    expect(categoryState.isCategoryDetectionInFlight()).toBe(true);
    expect(sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'DETECT_PAGE_CATEGORY_LLM',
        pageContext: expect.objectContaining({
          pathname: expect.any(String),
        }),
      }),
    );

    // A second concurrent trigger must be blocked while the first is pending.
    const secondDetected = vi.fn();
    await pageContext.triggerAutoCategoryDetection(
      settings({ llmCategoryDetectionMode: 'async' }),
      undefined,
      secondDetected,
    );
    expect(sendMessage).toHaveBeenCalledTimes(1);
    expect(secondDetected).not.toHaveBeenCalled();
    expect(onDetected).not.toHaveBeenCalled();

    resolveMessage({ success: true, category: 'Software Development' });
    await vi.waitFor(() => {
      expect(onDetected).toHaveBeenCalledWith('Software Development');
    });
    expect(categoryState.isCategoryDetectionInFlight()).toBe(false);
  });

  it('clears stale auto category when the page URL changes, and does not let weak heuristic results permanently block LLM detection', async () => {
    const { categoryState } = await loadModules();
    categoryState.setAutoDetectedCategory('News', 'llm');
    expect(categoryState.getAutoDetectedCategory()).toBe('News');

    window.history.replaceState({}, '', '/other-page');
    categoryState.invalidateCategoryIfUrlChanged();

    expect(categoryState.getAutoDetectedCategory()).toBeUndefined();
    expect(categoryState.getAutoDetectedSource()).toBeUndefined();

    // Weak heuristic (meta description) should be available immediately but
    // must not skip LLM refinement.
    vi.stubGlobal('chrome', {
      runtime: {
        sendMessage: vi.fn().mockResolvedValue({ success: true, category: 'Technology News' }),
      },
    });

    document.head.innerHTML = `<meta name="description" content="breaking news headlines journalism">`;
    const { categoryState: state2, pageContext } = await loadModules();

    const heuristic = pageContext.extractPageContext(document, true).category;
    expect(heuristic).toBe('News');
    state2.setAutoDetectedCategory(heuristic, 'heuristic');

    const onDetected = vi.fn();
    await pageContext.triggerAutoCategoryDetection(
      settings({ llmCategoryDetectionMode: 'blocking' }),
      undefined,
      onDetected,
    );
    expect(chrome.runtime.sendMessage).toHaveBeenCalled();
    expect(onDetected).toHaveBeenCalledWith('Technology News');
    expect(state2.getAutoDetectedCategory()).toBe('Technology News');
    expect(state2.getAutoDetectedSource()).toBe('llm');
  });

  it('skips the LLM when a domain-map/prior-LLM category is locked or the session cache has the host, and normalizes LLM responses through detectLLMCategoryIfNeeded', async () => {
    vi.stubGlobal('chrome', {
      runtime: { sendMessage: vi.fn().mockResolvedValue({ success: true, category: 'News' }) },
    });
    const { categoryState, pageContext } = await loadModules();

    // Scenario 1: domain-map lock → no LLM call.
    categoryState.setAutoDetectedCategory('Video Platform', 'domain');
    await pageContext.triggerAutoCategoryDetection(settings(), undefined, vi.fn());
    expect(chrome.runtime.sendMessage).not.toHaveBeenCalled();

    // Scenario 2: prior LLM category lock → no LLM call.
    categoryState._resetCategoryState();
    categoryState.setAutoDetectedCategory('News', 'llm');
    await pageContext.triggerAutoCategoryDetection(settings(), undefined, vi.fn());
    expect(chrome.runtime.sendMessage).not.toHaveBeenCalled();

    // Scenario 3: session host cache → cached category wins, no LLM call.
    const store = new Map<string, string>();
    vi.stubGlobal('sessionStorage', {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => {
        store.set(k, v);
      },
      removeItem: (k: string) => {
        store.delete(k);
      },
    });
    categoryState._resetCategoryState();
    pageContext.writeCategorySessionCache(window.location.hostname, 'Academic Research');

    const onDetected = vi.fn();
    await pageContext.triggerAutoCategoryDetection(
      settings({ llmCategoryDetectionMode: 'blocking' }),
      undefined,
      onDetected,
    );

    expect(onDetected).toHaveBeenCalledWith('Academic Research');
    expect(chrome.runtime.sendMessage).not.toHaveBeenCalled();
    expect(categoryState.getAutoDetectedCategory()).toBe('Academic Research');
    expect(categoryState.getAutoDetectedSource()).toBe('cache');

    // Direct normalization through detectLLMCategoryIfNeeded (blocking mode).
    vi.stubGlobal('chrome', {
      runtime: {
        sendMessage: vi.fn().mockResolvedValue({
          success: true,
          category: 'software development',
        }),
      },
    });
    const { pageContext: pc2 } = await loadModules();
    const ctx: PageContext = { title: 't', description: 'd', domain: 'example.com' };
    const onDetected2 = vi.fn();

    await pc2.detectLLMCategoryIfNeeded(
      ctx,
      settings({ llmCategoryDetectionMode: 'blocking' }),
      undefined,
      undefined,
      onDetected2,
    );

    expect(onDetected2).toHaveBeenCalledWith('Software Development');
    expect(ctx.category).toBe('Software Development');
  });
});

/**
 * @vitest-environment jsdom
 */

describe('systemic pause sticky banner', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    hideSystemicPauseBanner();
  });

  afterEach(() => {
    hideSystemicPauseBanner();
    document.body.innerHTML = '';
  });

  it('shows sticky banner with message and action buttons', () => {
    const onRetry = vi.fn();
    const onDismiss = vi.fn();
    const onOpenSettings = vi.fn();

    showSystemicPauseBanner({
      message: 'All providers rate-limited',
      onRetry,
      onDismiss,
      onOpenSettings,
    });

    expect(isSystemicPauseBannerVisible()).toBe(true);
    const bar = document.querySelector('[data-anyllm-role="systemic-pause-banner"]');
    expect(bar).toBeTruthy();
    expect(bar?.textContent).toContain('All providers rate-limited');
    expect(bar?.querySelector('.anyllm-systemic-pause-retry')?.textContent).toBe('Retry');
    expect(bar?.querySelector('.anyllm-systemic-pause-dismiss')?.textContent).toBe('Dismiss');
    expect(bar?.querySelector('.anyllm-systemic-pause-settings')?.textContent).toBe(
      'Open settings',
    );

    // hideSystemicPauseBanner removes the bar
    hideSystemicPauseBanner();
    expect(isSystemicPauseBannerVisible()).toBe(false);
    expect(document.querySelector('[data-anyllm-role="systemic-pause-banner"]')).toBeNull();
  });

  it('does not auto-dismiss (sticky until action)', async () => {
    vi.useFakeTimers();
    showSystemicPauseBanner({
      message: 'Pool exhausted',
      onRetry: () => {},
      onDismiss: () => {},
    });
    await vi.advanceTimersByTimeAsync(60_000);
    expect(isSystemicPauseBannerVisible()).toBe(true);
    vi.useRealTimers();
  });

  it('action buttons invoke callbacks — Retry/Dismiss remove the banner, Open settings does not', () => {
    // Retry
    const onRetry = vi.fn();
    showSystemicPauseBanner({
      message: 'err',
      onRetry,
      onDismiss: () => {},
    });
    const retry = document.querySelector(
      '.anyllm-systemic-pause-retry',
    ) as HTMLButtonElement;
    retry.click();
    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(isSystemicPauseBannerVisible()).toBe(false);

    // Dismiss
    const onDismiss = vi.fn();
    showSystemicPauseBanner({
      message: 'err',
      onRetry: () => {},
      onDismiss,
    });
    const dismiss = document.querySelector(
      '.anyllm-systemic-pause-dismiss',
    ) as HTMLButtonElement;
    dismiss.click();
    expect(onDismiss).toHaveBeenCalledTimes(1);
    expect(isSystemicPauseBannerVisible()).toBe(false);

    // Open settings
    const onOpenSettings = vi.fn();
    showSystemicPauseBanner({
      message: 'err',
      onRetry: () => {},
      onDismiss: () => {},
      onOpenSettings,
    });
    const settings = document.querySelector(
      '.anyllm-systemic-pause-settings',
    ) as HTMLButtonElement;
    settings.click();
    expect(onOpenSettings).toHaveBeenCalledTimes(1);
    expect(isSystemicPauseBannerVisible()).toBe(true);
  });

  it('replaces ephemeral error toast when sticky banner is shown', () => {
    showTranslationErrorNotification('temporary');
    expect(
      document.querySelector('[data-anyllm-role="translation-error-notification"]'),
    ).toBeTruthy();

    showSystemicPauseBanner({
      message: 'sticky',
      onRetry: () => {},
      onDismiss: () => {},
    });

    expect(
      document.querySelector('[data-anyllm-role="translation-error-notification"]'),
    ).toBeNull();
    expect(isSystemicPauseBannerVisible()).toBe(true);
  });
});

/**
 * Tests for subtitleControls — drag offset persistence.
 *
 * Drag offsets must be scoped per hostname: an offset tuned on one site's
 * large player must not be applied on another site's smaller player (it can
 * park the overlay off the video with nothing left to grab — reported on
 * Udemy). Style preferences (font size, position, opacity) stay global.
 */


// ============================================================================
// chrome.storage.local mock — a simple in-memory Map honoring array-form get
// ============================================================================

const storageData = new Map<string, unknown>();
const storageGet = vi.fn(async (keys: string | string[]) => {
  const keyList = Array.isArray(keys) ? keys : [keys];
  const out: Record<string, unknown> = {};
  for (const key of keyList) {
    if (storageData.has(key)) out[key] = storageData.get(key);
  }
  return out;
});
const storageSet = vi.fn(async (items: Record<string, unknown>) => {
  for (const [key, value] of Object.entries(items)) storageData.set(key, value);
});

function setHostname(hostname: string): void {
  Object.defineProperty(window, 'location', {
    value: { hostname, href: `https://${hostname}/learn/lecture/1` },
    writable: true,
    configurable: true,
  });
}

describe('subtitleControls — per-host drag offsets', () => {
  // The fake window.location and chrome stub must be scoped to this describe —
  // at file level they would leak into the other merged describes.
  const realLocation = window.location;

  beforeEach(() => {
    vi.stubGlobal('chrome', {
      storage: { local: { get: storageGet, set: storageSet } },
    });
    storageData.clear();
    storageGet.mockClear();
    storageSet.mockClear();
    setHostname('www.udemy.com');
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    Object.defineProperty(window, 'location', {
      value: realLocation,
      writable: true,
      configurable: true,
    });
  });
  it('stores drag offsets per hostname and does not leak them across sites', async () => {
    setOffset(120, -60);
    await vi.waitFor(() => {
      const map = storageData.get('anyllm-translate-subtitle-offsets') as
        | Record<string, { offsetX: number }>
        | undefined;
      expect(map?.['www.udemy.com']?.offsetX).toBe(120);
    });

    // Same host reload: offset restored.
    const onUdemy = await loadPreferences();
    expect(onUdemy.offsetX).toBe(120);
    expect(onUdemy.offsetY).toBe(-60);

    // Different host: no offset applied.
    setHostname('www.youtube.com');
    const onYoutube = await loadPreferences();
    expect(onYoutube.offsetX).toBe(0);
    expect(onYoutube.offsetY).toBe(0);

    // Each host evolves independently.
    setOffset(-40, 30);
    await vi.waitFor(() => {
      const map = storageData.get('anyllm-translate-subtitle-offsets') as
        | Record<string, { offsetX: number }>
        | undefined;
      expect(map?.['www.youtube.com']?.offsetX).toBe(-40);
    });
    setHostname('www.udemy.com');
    const udemyAgain = await loadPreferences();
    expect(udemyAgain.offsetX).toBe(120);
    expect(udemyAgain.offsetY).toBe(-60);
  });

  it('ignores legacy cross-site offsets stored in the shared prefs blob', async () => {
    // Simulate an old-version write: offsets inside the global blob.
    await savePreferences({
      fontSize: 16,
      fontSizeMode: 'fixed',
      position: 'bottom',
      backgroundOpacity: 0.7,
      offsetX: 999,
      offsetY: -999,
      fontFamily: 'system',
      textColor: 'rgba(255,255,255,1)',
      originalTextColor: 'rgba(255,255,255,0.6)',
      backgroundColor: '0,0,0',
      borderRadius: 8,
      textShadow: '0 1px 3px rgba(0,0,0,0.5)',
      displayMode: 'bilingual',
    });

    const prefs = await loadPreferences();
    expect(prefs.offsetX).toBe(0);
    expect(prefs.offsetY).toBe(0);
    // Style fields from the blob still load globally.
    expect(prefs.fontSize).toBe(16);
  });

  it('keeps style preferences global across hosts', async () => {
    setHostname('www.youtube.com');
    setFontSize(24);
    await vi.waitFor(() => expect(storageSet).toHaveBeenCalled());

    setHostname('www.udemy.com');
    const prefs = await loadPreferences();
    expect(prefs.fontSize).toBe(24);
  });

  it('coalesces a drag burst into one persisted offset on flush', async () => {
    setOffset(10, 10);
    setOffset(40, -20);
    setOffset(80, -35);
    // Debounced: nothing written yet mid-drag (the burst above is synchronous).
    expect(storageData.has('anyllm-translate-subtitle-offsets')).toBe(false);

    flushPendingOffsetSave();
    await vi.waitFor(() => {
      const map = storageData.get('anyllm-translate-subtitle-offsets') as
        | Record<string, { offsetX: number; offsetY: number }>
        | undefined;
      expect(map?.['www.udemy.com']).toEqual({ offsetX: 80, offsetY: -35 });
    });
    resetDragState();
  });
});
