/**
 * Tests for pageContext extraction utility.
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import type { PageContext } from '@/types/config';
import { extractPageContext, resolveCategory, detectLLMCategoryIfNeeded, triggerAutoCategoryDetection, DOMAIN_CATEGORY_MAP } from '../pageContext';

vi.mock('@/content/categoryState', () => ({
  getAutoDetectedCategory: vi.fn(() => undefined),
  setAutoDetectedCategory: vi.fn(),
  setCategoryDetectionInFlight: vi.fn(),
  isCategoryDetectionInFlight: vi.fn(() => false),
  buildCategoryInfo: vi.fn(() => ({ autoDetected: undefined, siteRule: undefined, override: undefined, effective: undefined })),
  broadcastCategoryInfo: vi.fn(),
  _resetCategoryState: vi.fn(),
}));
import { getAutoDetectedCategory, setCategoryDetectionInFlight, isCategoryDetectionInFlight } from '@/content/categoryState';

describe('extractPageContext', () => {
  beforeEach(() => {
    document.title = '';
    document.head.innerHTML = '';
  });

  it('extracts title and truncates to 100 chars', () => {
    document.title = 'A'.repeat(150);
    const ctx = extractPageContext(document);
    expect(ctx.title).toHaveLength(100);
    expect(ctx.title.endsWith('…')).toBe(true);
  });

  it('extracts meta description and truncates to 200 chars', () => {
    const meta = document.createElement('meta');
    meta.setAttribute('name', 'description');
    meta.setAttribute('content', 'B'.repeat(250));
    document.head.appendChild(meta);

    const ctx = extractPageContext(document);
    expect(ctx.description).toHaveLength(200);
    expect(ctx.description.endsWith('…')).toBe(true);
  });

  it('returns empty description when meta is missing', () => {
    const ctx = extractPageContext(document);
    expect(ctx.description).toBe('');
  });

  it('returns domain from window.location.hostname', () => {
    const ctx = extractPageContext(document);
    expect(typeof ctx.domain).toBe('string');
  });

  it('does not include category when detection is disabled', () => {
    document.title = 'Test';
    const ctx = extractPageContext(document, false);
    expect(ctx.category).toBeUndefined();
  });

  it('detects category for known domains when enabled', () => {
    // Mock window.location.hostname by overriding the property in the function
    // Since we can't change window.location easily, we test the fallback logic
    document.title = 'Test';
    const meta = document.createElement('meta');
    meta.setAttribute('name', 'keywords');
    meta.setAttribute('content', 'programming, software, code');
    document.head.appendChild(meta);

    const ctx = extractPageContext(document, true);
    expect(ctx.category).toBe('Software Development');
  });

  it('detects education category from keywords', () => {
    document.title = 'Test';
    const meta = document.createElement('meta');
    meta.setAttribute('name', 'keywords');
    meta.setAttribute('content', 'education, learning, course');
    document.head.appendChild(meta);

    const ctx = extractPageContext(document, true);
    expect(ctx.category).toBe('Online Education');
  });

  it('detects news category from h1 text', () => {
    document.title = 'Test';
    const h1 = document.createElement('h1');
    h1.textContent = 'Breaking News: Something Happened';
    document.body.appendChild(h1);

    const ctx = extractPageContext(document, true);
    expect(ctx.category).toBe('News');

    document.body.innerHTML = '';
  });

  it('detects academic research from h1 text', () => {
    document.title = 'Test';
    const h1 = document.createElement('h1');
    h1.textContent = 'A New Study on Climate Change';
    document.body.appendChild(h1);

    const ctx = extractPageContext(document, true);
    expect(ctx.category).toBe('Academic Research');

    document.body.innerHTML = '';
  });

  it('returns undefined category for unknown domains without clues', () => {
    document.title = 'Test';
    const ctx = extractPageContext(document, true);
    expect(ctx.category).toBeUndefined();
  });

  it('leaves description empty when meta content is empty', () => {
    const meta = document.createElement('meta');
    meta.setAttribute('name', 'description');
    meta.setAttribute('content', '');
    document.head.appendChild(meta);

    const ctx = extractPageContext(document);
    expect(ctx.description).toBe('');
  });
});

describe('resolveCategory', () => {
  it('returns tabOverride when all three are provided', () => {
    expect(resolveCategory('auto', 'site', 'tab')).toBe('tab');
  });

  it('returns siteRuleCategory when no tabOverride', () => {
    expect(resolveCategory('auto', 'site', undefined)).toBe('site');
  });

  it('returns autoDetected when no tabOverride or siteRule', () => {
    expect(resolveCategory('auto', undefined, undefined)).toBe('auto');
  });

  it('returns undefined when all are undefined', () => {
    expect(resolveCategory(undefined, undefined, undefined)).toBeUndefined();
  });

  it('prefers tabOverride over siteRule even when autoDetected is set', () => {
    expect(resolveCategory('auto', 'site', 'override')).toBe('override');
  });

  it('prefers siteRule over autoDetected', () => {
    expect(resolveCategory('auto', 'site')).toBe('site');
  });
});

describe('detectLLMCategoryIfNeeded', () => {
  const baseSettings = {
    enableLLMPageCategoryDetection: true,
    llmCategoryDetectionMode: 'blocking',
  } as const;

  function makePageContext(): PageContext {
    return { title: 'Test', description: '', domain: 'example.com' };
  }

  beforeEach(() => {
    vi.stubGlobal('chrome', {
      runtime: { sendMessage: vi.fn().mockResolvedValue({ success: true, category: 'News' }) },
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns early when LLM detection is disabled', async () => {
    const onDetected = vi.fn();
    const settings = { ...baseSettings, enableLLMPageCategoryDetection: false };
    await detectLLMCategoryIfNeeded(makePageContext(), settings as never, undefined, undefined, onDetected);
    expect(onDetected).not.toHaveBeenCalled();
  });

  it('returns early when a manual override is set', async () => {
    const onDetected = vi.fn();
    await detectLLMCategoryIfNeeded(makePageContext(), baseSettings as never, 'Gaming', undefined, onDetected);
    expect(onDetected).not.toHaveBeenCalled();
  });

  it('returns early when existingAutoDetected is already set', async () => {
    const onDetected = vi.fn();
    await detectLLMCategoryIfNeeded(makePageContext(), baseSettings as never, undefined, 'News', onDetected);
    expect(onDetected).not.toHaveBeenCalled();
  });

  it('calls onDetected with the LLM category in blocking mode', async () => {
    const onDetected = vi.fn();
    const ctx = makePageContext();
    await detectLLMCategoryIfNeeded(ctx, baseSettings as never, undefined, undefined, onDetected);
    expect(onDetected).toHaveBeenCalledWith('News');
    expect(ctx.category).toBe('News');
  });

  it('does NOT call onDetected when category is Other', async () => {
    vi.stubGlobal('chrome', {
      runtime: { sendMessage: vi.fn().mockResolvedValue({ success: true, category: 'Other' }) },
    });
    const onDetected = vi.fn();
    await detectLLMCategoryIfNeeded(makePageContext(), baseSettings as never, undefined, undefined, onDetected);
    expect(onDetected).not.toHaveBeenCalled();
  });

  it('does NOT send setCategoryOverride', async () => {
    const sendSpy = vi.fn().mockResolvedValue({ success: true, category: 'News' });
    vi.stubGlobal('chrome', { runtime: { sendMessage: sendSpy } });
    await detectLLMCategoryIfNeeded(makePageContext(), baseSettings as never, undefined, undefined, vi.fn());
    const overrideCalls = sendSpy.mock.calls.filter((c: unknown[]) => (c[0] as { action?: string }).action === 'setCategoryOverride');
    expect(overrideCalls).toHaveLength(0);
  });

  it('calls onDetected in async mode', async () => {
    const sendSpy = vi.fn().mockResolvedValue({ success: true, category: 'Academic Research' });
    vi.stubGlobal('chrome', { runtime: { sendMessage: sendSpy } });
    const onDetected = vi.fn();
    const settings = { ...baseSettings, llmCategoryDetectionMode: 'async' } as never;
    await detectLLMCategoryIfNeeded(makePageContext(), settings, undefined, undefined, onDetected);
    // async mode resolves the promise internally; flush microtasks
    await new Promise((r) => setTimeout(r, 0));
    expect(onDetected).toHaveBeenCalledWith('Academic Research');
  });
});

describe('triggerAutoCategoryDetection', () => {
  const baseSettings = {
    enableLLMPageCategoryDetection: true,
    llmCategoryDetectionMode: 'async',
  } as const;

  beforeEach(() => {
    document.title = 'Some page';
    document.head.innerHTML = '';
    vi.stubGlobal('chrome', {
      runtime: { sendMessage: vi.fn().mockResolvedValue({ success: true, category: 'News' }) },
    });
    vi.mocked(getAutoDetectedCategory).mockReturnValue(undefined);
    vi.mocked(isCategoryDetectionInFlight).mockReturnValue(false);
    vi.mocked(setCategoryDetectionInFlight).mockClear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns early when LLM detection is disabled', async () => {
    const onDetected = vi.fn();
    const settings = { ...baseSettings, enableLLMPageCategoryDetection: false } as never;
    await triggerAutoCategoryDetection(settings, undefined, onDetected);
    expect(setCategoryDetectionInFlight).not.toHaveBeenCalledWith(true);
    expect(onDetected).not.toHaveBeenCalled();
  });

  it('returns early when a manual override is set', async () => {
    const onDetected = vi.fn();
    await triggerAutoCategoryDetection(baseSettings as never, 'Gaming', onDetected);
    expect(setCategoryDetectionInFlight).not.toHaveBeenCalledWith(true);
    expect(onDetected).not.toHaveBeenCalled();
  });

  it('returns early when an auto-detected value already exists', async () => {
    vi.mocked(getAutoDetectedCategory).mockReturnValue('News');
    const onDetected = vi.fn();
    await triggerAutoCategoryDetection(baseSettings as never, undefined, onDetected);
    expect(setCategoryDetectionInFlight).not.toHaveBeenCalledWith(true);
    expect(onDetected).not.toHaveBeenCalled();
  });

  it('returns early when a detection is already in flight', async () => {
    vi.mocked(isCategoryDetectionInFlight).mockReturnValue(true);
    const onDetected = vi.fn();
    await triggerAutoCategoryDetection(baseSettings as never, undefined, onDetected);
    expect(setCategoryDetectionInFlight).not.toHaveBeenCalledWith(true);
    expect(onDetected).not.toHaveBeenCalled();
  });

  it('sets in-flight flag, fires detection, calls onDetected, then clears flag (async mode)', async () => {
    const onDetected = vi.fn();
    await triggerAutoCategoryDetection(baseSettings as never, undefined, onDetected);
    await new Promise((r) => setTimeout(r, 0)); // flush async-mode microtasks
    expect(setCategoryDetectionInFlight).toHaveBeenCalledWith(true);
    expect(setCategoryDetectionInFlight).toHaveBeenCalledWith(false);
    expect(onDetected).toHaveBeenCalledWith('News');
  });

  it('clears the in-flight flag even when the LLM returns Other (no onDetected)', async () => {
    vi.stubGlobal('chrome', {
      runtime: { sendMessage: vi.fn().mockResolvedValue({ success: true, category: 'Other' }) },
    });
    const onDetected = vi.fn();
    await triggerAutoCategoryDetection(baseSettings as never, undefined, onDetected);
    await new Promise((r) => setTimeout(r, 0));
    expect(setCategoryDetectionInFlight).toHaveBeenCalledWith(false);
    expect(onDetected).not.toHaveBeenCalled();
  });
});

describe('DOMAIN_CATEGORY_MAP', () => {
  it('maps every streaming domain to Streaming Entertainment', () => {
    const streaming = [
      'netflix.com',
      'disneyplus.com',
      'hulu.com',
      'primevideo.com',
      'tv.apple.com',
      'peacocktv.com',
      'paramountplus.com',
      'max.com',
      'youku.com',
      'iqiyi.com',
      'v.qq.com',
      'bilibili.com',
    ];
    for (const domain of streaming) {
      expect(DOMAIN_CATEGORY_MAP[domain]).toBe('Streaming Entertainment');
    }
  });

  it('maps every learning domain to Online Education', () => {
    const learning = [
      'udemy.com',
      'coursera.org',
      'khanacademy.org',
      'edx.org',
      'pluralsight.com',
      'skillshare.com',
      'udacity.com',
      'duolingo.com',
      'lingoda.com',
    ];
    for (const domain of learning) {
      expect(DOMAIN_CATEGORY_MAP[domain]).toBe('Online Education');
    }
  });

  it('does not collide with a non-streaming apex like netflix.com being reused elsewhere', () => {
    // Sanity: the two streaming entries that already existed are still correct.
    expect(DOMAIN_CATEGORY_MAP['netflix.com']).toBe('Streaming Entertainment');
    expect(DOMAIN_CATEGORY_MAP['youtube.com']).toBe('Video Platform');
  });
});
