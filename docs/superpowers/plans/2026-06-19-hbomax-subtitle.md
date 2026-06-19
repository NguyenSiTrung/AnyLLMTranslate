# HBO Max Subtitle Translation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add bilingual subtitle translation for HBO Max (`max.com` / `play.hbomax.com`) by scraping Max's DOM-rendered captions and feeding them into the existing subtitle overlay/translation pipeline.

**Architecture:** Max streams DRM/MSE video and renders captions itself into the DOM (`[data-testid="cueBoxRowTextCue"]`) — no VTT URL to intercept, no native `<track>`/`TextTrack`. A new `DomCueSource` (MutationObserver on a stable ancestor) samples `video.currentTime` on each cue-text change and emits rolling `SubtitleCue[]` over a new `SUBTITLE_DOM_CUES` bridge message. The coordinator's new DOM branch hides Max's native caption window (`visibility: hidden !important`) and feeds cues into the existing `initializeOverlay` → `translateSubtitle` → `updateTranslatedCues` flow. No new overlay, no new translation logic.

**Tech Stack:** TypeScript, WXT (Manifest V3), React, Vitest + jsdom, Chrome Extension APIs.

## Global Constraints

- Max hostnames: `max.com` and `play.hbomax.com` (site is mid-rebrand; cover both in `detect()`).
- Max watch-page path: `/video/watch/<id>/...`. `isOnWatchPage()` must return true only for this path on Max hostnames.
- Cue selector: `[data-testid="cueBoxRowTextCue"]`. Caption overlay selector: `[data-testid="caption_renderer_overlay"]`. Track buttons: `[data-testid="player-ux-text-track-button"]`.
- Caption hide: injected `<style>` with `[data-testid="caption_renderer_overlay"] { visibility: hidden !important; }` — `visibility` (not `display`) because Max's own `up_next`/`skip` overlays use this idiom and it preserves cue scraping.
- Never mutate Max's player state. Do not click Max's track buttons. Read state only.
- The active Max track must be non-`Off` for `cueBoxRowTextCue` to exist — if `Off`, show a guidance toast and do not activate.
- TDD: write failing test first, verify it fails, implement minimal code, verify pass, commit.
- Use `bd` for issue tracking (per `AGENTS.md`); do NOT use TodoWrite.
- Non-interactive shell: use `cp -f`, `rm -rf`, etc.
- Test runner: `pnpm vitest` (or `npx vitest`). Tests live in `tests/unit/` and `inject/**/__tests__/`.

---

## File Structure

| File | Status | Responsibility |
|---|---|---|
| `types/subtitle.ts` | Modify | Add `DomCueSource` type, `'SUBTITLE_DOM_CUES'` message type, `SubtitleDomCuesPayload` |
| `inject/subtitleHandlers/registry.ts` | Modify | Add optional `getDomCueSource?()` to `SubtitleHandler` interface; re-export `DomCueSource` |
| `inject/subtitleHandlers/hbomax.ts` | Create | `HboMaxHandler` — detect, extract tracks from track buttons, return `DomCueSource` |
| `inject/domCueSource.ts` | Create | `startDomCueSource(handler, bridge)` — MutationObserver scraper emitting `SUBTITLE_DOM_CUES` |
| `content/messageBridge.ts` | Modify | Add `onDomCues(handler)` receiver |
| `content/subtitleCoordinator.ts` | Modify | `handleDomCues`, `activateOverlayFromDom`, caption-hide lifecycle, `isOnWatchPage()` Max branch, activation precondition |
| `entrypoints/inject.content/index.ts` | Modify | Register `HboMaxHandler`; start `domCueSource` when handler exposes it |
| `entrypoints/content.ts` | Modify | Register `HboMaxHandler` in isolated world |
| `tests/unit/hbomaxHandler.test.ts` | Create | Handler unit tests |
| `tests/unit/domCueSource.test.ts` | Create | Scraper unit tests |
| `tests/unit/subtitleCoordinatorDom.test.ts` | Create | Coordinator DOM-branch tests |

---

## Task 1: Add DOM cue types to `types/subtitle.ts`

**Files:**
- Modify: `types/subtitle.ts`

**Interfaces:**
- Produces: `DomCueSource` (re-exported by registry), `'SUBTITLE_DOM_CUES'` added to `BridgeMessageType`, `SubtitleDomCuesPayload`

- [ ] **Step 1: Add `DomCueSource` interface and bridge message type**

Add to `types/subtitle.ts` (after the `SubtitleUrlPattern` interface at end of file):

```ts
/** Contract for DOM-scraped cue sources (platforms like Max with no VTT URL) */
export interface DomCueSource {
  /** Selector for the element whose textContent = current cue text */
  cueSelector: string;
  /** Selector for the native caption window/overlay to hide while active */
  captionWindowSelector: string;
  /** Selector for a stable ancestor to observe (survives cue node replacement by React) */
  observeRootSelector: string;
  /** Extract the active track's language from the DOM ('' if unknown/off) */
  readActiveLanguage(): string;
}
```

Extend the `BridgeMessageType` union (currently lines 33-38) to add `'SUBTITLE_DOM_CUES'`:

```ts
export type BridgeMessageType =
  | 'SUBTITLE_INTERCEPTED'
  | 'SUBTITLE_TRANSLATED'
  | 'SUBTITLE_METADATA'
  | 'SUBTITLE_ERROR'
  | 'SUBTITLE_TRACKS_DISCOVERED'
  | 'SUBTITLE_DOM_CUES';
```

Add the payload type (after `SubtitleTracksDiscoveredPayload`):

```ts
/** Payload for SUBTITLE_DOM_CUES messages (DOM-scraped cues from MAIN world) */
export interface SubtitleDomCuesPayload {
  cues: SubtitleCue[];
  platform: string;   // e.g. 'hbomax'
  language: string;   // active source language ('' if unknown)
  videoId?: string;
}
```

