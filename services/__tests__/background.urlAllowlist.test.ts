/**
 * Tests: subtitle URL allow-list hardening.
 *
 * Phase 4 of subtitle-reliability-hardening.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.stubGlobal('chrome', {
  storage: {
    local: { get: vi.fn(), set: vi.fn() },
    onChanged: { addListener: vi.fn(), removeListener: vi.fn() },
  },
  runtime: { sendMessage: vi.fn().mockResolvedValue(undefined) },
  tabs: { onRemoved: { addListener: vi.fn() } },
  alarms: {
    create: vi.fn(),
    get: vi.fn(),
    clear: vi.fn(),
    onAlarm: { addListener: vi.fn(), removeListener: vi.fn() },
  },
});

vi.mock('@/services/cacheManager', () => ({
  getCachedTranslation: vi.fn().mockResolvedValue(null),
  cacheTranslation: vi.fn().mockResolvedValue(undefined),
  evictCache: vi.fn().mockResolvedValue(undefined),
  clearCache: vi.fn().mockResolvedValue(undefined),
  flushLruUpdates: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('@/services/statsCollector', () => ({
  incrementStats: vi.fn().mockResolvedValue(undefined),
  recordDailyStats: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('@/services/debugLog', () => ({
  invalidateDebugCache: vi.fn(),
}));

// Mock fetch globally so allowed-URL tests don't make real network calls
const fetchMock = vi.fn().mockRejectedValue(new Error('network disabled in test'));
vi.stubGlobal('fetch', fetchMock);

import { handleMessage } from '../background';

const fakeSender = () => ({} as chrome.runtime.MessageSender);

describe('subtitle URL allow-list hardening', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fetchMock.mockRejectedValue(new Error('network disabled in test'));
  });

  it('accepts valid YouTube subtitle URL', async () => {
    const result = await handleMessage(
      { action: 'FETCH_SUBTITLE', url: 'https://www.youtube.com/api/timedtext?v=abc' },
      fakeSender(),
    );
    // fetch will fail in test but the URL check should pass
    expect(result).toBeDefined();
    expect((result as { error?: string }).error).not.toBe('URL not in subtitle allow-list');
  });

  it('accepts valid Udemy CDN URL', async () => {
    const result = await handleMessage(
      { action: 'FETCH_SUBTITLE', url: 'https://assets.udemycdn.com/subtitle.vtt' },
      fakeSender(),
    );
    expect((result as { error?: string }).error).not.toBe('URL not in subtitle allow-list');
  });

  it('rejects URL with allowed domain in path (not hostname)', async () => {
    const result = await handleMessage(
      { action: 'FETCH_SUBTITLE', url: 'https://evil.com/youtube.com/subtitles' },
      fakeSender(),
    );
    expect(result).toEqual({ success: false, error: 'URL not in subtitle allow-list' });
  });

  it('rejects URL with allowed domain in query string', async () => {
    const result = await handleMessage(
      { action: 'FETCH_SUBTITLE', url: 'https://evil.com/proxy?target=youtube.com' },
      fakeSender(),
    );
    expect(result).toEqual({ success: false, error: 'URL not in subtitle allow-list' });
  });

  it('rejects localhost URLs containing allowed domain suffix', async () => {
    const result = await handleMessage(
      { action: 'FETCH_SUBTITLE', url: 'http://localhost:8080/youtube.com/captions' },
      fakeSender(),
    );
    expect(result).toEqual({ success: false, error: 'URL not in subtitle allow-list' });
  });

  it('rejects private IP addresses', async () => {
    const result = await handleMessage(
      { action: 'FETCH_SUBTITLE', url: 'http://192.168.1.1/subtitles.vtt' },
      fakeSender(),
    );
    expect(result).toEqual({ success: false, error: 'URL not in subtitle allow-list' });
  });

  it('rejects non-HTTP protocols', async () => {
    const result = await handleMessage(
      { action: 'FETCH_SUBTITLE', url: 'file:///etc/passwd' },
      fakeSender(),
    );
    expect(result).toEqual({ success: false, error: 'URL not in subtitle allow-list' });
  });

  it('rejects data: URLs', async () => {
    const result = await handleMessage(
      { action: 'FETCH_SUBTITLE', url: 'data:text/plain,youtube.com' },
      fakeSender(),
    );
    expect(result).toEqual({ success: false, error: 'URL not in subtitle allow-list' });
  });

  it('rejects invalid URL strings', async () => {
    const result = await handleMessage(
      { action: 'FETCH_SUBTITLE', url: 'not-a-url' },
      fakeSender(),
    );
    expect(result).toEqual({ success: false, error: 'URL not in subtitle allow-list' });
  });

  it('accepts CDN subdomain of allowed domain', async () => {
    const result = await handleMessage(
      { action: 'FETCH_SUBTITLE', url: 'https://cdn.cloudfront.net/subtitles/en.vtt' },
      fakeSender(),
    );
    expect((result as { error?: string }).error).not.toBe('URL not in subtitle allow-list');
  });

  it('accepts Max APAC media CDN hostname', async () => {
    const result = await handleMessage(
      {
        action: 'FETCH_SUBTITLE',
        url: 'https://cf.asia.prd.media.max.com/segment.vtt?manifest-params=token',
      },
      fakeSender(),
    );
    expect((result as { error?: string }).error).not.toBe('URL not in subtitle allow-list');
  });

  it('passes through nested DASH manifests for Max CDN VTT segment URLs', async () => {
    const mpd = `<?xml version="1.0"?>
<MPD xmlns="urn:mpeg:dash:schema:mpd:2011"><Period/></MPD>`;
    fetchMock.mockResolvedValueOnce(
      new Response(mpd, { status: 200, headers: { 'Content-Type': 'application/dash+xml' } }),
    );

    const result = await handleMessage(
      {
        action: 'FETCH_SUBTITLE',
        url: 'https://akm.asia.prd.media.max.com/fadb6e8d/t/t6/1.vtt?manifest-params=token',
      },
      fakeSender(),
    );

    expect(result).toEqual({
      success: true,
      content: mpd,
      contentType: 'application/dash+xml',
    });
  });

  it('rejects DASH manifest bodies from FETCH_SUBTITLE for non-Max URLs', async () => {
    const mpd = `<?xml version="1.0"?>
<MPD xmlns="urn:mpeg:dash:schema:mpd:2011"><Period/></MPD>`;
    fetchMock.mockResolvedValueOnce(
      new Response(mpd, { status: 200, headers: { 'Content-Type': 'application/dash+xml' } }),
    );

    const result = await handleMessage(
      {
        action: 'FETCH_SUBTITLE',
        url: 'https://cdn.cloudfront.net/subtitles/en.vtt',
      },
      fakeSender(),
    );

    expect(result).toEqual({ success: false, error: 'response is a DASH manifest, not subtitle content' });
  });
});
