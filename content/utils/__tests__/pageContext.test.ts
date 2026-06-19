/**
 * Tests for pageContext extraction utility.
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { extractPageContext, resolveCategory, detectLLMCategoryIfNeeded } from '../pageContext';

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

  function makePageContext() {
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
