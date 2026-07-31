/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, afterEach } from 'vitest';
import { udemyPlayerChromeAdapter } from '@/content/playerChrome/adapters/udemy';
import { courseraPlayerChromeAdapter } from '@/content/playerChrome/adapters/coursera';

describe('learning site adapters', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('udemy matches and mounts when fixture present', () => {
    expect(udemyPlayerChromeAdapter.match('www.udemy.com')).toBe(true);
    document.body.innerHTML = `<div data-purpose="video-controls"></div>`;
    expect(udemyPlayerChromeAdapter.findNativeMount(document)?.getAttribute('data-purpose')).toBe(
      'video-controls',
    );
  });

  it('coursera matches and mounts when fixture present', () => {
    expect(courseraPlayerChromeAdapter.match('www.coursera.org')).toBe(true);
    document.body.innerHTML = `<div class="rc-VideoControlsContainer"></div>`;
    expect(
      courseraPlayerChromeAdapter.findNativeMount(document)?.classList.contains(
        'rc-VideoControlsContainer',
      ),
    ).toBe(true);
  });

  it('returns null mount when controls missing (floating fallback)', () => {
    expect(udemyPlayerChromeAdapter.findNativeMount(document)).toBeNull();
    expect(courseraPlayerChromeAdapter.findNativeMount(document)).toBeNull();
  });
});
