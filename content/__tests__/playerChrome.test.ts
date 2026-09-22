/**
 * @vitest-environment jsdom
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createChromeButton } from '@/content/playerChrome/button';
import { PLAYER_CHROME_BUTTON_CLASS, PLAYER_CHROME_PANEL_CLASS, PLAYER_CHROME_HOST_CLASS } from '@/content/playerChrome/types';
import { isPlausibleControlBar } from '@/content/playerChrome/host';
import { udemyPlayerChromeAdapter } from '@/content/playerChrome/adapters/udemy';
import { courseraPlayerChromeAdapter } from '@/content/playerChrome/adapters/coursera';
import { deepLearningAiPlayerChromeAdapter } from '@/content/playerChrome/adapters/deepLearningAi';
import { buildMiniStudioView, setStatusPill, updatePreview, fillSelect, fillStyleSelect, PREVIEW_FONT_SCALE } from '@/content/playerChrome/miniStudioView';
import { createFloatingShell, createNativeShell } from '@/content/playerChrome/mountFloating';
import { __setPlayerChromeAdaptersForTest } from '@/content/playerChrome/adapters/registry';
import { createVisibilityState, reduceVisibility, PLAYER_CHROME_IDLE_HIDE_MS } from '@/content/playerChrome/visibility';
import { buildToggle, buildSegmented, buildSlider, buildSelect } from '@/content/playerChrome/widgets';
import { youtubePlayerChromeAdapter } from '@/content/playerChrome/adapters/youtube';

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

/**
 * @vitest-environment jsdom
 */

function mockRect(el: HTMLElement, r: Record<string, number>): void {
  Object.defineProperty(el, 'getBoundingClientRect', {
    configurable: true,
    value: () => ({
      top: r.top,
      left: r.left ?? 0,
      bottom: r.bottom,
      right: r.right ?? 0,
      width: r.width,
      height: r.height,
      x: r.left ?? 0,
      y: r.top,
      toJSON: () => ({}),
    }),
  });
}

describe('isPlausibleControlBar', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('accepts a bottom-band node and rejects player-spanning, top-anchored, disconnected, and zero-size nodes; trusts selectors while video geometry is unknown', () => {
    // facet: accepts a node in the video bottom band and rejects player-spanning or top-anchored nodes
    {
      const video = document.createElement('video');
      mockRect(video, { top: 100, bottom: 460, right: 740, width: 640, height: 360 });
      document.body.appendChild(video);

      const bar = document.createElement('div');
      mockRect(bar, { top: 400, bottom: 460, right: 740, width: 640, height: 60 });
      document.body.appendChild(bar);
      expect(isPlausibleControlBar(bar, video)).toBe(true);

      // Player root spans the whole video — must NOT be treated as a control bar.
      const playerRoot = document.createElement('div');
      mockRect(playerRoot, { top: 100, bottom: 460, right: 740, width: 640, height: 360 });
      document.body.appendChild(playerRoot);
      expect(isPlausibleControlBar(playerRoot, video)).toBe(false);

      // A top-anchored lookalike (top bar) must not qualify either.
      const topBar = document.createElement('div');
      mockRect(topBar, { top: 100, bottom: 160, right: 740, width: 640, height: 60 });
      document.body.appendChild(topBar);
      expect(isPlausibleControlBar(topBar, video)).toBe(false);
    }

    // facet: rejects disconnected and zero-size nodes, and trusts selectors while video geometry is unknown
    {
      const video = document.createElement('video');
      mockRect(video, { top: 100, bottom: 460, right: 740, width: 640, height: 360 });
      document.body.appendChild(video);

      const detached = document.createElement('div');
      mockRect(detached, { top: 400, bottom: 460, right: 740, width: 640, height: 60 });
      expect(isPlausibleControlBar(detached, video)).toBe(false);

      const hidden = document.createElement('div');
      mockRect(hidden, { top: 400, bottom: 460, right: 740, width: 0, height: 0 });
      document.body.appendChild(hidden);
      expect(isPlausibleControlBar(hidden, video)).toBe(false);

      // Player not laid out yet — can't judge geometry, keep the selector's verdict.
      const unknownVideo = document.createElement('video');
      mockRect(unknownVideo, { top: 0, bottom: 0, right: 0, width: 0, height: 0 });
      const bar = document.createElement('div');
      mockRect(bar, { top: 400, bottom: 460, right: 740, width: 640, height: 60 });
      document.body.appendChild(bar);
      expect(isPlausibleControlBar(bar, unknownVideo)).toBe(true);
    }
  });
});

