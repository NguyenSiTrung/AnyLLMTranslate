import { describe, it, expect, beforeEach, vi } from 'vitest';
import { WetvHandler } from '@/inject/subtitleHandlers/wetv';

describe('WetvHandler', () => {
  let handler: WetvHandler;

  beforeEach(() => {
    handler = new WetvHandler();
  });

  it('has platform wetv', () => {
    expect(handler.platform).toBe('wetv');
  });

  describe('detect', () => {
    it.each([
      ['www.iflix.com'],
      ['wetv.vip'],
      ['play.wetv.vip'],
    ])('detects %s', (host) => {
      vi.stubGlobal('location', { hostname: host, pathname: '/play/123' });
      expect(handler.detect()).toBe(true);
    });

    it.each([['www.youtube.com'], ['wetv.evil.com']])('rejects %s', (host) => {
      vi.stubGlobal('location', { hostname: host, pathname: '/x' });
      expect(handler.detect()).toBe(false);
    });
  });

  describe('getPatterns', () => {
    it('matches .vtt URLs (Immersive iflix rule)', () => {
      const patterns = handler.getPatterns();
      expect(patterns[0].pattern.test('https://cdn.example/sub_en.vtt')).toBe(true);
      expect(patterns[0].pattern.test('https://cdn.example/manifest.m3u8')).toBe(false);
    });
  });

  describe('transformResponse', () => {
    it('parses WebVTT', () => {
      const vtt = `WEBVTT

00:00:01.000 --> 00:00:02.000
Hi`;
      const cues = handler.transformResponse(vtt, 'text/vtt', 'https://x/a.vtt');
      expect(cues).toHaveLength(1);
      expect(cues[0].text).toBe('Hi');
    });
  });

  describe('getNativeCaptionHide', () => {
    it('hides .text-track per Immersive attachRule', () => {
      expect(handler.getNativeCaptionHide?.()).toEqual({
        selector: '.text-track',
        method: 'display',
      });
    });
  });
});