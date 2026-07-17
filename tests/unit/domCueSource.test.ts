import { describe, it, expect, beforeEach } from 'vitest';
import { startDomCueSource } from '@/inject/domCueSource';
import { OPEN_CUE_END_SENTINEL } from '@/lib/subtitleTiming';
import type { SubtitleHandler } from '@/inject/subtitleHandlers/registry';
import type { DomCueSource, SubtitleCue } from '@/types/subtitle';

function makeHandler(domSource: DomCueSource): SubtitleHandler {
  return {
    platform: 'hbomax',
    detect: () => true,
    getPatterns: () => [],
    transformResponse: () => [],
    extractAvailableTracks: () => [],
    getDomCueSource: () => domSource,
  } as unknown as SubtitleHandler;
}

function makeDomSource(readActiveLanguage = () => 'en'): DomCueSource {
  return {
    cueSelector: '[data-testid="cueBoxRowTextCue"]',
    captionWindowSelector: '[data-testid="caption_renderer_overlay"]',
    observeRootSelector: '[data-testid="caption_renderer_overlay"]',
    readActiveLanguage,
    trackSwitchSelector: '[data-testid="player-ux-text-track-button"]',
    trackSwitchAttribute: 'aria-checked',
  };
}

function flushObservers(): Promise<void> {
  return new Promise((resolve) => {
    Promise.resolve()
      .then(() => Promise.resolve())
      .then(() => setTimeout(resolve, 60));
  });
}