/**
 * @vitest-environment jsdom
 */

describe('learning site adapters', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('deeplearning.ai, udemy, and coursera match and mount when fixtures present, and return null mount when controls are missing (floating fallback)', () => {
    // facet: deeplearning.ai matches and mounts onto the VDS control bar, null mount when missing (floating fallback)
    {
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
    }

    // facet: udemy and coursera match and mount when fixtures present, and return null mount when controls are missing (floating fallback)
    {
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
    }
  });
});

/**
 * @vitest-environment jsdom
 */

describe('mini studio view', () => {
  it('builds the panel and applies status, preview, and select mutations', () => {
    const v = buildMiniStudioView();
    expect(v.panel.className).toBe(PLAYER_CHROME_PANEL_CLASS);
    expect(v.panel.hidden).toBe(true);
    expect(v.panel.getAttribute('role')).toBe('dialog');
    expect(v.panel.querySelector('.panel-header h2')?.textContent).toBe('Subtitles');
    expect(v.closeBtn.dataset.action).toBe('close');
    expect(v.closeBtn.getAttribute('aria-label')).toBe('Close');
    expect(v.optionsBtn.dataset.action).toBe('open-options');
    expect(v.enable.input.dataset.action).toBe('enable');
    expect(v.fontSize.input.dataset.action).toBe('fontSize');
    expect(v.opacity.input.dataset.action).toBe('opacity');
    expect(v.displayMode.inputs[0].dataset.action).toBe('displayMode');
    expect(v.styleSelect.select.dataset.action).toBe('stylePreset');
    fillStyleSelect(v.styleSelect.select, 'classic', false);
    expect(v.styleSelect.select.options).toHaveLength(5);
    expect(v.styleSelect.select.value).toBe('classic');
    expect(v.styleSelect.select.options[1].textContent).toBe('Netflix');
    fillStyleSelect(v.styleSelect.select, 'classic', true);
    expect(v.styleSelect.select.options).toHaveLength(6);
    expect(v.styleSelect.select.value).toBe('custom');
    expect(v.position.inputs[0].dataset.action).toBe('position');
    expect(v.knobSelects).toHaveLength(4);
    expect(v.knobSelects.map((s) => s.dataset.knob)).toEqual([
      'faithfulness',
      'brevity',
      'register',
      'profanity',
    ]);
    expect(v.glossary.dataset.action).toBe('glossary');
    expect(v.style.textContent).toContain('backdrop-filter');

    const labels = v.knobSelects.map(
      (s) => v.panel.querySelector(`label[for="${s.id}"]`)?.textContent,
    );
    expect(labels).toEqual(['Faithfulness', 'Brevity', 'Register', 'Profanity']);
    expect(v.knobSelects[0].options[0].textContent).toBe('Auto');
    expect(v.knobSelects[0].options[1].textContent).toBe('Literal');

    const titles = [...v.panel.querySelectorAll('.section-title')].map((el) => el.textContent);
    expect(titles).toEqual(['Appearance', 'Translation style', 'Glossary']);
    {
    const v = buildMiniStudioView();
    setStatusPill(v.statusPill, v.statusLabel, 'translating');
    expect(v.statusPill.dataset.status).toBe('translating');
    expect(v.statusLabel.textContent).toBe('Translating');
    setStatusPill(v.statusPill, v.statusLabel, 'disabled');
    expect(v.statusPill.dataset.status).toBe('disabled');
    expect(v.statusLabel.textContent).toBe('Off');
    setStatusPill(v.statusPill, v.statusLabel, 'waiting');
    expect(v.statusLabel.textContent).toBe('Waiting for captions');
    updatePreview(v.preview, {
      fontSize: 20,
      backgroundOpacity: 0.5,
      position: 'top',
      displayMode: 'translation-only',
      style: {
        textColor: 'rgba(255,255,255,1)',
        originalTextColor: 'rgba(255,255,255,0.6)',
        backgroundColor: '0,0,0',
        backgroundOpacity: 0.5,
        borderRadius: 8,
        textShadow: 'none',
      },
    });
    expect(v.preview.cue.style.fontSize).toBe(`${Math.round(20 * PREVIEW_FONT_SCALE)}px`);
    expect(v.preview.cue.style.getPropertyValue('--preview-bg')).toBe('0.5');
    expect(v.preview.cue.style.getPropertyValue('--preview-bg-color')).toBe('0,0,0');
    expect(v.preview.cue.style.borderRadius).toBe('8px');
    expect(v.preview.cue.style.textShadow).toBe('none');
    expect(v.preview.original.style.color).toBe('rgba(255, 255, 255, 0.6)');
    expect(v.preview.translated.style.color).toBe('rgb(255, 255, 255)');
    expect(v.preview.root.dataset.position).toBe('top');
    expect(v.preview.root.dataset.display).toBe('translation-only');
    fillSelect(v.glossary, ['auto', 'literal'], 'literal');
    expect(v.glossary.options).toHaveLength(2);
    expect(v.glossary.options[0].textContent).toBe('Auto');
    expect(v.glossary.value).toBe('literal');
    fillSelect(v.glossary, ['auto', 'literal'], 'missing');
    expect(v.glossary.value).toBe('auto');
    }
  });
});

