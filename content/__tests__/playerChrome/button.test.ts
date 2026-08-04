/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { createChromeButton } from '@/content/playerChrome/button';
import { PLAYER_CHROME_BUTTON_CLASS } from '@/content/playerChrome/types';

describe('createChromeButton', () => {
  it('renders an SVG icon with a11y attributes and default off state, setState updates data-state, and click invokes onToggle', () => {
    const onToggle = vi.fn();
    const { button, setState } = createChromeButton(onToggle);
    expect(button.className).toBe(PLAYER_CHROME_BUTTON_CLASS);
    expect(button.getAttribute('aria-label')).toBe('Subtitle translation settings');
    expect(button.getAttribute('aria-expanded')).toBe('false');
    expect(button.title).toBe('AnyLLMTranslate subtitles');
    expect(button.dataset.state).toBe('off');
    expect(button.querySelector('svg')).toBeTruthy();

    setState('enabled');
    expect(button.dataset.state).toBe('enabled');
    setState('translating');
    expect(button.dataset.state).toBe('translating');
    setState('off');
    expect(button.dataset.state).toBe('off');

    button.click();
    expect(onToggle).toHaveBeenCalledTimes(1);
  });
});
