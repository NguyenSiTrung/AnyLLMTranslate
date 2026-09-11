// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { HboMaxHandler } from '@/inject/subtitleHandlers/hbomax';

describe('HboMaxHandler.getDomCueSource', () => {
  const originalLocation = window.location;

  beforeEach(() => {
    Object.defineProperty(window, 'location', {
      value: {
        hostname: 'www.max.com',
        pathname: '/video/watch/abc-123',
        href: 'https://www.max.com/video/watch/abc-123',
      },
      writable: true,
      configurable: true,
    });
    document.body.innerHTML = '';
  });

  afterEach(() => {
    Object.defineProperty(window, 'location', {
      value: originalLocation,
      writable: true,
      configurable: true,
    });
    document.body.innerHTML = '';
  });

  it('hides native captions with visibility (never display) so Max keeps rendering cues', () => {
    const source = new HboMaxHandler().getDomCueSource();

    // MAX-28 / spec decision 1: the cue source lives inside the caption window,
    // so display:none risks stopping cue production entirely.
    expect(source.captionHideMethod).toBe('visibility');
    expect(source.cueSelector).toBe('[data-testid="cueBoxRowTextCue"]');
    expect(source.captionWindowSelector).toBe('[data-testid="caption_renderer_overlay"]');
  });

  it('declares the cue root as the observed ancestor and the aria-checked track button for switches', () => {
    const source = new HboMaxHandler().getDomCueSource();

    expect(source.observeRootSelector).toBe('[data-testid="caption_renderer_overlay"]');
    expect(source.trackSwitchSelector).toBe('[data-testid="player-ux-text-track-button"]');
    expect(source.trackSwitchAttribute).toBe('aria-checked');
  });

  it('reads the active language from the checked track button', () => {
    const button = document.createElement('button');
    button.setAttribute('data-testid', 'player-ux-text-track-button');
    button.setAttribute('aria-checked', 'true');
    button.setAttribute('aria-label', 'English');
    document.body.appendChild(button);

    const source = new HboMaxHandler().getDomCueSource();
    expect(source.readActiveLanguage()).toBe('en');
  });

  it('extracts the video id from the watch URL', () => {
    const source = new HboMaxHandler().getDomCueSource();
    expect(source.videoIdExtractor?.()).toBe('abc-123');
  });
});

describe('HboMaxHandler detection, patterns and track extraction', () => {
  const originalLocation = window.location;

  function setLocation(hostname: string, pathname = '/video/watch/abc-123'): void {
    Object.defineProperty(window, 'location', {
      value: { hostname, pathname, href: `https://${hostname}${pathname}` },
      writable: true,
      configurable: true,
    });
  }

  beforeEach(() => {
    setLocation('www.max.com');
    document.body.innerHTML = '';
  });

  afterEach(() => {
    Object.defineProperty(window, 'location', {
      value: originalLocation,
      writable: true,
      configurable: true,
    });
    document.body.innerHTML = '';
  });

  it('detects every Max-owned host shape and rejects look-alike hosts', () => {
    const handler = new HboMaxHandler();

    for (const host of [
      'max.com',
      'www.max.com',
      'play.max.com',
      'play.hbomax.com',
      'www.hbomax.com',
      'eu.hbomax.com',
    ]) {
      setLocation(host);
      expect(handler.detect(), host).toBe(true);
    }

    for (const host of [
      'notmax.com',
      'max.com.evil.example',
      'hbomax.com.evil.example',
      'www.example.com',
    ]) {
      setLocation(host);
      expect(handler.detect(), host).toBe(false);
    }
  });

  it('treats only /video/watch/ paths as watch pages', () => {
    const handler = new HboMaxHandler();

    setLocation('www.max.com', '/video/watch/abc-123');
    expect(handler.isWatchPage()).toBe(true);

    setLocation('www.max.com', '/browse');
    expect(handler.isWatchPage()).toBe(false);
    setLocation('www.max.com', '/');
    expect(handler.isWatchPage()).toBe(false);
  });

  it('exposes the .vtt pattern with a track-id language extractor and the manifest patterns', () => {
    const handler = new HboMaxHandler();

    const [vttPattern] = handler.getPatterns();
    expect(vttPattern.pattern.test('https://cf.asia.prd.media.max.com/a/t/t3/8.vtt')).toBe(true);
    expect(vttPattern.pattern.test('https://cf.asia.prd.media.max.com/a/t/t3/8.vtt?x=1')).toBe(true);
    expect(vttPattern.pattern.test('https://cf.asia.prd.media.max.com/a/t/t3/8.mpd')).toBe(false);

    document.body.innerHTML = '<button data-testid="player-ux-text-track-button" aria-checked="true" aria-label="Deutsch"></button>';
    const extracted = vttPattern.languageExtractor?.(
      new URL('https://cf.asia.prd.media.max.com/a/t/t3/8.vtt'),
    );
    // The checked track button wins over the opaque CDN track id.
    expect(extracted).toBe('de');

    document.body.innerHTML = '';
    const fromPath = vttPattern.languageExtractor?.(
      new URL('https://cf.asia.prd.media.max.com/a/t/t3/8.vtt'),
    );
    expect(fromPath).toBe('t3');

    const manifestPatterns = handler.getManifestPatterns();
    expect(
      manifestPatterns.some((p) => p.pattern.test('https://beam.prd.api.hbomax.com/x/master.m3u8')),
    ).toBe(true);
    expect(manifestPatterns.some((p) => p.pattern.test('https://cdn.example.com/a/1.mpd'))).toBe(true);
    expect(
      manifestPatterns.some((p) =>
        p.pattern.test('https://akm.asia.prd.media.max.com/fadb6e8d?manifest-params=TOKEN'),
      ),
    ).toBe(true);
  });

  it('extracts DOM tracks with localized labels and skips the Off entry', () => {
    setLocation('www.max.com', '/video/watch/abc-123');
    document.body.innerHTML = `
      <button data-testid="player-ux-text-track-button" aria-checked="true" aria-label="English"></button>
      <button data-testid="player-ux-text-track-button" aria-checked="false" aria-label="Español (Latinoamérica)"></button>
      <button data-testid="player-ux-text-track-button" aria-checked="false" aria-label="Off"></button>
      <button data-testid="player-ux-text-track-button" aria-checked="false"></button>
    `;

    const tracks = new HboMaxHandler().extractAvailableTracks('', 'application/json', '');

    // "Español (Latinoamérica)" is the Latin American track: the label map
    // records the region (es-419) rather than a bare `es`.
    expect(tracks.map((track) => track.language)).toEqual(['en', 'es-419']);
    expect(tracks.map((track) => track.label)).toEqual(['English', 'Español (Latinoamérica)']);
    expect(tracks.every((track) => track.platform === 'hbomax')).toBe(true);
    expect(tracks.every((track) => track.videoId === 'abc-123')).toBe(true);
    expect(tracks.every((track) => track.url === undefined)).toBe(true);
  });

  it('returns no tracks when the player has not rendered the caption menu', () => {
    document.body.innerHTML = '<div></div>';
    expect(new HboMaxHandler().extractAvailableTracks('', '', '')).toEqual([]);
  });
});