/**
 * @vitest-environment jsdom
 */

describe('player chrome mounts', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    __setPlayerChromeAdaptersForTest([]);
  });
  afterEach(() => {
    document.body.innerHTML = '';
    __setPlayerChromeAdaptersForTest([]);
  });

  it('mounts floating host with shadow button and toggles visibility; prefers native mount when the adapter provides a node', () => {
    const root = document.createElement('div');
    document.body.appendChild(root);
    const video = document.createElement('video');
    Object.defineProperty(video, 'getBoundingClientRect', {
      value: () => ({
        top: 100,
        left: 100,
        bottom: 460,
        right: 740,
        width: 640,
        height: 360,
        x: 100,
        y: 100,
        toJSON: () => ({}),
      }),
    });
    root.appendChild(video);
    const onToggle = vi.fn();
    const shell = createFloatingShell({ playerRoot: root, video, onToggle });
    expect(document.querySelector(`.${PLAYER_CHROME_HOST_CLASS}`)).toBeTruthy();
    // The chrome host is extension-owned — its shadow root must never be
    // registered for translation/extraction (data-anyllm-owned marker).
    expect(shell.host.hasAttribute('data-anyllm-owned')).toBe(true);
    const btn = shell.shadow.querySelector(`.${PLAYER_CHROME_BUTTON_CLASS}`) as HTMLButtonElement;
    expect(btn).toBeTruthy();
    btn.click();
    expect(onToggle).toHaveBeenCalledTimes(1);
    shell.setVisible(false);
    expect(
      shell.host.style.opacity === '0' ||
        shell.host.hidden ||
        shell.host.style.visibility === 'hidden',
    ).toBe(true);
    shell.setVisible(true);
    shell.destroy();
    expect(document.querySelector(`.${PLAYER_CHROME_HOST_CLASS}`)).toBeNull();

    // Native mount: adapter-provided node hosts the chrome.
    const bar = document.createElement('div');
    bar.id = 'right-controls';
    document.body.appendChild(bar);
    const onToggle2 = vi.fn();
    const native = createNativeShell({ mountNode: bar, onToggle: onToggle2 });
    expect(bar.querySelector(`.${PLAYER_CHROME_HOST_CLASS}`)).toBeTruthy();
    expect(native.host.hasAttribute('data-anyllm-owned')).toBe(true);
    expect(native.getMountMode()).toBe('native');
    native.button.click();
    expect(onToggle2).toHaveBeenCalledTimes(1);
    native.destroy();
    expect(bar.querySelector(`.${PLAYER_CHROME_HOST_CLASS}`)).toBeNull();
  });

  it('anchors bottom-right inside the video above the control band, tracks scroll, and never strands at the viewport origin', async () => {
    const root = document.createElement('div');
    document.body.appendChild(root);
    const video = document.createElement('video');
    const mockRect = (r: Record<string, number>): void => {
      Object.defineProperty(video, 'getBoundingClientRect', {
        configurable: true,
        value: () => ({
          top: r.top,
          left: 100,
          bottom: r.bottom,
          right: r.right,
          width: r.width,
          height: r.height,
          x: 100,
          y: r.top,
          toJSON: () => ({}),
        }),
      });
    };
    mockRect({ top: 100, bottom: 460, right: 740, width: 640, height: 360 });
    root.appendChild(video);
    const shell = createFloatingShell({ playerRoot: root, video, onToggle: vi.fn() });

    // Bottom-right INSIDE the video: bottom edge 56px above the video bottom
    // (clear of the native control band), 12px from the right edge.
    expect(shell.host.style.bottom).toBe(`${window.innerHeight - 460 + 56}px`);
    expect(shell.host.style.right).toBe(`${window.innerWidth - 740 + 12}px`);

    // Scroll tracking keeps the fixed host glued to the video.
    mockRect({ top: 60, bottom: 420, right: 740, width: 640, height: 360 });
    window.dispatchEvent(new Event('scroll'));
    await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()));
    expect(shell.host.style.bottom).toBe(`${window.innerHeight - 420 + 56}px`);

    // Invalid geometry (player mounting/hidden): off-screen, never top:0;left:0.
    mockRect({ top: 0, bottom: 0, right: 0, width: 0, height: 0 });
    shell.reposition();
    expect(shell.host.style.top).toBe('-10000px');
    expect(shell.host.style.left).toBe('-10000px');
    expect(shell.host.style.bottom).toBe('auto');
    expect(shell.host.style.right).toBe('auto');

    shell.destroy();
  });
});

