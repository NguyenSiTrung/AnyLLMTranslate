import { describe, it, expect, vi, beforeEach } from 'vitest';
import { get, set, del } from 'idb-keyval';
import { getFont, clearFontCache, type FontProgress } from '../pdfFontManager';

vi.mock('idb-keyval', () => ({
  get: vi.fn(),
  set: vi.fn(),
  del: vi.fn(),
}));

const mockedGet = vi.mocked(get);
const mockedSet = vi.mocked(set);
const mockedDel = vi.mocked(del);

function createMockReadableStream(
  data: Uint8Array,
  chunkSize = 100,
): ReadableStream<Uint8Array> {
  let offset = 0;
  return new ReadableStream({
    pull(controller) {
      if (offset >= data.length) {
        controller.close();
        return;
      }
      const chunk = data.slice(offset, offset + chunkSize);
      controller.enqueue(chunk);
      offset += chunkSize;
    },
  });
}

function mockFetchWithStream(data: Uint8Array, chunkSize = 100): void {
  const stream = createMockReadableStream(data, chunkSize);
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: true,
      headers: new Headers({ 'content-length': String(data.byteLength) }),
      body: stream,
    }),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

describe('pdfFontManager', () => {
  describe('getFont', () => {
    it('returns cached font when available in IndexedDB (no fetch call)', async () => {
      // Arrange
      const cachedFont = new Uint8Array([1, 2, 3, 4]);
      mockedGet.mockResolvedValue(cachedFont);
      const fetchMock = vi.fn();
      vi.stubGlobal('fetch', fetchMock);

      // Act
      const result = await getFont();

      // Assert
      expect(result).toBe(cachedFont);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('fetches from CDN on cache miss and stores in IndexedDB', async () => {
      // Arrange
      mockedGet.mockResolvedValue(undefined);
      const fontData = new Uint8Array(250);
      for (let i = 0; i < fontData.length; i++) fontData[i] = i % 256;
      mockFetchWithStream(fontData);

      // Act
      const result = await getFont();

      // Assert
      expect(result).toEqual(fontData);
      expect(mockedSet).toHaveBeenCalledOnce();
      expect(mockedSet).toHaveBeenCalledWith(
        'pdf-font:noto-sans:v1',
        expect.any(Uint8Array),
      );
      const storedValue = mockedSet.mock.calls[0][1] as Uint8Array;
      expect(storedValue).toEqual(fontData);
    });

    it('fetch error throws descriptive error message', async () => {
      // Arrange
      mockedGet.mockResolvedValue(undefined);
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: false,
          status: 404,
          headers: new Headers(),
        }),
      );

      // Act & Assert
      await expect(getFont()).rejects.toThrow('Font download failed: 404');
    });

    it('progress callback is invoked during fetch', async () => {
      // Arrange
      mockedGet.mockResolvedValue(undefined);
      const fontData = new Uint8Array(250);
      for (let i = 0; i < fontData.length; i++) fontData[i] = i % 256;
      mockFetchWithStream(fontData, 100);
      const progressCalls: FontProgress[] = [];
      const onProgress = (p: FontProgress) => progressCalls.push({ ...p });

      // Act
      await getFont(onProgress);

      // Assert — 250 bytes in chunks of 100 → 3 chunks (100, 100, 50)
      expect(progressCalls.length).toBe(3);
      expect(progressCalls[0]).toEqual({
        bytesLoaded: 100,
        bytesTotal: 250,
      });
      expect(progressCalls[1]).toEqual({
        bytesLoaded: 200,
        bytesTotal: 250,
      });
      expect(progressCalls[2]).toEqual({
        bytesLoaded: 250,
        bytesTotal: 250,
      });
    });

    it('handles cached ArrayBuffer by converting to Uint8Array', async () => {
      // Arrange
      const buffer = new ArrayBuffer(4);
      new Uint8Array(buffer).set([10, 20, 30, 40]);
      mockedGet.mockResolvedValue(buffer);
      const fetchMock = vi.fn();
      vi.stubGlobal('fetch', fetchMock);

      // Act
      const result = await getFont();

      // Assert
      expect(result).toBeInstanceOf(Uint8Array);
      expect(result).toEqual(new Uint8Array([10, 20, 30, 40]));
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('throws when response body has no readable stream', async () => {
      // Arrange
      mockedGet.mockResolvedValue(undefined);
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: true,
          headers: new Headers({ 'content-length': '100' }),
          body: null,
        }),
      );

      // Act & Assert
      await expect(getFont()).rejects.toThrow(
        'Font download: no readable stream',
      );
    });
  });

  describe('clearFontCache', () => {
    it('removes cached font from IndexedDB', async () => {
      // Arrange — nothing special

      // Act
      await clearFontCache();

      // Assert
      expect(mockedDel).toHaveBeenCalledOnce();
      expect(mockedDel).toHaveBeenCalledWith('pdf-font:noto-sans:v1');
    });
  });
});
