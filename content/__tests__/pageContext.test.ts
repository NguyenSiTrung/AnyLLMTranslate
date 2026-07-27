import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { DEFAULT_SETTINGS, type ExtensionSettings, type PageContext } from '@/types/config';

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

  it('clears stale auto category when the page URL changes', async () => {
    const { categoryState } = await loadModules();
    categoryState.setAutoDetectedCategory('News', 'llm');
    expect(categoryState.getAutoDetectedCategory()).toBe('News');

    window.history.replaceState({}, '', '/other-page');
    categoryState.invalidateCategoryIfUrlChanged();

    expect(categoryState.getAutoDetectedCategory()).toBeUndefined();
    expect(categoryState.getAutoDetectedSource()).toBeUndefined();
  });

  it('does not let weak heuristic results permanently block LLM detection', async () => {
    vi.stubGlobal('chrome', {
      runtime: {
        sendMessage: vi.fn().mockResolvedValue({ success: true, category: 'Technology News' }),
      },
    });

    document.head.innerHTML = `<meta name="description" content="breaking news headlines journalism">`;
    const { categoryState, pageContext } = await loadModules();

    // Weak heuristic (meta description) should be available immediately...
    const heuristic = pageContext.extractPageContext(document, true).category;
    expect(heuristic).toBe('News');
    categoryState.setAutoDetectedCategory(heuristic, 'heuristic');

    // ...but must not skip LLM refinement.
    const onDetected = vi.fn();
    await pageContext.triggerAutoCategoryDetection(
      settings({ llmCategoryDetectionMode: 'blocking' }),
      undefined,
      onDetected,
    );
    expect(chrome.runtime.sendMessage).toHaveBeenCalled();
    expect(onDetected).toHaveBeenCalledWith('Technology News');
    expect(categoryState.getAutoDetectedCategory()).toBe('Technology News');
    expect(categoryState.getAutoDetectedSource()).toBe('llm');
  });

  it('skips LLM when domain-map or prior LLM category is already locked', async () => {
    vi.stubGlobal('chrome', {
      runtime: { sendMessage: vi.fn().mockResolvedValue({ success: true, category: 'News' }) },
    });
    const { categoryState, pageContext } = await loadModules();

    categoryState.setAutoDetectedCategory('Video Platform', 'domain');
    await pageContext.triggerAutoCategoryDetection(settings(), undefined, vi.fn());
    expect(chrome.runtime.sendMessage).not.toHaveBeenCalled();

    categoryState._resetCategoryState();
    categoryState.setAutoDetectedCategory('News', 'llm');
    await pageContext.triggerAutoCategoryDetection(settings(), undefined, vi.fn());
    expect(chrome.runtime.sendMessage).not.toHaveBeenCalled();
  });

  it('uses session host cache before calling the LLM', async () => {
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
    vi.stubGlobal('chrome', {
      runtime: { sendMessage: vi.fn().mockResolvedValue({ success: true, category: 'Gaming' }) },
    });

    const { categoryState, pageContext } = await loadModules();
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
  });

  it('normalizes LLM responses through detectLLMCategoryIfNeeded', async () => {
    vi.stubGlobal('chrome', {
      runtime: {
        sendMessage: vi.fn().mockResolvedValue({
          success: true,
          category: 'software development',
        }),
      },
    });
    const { pageContext } = await loadModules();
    const ctx: PageContext = { title: 't', description: 'd', domain: 'example.com' };
    const onDetected = vi.fn();

    await pageContext.detectLLMCategoryIfNeeded(
      ctx,
      settings({ llmCategoryDetectionMode: 'blocking' }),
      undefined,
      undefined,
      onDetected,
    );

    expect(onDetected).toHaveBeenCalledWith('Software Development');
    expect(ctx.category).toBe('Software Development');
  });
});