/**
 * @vitest-environment jsdom
 */

describe('reduceVisibility', () => {
  it('handles activity, adapter visibility, panel forcing/closing, and teardown', () => {
    let s = createVisibilityState(0);
    expect(s.visual).toBe('hidden');
    expect(s.destroyed).toBe(false);

    s = reduceVisibility(s, { type: 'activity', nowMs: 1000 });
    expect(s.visual).toBe('shown');
    expect(s.lastActivityMs).toBe(1000);

    s = reduceVisibility(s, {
      type: 'idleTick',
      nowMs: 1000 + PLAYER_CHROME_IDLE_HIDE_MS - 1,
    });
    expect(s.visual).toBe('shown');

    s = reduceVisibility(s, {
      type: 'idleTick',
      nowMs: 1000 + PLAYER_CHROME_IDLE_HIDE_MS,
    });
    expect(s.visual).toBe('hidden');

    s = createVisibilityState(0);
    s = reduceVisibility(s, { type: 'adapterVisible', visible: true, nowMs: 50 });
    expect(s.visual).toBe('shown');
    s = reduceVisibility(s, { type: 'adapterVisible', visible: false, nowMs: 60 });
    expect(s.visual).toBe('hidden');

    s = createVisibilityState(0);
    s = reduceVisibility(s, { type: 'activity', nowMs: 10 });
    s = reduceVisibility(s, { type: 'panelOpened' });
    expect(s.visual).toBe('shownForced');
    s = reduceVisibility(s, {
      type: 'idleTick',
      nowMs: 10 + PLAYER_CHROME_IDLE_HIDE_MS * 5,
    });
    expect(s.visual).toBe('shownForced');
    s = reduceVisibility(s, { type: 'adapterVisible', visible: false, nowMs: 9999 });
    expect(s.visual).toBe('shownForced');

    // Panel close with pointer over the player returns to shown; without the
    // pointer it hides.
    s = createVisibilityState(0);
    s = reduceVisibility(s, { type: 'panelOpened' });
    s = reduceVisibility(s, {
      type: 'panelClosed',
      pointerOverPlayer: true,
      nowMs: 5000,
    });
    expect(s.visual).toBe('shown');
    expect(s.lastActivityMs).toBe(5000);

    s = createVisibilityState(0);
    s = reduceVisibility(s, { type: 'panelOpened' });
    s = reduceVisibility(s, {
      type: 'panelClosed',
      pointerOverPlayer: false,
      nowMs: 5000,
    });
    expect(s.visual).toBe('hidden');

    s = createVisibilityState(0);
    s = reduceVisibility(s, { type: 'activity', nowMs: 1 });
    s = reduceVisibility(s, { type: 'teardown' });
    expect(s.destroyed).toBe(true);
    s = reduceVisibility(s, { type: 'activity', nowMs: 2 });
    expect(s.destroyed).toBe(true);
    expect(s.visual).toBe('hidden');
  });
});