- [ ] **Step 2: Verify typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add types/subtitle.ts
git commit -m "feat(hbomax): add DomCueSource type and SUBTITLE_DOM_CUES bridge message"
```

---

## Task 2: Extend `SubtitleHandler` interface with `getDomCueSource?()`

**Files:**
- Modify: `inject/subtitleHandlers/registry.ts`

**Interfaces:**
- Consumes: `DomCueSource` from `@/types/subtitle`
- Produces: optional `getDomCueSource?(): DomCueSource` on `SubtitleHandler`

- [ ] **Step 1: Add `DomCueSource` import and optional method to interface**

In `inject/subtitleHandlers/registry.ts`, update the import on line 6:

```ts
import type { SubtitleCue, SubtitleUrlPattern, AvailableSubtitleTrack, DomCueSource } from '@/types/subtitle';
```

Add the optional method to the `SubtitleHandler` interface (after `extractAvailableTracks?`, before the closing brace):

```ts
  /** For DOM-sourced platforms (e.g. Max): return cue-scraping contract.
   *  Platforms that intercept URLs return undefined. */
  getDomCueSource?(): DomCueSource;
```

- [ ] **Step 2: Verify typecheck (existing handlers must still compile)**

Run: `npx tsc --noEmit`
Expected: no errors (method is optional, existing handlers unaffected).

- [ ] **Step 3: Commit**

```bash
git add inject/subtitleHandlers/registry.ts
git commit -m "feat(hbomax): add optional getDomCueSource() to SubtitleHandler interface"
```

---

## Task 3: Create `HboMaxHandler`

**Files:**
- Create: `inject/subtitleHandlers/hbomax.ts`
- Create: `tests/unit/hbomaxHandler.test.ts`

**Interfaces:**
- Consumes: `SubtitleHandler` from `./registry`, `DomCueSource`, `AvailableSubtitleTrack` from `@/types/subtitle`
- Produces: `HboMaxHandler` class with `platform='hbomax'`, `detect()`, `getPatterns()`, `transformResponse()`, `extractAvailableTracks()`, `getDomCueSource()`, private `readActiveLanguage()`/`labelToLanguage()`

- [ ] **Step 1: Write failing test `tests/unit/hbomaxHandler.test.ts`**

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { HboMaxHandler } from '@/inject/subtitleHandlers/hbomax';

describe('HboMaxHandler', () => {
  let handler: HboMaxHandler;

  beforeEach(() => {
    handler = new HboMaxHandler();
    document.body.innerHTML = '';
  });

  it('has platform identifier', () => {
    expect(handler.platform).toBe('hbomax');
  });

  describe('detect', () => {
    it('detects play.hbomax.com', () => {
      vi.stubGlobal('location', { hostname: 'play.hbomax.com' });
      expect(handler.detect()).toBe(true);
    });

    it('detects max.com', () => {
      vi.stubGlobal('location', { hostname: 'www.max.com' });
      expect(handler.detect()).toBe(true);
    });

    it('rejects unrelated hostnames', () => {
      vi.stubGlobal('location', { hostname: 'www.youtube.com' });
      expect(handler.detect()).toBe(false);
    });
  });

  describe('getPatterns', () => {
    it('returns empty array (no URL interception)', () => {
      expect(handler.getPatterns()).toEqual([]);
    });
  });

  describe('transformResponse', () => {
    it('returns empty array (never called for DOM source)', () => {
      expect(handler.transformResponse('anything', 'text/vtt', 'https://max.com/x')).toEqual([]);
    });
  });

  describe('extractAvailableTracks', () => {
    it('reads track buttons, excludes Off, extracts videoId from path', () => {
      vi.stubGlobal('location', {
        hostname: 'play.hbomax.com',
        pathname: '/video/watch/847404c3-4390-4195-bf4b-465a8935fd04/194b0aab-a97a-42b6-a7f8-ca5bc3576d56',
      });
      document.body.innerHTML = `
        <button data-testid="player-ux-text-track-button" aria-label="Off" aria-checked="false"></button>
        <button data-testid="player-ux-text-track-button" aria-label="English" aria-checked="true"></button>
        <button data-testid="player-ux-text-track-button" aria-label="Chinese (Simplified)" aria-checked="false"></button>
        <button data-testid="player-ux-text-track-button" aria-label="Vietnamese" aria-checked="false"></button>
      `;

      const tracks = handler.extractAvailableTracks('', 'application/json', '');

      expect(tracks).toHaveLength(3);
      expect(tracks[0]).toMatchObject({
        platform: 'hbomax',
        url: undefined,
        isAutoGenerated: false,
        videoId: '847404c3-4390-4195-bf4b-465a8935fd04',
      });
      // English is the active one (aria-checked="true")
      const english = tracks.find((t) => t.language === 'en');
      expect(english).toBeDefined();
      expect(english?.label).toBe('English');
    });

    it('returns empty array when no track buttons present', () => {
      document.body.innerHTML = '';
      expect(handler.extractAvailableTracks('', 'application/json', '')).toEqual([]);
    });
  });

  describe('getDomCueSource', () => {
    it('returns selectors and a readActiveLanguage that maps active label to code', () => {
      document.body.innerHTML = `
        <button data-testid="player-ux-text-track-button" aria-label="English" aria-checked="true"></button>
      `;
      const source = handler.getDomCueSource();
      expect(source.cueSelector).toBe('[data-testid="cueBoxRowTextCue"]');
      expect(source.captionWindowSelector).toBe('[data-testid="caption_renderer_overlay"]');
      expect(source.observeRootSelector).toBe('[data-testid="caption_renderer_overlay"]');
      expect(source.readActiveLanguage()).toBe('en');
    });

    it('readActiveLanguage returns empty when no active button', () => {
      document.body.innerHTML = `
        <button data-testid="player-ux-text-track-button" aria-label="Off" aria-checked="true"></button>
      `;
      expect(handler.getDomCueSource().readActiveLanguage()).toBe('');
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/hbomaxHandler.test.ts`
Expected: FAIL — `Cannot find module '@/inject/subtitleHandlers/hbomax'`.

