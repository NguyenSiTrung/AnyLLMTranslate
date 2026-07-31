/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, afterEach } from 'vitest';
import { youtubePlayerChromeAdapter } from '@/content/playerChrome/adapters/youtube';

describe('youtubePlayerChromeAdapter', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('matches youtube hosts', () => {
    expect(youtubePlayerChromeAdapter.match('www.youtube.com')).toBe(true);
    expect(youtubePlayerChromeAdapter.match('example.com')).toBe(false);
  });

  it('finds right controls mount', () => {
    document.body.innerHTML = `
      <div class="html5-video-player">
        <div class="ytp-chrome-bottom">
          <div class="ytp-right-controls"></div>
        </div>
      </div>`;
    const mount = youtubePlayerChromeAdapter.findNativeMount(document);
    expect(mount?.classList.contains('ytp-right-controls')).toBe(true);
    expect(
      youtubePlayerChromeAdapter.findPlayerRoot?.(document)?.classList.contains(
        'html5-video-player',
      ),
    ).toBe(true);
  });

  it('detects autohide', () => {
    document.body.innerHTML = `<div class="html5-video-player ytp-autohide"></div>`;
    expect(youtubePlayerChromeAdapter.isControlsVisible?.(document)).toBe(false);
  });
});
