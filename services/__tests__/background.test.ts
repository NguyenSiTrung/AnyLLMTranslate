import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleMessage, tabStates, getTabState, updateTabState } from '../background';

// Mock chrome APIs
const mockStorage: Record<string, unknown> = {};
vi.stubGlobal('chrome', {
  storage: {
    local: {
      get: vi.fn(async (key: string) => {
        return { [key]: mockStorage[key] };
      }),
      set: vi.fn(async (items: Record<string, unknown>) => {
        Object.assign(mockStorage, items);
      }),
    },
    onChanged: {
      addListener: vi.fn(),
      removeListener: vi.fn(),
    },
  },
  runtime: {
    sendMessage: vi.fn(),
  },
  tabs: {
    onRemoved: {
      addListener: vi.fn(),
    },
  },
});

// Mock fetch for translation service
function mockFetch(content: string) {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    statusText: 'OK',
    json: () => Promise.resolve({
      id: 'test',
      choices: [{ message: { role: 'assistant', content }, finish_reason: 'stop' }],
    }),
    text: () => Promise.resolve(''),
  }));
}

describe('services/background', () => {
  beforeEach(() => {
    tabStates.clear();
  });

  describe('getTabState', () => {
    it('returns default state for unknown tab', () => {
      const state = getTabState(1);
      expect(state.status).toBe('idle');
      expect(state.translatedCount).toBe(0);
      expect(state.totalCount).toBe(0);
    });

    it('returns existing state for known tab', () => {
      updateTabState(1, { status: 'translating', totalCount: 5 });
      const state = getTabState(1);
      expect(state.status).toBe('translating');
      expect(state.totalCount).toBe(5);
    });
  });

  describe('handleMessage — getStatus', () => {
    it('returns idle status for new tab', async () => {
      const result = await handleMessage(
        { action: 'getStatus', tabId: 1 },
        { tab: { id: 1 } } as chrome.runtime.MessageSender,
      );

      expect(result).toEqual({
        status: 'idle',
        translatedCount: 0,
        totalCount: 0,
        error: undefined,
      });
    });

    it('returns current status for active tab', async () => {
      updateTabState(2, { status: 'done', translatedCount: 10, totalCount: 10 });

      const result = await handleMessage(
        { action: 'getStatus', tabId: 2 },
        { tab: { id: 2 } } as chrome.runtime.MessageSender,
      );

      expect(result).toEqual({
        status: 'done',
        translatedCount: 10,
        totalCount: 10,
        error: undefined,
      });
    });
  });

  describe('handleMessage — restore', () => {
    it('resets tab state to idle', async () => {
      updateTabState(1, { status: 'done', translatedCount: 5, totalCount: 5 });

      const result = await handleMessage(
        { action: 'restore', tabId: 1 },
        { tab: { id: 1 } } as chrome.runtime.MessageSender,
      );

      expect(result).toEqual({ success: true });

      const state = getTabState(1);
      expect(state.status).toBe('idle');
      expect(state.translatedCount).toBe(0);
    });
  });

  describe('handleMessage — translate', () => {
    it('translates pieces and updates state', async () => {
      mockFetch(JSON.stringify({ translations: { p1: 'Xin chào' } }));

      const result = await handleMessage(
        {
          action: 'translate',
          pieces: [{ id: 'p1', text: 'Hello' }],
          sourceLanguage: 'en',
          targetLanguage: 'vi',
        },
        { tab: { id: 1 } } as chrome.runtime.MessageSender,
      );

      expect(result).toEqual({
        success: true,
        results: [{ id: 'p1', translatedText: 'Xin chào' }],
      });
    });

    it('returns error on translation failure', async () => {
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network error')));

      const result = await handleMessage(
        {
          action: 'translate',
          pieces: [{ id: 'p1', text: 'Hello' }],
          sourceLanguage: 'en',
          targetLanguage: 'vi',
        },
        { tab: { id: 1 } } as chrome.runtime.MessageSender,
      );

      const typedResult = result as { success: boolean; error: string };
      expect(typedResult.success).toBe(false);
      expect(typedResult.error).toBeDefined();
    });
  });

  describe('handleMessage — unknown action', () => {
    it('returns undefined for unknown actions', () => {
      const result = handleMessage(
        { action: 'unknownAction' } as unknown as Parameters<typeof handleMessage>[0],
        {} as chrome.runtime.MessageSender,
      );
      expect(result).toBeUndefined();
    });
  });
});
