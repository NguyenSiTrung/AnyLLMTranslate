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
  };
}

/** Flush pending MutationObserver callbacks (jsdom delivers them as microtasks).
 *  Also waits for the 50ms debounce in domCueSource's MutationObserver wrappers. */
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

  it('emits a cue when cue text changes, with startTime from video.currentTime', async () => {
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

    cleanup();
  });

  it('closes previous cue endTime when a new cue appears', async () => {
    const cleanup = startDomCueSource(makeHandler(makeDomSource()), bridge);

    Object.defineProperty(video, 'currentTime', { configurable: true, get: () => 10 });
    cueEl.textContent = 'First';
    await flushObservers();

    Object.defineProperty(video, 'currentTime', { configurable: true, get: () => 15 });
    cueEl.textContent = 'Second';
    await flushObservers();

    const domMsg = sentMessages.filter((m) => m.type === 'SUBTITLE_DOM_CUES').pop();
    expect(domMsg).toBeDefined();
    const cues = ((domMsg ?? { payload: { cues: [] } }).payload as { cues: SubtitleCue[] }).cues;
    expect(cues).toHaveLength(2);
    expect(cues[0].startTime).toBe(10);
    expect(cues[0].endTime).toBe(15);
    expect(cues[1].startTime).toBe(15);
    expect(cues[1].text).toBe('Second');

    cleanup();
  });

  it('does not emit when text unchanged', async () => {
    const cleanup = startDomCueSource(makeHandler(makeDomSource()), bridge);
    Object.defineProperty(video, 'currentTime', { configurable: true, get: () => 5 });
    cueEl.textContent = 'Same';
    await flushObservers();

    const before = sentMessages.length;
    cueEl.textContent = 'Same';
    await flushObservers();
    expect(sentMessages.length).toBe(before);

    cleanup();
  });

  it('cleanup disconnects observer (no emit after cleanup)', async () => {
    const cleanup = startDomCueSource(makeHandler(makeDomSource()), bridge);
    cleanup();
    Object.defineProperty(video, 'currentTime', { configurable: true, get: () => 7 });
    cueEl.textContent = 'After cleanup';
    await flushObservers();
    expect(sentMessages.find((m) => m.type === 'SUBTITLE_DOM_CUES')).toBeUndefined();
  });

  it('caps dangling open cue on video pause', async () => {
    const pauseBridge = { send: (type: string, payload: unknown) => { sentMessages.push({ type, payload }); return 'r'; } };
    const cleanup = startDomCueSource(makeHandler(makeDomSource()), pauseBridge);

    Object.defineProperty(video, 'currentTime', { configurable: true, get: () => 20 });
    cueEl.textContent = 'Open cue';
    await flushObservers();

    // Simulate currentTime advancing then pause fires.
    Object.defineProperty(video, 'currentTime', { configurable: true, get: () => 24 });
    video.dispatchEvent(new Event('pause'));
    await flushObservers();

    const lastMsg = sentMessages.filter((m) => m.type === 'SUBTITLE_DOM_CUES').pop();
    expect(lastMsg).toBeDefined();
    const cues = ((lastMsg ?? { payload: { cues: [] } }).payload as { cues: SubtitleCue[] }).cues;
    const open = cues.find((c) => c.text === 'Open cue');
    expect(open).toBeDefined();
    expect((open ?? { endTime: -1 }).endTime).toBe(24);

    cleanup();
  });

  it('returns a no-op cleanup when handler has no getDomCueSource', () => {
    const noDomHandler = {
      platform: 'x', detect: () => true, getPatterns: () => [], transformResponse: () => [],
    } as unknown as SubtitleHandler;
    const cleanup = startDomCueSource(noDomHandler, bridge);
    expect(typeof cleanup).toBe('function');
    expect(() => cleanup()).not.toThrow();
  });

  it('waits and attaches when the video element is absent at startup', async () => {
    document.body.innerHTML = '';
    // No video at startup — scraper must NOT bail; it should wait.
    const cleanup = startDomCueSource(makeHandler(makeDomSource()), bridge);
    expect(typeof cleanup).toBe('function');

    // Video mounts later.
    const lateVideo = document.createElement('video');
    document.body.appendChild(lateVideo);
    // Caption overlay mounts later.
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

  it('waits and attaches when the caption overlay is absent at startup', async () => {
    document.body.innerHTML = '';
    const earlyVideo = document.createElement('video');
    document.body.appendChild(earlyVideo);
    // No caption overlay at startup — scraper must NOT bail.
    const cleanup = startDomCueSource(makeHandler(makeDomSource()), bridge);

    // Caption overlay mounts later.
    const lateOverlay = document.createElement('div');
    lateOverlay.setAttribute('data-testid', 'caption_renderer_overlay');
    const lateCue = document.createElement('div');
    lateCue.setAttribute('data-testid', 'cueBoxRowTextCue');
    lateOverlay.appendChild(lateCue);
    document.body.appendChild(lateOverlay);

    Object.defineProperty(earlyVideo, 'currentTime', { configurable: true, get: () => 7 });
    lateCue.textContent = 'Late cue';
    await flushObservers();

    expect(sentMessages.find((m) => m.type === 'SUBTITLE_DOM_CUES')).toBeDefined();
    cleanup();
  });

  it('resets the rolling cue buffer when the active track changes mid-session', async () => {
    // A track button that will become active mid-session.
    const btn = document.createElement('button');
    btn.setAttribute('data-testid', 'player-ux-text-track-button');
    btn.setAttribute('aria-label', 'Thai');
    btn.setAttribute('aria-checked', 'false');
    document.body.appendChild(btn);

    const cleanup = startDomCueSource(makeHandler(makeDomSource()), bridge);

    // Emit a first cue.
    Object.defineProperty(video, 'currentTime', { configurable: true, get: () => 5 });
    cueEl.textContent = 'English cue';
    await flushObservers();
    const beforeSwitch = (sentMessages.filter((m) => m.type === 'SUBTITLE_DOM_CUES').pop() as { payload: { cues: SubtitleCue[] } })?.payload.cues;
    expect(beforeSwitch?.length).toBeGreaterThanOrEqual(1);

    // User switches Max's track to Thai: the button becomes aria-checked=true.
    btn.setAttribute('aria-checked', 'true');
    await flushObservers();

    const trackChanged = sentMessages.find((m) => m.type === 'SUBTITLE_DOM_TRACK_CHANGED');
    expect(trackChanged).toBeDefined();
    expect((trackChanged?.payload as { platform: string }).platform).toBe('hbomax');

    // Emit a cue from the new track.
    Object.defineProperty(video, 'currentTime', { configurable: true, get: () => 10 });
    cueEl.textContent = 'Thai cue';
    await flushObservers();

    const afterSwitch = sentMessages.filter((m) => m.type === 'SUBTITLE_DOM_CUES').pop() as { payload: { cues: SubtitleCue[] } };
    // Buffer was reset — only the new track's cue should be present.
    expect(afterSwitch?.payload.cues).toHaveLength(1);
    expect(afterSwitch?.payload.cues[0].text).toBe('Thai cue');

    cleanup();
  });

  it('does NOT reset the buffer on aria-checked changes from non-track-button controls', async () => {
    // A settings toggle (NOT a text-track button) that becomes checked.
    const toggle = document.createElement('button');
    toggle.setAttribute('data-testid', 'player-ux-settings-toggle');
    toggle.setAttribute('aria-checked', 'false');
    document.body.appendChild(toggle);

    const cleanup = startDomCueSource(makeHandler(makeDomSource()), bridge);

    // Emit a first cue.
    Object.defineProperty(video, 'currentTime', { configurable: true, get: () => 5 });
    cueEl.textContent = 'Cue one';
    await flushObservers();
    const cuesBefore = (sentMessages.filter((m) => m.type === 'SUBTITLE_DOM_CUES').pop() as { payload: { cues: SubtitleCue[] } })?.payload.cues;
    expect(cuesBefore?.length).toBeGreaterThanOrEqual(1);

    // User toggles an unrelated settings control.
    toggle.setAttribute('aria-checked', 'true');
    await flushObservers();

    // Emit a second cue — the buffer should still contain the first cue.
    Object.defineProperty(video, 'currentTime', { configurable: true, get: () => 8 });
    cueEl.textContent = 'Cue two';
    await flushObservers();

    const cuesAfter = sentMessages.filter((m) => m.type === 'SUBTITLE_DOM_CUES').pop() as { payload: { cues: SubtitleCue[] } };
    // Buffer NOT reset — both cues present.
    expect(cuesAfter?.payload.cues).toHaveLength(2);
    expect(cuesAfter?.payload.cues[0].text).toBe('Cue one');
    expect(cuesAfter?.payload.cues[1].text).toBe('Cue two');

    cleanup();
  });

  it('on seeked, does NOT collapse the open cue to zero duration — finalizes at currentTime', async () => {
    const cleanup = startDomCueSource(makeHandler(makeDomSource()), bridge);

    // Open a cue at t=20.
    Object.defineProperty(video, 'currentTime', { configurable: true, get: () => 20 });
    cueEl.textContent = 'Open before seek';
    await flushObservers();

    // Forward-seek to t=35: the open cue should be finalized at 35 (a real
    // span 20→35), NOT collapsed to endTime === startTime (0s duration).
    Object.defineProperty(video, 'currentTime', { configurable: true, get: () => 35 });
    video.dispatchEvent(new Event('seeked'));
    await flushObservers();

    const lastMsg = sentMessages.filter((m) => m.type === 'SUBTITLE_DOM_CUES').pop();
    const cues = ((lastMsg ?? { payload: { cues: [] } }).payload as { cues: SubtitleCue[] }).cues;
    const open = cues.find((c) => c.text === 'Open before seek');
    expect(open).toBeDefined();
    const oc = open as SubtitleCue;
    expect(oc.startTime).toBe(20);
    // Pre-fix this was startTime (20) -> zero duration. Post-fix it is 35.
    expect(oc.endTime).toBe(35);
    expect(oc.endTime).toBeGreaterThan(oc.startTime);

    cleanup();
  });

  it('on backward seeked, the open cue does not linger with a negative/far-future span', async () => {
    const cleanup = startDomCueSource(makeHandler(makeDomSource()), bridge);

    // Open a cue at t=40.
    Object.defineProperty(video, 'currentTime', { configurable: true, get: () => 40 });
    cueEl.textContent = 'Open then jump back';
    await flushObservers();

    // Backward-seek to t=5. The cue started at 40; clamping to max(5, 40+0.1)
    // means endTime = 40.1 — a tiny (0.1s) cue that vanishes immediately rather
    // than spanning the 40→5 gap or lingering as stale text.
    Object.defineProperty(video, 'currentTime', { configurable: true, get: () => 5 });
    video.dispatchEvent(new Event('seeked'));
    await flushObservers();

    const lastMsg = sentMessages.filter((m) => m.type === 'SUBTITLE_DOM_CUES').pop();
    const cues = ((lastMsg ?? { payload: { cues: [] } }).payload as { cues: SubtitleCue[] }).cues;
    const open = cues.find((c) => c.text === 'Open then jump back');
    expect(open).toBeDefined();
    const oc = open as SubtitleCue;
    expect(oc.endTime).toBeGreaterThanOrEqual(oc.startTime); // never negative
    // Duration must be tiny (≤ 1s), not a multi-second span.
    expect(oc.endTime - oc.startTime).toBeLessThanOrEqual(1);

    cleanup();
  });

  it('uses OPEN_CUE_END_SENTINEL (not 86400) for the open cue marker', async () => {
    const cleanup = startDomCueSource(makeHandler(makeDomSource()), bridge);

    Object.defineProperty(video, 'currentTime', { configurable: true, get: () => 10 });
    cueEl.textContent = 'Open cue';
    await flushObservers();

    const lastMsg = sentMessages.filter((m) => m.type === 'SUBTITLE_DOM_CUES').pop();
    const cues = ((lastMsg ?? { payload: { cues: [] } }).payload as { cues: SubtitleCue[] }).cues;
    const open = cues.find((c) => c.text === 'Open cue');
    expect(open).toBeDefined();
    expect((open as SubtitleCue).endTime).toBe(OPEN_CUE_END_SENTINEL);

    cleanup();
  });
});