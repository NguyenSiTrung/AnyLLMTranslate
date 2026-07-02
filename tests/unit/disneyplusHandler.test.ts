import { describe, it, expect, afterEach } from 'vitest';
import {
  DisneyPlusHandler,
  extractDisneyPlusTracksFromValue,
} from '@/inject/subtitleHandlers/disneyplus';

describe('DisneyPlusHandler', () => {
  const handler = new DisneyPlusHandler();
  const originalHostname = window.location.hostname;
  const originalPathname = window.location.pathname;

  afterEach(() => {
    Object.defineProperty(window, 'location', {
      value: { hostname: originalHostname, pathname: originalPathname },
      writable: true,
    });
  });

  const setLocation = (hostname: string, pathname: string = '/') => {
    Object.defineProperty(window, 'location', {
      value: { hostname, pathname },
      writable: true,
    });
  };

  it('has platform identifier', () => {
    expect(handler.platform).toBe('disneyplus');
  });

  describe('detect', () => {
    it('returns true for www.disneyplus.com', () => {
      setLocation('www.disneyplus.com');
      expect(handler.detect()).toBe(true);
    });
  });

  describe('getPatterns', () => {
    it('matches .vtt subtitle URLs', () => {
      const patterns = handler.getPatterns();
      expect(patterns[0].pattern.test('https://cdn.disneyplus.com/sub/en/file.vtt')).toBe(true);
    });
  });

  describe('extractDisneyPlusTracksFromValue', () => {
    it('parses asset.captions', () => {
      const tracks = extractDisneyPlusTracksFromValue({
        asset: {
          id: 'entity-1',
          captions: [
            { language: 'en', label: 'English', url: 'https://cdn.example/en.vtt' },
            { lang: 'es', name: 'Spanish', href: 'https://cdn.example/es.vtt' },
          ],
        },
      });
      expect(tracks).toHaveLength(2);
      expect(tracks[0].videoId).toBe('entity-1');
      expect(tracks[1].language).toBe('es');
    });
  });
});
