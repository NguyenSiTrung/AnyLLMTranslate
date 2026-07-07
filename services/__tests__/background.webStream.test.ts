/**
 * Tests for the FR-6 web-page streaming translation port handler.
 *
 * Verifies the port listener:
 *  - streams piece deltas as they arrive
 *  - emits a terminal 'done' with the full result set
 *  - writes fresh translations to the success cache
 *  - posts an 'error' when the service lacks translateStream
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Module-level mocks (hoisted) ─────────────────────────────────────────────
vi.mock('@/services/cacheManager', () => ({
  getCachedTranslation: vi.fn().mockResolvedValue(null),
  cacheTranslation: vi.fn().mockResolvedValue(undefined),
  getCachedFailure: vi.fn().mockResolvedValue(null),
  cacheFailure: vi.fn().mockResolvedValue(undefined),
  evictCache: vi.fn(),
  clearCache: vi.fn(),
  flushLruUpdates: vi.fn(),
}));

vi.mock('@/services/statsCollector', () => ({
  incrementStats: vi.fn().mockResolvedValue(undefined),
  recordDailyStats: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/services/subtitleNameScanner', () => ({
  preScanNames: vi.fn().mockResolvedValue({}),
}));
vi.mock('@/services/filmGlossaryStore', () => ({
  loadFilmGlossary: vi.fn().mockResolvedValue(undefined),
  saveFilmGlossary: vi.fn().mockResolvedValue(undefined),
  FILM_GLOSSARY_STORAGE_KEY: 'anyllm-film-glossary',
}));

// ── Shared chrome mock with a controllable onConnect registry ────────────────
interface Port {
  name: string;
  onMessage: { addListener: (cb: (msg: unknown) => void) => void };
  onDisconnect: { addListener: (cb: () => void) => void };
  postMessage: ReturnType<typeof vi.fn>;
  disconnect: ReturnType<typeof vi.fn>;
  // captured for the test to drive
  _msgCb?: (msg: unknown) => void;
}

let connectListeners: Array<(port: Port) => void> = [];

const mockStorage: Record<string, unknown> = {};

function makePort(name: string): Port {
  const port: Port = {
    name,
    onMessage: {
      addListener: (cb) => {
        port._msgCb = cb;
      },
    },
    onDisconnect: { addListener: () => {} },
    postMessage: vi.fn(),
    disconnect: vi.fn(),
  };
  return port;
}

vi.stubGlobal('chrome', {
  storage: {
    local: {
      get: vi.fn(async (key: string) => ({ [key]: mockStorage[key] })),
      set: vi.fn(async (items: Record<string, unknown>) => {
        Object.assign(mockStorage, items);
      }),
    },
    onChanged: { addListener: vi.fn(), removeListener: vi.fn() },
  },
  runtime: {
    onConnect: {
      addListener: vi.fn((cb: (port: Port) => void) => {
        connectListeners.push(cb);
      }),
    },
    onMessage: { addListener: vi.fn() },
    sendMessage: vi.fn().mockResolvedValue(undefined),
  },
  tabs: { sendMessage: vi.fn().mockResolvedValue(undefined), onRemoved: { addListener: vi.fn() } },
  alarms: {
    create: vi.fn(),
    get: vi.fn(),
    clear: vi.fn(),
    onAlarm: { addListener: vi.fn(), removeListener: vi.fn() },
  },
});

describe('FR-6: initWebStreamPortListener', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    connectListeners = [];
    delete mockStorage['anyllm-translate-settings'];
    await new Promise((r) => setTimeout(r, 5));
    vi.resetModules();
  });

  it('streams piece deltas and emits done with the full result set', async () => {
    // Inject a service factory that streams two pieces then resolves.
    vi.doMock('@/services/providerPool', () => ({
      ProviderPoolCoordinator: vi.fn().mockImplementation(() => ({
        translateStream: vi.fn(async (_req: unknown, onPiece: (id: string, text: string) => void) => {
          onPiece('p1', 'Xin chào');
          onPiece('p2', 'Thế giới');
          return { success: true, translations: new Map([['p1', 'Xin chào'], ['p2', 'Thế giới']]) };
        }),
        translate: vi.fn(),
        rebuild: vi.fn(),
      })),
      PoolExhaustedError: class extends Error {},
    }));

    const { initWebStreamPortListener } = await import('../background');
    initWebStreamPortListener();

    const port = makePort('TRANSLATE_WEB_STREAM');
    for (const cb of connectListeners) cb(port);
    expect(port._msgCb).toBeDefined();

    port._msgCb!({
      type: 'request',
      pieces: [
        { id: 'p1', text: 'Hello' },
        { id: 'p2', text: 'World' },
      ],
      sourceLanguage: 'en',
      targetLanguage: 'vi',
    });

    // Allow the async handler to run.
    await new Promise((r) => setTimeout(r, 20));

    const posts = port.postMessage.mock.calls.map((c) => c[0]);
    // Two piece deltas + one done.
    const piecePosts = posts.filter((m) => m.type === 'piece');
    expect(piecePosts).toHaveLength(2);
    const donePost = posts.find((m) => m.type === 'done');
    expect(donePost).toBeDefined();
    expect(donePost.results.map((r: { id: string }) => r.id).sort()).toEqual(['p1', 'p2']);
  });

  it('posts an error when the service does not support translateStream', async () => {
    vi.doMock('@/services/providerPool', () => ({
      ProviderPoolCoordinator: vi.fn().mockImplementation(() => ({
        // No translateStream method.
        translate: vi.fn(),
        rebuild: vi.fn(),
      })),
      PoolExhaustedError: class extends Error {},
    }));

    const { initWebStreamPortListener } = await import('../background');
    initWebStreamPortListener();

    const port = makePort('TRANSLATE_WEB_STREAM');
    for (const cb of connectListeners) cb(port);

    port._msgCb!({
      type: 'request',
      pieces: [{ id: 'p1', text: 'Hello' }],
      sourceLanguage: 'en',
      targetLanguage: 'vi',
    });

    await new Promise((r) => setTimeout(r, 20));

    const posts = port.postMessage.mock.calls.map((c) => c[0]);
    const errPost = posts.find((m) => m.type === 'error');
    expect(errPost).toBeDefined();
    expect(errPost.error).toContain('Streaming not supported');
  });

  it('ignores ports with a different name (does not register a message listener)', async () => {
    const { initWebStreamPortListener } = await import('../background');
    initWebStreamPortListener();

    const otherPort = makePort('TRANSLATE_PDF_STREAM');
    for (const cb of connectListeners) cb(otherPort);
    // A different-named port should not have its message listener wired.
    expect(otherPort._msgCb).toBeUndefined();
  });
});