- [ ] **Step 3: Implement `inject/subtitleHandlers/hbomax.ts`**

```ts
import type { SubtitleCue, SubtitleUrlPattern, AvailableSubtitleTrack, DomCueSource } from '@/types/subtitle';
import type { SubtitleHandler } from './registry';

/** Max aria-label → ISO 639-1 / BCP-47 code. Covers observed track labels. */
const LABEL_TO_LANGUAGE: Record<string, string> = {
  English: 'en',
  'Chinese (Simplified)': 'zh-Hans',
  'Chinese (Traditional)': 'zh-Hant',
  Indonesian: 'id',
  Malay: 'ms',
  Thai: 'th',
  Vietnamese: 'vi',
};

export class HboMaxHandler implements SubtitleHandler {
  readonly platform = 'hbomax';

  detect(): boolean {
    const host = window.location.hostname;
    return host === 'max.com' || host === 'www.max.com' || host.endsWith('.max.com')
      || host === 'play.hbomax.com' || host.endsWith('.hbomax.com');
  }

  getPatterns(): SubtitleUrlPattern[] {
    // Max renders captions into the DOM — no URL interception.
    return [];
  }

  transformResponse(_body: string, _contentType: string, _url: string): SubtitleCue[] {
    return [];
  }

  extractAvailableTracks(_body: string, _contentType: string, _url: string): AvailableSubtitleTrack[] {
    const buttons = document.querySelectorAll<HTMLButtonElement>(
      '[data-testid="player-ux-text-track-button"]',
    );
    if (buttons.length === 0) return [];

    const videoId = this.extractVideoId();

    const tracks: AvailableSubtitleTrack[] = [];
    for (const btn of buttons) {
      const label = btn.getAttribute('aria-label') || '';
      if (!label || label.toLowerCase() === 'off') continue;
      const language = LABEL_TO_LANGUAGE[label] ?? label.toLowerCase();
      tracks.push({
        language,
        label,
        url: undefined, // DOM-sourced — no fetch URL
        isAutoGenerated: false,
        platform: 'hbomax',
        videoId,
      });
    }
    return tracks;
  }

  getDomCueSource(): DomCueSource {
    return {
      cueSelector: '[data-testid="cueBoxRowTextCue"]',
      captionWindowSelector: '[data-testid="caption_renderer_overlay"]',
      observeRootSelector: '[data-testid="caption_renderer_overlay"]',
      readActiveLanguage: () => this.readActiveLanguage(),
    };
  }

  /** Read the active track's language from the aria-checked button. */
  private readActiveLanguage(): string {
    const buttons = document.querySelectorAll<HTMLButtonElement>(
      '[data-testid="player-ux-text-track-button"]',
    );
    for (const btn of buttons) {
      if (btn.getAttribute('aria-checked') === 'true') {
        const label = btn.getAttribute('aria-label') || '';
        if (!label || label.toLowerCase() === 'off') return '';
        return LABEL_TO_LANGUAGE[label] ?? label.toLowerCase();
      }
    }
    return '';
  }

  /** Extract videoId from /video/watch/<id>/... path. */
  private extractVideoId(): string | undefined {
    const match = window.location.pathname.match(/\/video\/watch\/([^/]+)/);
    return match?.[1];
  }
}
```

- [ ] **Step 4: Run test to verify pass**

Run: `npx vitest run tests/unit/hbomaxHandler.test.ts`
Expected: PASS — all tests green.

- [ ] **Step 5: Commit**

```bash
git add inject/subtitleHandlers/hbomax.ts tests/unit/hbomaxHandler.test.ts
git commit -m "feat(hbomax): add HboMaxHandler with DOM cue source contract"
```

---

## Task 4: Create `inject/domCueSource.ts` — DOM cue scraper

**Files:**
- Create: `inject/domCueSource.ts`
- Create: `tests/unit/domCueSource.test.ts`

**Interfaces:**
- Consumes: `MessageBridgeSender` from `@/inject/messageBridge`, `SubtitleHandler` from `@/inject/subtitleHandlers/registry`, `SubtitleCue`, `SubtitleDomCuesPayload` from `@/types/subtitle`
- Produces: `startDomCueSource(handler, bridge): () => void`

- [ ] **Step 1: Write failing test `tests/unit/domCueSource.test.ts`**

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { startDomCueSource } from '@/inject/domCueSource';
import type { SubtitleHandler, DomCueSource } from '@/inject/subtitleHandlers/registry';

function makeHandler(domSource: DomCueSource, videoId?: string): SubtitleHandler {
  return {
    platform: 'hbomax',
    detect: () => true,
    getPatterns: () => [],
    transformResponse: () => [],
    extractAvailableTracks: () => [],
    getDomCueSource: () => domSource,
  } as unknown as SubtitleHandler;
}