/**
 * @vitest-environment jsdom
 */

describe('buildToggle / buildSegmented', () => {
  it('creates a checkbox with data-action inside a toggle root, and radio options with matching/fallback selection', () => {
    // facet: creates a checkbox with data-action inside a toggle root
    {
      const w = buildToggle({ id: 't1', action: 'enable' });
      expect(w.root.className).toBe('toggle');
      expect(w.input.type).toBe('checkbox');
      expect(w.input.id).toBe('t1');
      expect(w.input.dataset.action).toBe('enable');
      expect(w.root.contains(w.input)).toBe(true);
      expect(w.root.querySelector('.track')).toBeTruthy();
      expect(w.root.querySelector('.thumb')).toBeTruthy();
    }

    // facet: creates radio options and preserves matching and fallback selection
    {
      const opts = [
        { value: 'bilingual', label: 'Bilingual' },
        { value: 'translation-only', label: 'Translation only' },
      ];
      const w = buildSegmented({ name: 'display', action: 'displayMode', options: opts });
      expect(w.root.getAttribute('role')).toBe('radiogroup');
      expect(w.inputs).toHaveLength(2);
      expect(w.inputs[0].type).toBe('radio');
      expect(w.inputs[0].name).toBe('display');
      expect(w.inputs[0].dataset.action).toBe('displayMode');
      expect(w.root.textContent).toContain('Bilingual');
      expect(w.root.textContent).toContain('Translation only');
      w.setValue('translation-only');
      expect(w.inputs[1].checked).toBe(true);
      expect(w.value()).toBe('translation-only');
      w.setValue('nope');
      expect(w.inputs[0].checked).toBe(true);
      expect(w.value()).toBe('bilingual');
    }
  });
});

describe('buildSlider / buildSelect', () => {
  it('creates a range input with synced fill updates, and wraps a select with optional knob metadata', () => {
    // facet: creates a range input and keeps programmatic and event fill updates in sync
    {
      const w = buildSlider({ id: 's1', action: 'fontSize', min: 12, max: 36, step: 1 });
      expect(w.input.type).toBe('range');
      expect(w.input.min).toBe('12');
      expect(w.input.max).toBe('36');
      expect(w.input.step).toBe('1');
      expect(w.input.dataset.action).toBe('fontSize');
      expect(w.input.className).toBe('glass-range');
      w.setValue(24);
      expect(w.input.value).toBe('24');
      expect(w.input.style.getPropertyValue('--fill')).toBe('50%');
      const opacity = buildSlider({ id: 's2', action: 'opacity', min: 0, max: 100, step: 5 });
      opacity.input.value = '25';
      opacity.input.dispatchEvent(new Event('input', { bubbles: true }));
      expect(opacity.input.style.getPropertyValue('--fill')).toBe('25%');
    }

    // facet: wraps a select and preserves optional knob metadata
    {
      const w = buildSelect({ id: 'g1', action: 'glossary' });
      expect(w.root.className).toBe('select-wrap');
      expect(w.select.id).toBe('g1');
      expect(w.select.dataset.action).toBe('glossary');
      expect(w.root.contains(w.select)).toBe(true);
      const knob = buildSelect({ id: 'k1', action: 'knob', knob: 'brevity' });
      expect(knob.select.dataset.knob).toBe('brevity');
    }
  });
});

/**
 * @vitest-environment jsdom
 */

describe('youtubePlayerChromeAdapter', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('matches youtube hosts, finds the right-controls mount, and detects autohide', () => {
    expect(youtubePlayerChromeAdapter.match('www.youtube.com')).toBe(true);
    expect(youtubePlayerChromeAdapter.match('example.com')).toBe(false);

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

    document.body.innerHTML = `<div class="html5-video-player ytp-autohide"></div>`;
    expect(youtubePlayerChromeAdapter.isControlsVisible?.(document)).toBe(false);
  });
});