describe('startDomCueSource (real MutationObserver in jsdom)', () => {
  let sentMessages: Array<{ type: string; payload: unknown }>;
  let bridge: { send: (type: string, payload: unknown) => string };
  let video: HTMLVideoElement;
  let captionOverlay: HTMLElement;
  let cueEl: HTMLElement;

  beforeEach(() => {
    sentMessages = [];
    bridge = { send: (type, payload) => { sentMessages.push({ type, payload }); return 'req-1'; } };

    document.body.innerHTML = '';
    video = document.createElement('video');
    document.body.appendChild(video);

    captionOverlay = document.createElement('div');
    captionOverlay.setAttribute('data-testid', 'caption_renderer_overlay');
    document.body.appendChild(captionOverlay);

    cueEl = document.createElement('div');
    cueEl.setAttribute('data-testid', 'cueBoxRowTextCue');
    captionOverlay.appendChild(cueEl);
  });

  it('emits cues on text change, closes previous, skips unchanged, cleanup stops', async () => {
    const cleanup = startDomCueSource(makeHandler(makeDomSource()), bridge);

    Object.defineProperty(video, 'currentTime', { configurable: true, get: () => 12.5 });
    cueEl.textContent = 'Hello world';
    await flushObservers();

    const domMsg = sentMessages.find((m) => m.type === 'SUBTITLE_DOM_CUES');
    expect(domMsg).toBeDefined();
    const payload = (domMsg ?? { payload: { cues: [], platform: '', language: '' } }).payload as { cues: SubtitleCue[]; platform: string; language: string };
    expect(payload.platform).toBe('hbomax');
    expect(payload.language).toBe('en');
    expect(payload.cues.length).toBeGreaterThanOrEqual(1);
    expect(payload.cues[0].text).toBe('Hello world');
    expect(payload.cues[0].startTime).toBe(12.5);
    expect(payload.cues[0].endTime).toBe(OPEN_CUE_END_SENTINEL);

    const before = sentMessages.length;
    cueEl.textContent = 'Hello world';
    await flushObservers();
    expect(sentMessages.length).toBe(before);

    Object.defineProperty(video, 'currentTime', { configurable: true, get: () => 15 });
    cueEl.textContent = 'Second';
    await flushObservers();

    const lastMsg = sentMessages.filter((m) => m.type === 'SUBTITLE_DOM_CUES').pop();
    const cues = ((lastMsg ?? { payload: { cues: [] } }).payload as { cues: SubtitleCue[] }).cues;
    expect(cues).toHaveLength(2);
    expect(cues[0].startTime).toBe(12.5);
    expect(cues[0].endTime).toBe(15);
    expect(cues[1].startTime).toBe(15);
    expect(cues[1].text).toBe('Second');

    cleanup();
    sentMessages.length = 0;
    Object.defineProperty(video, 'currentTime', { configurable: true, get: () => 20 });
    cueEl.textContent = 'After cleanup';
    await flushObservers();
    expect(sentMessages.find((m) => m.type === 'SUBTITLE_DOM_CUES')).toBeUndefined();
  });

  it('caps open cue on pause; seeked finalizes without zero/negative span', async () => {
    const cleanup = startDomCueSource(makeHandler(makeDomSource()), bridge);

    Object.defineProperty(video, 'currentTime', { configurable: true, get: () => 20 });
    cueEl.textContent = 'Open cue';
    await flushObservers();

    Object.defineProperty(video, 'currentTime', { configurable: true, get: () => 24 });
    video.dispatchEvent(new Event('pause'));
    await flushObservers();

    let lastMsg = sentMessages.filter((m) => m.type === 'SUBTITLE_DOM_CUES').pop();
    let cues = ((lastMsg ?? { payload: { cues: [] } }).payload as { cues: SubtitleCue[] }).cues;
    const paused = cues.find((c) => c.text === 'Open cue');
    expect(paused).toBeDefined();
    expect((paused ?? { endTime: -1 }).endTime).toBe(24);

    // Forward seek
    Object.defineProperty(video, 'currentTime', { configurable: true, get: () => 30 });
    cueEl.textContent = 'Open before seek';
    await flushObservers();
    Object.defineProperty(video, 'currentTime', { configurable: true, get: () => 35 });
    video.dispatchEvent(new Event('seeked'));
    await flushObservers();

    lastMsg = sentMessages.filter((m) => m.type === 'SUBTITLE_DOM_CUES').pop();
    cues = ((lastMsg ?? { payload: { cues: [] } }).payload as { cues: SubtitleCue[] }).cues;
    const forward = cues.find((c) => c.text === 'Open before seek') as SubtitleCue;
    expect(forward.startTime).toBe(30);
    expect(forward.endTime).toBe(35);
    expect(forward.endTime).toBeGreaterThan(forward.startTime);

    // Backward seek
    Object.defineProperty(video, 'currentTime', { configurable: true, get: () => 40 });
    cueEl.textContent = 'Open then jump back';
    await flushObservers();
    Object.defineProperty(video, 'currentTime', { configurable: true, get: () => 5 });
    video.dispatchEvent(new Event('seeked'));
    await flushObservers();

    lastMsg = sentMessages.filter((m) => m.type === 'SUBTITLE_DOM_CUES').pop();
    cues = ((lastMsg ?? { payload: { cues: [] } }).payload as { cues: SubtitleCue[] }).cues;
    const backward = cues.find((c) => c.text === 'Open then jump back') as SubtitleCue;
    expect(backward.endTime).toBeGreaterThanOrEqual(backward.startTime);
    expect(backward.endTime - backward.startTime).toBeLessThanOrEqual(1);

    cleanup();
  });

  it('late video attach; no-op without getDomCueSource', async () => {
    const noDomHandler = {
      platform: 'x', detect: () => true, getPatterns: () => [], transformResponse: () => [],
    } as unknown as SubtitleHandler;
    const noop = startDomCueSource(noDomHandler, bridge);
    expect(typeof noop).toBe('function');
    expect(() => noop()).not.toThrow();

    document.body.innerHTML = '';
    sentMessages = [];
    const cleanup = startDomCueSource(makeHandler(makeDomSource()), bridge);
    expect(typeof cleanup).toBe('function');

    const lateVideo = document.createElement('video');
    document.body.appendChild(lateVideo);
    const lateOverlay = document.createElement('div');
    lateOverlay.setAttribute('data-testid', 'caption_renderer_overlay');
    const lateCue = document.createElement('div');
    lateCue.setAttribute('data-testid', 'cueBoxRowTextCue');
    lateOverlay.appendChild(lateCue);
    document.body.appendChild(lateOverlay);

    Object.defineProperty(lateVideo, 'currentTime', { configurable: true, get: () => 3 });
    lateCue.textContent = 'Late cue';
    await flushObservers();

    expect(sentMessages.find((m) => m.type === 'SUBTITLE_DOM_CUES')).toBeDefined();
    cleanup();
  });

  it('track switch resets buffer; non-track controls and missing selector do not', async () => {
    const btn = document.createElement('button');
    btn.setAttribute('data-testid', 'player-ux-text-track-button');
    btn.setAttribute('aria-label', 'Thai');
    btn.setAttribute('aria-checked', 'false');
    document.body.appendChild(btn);

    const cleanup = startDomCueSource(makeHandler(makeDomSource()), bridge);

    Object.defineProperty(video, 'currentTime', { configurable: true, get: () => 5 });
    cueEl.textContent = 'English cue';
    await flushObservers();
    const beforeSwitch = (sentMessages.filter((m) => m.type === 'SUBTITLE_DOM_CUES').pop() as { payload: { cues: SubtitleCue[] } })?.payload.cues;
    expect(beforeSwitch?.length).toBeGreaterThanOrEqual(1);

    btn.setAttribute('aria-checked', 'true');
    await flushObservers();

    const trackChanged = sentMessages.find((m) => m.type === 'SUBTITLE_DOM_TRACK_CHANGED');
    expect(trackChanged).toBeDefined();
    expect((trackChanged?.payload as { platform: string }).platform).toBe('hbomax');

    Object.defineProperty(video, 'currentTime', { configurable: true, get: () => 10 });
    cueEl.textContent = 'Thai cue';
    await flushObservers();

    const afterSwitch = sentMessages.filter((m) => m.type === 'SUBTITLE_DOM_CUES').pop() as { payload: { cues: SubtitleCue[] } };
    expect(afterSwitch?.payload.cues).toHaveLength(1);
    expect(afterSwitch?.payload.cues[0].text).toBe('Thai cue');
    cleanup();

    // Non-track control
    document.body.innerHTML = '';
    sentMessages = [];
    video = document.createElement('video');
    document.body.appendChild(video);
    captionOverlay = document.createElement('div');
    captionOverlay.setAttribute('data-testid', 'caption_renderer_overlay');
    document.body.appendChild(captionOverlay);
    cueEl = document.createElement('div');
    cueEl.setAttribute('data-testid', 'cueBoxRowTextCue');
    captionOverlay.appendChild(cueEl);

    const toggle = document.createElement('button');
    toggle.setAttribute('data-testid', 'player-ux-settings-toggle');
    toggle.setAttribute('aria-checked', 'false');
    document.body.appendChild(toggle);

    const cleanup2 = startDomCueSource(makeHandler(makeDomSource()), bridge);
    Object.defineProperty(video, 'currentTime', { configurable: true, get: () => 5 });
    cueEl.textContent = 'Cue one';
    await flushObservers();

    toggle.setAttribute('aria-checked', 'true');
    await flushObservers();

    Object.defineProperty(video, 'currentTime', { configurable: true, get: () => 8 });
    cueEl.textContent = 'Cue two';
    await flushObservers();

    const cuesAfter = sentMessages.filter((m) => m.type === 'SUBTITLE_DOM_CUES').pop() as { payload: { cues: SubtitleCue[] } };
    expect(cuesAfter?.payload.cues).toHaveLength(2);
    expect(cuesAfter?.payload.cues[0].text).toBe('Cue one');
    expect(cuesAfter?.payload.cues[1].text).toBe('Cue two');
    cleanup2();

    // No trackSwitchSelector
    document.body.innerHTML = '';
    sentMessages = [];
    video = document.createElement('video');
    document.body.appendChild(video);
    captionOverlay = document.createElement('div');
    captionOverlay.setAttribute('data-testid', 'caption_renderer_overlay');
    document.body.appendChild(captionOverlay);
    cueEl = document.createElement('div');
    cueEl.setAttribute('data-testid', 'cueBoxRowTextCue');
    captionOverlay.appendChild(cueEl);

    const noTrackDomSource: DomCueSource = {
      cueSelector: '[data-testid="cueBoxRowTextCue"]',
      captionWindowSelector: '[data-testid="caption_renderer_overlay"]',
      observeRootSelector: '[data-testid="caption_renderer_overlay"]',
      readActiveLanguage: () => 'en',
    };
    const cleanup3 = startDomCueSource(makeHandler(noTrackDomSource), bridge);

    const btn2 = document.createElement('button');
    btn2.setAttribute('data-testid', 'player-ux-text-track-button');
    btn2.setAttribute('aria-checked', 'false');
    document.body.appendChild(btn2);

    Object.defineProperty(video, 'currentTime', { configurable: true, get: () => 5 });
    cueEl.textContent = 'Cue A';
    await flushObservers();

    btn2.setAttribute('aria-checked', 'true');
    await flushObservers();
    expect(sentMessages.find((m) => m.type === 'SUBTITLE_DOM_TRACK_CHANGED')).toBeUndefined();

    Object.defineProperty(video, 'currentTime', { configurable: true, get: () => 8 });
    cueEl.textContent = 'Cue B';
    await flushObservers();
    const cues = (sentMessages.filter((m) => m.type === 'SUBTITLE_DOM_CUES').pop() as { payload: { cues: SubtitleCue[] } })?.payload.cues;
    expect(cues?.length).toBeGreaterThanOrEqual(2);

    cleanup3();
  });
});
