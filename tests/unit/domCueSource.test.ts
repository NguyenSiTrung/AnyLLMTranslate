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

  it('keeps the open cue alive across pause, reseeds after a backward seek, re-samples on the seek-reset bridge message, clears the buffer on SUBTITLE_CAPTURE_RESET, and starts a fresh timeline on media swap', async () => {
    // Scenario 1: pause must NOT cap the open cue; a backward seek emits a fresh cue.
    const cleanup = startDomCueSource(makeHandler(makeDomSource()), bridge);

    Object.defineProperty(video, 'currentTime', { configurable: true, get: () => 20 });
    cueEl.textContent = 'Repeated caption';
    await flushObservers();

    Object.defineProperty(video, 'currentTime', { configurable: true, get: () => 24 });
    video.dispatchEvent(new Event('pause'));
    await flushObservers();

    let lastMsg = sentMessages.filter((m) => m.type === 'SUBTITLE_DOM_CUES').pop();
    let cues = ((lastMsg ?? { payload: { cues: [] } }).payload as { cues: SubtitleCue[] }).cues;
    const paused = cues.find((c) => c.text === 'Repeated caption');
    expect(paused).toBeDefined();
    // MAX-7: capping at the pause time would unmatch the still-visible line, so
    // the cue stays open (sentinel) until the next cue text change closes it.
    expect((paused ?? { endTime: -1 }).endTime).toBe(OPEN_CUE_END_SENTINEL);

    // The caption text remains unchanged after a backward seek. The source must
    // still emit a new cue at the destination rather than retaining the old cue.
    Object.defineProperty(video, 'currentTime', { configurable: true, get: () => 5 });
    video.dispatchEvent(new Event('seeked'));
    await flushObservers();

    lastMsg = sentMessages.filter((m) => m.type === 'SUBTITLE_DOM_CUES').pop();
    cues = ((lastMsg ?? { payload: { cues: [] } }).payload as { cues: SubtitleCue[] }).cues;
    expect(cues).toHaveLength(1);
    expect(cues[0]).toMatchObject({
      startTime: 5,
      endTime: OPEN_CUE_END_SENTINEL,
      text: 'Repeated caption',
    });

    cleanup();

    // Scenario 2: the coordinator's seek-reset bridge message triggers a
    // re-sample at the new position.
    sentMessages.length = 0;
    const cleanup2 = startDomCueSource(makeHandler(makeDomSource()), bridge);

    Object.defineProperty(video, 'currentTime', { configurable: true, get: () => 2 });
    cueEl.textContent = 'Bridge reset caption';
    await flushObservers();

    Object.defineProperty(video, 'currentTime', { configurable: true, get: () => 8 });
    window.dispatchEvent(new MessageEvent('message', {
      origin: window.location.origin,
      data: {
        channel: 'anyllm-translate',
        type: 'SUBTITLE_SEEK_RESET',
        requestId: 'seek-reset-1',
        payload: {},
      },
    }));
    await flushObservers();

    const resetMsg = sentMessages.filter((m) => m.type === 'SUBTITLE_DOM_CUES').pop();
    const resetCues = ((resetMsg ?? { payload: { cues: [] } }).payload as { cues: SubtitleCue[] }).cues;
    expect(resetCues).toHaveLength(1);
    expect(resetCues[0]).toMatchObject({
      startTime: 8,
      endTime: OPEN_CUE_END_SENTINEL,
      text: 'Bridge reset caption',
    });

    cleanup2();

    // Facet: SUBTITLE_CAPTURE_RESET clears the rolling buffer and re-samples at
    // the new position (a new title's identical-looking caption is a fresh cue).
    sentMessages.length = 0;
    cueEl.textContent = '';
    const cleanup3 = startDomCueSource(makeHandler(makeDomSource()), bridge);

    Object.defineProperty(video, 'currentTime', { configurable: true, get: () => 1 });
    cueEl.textContent = 'Previous title caption';
    await flushObservers();
    expect(
      (sentMessages.filter((m) => m.type === 'SUBTITLE_DOM_CUES').pop() as { payload: { cues: SubtitleCue[] } })?.payload.cues,
    ).toHaveLength(1);

    Object.defineProperty(video, 'currentTime', { configurable: true, get: () => 9 });
    window.dispatchEvent(new MessageEvent('message', {
      origin: window.location.origin,
      data: {
        channel: 'anyllm-translate',
        type: 'SUBTITLE_CAPTURE_RESET',
        requestId: 'capture-reset-1',
        payload: { platform: 'hbomax' },
      },
    }));
    await flushObservers();

    const captureResetCues = (sentMessages.filter((m) => m.type === 'SUBTITLE_DOM_CUES').pop() as { payload: { cues: SubtitleCue[] } })?.payload.cues;
    // The new title's identical-looking caption is a fresh cue at the new time.
    expect(captureResetCues).toHaveLength(1);
    expect(captureResetCues?.[0]).toMatchObject({
      startTime: 9,
      endTime: OPEN_CUE_END_SENTINEL,
      text: 'Previous title caption',
    });

    cleanup3();

    // Facet: emptied/loadstart (player swaps media) starts a fresh timeline.
    sentMessages.length = 0;
    cueEl.textContent = '';
    const cleanup4 = startDomCueSource(makeHandler(makeDomSource()), bridge);

    Object.defineProperty(video, 'currentTime', { configurable: true, get: () => 300 });
    cueEl.textContent = 'Season 1 finale line';
    await flushObservers();

    // Next episode loads into the same <video> element.
    Object.defineProperty(video, 'currentTime', { configurable: true, get: () => 4 });
    video.dispatchEvent(new Event('emptied'));
    await flushObservers();

    let swapCues = (sentMessages.filter((m) => m.type === 'SUBTITLE_DOM_CUES').pop() as { payload: { cues: SubtitleCue[] } })?.payload.cues;
    expect(swapCues).toHaveLength(1);
    expect(swapCues?.[0]).toMatchObject({ startTime: 4, endTime: OPEN_CUE_END_SENTINEL });

    // `loadstart` (media load begins) resets as well.
    Object.defineProperty(video, 'currentTime', { configurable: true, get: () => 12 });
    cueEl.textContent = 'Episode 2 line';
    await flushObservers();
    video.dispatchEvent(new Event('loadstart'));
    await flushObservers();

    swapCues = (sentMessages.filter((m) => m.type === 'SUBTITLE_DOM_CUES').pop() as { payload: { cues: SubtitleCue[] } })?.payload.cues;
    expect(swapCues).toHaveLength(1);
    expect(swapCues?.[0]).toMatchObject({ startTime: 12, text: 'Episode 2 line' });

    cleanup4();
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

  it('track switch resets buffer; non-track controls and missing selector do not; joins multi-row cue nodes in DOM order', async () => {
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

    // Facet: multi-row cue nodes are joined in DOM order.
    sentMessages.length = 0;
    cueEl.textContent = '';
    const secondRow = document.createElement('div');
    secondRow.setAttribute('data-testid', 'cueBoxRowTextCue');
    captionOverlay.appendChild(secondRow);

    const cleanup4 = startDomCueSource(makeHandler(makeDomSource()), bridge);

    Object.defineProperty(video, 'currentTime', { configurable: true, get: () => 7 });
    cueEl.textContent = 'First row';
    secondRow.textContent = 'Second row';
    await flushObservers();

    const rowCues = (sentMessages.filter((m) => m.type === 'SUBTITLE_DOM_CUES').pop() as { payload: { cues: SubtitleCue[] } })?.payload.cues;
    expect(rowCues).toHaveLength(1);
    expect(rowCues?.[0].text).toBe('First row\nSecond row');

    cleanup4();
  });

  it('re-attaches when the caption root is remounted and keeps observing the new root', async () => {
    const cleanup = startDomCueSource(makeHandler(makeDomSource()), bridge);

    Object.defineProperty(video, 'currentTime', { configurable: true, get: () => 5 });
    cueEl.textContent = 'Before remount';
    await flushObservers();

    // Max's React player replaces the caption overlay element on quality/track
    // changes. The old root is disconnected; a fresh root must be observed.
    captionOverlay.remove();
    const newOverlay = document.createElement('div');
    newOverlay.setAttribute('data-testid', 'caption_renderer_overlay');
    document.body.appendChild(newOverlay);
    const newCueEl = document.createElement('div');
    newCueEl.setAttribute('data-testid', 'cueBoxRowTextCue');
    newOverlay.appendChild(newCueEl);

    Object.defineProperty(video, 'currentTime', { configurable: true, get: () => 8 });
    newCueEl.textContent = 'After remount';
    await flushObservers();

    let cues = (sentMessages.filter((m) => m.type === 'SUBTITLE_DOM_CUES').pop() as { payload: { cues: SubtitleCue[] } })?.payload.cues;
    expect(cues?.map((c) => c.text)).toEqual(['Before remount', 'After remount']);
    expect(cues?.[1]).toMatchObject({ startTime: 8, endTime: OPEN_CUE_END_SENTINEL });

    // The new root — not the detached one — drives further cue sampling.
    Object.defineProperty(video, 'currentTime', { configurable: true, get: () => 11 });
    newCueEl.textContent = 'Third caption';
    newOverlay.appendChild(document.createElement('span'));
    await flushObservers();

    cues = (sentMessages.filter((m) => m.type === 'SUBTITLE_DOM_CUES').pop() as { payload: { cues: SubtitleCue[] } })?.payload.cues;
    expect(cues?.map((c) => c.text)).toEqual(['Before remount', 'After remount', 'Third caption']);

    cleanup();
  });

  it('rebinds cue timing to a replacement <video> element', async () => {
    const cleanup = startDomCueSource(makeHandler(makeDomSource()), bridge);

    Object.defineProperty(video, 'currentTime', { configurable: true, get: () => 3 });
    cueEl.textContent = 'Opening line';
    await flushObservers();

    // Some players swap the <video> node (or insert a second one) on ads/DRM
    // re-init. Timing must come from the element that is primary now.
    video.remove();
    const newVideo = document.createElement('video');
    document.body.appendChild(newVideo);
    Object.defineProperty(newVideo, 'currentTime', { configurable: true, get: () => 42 });

    await flushObservers();

    cueEl.textContent = 'After swap';
    await flushObservers();

    const cues = (sentMessages.filter((m) => m.type === 'SUBTITLE_DOM_CUES').pop() as { payload: { cues: SubtitleCue[] } })?.payload.cues;
    expect(cues?.map((c) => c.text)).toEqual(['Opening line', 'After swap']);
    expect(cues?.[1]).toMatchObject({ startTime: 42, endTime: OPEN_CUE_END_SENTINEL });

    cleanup();
  });
});