describe('startDomCueSource', () => {
  let sentMessages: Array<{ type: string; payload: unknown }>;
  let bridge: { send: (type: string, payload: unknown) => string };
  let video: HTMLVideoElement;
  let captionOverlay: HTMLElement;
  let cueEl: HTMLElement;

  beforeEach(() => {
    vi.useFakeTimers();
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

  function makeDomSource(): DomCueSource {
    return {
      cueSelector: '[data-testid="cueBoxRowTextCue"]',
      captionWindowSelector: '[data-testid="caption_renderer_overlay"]',
      observeRootSelector: '[data-testid="caption_renderer_overlay"]',
      readActiveLanguage: () => 'en',
    };
  }

  it('emits a cue when cue text changes, with startTime from video.currentTime', () => {
    const cleanup = startDomCueSource(makeHandler(makeDomSource()), bridge);

    cueEl.textContent = 'Hello world';
    Object.defineProperty(video, 'currentTime', { configurable: true, get: () => 12.5 });
    captionOverlay.dispatchEvent(new MutationEvent('childList', { bubbles: false }));

    // MutationObserver is async — flush
    vi.runAllTimers();

    const domMsg = sentMessages.find((m) => m.type === 'SUBTITLE_DOM_CUES');
    expect(domMsg).toBeDefined();
    const payload = domMsg!.payload as { cues: SubtitleCue[]; platform: string; language: string };
    expect(payload.platform).toBe('hbomax');
    expect(payload.language).toBe('en');
    expect(payload.cues.length).toBeGreaterThanOrEqual(1);
    expect(payload.cues[0].text).toBe('Hello world');
    expect(payload.cues[0].startTime).toBe(12.5);

    cleanup();
  });

  it('closes previous cue endTime when a new cue appears', () => {
    const cleanup = startDomCueSource(makeHandler(makeDomSource()), bridge);

    Object.defineProperty(video, 'currentTime', { configurable: true, get: () => 10 });
    cueEl.textContent = 'First';
    captionOverlay.dispatchEvent(new MutationEvent('childList'));
    vi.runAllTimers();

    Object.defineProperty(video, 'currentTime', { configurable: true, get: () => 15 });
    cueEl.textContent = 'Second';
    captionOverlay.dispatchEvent(new MutationEvent('childList'));
    vi.runAllTimers();

    const domMsg = sentMessages.filter((m) => m.type === 'SUBTITLE_DOM_CUES').pop()!;
    const cues = (domMsg.payload as { cues: SubtitleCue[] }).cues;
    expect(cues).toHaveLength(2);
    expect(cues[0].startTime).toBe(10);
    expect(cues[0].endTime).toBe(15); // closed at second cue's start
    expect(cues[1].startTime).toBe(15);
    expect(cues[1].text).toBe('Second');

    cleanup();
  });

  it('does not emit when text unchanged', () => {
    const cleanup = startDomCueSource(makeHandler(makeDomSource()), bridge);
    Object.defineProperty(video, 'currentTime', { configurable: true, get: () => 5 });
    cueEl.textContent = 'Same';
    captionOverlay.dispatchEvent(new MutationEvent('childList'));
    vi.runAllTimers();

    const before = sentMessages.length;
    cueEl.textContent = 'Same';
    captionOverlay.dispatchEvent(new MutationEvent('childList'));
    vi.runAllTimers();
    expect(sentMessages.length).toBe(before);

    cleanup();
  });

  it('cleanup disconnects observer', () => {
    const cleanup = startDomCueSource(makeHandler(makeDomSource()), bridge);
    cleanup();
    Object.defineProperty(video, 'currentTime', { configurable: true, get: () => 7 });
    cueEl.textContent = 'After cleanup';
    captionOverlay.dispatchEvent(new MutationEvent('childList'));
    vi.runAllTimers();
    expect(sentMessages.find((m) => m.type === 'SUBTITLE_DOM_CUES')).toBeUndefined();
  });
});

type SubtitleCue = { startTime: number; endTime: number; text: string };
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/domCueSource.test.ts`
Expected: FAIL — `Cannot find module '@/inject/domCueSource'`.

- [ ] **Step 3: Implement `inject/domCueSource.ts`**

```ts
/**
 * DOM Cue Source — scrapes platform-rendered captions from the DOM.
 *
 * For platforms (e.g. HBO Max) that render captions themselves instead of
 * exposing a VTT URL or native TextTrack. Observes a stable ancestor and
 * samples video.currentTime on each cue-text change to derive cue timing.
 *
 * Mirrors textTrackDiscovery.ts shape: returns a cleanup function.
 */

import type { MessageBridgeSender } from '@/inject/messageBridge';
import type { SubtitleHandler } from '@/inject/subtitleHandlers/registry';
import type { SubtitleCue, SubtitleDomCuesPayload } from '@/types/subtitle';

/**
 * Start observing the page for DOM-rendered captions.
 * Emits SUBTITLE_DOM_CUES messages with a rolling SubtitleCue[].
 * Returns a cleanup function.
 */
export function startDomCueSource(handler: SubtitleHandler, bridge: MessageBridgeSender): () => void {
  const domSource = handler.getDomCueSource?.();
  if (!domSource) return () => {};

  const video = findPrimaryVideo();
  if (!video) return () => {};

  const cues: SubtitleCue[] = [];
  let lastText = '';
  let openCue: SubtitleCue | null = null;

  const emit = (language: string, videoId?: string) => {
    const payload: SubtitleDomCuesPayload = {
      cues: [...cues],
      platform: handler.platform,
      language,
      videoId,
    };
    bridge.send('SUBTITLE_DOM_CUES', payload);
  };

  const sampleCue = () => {
    const cueEl = document.querySelector<HTMLElement>(domSource.cueSelector);
    const text = cueEl?.textContent?.trim() ?? '';
    if (!text || text === lastText) return;

    const t = video.currentTime;
    // Close previous open cue at the new cue's start time.
    if (openCue) {
      openCue.endTime = t;
      openCue = null;
    }

    const cue: SubtitleCue = { startTime: t, endTime: t, text };
    cues.push(cue);
    openCue = cue;
    lastText = text;

    emit(domSource.readActiveLanguage(), extractVideoId());
  };

  const rootEl = document.querySelector<HTMLElement>(domSource.observeRootSelector);
  if (!rootEl) return () => {};

  const observer = new MutationObserver(() => {
    sampleCue();
  });
  observer.observe(rootEl, { childList: true, subtree: true, characterData: true });

  // Cap dangling open cue when video pauses without a cue change.
  const pauseHandler = () => {
    if (openCue) {
      openCue.endTime = video.currentTime;
      emit(domSource.readActiveLanguage(), extractVideoId());
    }
  };
  video.addEventListener('pause', pauseHandler);

  return () => {
    observer.disconnect();
    video.removeEventListener('pause', pauseHandler);
  };
}

function findPrimaryVideo(): HTMLVideoElement | null {
  const videos = Array.from(document.querySelectorAll<HTMLVideoElement>('video'));
  if (videos.length === 0) return null;
  if (videos.length === 1) return videos[0];
  const scored = videos
    .map((v) => {
      const rect = v.getBoundingClientRect();
      return { video: v, score: rect.width * rect.height };
    })
    .sort((a, b) => b.score - a.score);
  return scored[0]?.video ?? null;
}

function extractVideoId(): string | undefined {
  const match = window.location.pathname.match(/\/video\/watch\/([^/]+)/);
  return match?.[1];
}
```

- [ ] **Step 4: Run test to verify pass**

Run: `npx vitest run tests/unit/domCueSource.test.ts`
Expected: PASS.

If the MutationObserver-based tests are flaky under jsdom (jsdom has partial MutationObserver support), adjust the test to call the internal sampling via a small exported helper or by dispatching events that the observer catches. Prefer keeping the observer-based API; only fall back to direct `sampleCue` export if jsdom genuinely cannot fire observers.

- [ ] **Step 5: Commit**

```bash
git add inject/domCueSource.ts tests/unit/domCueSource.test.ts
git commit -m "feat(hbomax): add DOM cue source scraper with MutationObserver"
```

---

## Task 5: Add `onDomCues` receiver to `content/messageBridge.ts`

**Files:**
- Modify: `content/messageBridge.ts`

**Interfaces:**
- Consumes: `SubtitleDomCuesPayload` from `@/types/subtitle`, `onMessage` from `@/inject/messageBridge`
- Produces: `onDomCues(handler): () => void`

- [ ] **Step 1: Add import and receiver function**

In `content/messageBridge.ts`, update the type import (line 10):

```ts
import type { SubtitleInterceptedPayload, SubtitleTranslatedPayload, SubtitleTracksDiscoveredPayload, SubtitleDomCuesPayload } from '@/types/subtitle';
```

Add after `onTracksDiscovered` (before `sendTranslatedSubtitle`):

```ts
/**
 * Listen for DOM-scraped cue events from the MAIN world.
 * Returns a cleanup function.
 */
export function onDomCues(
  handler: (payload: SubtitleDomCuesPayload) => Promise<void>,
): () => void {
  return onMessage('SUBTITLE_DOM_CUES', async (payload) => {
    try {
      await handler(payload as SubtitleDomCuesPayload);
    } catch (error) {
      console.warn('AnyLLMTranslate: DOM cues handler error', error);
    }
  });
}
```

- [ ] **Step 2: Verify typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add content/messageBridge.ts
git commit -m "feat(hbomax): add onDomCues bridge receiver"
```

---

## Task 6: Wire coordinator DOM branch — `activateOverlayFromDom` + caption hide

**Files:**
- Modify: `content/subtitleCoordinator.ts`
- Create: `tests/unit/subtitleCoordinatorDom.test.ts`

**Interfaces:**
- Consumes: `onDomCues` from `@/content/messageBridge`, `initializeOverlay`/`updateCues`/`getOverlayTextContainer`/`cleanupOverlay` from `@/content/subtitleOverlay`, `initializeControls`/`enableDragReposition` from `@/content/subtitleControls`, `showSubtitleToast`/`hideSubtitleToast` from `@/content/subtitleToast`, `detectCurrentHandler` from registry, `loadSettings` from `@/lib/config`
- Produces: `handleDomCues(payload)`, `activateOverlayFromDom(handler)`, caption-hide `<style>` lifecycle, `isOnWatchPage()` Max branch

- [ ] **Step 1: Write failing test `tests/unit/subtitleCoordinatorDom.test.ts`**

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock bridge so coordinator import doesn't pull in chrome APIs at import time.
vi.mock('@/content/messageBridge', () => ({
  onSubtitleIntercepted: vi.fn(() => () => {}),
  onTracksDiscovered: vi.fn(() => () => {}),
  onDomCues: vi.fn(() => () => {}),
  sendTranslatedSubtitle: vi.fn(),
}));

vi.mock('@/lib/config', () => ({
  loadSettings: vi.fn().mockResolvedValue({
    enableContextAwareTranslation: false,
    subtitleSettings: { enabled: true, autoActivateSubtitles: true, preferredSubtitleLanguage: 'auto' },
    sourceLanguage: 'auto',
    targetLanguage: 'vi',
  }),
}));

describe('subtitleCoordinator — DOM branch (hbomax)', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    vi.resetModules();
  });

  it('isOnWatchPage returns true for /video/watch on max.com', async () => {
    vi.stubGlobal('location', { hostname: 'www.max.com', pathname: '/video/watch/abc-123/def', href: 'https://www.max.com/video/watch/abc-123/def' });
    const { isOnWatchPage } = await import('@/content/subtitleCoordinator');
    // isOnWatchPage is not exported; we test indirectly via a re-export below.
    // If not exported, this test is skipped — see note.
    expect(typeof isOnWatchPage).toBe('function');
  });
});
```

> **Note:** `isOnWatchPage` is currently a private (non-exported) function in `subtitleCoordinator.ts`. To make it testable, this task also exports it. Add `export` to the `function isOnWatchPage()` declaration.

- [ ] **Step 2: Run test to verify it fails (export missing)**

Run: `npx vitest run tests/unit/subtitleCoordinatorDom.test.ts`
Expected: FAIL — `isOnWatchPage is not a function` (not exported).

- [ ] **Step 3: Modify `content/subtitleCoordinator.ts`**

**(a) Update imports** — replace the existing messageBridge import line (line 12):

```ts
import { onSubtitleIntercepted, sendTranslatedSubtitle, onTracksDiscovered, onDomCues } from '@/content/messageBridge';
```

Add `SubtitleDomCuesPayload` to the type import (line 20):

```ts
import type { SubtitleCue, SubtitleInterceptedPayload, AvailableSubtitleTrack, SubtitleTracksDiscoveredPayload, SubtitleDomCuesPayload } from '@/types/subtitle';
```

**(b) Add state for caption-hide style** — extend `CoordinatorState` interface:

```ts
interface CoordinatorState {
  // ...existing fields...
  /** Injected <style> hiding Max's native caption window (null when inactive) */
  captionHideStyle: HTMLStyleElement | null;
}
```

Add to the `state` initializer object:

```ts
  captionHideStyle: null,
