/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, afterEach } from 'vitest';
import { udemyPlayerChromeAdapter } from '@/content/playerChrome/adapters/udemy';
import { courseraPlayerChromeAdapter } from '@/content/playerChrome/adapters/coursera';
import { deepLearningAiPlayerChromeAdapter } from '@/content/playerChrome/adapters/deepLearningAi';

describe('learning site adapters', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('deeplearning.ai matches and mounts onto the VDS control bar, null mount when missing (floating fallback)', () => {
    expect(deepLearningAiPlayerChromeAdapter.match('learn.deeplearning.ai')).toBe(true);
    expect(deepLearningAiPlayerChromeAdapter.match('youtube.com')).toBe(false);

    document.body.innerHTML = `
      <div class="vds-video-layout">
        <video></video>
        <div class="vds-controls" role="group"></div>
      </div>`;
    expect(
      deepLearningAiPlayerChromeAdapter.findNativeMount?.(document)?.classList.contains('vds-controls'),
    ).toBe(true);
    expect(
      deepLearningAiPlayerChromeAdapter.findPlayerRoot?.(document)?.classList.contains('vds-video-layout'),
    ).toBe(true);

    document.body.innerHTML = '';
    expect(deepLearningAiPlayerChromeAdapter.findNativeMount?.(document)).toBeNull();
    expect(deepLearningAiPlayerChromeAdapter.findPlayerRoot?.(document)).toBeNull();
  });

  it('udemy and coursera match and mount when fixtures present, and return null mount when controls are missing (floating fallback)', () => {
    expect(udemyPlayerChromeAdapter.match('www.udemy.com')).toBe(true);
    document.body.innerHTML = `<div data-purpose="video-controls"></div>`;
    expect(udemyPlayerChromeAdapter.findNativeMount(document)?.getAttribute('data-purpose')).toBe(
      'video-controls',
    );

    expect(courseraPlayerChromeAdapter.match('www.coursera.org')).toBe(true);
    document.body.innerHTML = `<div class="rc-VideoControlsContainer"></div>`;
    expect(
      courseraPlayerChromeAdapter.findNativeMount(document)?.classList.contains(
        'rc-VideoControlsContainer',
      ),
    ).toBe(true);

    document.body.innerHTML = '';
    expect(udemyPlayerChromeAdapter.findNativeMount(document)).toBeNull();
    expect(courseraPlayerChromeAdapter.findNativeMount(document)).toBeNull();
  });
});