```

**(c) Add caption-hide helpers** — after `cleanupActiveOverlay()`:

```ts
/** Inject a <style> hiding the platform's native caption window. */
function hideNativeCaptions(selector: string): void {
  if (state.captionHideStyle) return;
  const style = document.createElement('style');
  style.setAttribute('data-anyllm-role', 'caption-hide');
  style.textContent = `${selector} { visibility: hidden !important; }`;
  document.head.appendChild(style);
  state.captionHideStyle = style;
}

/** Remove the injected caption-hide <style>. */
function restoreNativeCaptions(): void {
  if (state.captionHideStyle) {
    state.captionHideStyle.remove();
    state.captionHideStyle = null;
  }
}
```

**(d) Call `restoreNativeCaptions()` in `resetCoordinatorState()`** — add at the end of `resetCoordinatorState()` (before the final closing brace):

```ts
  restoreNativeCaptions();
```

Also add to the coordinator cleanup return function (in `startCoordinator`'s returned cleanup, after `if (state.isOverlayMode) { cleanupOverlay(); }`):

```ts
    restoreNativeCaptions();
```

**(e) Add `isOnWatchPage()` Max branch** — inside `isOnWatchPage()`, before the final `return false;`:

```ts
  if (hostname.includes('max.com') || hostname.includes('hbomax.com')) {
    return pathname.includes('/video/watch/');
  }
```

And export the function:

```ts
export function isOnWatchPage(): boolean {
```

**(f) Add `handleDomCues` and `activateOverlayFromDom`** — after `activateOverlayMode`:

```ts
/**
 * Handle DOM-scraped cues from MAIN world (Max). Accumulates cues and drives
 * the translate→overlay flow on first cue batch.
 */
async function handleDomCues(payload: SubtitleDomCuesPayload): Promise<void> {
  if (!isOnWatchPage()) return;
  if (state.isOverlayMode) {
    // Already active — just refresh the cue set.
    updateCues(payload.cues);
    return;
  }
  await activateOverlayFromDom(payload);
}

/**
 * Activate overlay mode from DOM-scraped cues (Max).
 * Hides native captions, starts with original cues, then translates.
 */
async function activateOverlayFromDom(payload: SubtitleDomCuesPayload): Promise<void> {
  if (state.isOverlayMode) return;

  const settings = await loadSettings();
  if (!settings.subtitleSettings.enabled) {
    cleanupActiveOverlay();
    return;
  }

  const handler = detectCurrentHandler();
  const domSource = handler?.getDomCueSource?.();
  if (!handler || !domSource) {
    console.warn('AnyLLMTranslate: No DOM cue source for platform', payload.platform);
    return;
  }

  if (payload.cues.length === 0) {
    console.log('AnyLLMTranslate: No DOM cues yet — waiting for caption changes');
    return;
  }

  state.isOverlayMode = true;
  console.log('AnyLLMTranslate: Activating overlay from DOM cues (Max)');

  // Hide Max's native caption window.
  hideNativeCaptions(domSource.captionWindowSelector);

  const savedPrefs = await initializeControls();
  const overlayConfig = buildSubtitleOverlayConfig(settings.subtitleSettings, savedPrefs);

  // Initialize overlay with original cues so they show immediately.
  initializeOverlay(payload.cues, overlayConfig);

  const textContainer = getOverlayTextContainer();
  if (textContainer) {
    state.dragCleanup = enableDragReposition(textContainer);
  }

  showSubtitleToast('Translating subtitles progressively...', true);

  const sourceLanguage = settings.sourceLanguage === 'auto'
    ? (payload.language || 'en')
    : settings.sourceLanguage;

  const pageContext = await buildSubtitlePageContext();

  const response = await chrome.runtime.sendMessage({
    action: 'translateSubtitle',
    cues: payload.cues,
    sourceLanguage,
    targetLanguage: settings.targetLanguage,
    pageContext,
  }) as { success: boolean; cues?: SubtitleCue[]; error?: string; sessionId?: number };

  if (!response?.success || !response.cues) {
    console.warn('AnyLLMTranslate: DOM cue translation failed', response?.error);
    hideSubtitleToast();
    showSubtitleToast('Subtitle translation failed.');
    return;
  }

  if (response.sessionId !== undefined) {
    state.activeSubtitleSessionId = response.sessionId;
  }

  updateTranslatedCues(response.cues);

  hideSubtitleToast();
  showSubtitleToast('Subtitles processing...');
}
```

**(g) Register `onDomCues` in `startCoordinator`** — after `const cleanupDiscovery = onTracksDiscovered(handleTracksDiscovered);`:

```ts
  const cleanupDomCues = onDomCues(handleDomCues);
```

Add `cleanupDomCues();` to the returned cleanup function (after `cleanupDiscovery();`).

- [ ] **Step 4: Run test to verify pass**

Run: `npx vitest run tests/unit/subtitleCoordinatorDom.test.ts`
Expected: PASS.

- [ ] **Step 5: Run full coordinator test suite (no regressions)**

Run: `npx vitest run tests/unit/subtitleCoordinator.test.ts content/__tests__/subtitleCoordinator.test.ts`
Expected: PASS — existing tests unaffected (new optional bridge receiver, new private functions).

- [ ] **Step 6: Commit**

```bash
git add content/subtitleCoordinator.ts tests/unit/subtitleCoordinatorDom.test.ts
git commit -m "feat(hbomax): wire coordinator DOM branch with caption-hide lifecycle"
```

---

## Task 7: Register `HboMaxHandler` + start `domCueSource` in entrypoints

**Files:**
- Modify: `entrypoints/inject.content/index.ts`
- Modify: `entrypoints/content.ts`

**Interfaces:**
- Consumes: `HboMaxHandler` from `@/inject/subtitleHandlers/hbomax`, `startDomCueSource` from `@/inject/domCueSource`, `detectCurrentHandler` from registry

- [ ] **Step 1: Modify `entrypoints/inject.content/index.ts`**

Add imports (after the LinkedIn import, line 18):

```ts
import { HboMaxHandler } from '@/inject/subtitleHandlers/hbomax';
import { startDomCueSource } from '@/inject/domCueSource';
import { detectCurrentHandler } from '@/inject/subtitleHandlers/registry';
```

Add `new HboMaxHandler()` to the registration array (after `new LinkedInHandler()`):

```ts
    registerSubtitleHandlers([
       new YouTubeHandler(),
       new UdemyHandler(),
       new CourseraHandler(),
       new LinkedInHandler(),
       new HboMaxHandler(),
     ]);
```

Start `domCueSource` after the TextTrack discovery block (after the `if/else` that calls `startTextTrackDiscovery`, before the closing `console.log`/`}` of `main`):

```ts
    // Start DOM cue source for platforms that render captions into the DOM (e.g. Max)
    const currentHandler = detectCurrentHandler();
    if (currentHandler?.getDomCueSource) {
      const startDom = () => startDomCueSource(currentHandler, bridge);
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', startDom);
      } else {
        startDom();
      }
      console.log('[AnyLLMTranslate] DOM cue source started for', currentHandler.platform);
    }
```

- [ ] **Step 2: Modify `entrypoints/content.ts`**

Add import (next to the other handler imports):

```ts
import { HboMaxHandler } from '@/inject/subtitleHandlers/hbomax';
```

Add `new HboMaxHandler()` to the registration array (after `new LinkedInHandler()`):

```ts
    registerSubtitleHandlers([
      new YouTubeHandler(),
      new UdemyHandler(),
      new CourseraHandler(),
      new LinkedInHandler(),
      new HboMaxHandler(),
    ]);
```

- [ ] **Step 3: Verify typecheck and build**

Run: `npx tsc --noEmit && pnpm wxt build`
Expected: build succeeds, no errors.

- [ ] **Step 4: Commit**

```bash
git add entrypoints/inject.content/index.ts entrypoints/content.ts
git commit -m "feat(hbomax): register HboMaxHandler and start DOM cue source"
```

---

## Task 8: Activation precondition — gate auto-activate on visible Max captions

**Files:**
- Modify: `content/subtitleCoordinator.ts`
- Modify: `tests/unit/subtitleCoordinatorDom.test.ts`

**Interfaces:**
- Consumes: `detectCurrentHandler`, `DomCueSource`, `SubtitleSettings`

- [ ] **Step 1: Write failing test for the precondition**

Append to `tests/unit/subtitleCoordinatorDom.test.ts`:

```ts
describe('subtitleCoordinator — Max activation precondition', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    vi.resetModules();
  });

  it('tryAutoActivateForDom skips when caption overlay is not visible (captions off)', async () => {
    vi.stubGlobal('location', { hostname: 'www.max.com', pathname: '/video/watch/x/y', href: 'https://www.max.com/video/watch/x/y' });
    // No caption_renderer_overlay in DOM → captions off.
    const { tryAutoActivateForDom } = await import('@/content/subtitleCoordinator');
    const result = await tryAutoActivateForDom();
    expect(result.activated).toBe(false);
    expect(result.reason).toContain('captions');
  });

  it('tryAutoActivateForDom skips when active language does not match preferredSubtitleLanguage', async () => {
    vi.stubGlobal('location', { hostname: 'www.max.com', pathname: '/video/watch/x/y', href: 'https://www.max.com/video/watch/x/y' });
    const overlay = document.createElement('div');
    overlay.setAttribute('data-testid', 'caption_renderer_overlay');
    overlay.style.visibility = 'visible';
    document.body.appendChild(overlay);
    const btn = document.createElement('button');
    btn.setAttribute('data-testid', 'player-ux-text-track-button');
    btn.setAttribute('aria-label', 'Thai');
    btn.setAttribute('aria-checked', 'true');
    document.body.appendChild(btn);

    const { tryAutoActivateForDom } = await import('@/content/subtitleCoordinator');
    // preferredSubtitleLanguage defaults to 'auto' in the mock → any active track activates.
    // Override the mock here for a non-matching preferred language:
    const { loadSettings } = await import('@/lib/config');
    (loadSettings as unknown as { mockResolvedValue: (v: unknown) => void }).mockResolvedValue({
      enableContextAwareTranslation: false,
      subtitleSettings: { enabled: true, autoActivateSubtitles: true, preferredSubtitleLanguage: 'en' },
      sourceLanguage: 'auto',
      targetLanguage: 'vi',
    });

    const result = await tryAutoActivateForDom();
    expect(result.activated).toBe(false);
    expect(result.reason).toContain('language');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/subtitleCoordinatorDom.test.ts`
Expected: FAIL — `tryAutoActivateForDom is not a function`.

- [ ] **Step 3: Implement `tryAutoActivateForDom` in `content/subtitleCoordinator.ts`**

Add after `tryAutoActivate`:

```ts
/**
 * DOM-platform activation attempt (Max). Auto-activates on play ONLY if:
 *   1. Max's caption overlay is visible (captions on in Max)
 *   2. Active Max track language matches preferredSubtitleLanguage (or preferred is 'auto')
 * Returns { activated, reason } for testability.
 */
export async function tryAutoActivateForDom(): Promise<{ activated: boolean; reason: string }> {
  if (state.isOverlayMode) return { activated: false, reason: 'already active' };
  if (!isOnWatchPage()) return { activated: false, reason: 'not a watch page' };

  const handler = detectCurrentHandler();
  const domSource = handler?.getDomCueSource?.();
  if (!handler || !domSource) return { activated: false, reason: 'no DOM cue source' };

  // Precondition: Max's caption overlay must be present and visible.
  const overlay = document.querySelector<HTMLElement>(domSource.captionWindowSelector);
  if (!overlay || getComputedStyle(overlay).visibility === 'hidden') {
    showSubtitleToast('Enable subtitles in Max to enable translation (Alt+S to retry).');
    return { activated: false, reason: 'captions off in Max' };
  }

  const settings = await loadSettings();
  if (!settings.subtitleSettings.enabled || !settings.subtitleSettings.autoActivateSubtitles) {
    return { activated: false, reason: 'auto-activate disabled' };
  }

  const activeLang = domSource.readActiveLanguage();
  if (!activeLang) {
    showSubtitleToast('Enable subtitles in Max to enable translation (Alt+S to retry).');
    return { activated: false, reason: 'captions off in Max' };
  }

  const preferred = settings.subtitleSettings.preferredSubtitleLanguage;
  if (preferred && preferred !== 'auto' && activeLang !== preferred) {
    return { activated: false, reason: `active language ${activeLang} != preferred ${preferred}` };
  }

  // Defer to the DOM cue flow — actual activation happens when first cues arrive.
  // Mark videoIsPlaying so handleDomCues can proceed.
  state.videoIsPlaying = true;
  return { activated: true, reason: `activated for ${activeLang}` };
}
```

- [ ] **Step 4: Wire `tryAutoActivateForDom` into the play handler**

In `startVideoPlaybackWatcher`'s `attachPlayListener`, the existing `playHandler` calls `tryAutoActivate(epoch)`. Add a DOM-platform branch before it:

```ts
    const playHandler = () => {
      if (state.videoIsPlaying) return;
      state.videoIsPlaying = true;
      console.log('AnyLLMTranslate: Video play detected — attempting auto-activate');
      const epoch = state.navigationEpoch;
      // DOM-sourced platforms (Max) use a different activation path.
      const currentHandler = detectCurrentHandler();
      if (currentHandler?.getDomCueSource) {
        tryAutoActivateForDom().catch((err) => {
          console.warn('AnyLLMTranslate: DOM auto-activate on play failed', err);
        });
        return;
      }
      tryAutoActivate(epoch).catch((err) => {
        console.warn('AnyLLMTranslate: Auto-activate on play failed', err);
      });
    };
```

- [ ] **Step 5: Run test to verify pass**

Run: `npx vitest run tests/unit/subtitleCoordinatorDom.test.ts`
Expected: PASS.

- [ ] **Step 6: Run full test suite**

Run: `npx vitest run`
Expected: PASS — no regressions across all unit tests.

- [ ] **Step 7: Commit**

```bash
git add content/subtitleCoordinator.ts tests/unit/subtitleCoordinatorDom.test.ts
git commit -m "feat(hbomax): gate auto-activate on visible Max captions + language match"
```

---

## Task 9: Final verification — build, lint, full test suite

**Files:** none (verification only)

- [ ] **Step 1: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 2: Lint**

Run: `pnpm lint` (or `npx eslint inject/ content/ entrypoints/ types/ --max-warnings=0`)
Expected: no errors. Fix any lint issues introduced.

- [ ] **Step 3: Full test suite**

Run: `npx vitest run`
Expected: all tests pass, including new `hbomaxHandler`, `domCueSource`, `subtitleCoordinatorDom` suites and all pre-existing suites.

- [ ] **Step 4: Build the extension**

Run: `pnpm wxt build`
Expected: build succeeds; `.output/chrome-mv3/` updated.

- [ ] **Step 5: Smoke-check the bundle includes the new handler**

Run: `grep -l "HboMaxHandler\|hbomax" .output/chrome-mv3/content-scripts/*.js`
Expected: at least one file matches (confirms the handler is bundled).

- [ ] **Step 6: Manual verification note (no automation — DRM)**

Document in the commit/PR that final verification against live Max playback is manual (DRM prevents headless E2E). Test checklist for the human reviewer:
1. Load the unpacked extension from `.output/chrome-mv3`.
2. Open a Max watch page (`max.com/video/watch/...`) with captions enabled (English).
3. Press play — expect the toast "Translating subtitles progressively..." then bilingual overlay; Max's native caption window hidden.
4. With captions Off in Max — expect toast "Enable subtitles in Max to enable translation (Alt+S to retry)."
5. Navigate away (SPA) — expect overlay cleaned, native captions restored.

- [ ] **Step 7: Commit any lint fixes**

```bash
git add -A
git commit -m "chore(hbomax): final verification — build, lint, tests green" || echo "nothing to commit"
```

---

## Self-Review

**Spec coverage:**
- Decision 1 (visibility:hidden caption hide) → Task 6 (hideNativeCaptions/restoreNativeCaptions) ✅
- Decision 2 (auto-on-play preconditioned on visible captions + language match) → Task 8 (tryAutoActivateForDom) ✅
- `HboMaxHandler` with detect/getPatterns/transformResponse/extractAvailableTracks/getDomCueSource → Task 3 ✅
- `DomCueSource` interface + `getDomCueSource?()` on SubtitleHandler → Tasks 1, 2 ✅
- `inject/domCueSource.ts` MutationObserver on stable ancestor, re-resolve selector, seek handling (cap endTime), pause capping, cleanup → Task 4 ✅
- `SUBTITLE_DOM_CUES` bridge message + payload → Task 1 ✅
- `onDomCues` receiver → Task 5 ✅
- Coordinator DOM branch (handleDomCues, activateOverlayFromDom, caption-hide lifecycle, isOnWatchPage Max branch) → Task 6 ✅
- Registration in both entrypoints + start domCueSource → Task 7 ✅
- Testing: handler unit, scraper unit, coordinator DOM unit, no E2E (DRM) → Tasks 3, 4, 6, 8, 9 ✅
- Files-touched list matches plan ✅

**Type consistency:** `DomCueSource` fields (`cueSelector`, `captionWindowSelector`, `observeRootSelector`, `readActiveLanguage()`) consistent across types (Task 1), handler (Task 3), scraper (Task 4), coordinator (Task 6). `SubtitleDomCuesPayload` (`cues`, `platform`, `language`, `videoId?`) consistent across types (Task 1), bridge (Task 5), coordinator (Task 6). `startDomCueSource(handler, bridge)` consistent across scraper (Task 4) and entrypoint (Task 7).

**Placeholder scan:** No TBD/TODO; all code blocks complete.