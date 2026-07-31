# Player Subtitle Chrome (In-Player Mini Studio) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add hybrid in-player subtitle chrome (floating always, native adapters later) with a richer mini studio and soft-mirror control visibility, including fullscreen.

**Architecture:** New `content/playerChrome/` content-script module (no React on host pages). Pure visibility state machine + mount host + shadow-DOM button/panel. Appearance writes go through existing `subtitleControls` / `subtitleOverlay.updateConfig` and `updateSettings({ subtitleSettings })`. Per-tab knobs use existing `setSubtitleKnobOverride` message handler in `subtitleCoordinator`. Glossary list uses `setSiteListSelection` + `updateSettings`. Bootstrap beside `startCoordinator()` in `entrypoints/content.ts`.

**Tech Stack:** TypeScript, Vitest + jsdom, content-script DOM + Shadow DOM, existing `loadSettings` / `updateSettings`, Chrome extension messaging.

**Spec:** `docs/superpowers/specs/2026-07-31-player-subtitle-chrome-design.md`

## Global Constraints

- Phase 1 must ship **floating + soft-mirror + mini studio** on all subtitle-capable pages; native YouTube/Udemy/Coursera are later tasks and must not block Phase 1.
- No new settings schema keys for studio fields already in `subtitleSettings` / named lists / per-tab knobs.
- No React injected into host pages; shadow DOM isolation (selection-bubble spirit).
- Primary video only via `findPrimaryVideo`.
- Soft mirror: icon follows controls/heuristic; open panel forces chrome visible until dismiss.
- Icon shows even when `subtitleSettings.enabled === false` (on-ramp).
- Cue overlay visibility stays independent of chrome visibility.
- Fullscreen: chrome must remain usable (reparent under `fullscreenElement` when container; geometry from video rect).
- Fail quiet on extension context invalidation (`isContextInvalidated`).
- Commits: if git user unset, use  
  `git -c user.name="AnyLLMTranslate Agent" -c user.email="agent@anyllmtranslate.local" commit ...`
- Prefer `pnpm exec vitest run <path>` (or `npm test -- <path>` if pnpm unavailable).
- Do not modify MAIN-world interceptors for chrome v1.
- Do not add retry/re-translate/ASR/track picker to mini studio in this plan.

---

## File map

| File | Responsibility |
|------|----------------|
| Create: `content/playerChrome/types.ts` | Shared types, constants (idle ms, class names, status) |
| Create: `content/playerChrome/visibility.ts` | Pure soft-mirror state machine |
| Create: `content/playerChrome/host.ts` | Resolve player root + primary video + fullscreen parent |
| Create: `content/playerChrome/mountFloating.ts` | Floating anchor positioned from video/player rect |
| Create: `content/playerChrome/mountNative.ts` | Native adapter mount + disconnect observer |
| Create: `content/playerChrome/button.ts` | Icon button DOM inside shadow root |
| Create: `content/playerChrome/miniStudio.ts` | Panel DOM + control bindings |
| Create: `content/playerChrome/prefs.ts` | Read/write appearance, enable, knobs, glossary via existing APIs |
| Create: `content/playerChrome/fullscreen.ts` | Fullscreen listeners + reparent helper |
| Create: `content/playerChrome/adapters/types.ts` | `PlayerChromeAdapter` contract |
| Create: `content/playerChrome/adapters/registry.ts` | Hostname → adapter |
| Create: `content/playerChrome/adapters/youtube.ts` | Phase 2 native YouTube |
| Create: `content/playerChrome/adapters/udemy.ts` | Phase 3 native Udemy |
| Create: `content/playerChrome/adapters/coursera.ts` | Phase 3 native Coursera |
| Create: `content/playerChrome/index.ts` | `startPlayerChrome()` / cleanup lifecycle |
| Create: `content/__tests__/playerChrome/visibility.test.ts` | Visibility transitions |
| Create: `content/__tests__/playerChrome/mountFallback.test.ts` | Native → floating fallback |
| Create: `content/__tests__/playerChrome/prefs.test.ts` | Prefs wiring mocks |
| Create: `content/__tests__/playerChrome/miniStudio.test.ts` | Panel actions + sticky open |
| Create: `content/__tests__/playerChrome/youtubeAdapter.test.ts` | YouTube fixture mount (Phase 2) |
| Modify: `entrypoints/content.ts` | Start/stop player chrome with coordinator |
| Modify: `styles/subtitle.css` (or Create `styles/playerChrome.css` imported from content) | Base tokens if needed outside shadow; prefer shadow-injected CSS in modules |
| Modify: `README.md` | One short bullet under subtitle features |

**Do not modify for Phase 1:** MAIN inject handlers, Options Subtitle Studio, popup QuickSettings (reuse paths only), `subtitleOverlay` cue rendering logic beyond calling existing `updateConfig`.

---

### Task 1: Types + visibility state machine (TDD)

**Files:**
- Create: `content/playerChrome/types.ts`
- Create: `content/playerChrome/visibility.ts`
- Create: `content/__tests__/playerChrome/visibility.test.ts`

**Interfaces:**
- Produces:
  - `export const PLAYER_CHROME_IDLE_HIDE_MS = 2500`
  - `export const PLAYER_CHROME_HOST_CLASS = 'anyllm-player-chrome-host'`
  - `export const PLAYER_CHROME_BUTTON_CLASS = 'anyllm-player-chrome-btn'`
  - `export const PLAYER_CHROME_PANEL_CLASS = 'anyllm-player-chrome-panel'`
  - `export type ChromeVisualState = 'hidden' | 'shown' | 'shownForced'`
  - `export type ChromeStatus = 'idle' | 'waiting' | 'translating' | 'error' | 'disabled'`
  - `export type VisibilityEvent =`
    - `{ type: 'activity' }`
    - `{ type: 'adapterVisible'; visible: boolean }`
    - `{ type: 'idleTick'; nowMs: number }`
    - `{ type: 'panelOpened' }`
    - `{ type: 'panelClosed'; pointerOverPlayer: boolean; nowMs: number }`
    - `{ type: 'teardown' }`
  - `export interface VisibilityState { visual: ChromeVisualState; lastActivityMs: number; destroyed: boolean }`
  - `export function createVisibilityState(nowMs?: number): VisibilityState`
  - `export function reduceVisibility(state: VisibilityState, event: VisibilityEvent, idleMs?: number): VisibilityState`

- [ ] **Step 1: Write the failing unit test**

Create `content/__tests__/playerChrome/visibility.test.ts`:

```ts
/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from 'vitest';
import {
  createVisibilityState,
  reduceVisibility,
  PLAYER_CHROME_IDLE_HIDE_MS,
} from '@/content/playerChrome/visibility';

describe('playerChrome visibility', () => {
  it('starts shown on first activity then hides after idle', () => {
    let s = createVisibilityState(0);
    expect(s.visual).toBe('hidden');
    s = reduceVisibility(s, { type: 'activity' });
    // activity should record time — feed now via idleTick pattern:
    s = reduceVisibility(s, { type: 'panelClosed', pointerOverPlayer: true, nowMs: 1000 });
    // Force known path: activity event must set shown
    s = createVisibilityState(0);
    s = reduceVisibility(s, { type: 'activity' });
    // Implement activity to set lastActivityMs from a clock: use overload — see implementation:
    // For test, use adapterVisible and idleTick only if activity lacks timestamp.
  });
});
```

**Replace the draft test above with this complete file** (authoritative):

```ts
/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from 'vitest';
import {
  createVisibilityState,
  reduceVisibility,
  PLAYER_CHROME_IDLE_HIDE_MS,
} from '@/content/playerChrome/visibility';

describe('reduceVisibility', () => {
  it('shows on activity and hides after idle timeout when panel closed', () => {
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
  });

  it('adapterVisible true shows; false hides when panel not forced', () => {
    let s = createVisibilityState(0);
    s = reduceVisibility(s, { type: 'adapterVisible', visible: true, nowMs: 50 });
    expect(s.visual).toBe('shown');
    s = reduceVisibility(s, { type: 'adapterVisible', visible: false, nowMs: 60 });
    expect(s.visual).toBe('hidden');
  });

  it('panel open forces shown and ignores idle hide', () => {
    let s = createVisibilityState(0);
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
  });

  it('panel close with pointer over player returns to shown and resets activity', () => {
    let s = createVisibilityState(0);
    s = reduceVisibility(s, { type: 'panelOpened' });
    s = reduceVisibility(s, {
      type: 'panelClosed',
      pointerOverPlayer: true,
      nowMs: 5000,
    });
    expect(s.visual).toBe('shown');
    expect(s.lastActivityMs).toBe(5000);
  });

  it('panel close without pointer hides', () => {
    let s = createVisibilityState(0);
    s = reduceVisibility(s, { type: 'panelOpened' });
    s = reduceVisibility(s, {
      type: 'panelClosed',
      pointerOverPlayer: false,
      nowMs: 5000,
    });
    expect(s.visual).toBe('hidden');
  });

  it('teardown marks destroyed and stays destroyed', () => {
    let s = createVisibilityState(0);
    s = reduceVisibility(s, { type: 'activity', nowMs: 1 });
    s = reduceVisibility(s, { type: 'teardown' });
    expect(s.destroyed).toBe(true);
    s = reduceVisibility(s, { type: 'activity', nowMs: 2 });
    expect(s.destroyed).toBe(true);
    expect(s.visual).toBe('hidden');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run content/__tests__/playerChrome/visibility.test.ts`

Expected: FAIL (module not found / exports missing)

- [ ] **Step 3: Implement types + visibility**

Create `content/playerChrome/types.ts`:

```ts
export const PLAYER_CHROME_IDLE_HIDE_MS = 2500;
export const PLAYER_CHROME_HOST_CLASS = 'anyllm-player-chrome-host';
export const PLAYER_CHROME_BUTTON_CLASS = 'anyllm-player-chrome-btn';
export const PLAYER_CHROME_PANEL_CLASS = 'anyllm-player-chrome-panel';

export type ChromeVisualState = 'hidden' | 'shown' | 'shownForced';
export type ChromeStatus = 'idle' | 'waiting' | 'translating' | 'error' | 'disabled';

export type MountMode = 'native' | 'floating';
```

Create `content/playerChrome/visibility.ts`:

```ts
import { PLAYER_CHROME_IDLE_HIDE_MS } from './types';

export { PLAYER_CHROME_IDLE_HIDE_MS } from './types';

export type ChromeVisualState = 'hidden' | 'shown' | 'shownForced';

export type VisibilityEvent =
  | { type: 'activity'; nowMs: number }
  | { type: 'adapterVisible'; visible: boolean; nowMs: number }
  | { type: 'idleTick'; nowMs: number }
  | { type: 'panelOpened' }
  | { type: 'panelClosed'; pointerOverPlayer: boolean; nowMs: number }
  | { type: 'teardown' };

export interface VisibilityState {
  visual: ChromeVisualState;
  lastActivityMs: number;
  destroyed: boolean;
  panelOpen: boolean;
}

export function createVisibilityState(nowMs = 0): VisibilityState {
  return {
    visual: 'hidden',
    lastActivityMs: nowMs,
    destroyed: false,
    panelOpen: false,
  };
}

export function reduceVisibility(
  state: VisibilityState,
  event: VisibilityEvent,
  idleMs: number = PLAYER_CHROME_IDLE_HIDE_MS,
): VisibilityState {
  if (state.destroyed && event.type !== 'teardown') {
    return { ...state, visual: 'hidden' };
  }

  switch (event.type) {
    case 'teardown':
      return { ...state, destroyed: true, panelOpen: false, visual: 'hidden' };

    case 'panelOpened':
      return { ...state, panelOpen: true, visual: 'shownForced' };

    case 'panelClosed': {
      if (event.pointerOverPlayer) {
        return {
          ...state,
          panelOpen: false,
          visual: 'shown',
          lastActivityMs: event.nowMs,
        };
      }
      return { ...state, panelOpen: false, visual: 'hidden' };
    }

    case 'activity': {
      if (state.panelOpen) {
        return {
          ...state,
          lastActivityMs: event.nowMs,
          visual: 'shownForced',
        };
      }
      return {
        ...state,
        lastActivityMs: event.nowMs,
        visual: 'shown',
      };
    }

    case 'adapterVisible': {
      if (state.panelOpen) {
        return { ...state, visual: 'shownForced', lastActivityMs: event.nowMs };
      }
      if (event.visible) {
        return { ...state, visual: 'shown', lastActivityMs: event.nowMs };
      }
      return { ...state, visual: 'hidden' };
    }

    case 'idleTick': {
      if (state.panelOpen) return { ...state, visual: 'shownForced' };
      if (state.visual === 'hidden') return state;
      if (event.nowMs - state.lastActivityMs >= idleMs) {
        return { ...state, visual: 'hidden' };
      }
      return state;
    }

    default:
      return state;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run content/__tests__/playerChrome/visibility.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add content/playerChrome/types.ts content/playerChrome/visibility.ts content/__tests__/playerChrome/visibility.test.ts
git commit -m "$(cat <<'EOF'
feat(player-chrome): add soft-mirror visibility state machine

Pure reducer for icon show/hide with sticky open panel and idle timeout.
EOF
)"
```

---

### Task 2: Adapter types, registry, host helpers (TDD)

**Files:**
- Create: `content/playerChrome/adapters/types.ts`
- Create: `content/playerChrome/adapters/registry.ts`
- Create: `content/playerChrome/host.ts`
- Create: `content/__tests__/playerChrome/host.test.ts`

**Interfaces:**
- Produces:
  - `export interface PlayerChromeAdapter { id: string; match(hostname: string): boolean; findNativeMount(doc: Document): HTMLElement | null; isControlsVisible?(doc: Document): boolean | null; findPlayerRoot?(doc: Document): HTMLElement | null; }`
  - `export function getPlayerChromeAdapter(hostname: string): PlayerChromeAdapter | null`
  - `export function resolvePlayerTargets(doc?: Document): { video: HTMLVideoElement | null; playerRoot: HTMLElement | null; adapter: PlayerChromeAdapter | null }`
  - `export function getFullscreenMountParent(doc?: Document): Element | null` — returns container fullscreen element if not `HTMLVideoElement`, else null (caller uses popover/body strategy)

- [ ] **Step 1: Write failing tests**

Create `content/__tests__/playerChrome/host.test.ts`:

```ts
/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { resolvePlayerTargets, getFullscreenMountParent } from '@/content/playerChrome/host';
import { getPlayerChromeAdapter } from '@/content/playerChrome/adapters/registry';

describe('playerChrome host', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('resolvePlayerTargets returns null video when none', () => {
    const r = resolvePlayerTargets(document);
    expect(r.video).toBeNull();
  });

  it('resolvePlayerTargets picks primary video and optional player root', () => {
    const v = document.createElement('video');
    Object.defineProperty(v, 'readyState', { value: 2 });
    Object.defineProperty(v, 'getBoundingClientRect', {
      value: () => ({ width: 640, height: 360, top: 0, left: 0, bottom: 360, right: 640, x: 0, y: 0, toJSON: () => ({}) }),
    });
    document.body.appendChild(v);
    const r = resolvePlayerTargets(document);
    expect(r.video).toBe(v);
    expect(r.playerRoot === v || r.playerRoot instanceof HTMLElement).toBe(true);
  });

  it('getFullscreenMountParent returns container element not video', () => {
    const shell = document.createElement('div');
    document.body.appendChild(shell);
    Object.defineProperty(document, 'fullscreenElement', {
      configurable: true,
      get: () => shell,
    });
    expect(getFullscreenMountParent(document)).toBe(shell);
    Object.defineProperty(document, 'fullscreenElement', {
      configurable: true,
      get: () => null,
    });
  });

  it('getPlayerChromeAdapter returns null when no adapters registered (phase 1)', () => {
    expect(getPlayerChromeAdapter('www.example.com')).toBeNull();
  });
});
```

- [ ] **Step 2: Run test — expect FAIL**

Run: `pnpm exec vitest run content/__tests__/playerChrome/host.test.ts`

- [ ] **Step 3: Implement**

`content/playerChrome/adapters/types.ts`:

```ts
export interface PlayerChromeAdapter {
  id: string;
  match(hostname: string): boolean;
  findNativeMount(doc: Document): HTMLElement | null;
  isControlsVisible?(doc: Document): boolean | null;
  findPlayerRoot?(doc: Document): HTMLElement | null;
}
```

`content/playerChrome/adapters/registry.ts`:

```ts
import type { PlayerChromeAdapter } from './types';

/** Phase 1: empty. Phase 2+ push youtube/udemy/coursera adapters here. */
const ADAPTERS: PlayerChromeAdapter[] = [];

export function getPlayerChromeAdapter(hostname: string): PlayerChromeAdapter | null {
  const host = hostname.toLowerCase();
  for (const adapter of ADAPTERS) {
    if (adapter.match(host)) return adapter;
  }
  return null;
}

/** Test-only: replace adapters list. */
export function __setPlayerChromeAdaptersForTest(adapters: PlayerChromeAdapter[]): void {
  ADAPTERS.length = 0;
  ADAPTERS.push(...adapters);
}
```

`content/playerChrome/host.ts`:

```ts
import { findPrimaryVideo } from '@/lib/findPrimaryVideo';
import { getPlayerChromeAdapter } from './adapters/registry';
import type { PlayerChromeAdapter } from './adapters/types';

export function resolvePlayerTargets(doc: Document = document): {
  video: HTMLVideoElement | null;
  playerRoot: HTMLElement | null;
  adapter: PlayerChromeAdapter | null;
} {
  const adapter = getPlayerChromeAdapter(doc.defaultView?.location.hostname ?? location.hostname);
  const video = findPrimaryVideo(doc);
  let playerRoot: HTMLElement | null = null;
  if (adapter?.findPlayerRoot) {
    playerRoot = adapter.findPlayerRoot(doc);
  }
  if (!playerRoot && video) {
    playerRoot =
      (video.closest('.html5-video-player, .video-js, [class*="player"]') as HTMLElement | null) ??
      (video.parentElement as HTMLElement | null) ??
      video;
  }
  return { video, playerRoot, adapter };
}

type FullscreenDocument = Document & {
  webkitFullscreenElement?: Element | null;
  mozFullScreenElement?: Element | null;
  msFullscreenElement?: Element | null;
};

export function getActiveFullscreenElement(doc: Document = document): Element | null {
  const d = doc as FullscreenDocument;
  return (
    doc.fullscreenElement ??
    d.webkitFullscreenElement ??
    d.mozFullScreenElement ??
    d.msFullscreenElement ??
    null
  );
}

/** Container fullscreen parent suitable for appending chrome; null if none or bare video. */
export function getFullscreenMountParent(doc: Document = document): Element | null {
  const el = getActiveFullscreenElement(doc);
  if (!el) return null;
  if (el instanceof HTMLVideoElement) return null;
  return el;
}
```

- [ ] **Step 4: Run tests — expect PASS**

Run: `pnpm exec vitest run content/__tests__/playerChrome/host.test.ts`

- [ ] **Step 5: Commit**

```bash
git add content/playerChrome/adapters content/playerChrome/host.ts content/__tests__/playerChrome/host.test.ts
git commit -m "$(cat <<'EOF'
feat(player-chrome): add host targeting and empty adapter registry

Resolve primary video/player root and fullscreen container parent.
EOF
)"
```

---

### Task 3: Prefs bridge (TDD)

**Files:**
- Create: `content/playerChrome/prefs.ts`
- Create: `content/__tests__/playerChrome/prefs.test.ts`

**Interfaces:**
- Produces:
  - `export interface MiniStudioSnapshot { enabled: boolean; displayMode: 'bilingual' | 'translation-only'; fontSize: number; position: 'top' | 'bottom'; backgroundOpacity: number; knobs: Partial<ProfileKnobs>; lists: NamedGlossaryList[]; activeListId: string | null; hostname: string; status: ChromeStatus }`
  - `export async function loadMiniStudioSnapshot(): Promise<MiniStudioSnapshot>`
  - `export async function setSubtitlesEnabled(enabled: boolean): Promise<void>` — sets `subtitleSettings.enabled`; if enabling and current handler platform is in `disabledSubtitleSites`, remove it
  - `export async function setAppearance(partial: { fontSize?: number; position?: 'top' | 'bottom'; backgroundOpacity?: number; displayMode?: 'bilingual' | 'translation-only' }): Promise<void>` — `updateSettings` subtitleSettings + `updateConfig` live
  - `export function setTabKnob(knob: keyof ProfileKnobs, value: string): void` — dispatches same in-page path as popup: call coordinator via `chrome.runtime` is wrong from content; **directly** reuse message handler by posting to self OR export a small function. Implementation: send `chrome.runtime.sendMessage` is for background — popup uses `tabs.sendMessage`. From content script, call an exported helper. **Add** `export function applySubtitleKnobOverride(knobs: Partial<ProfileKnobs> | null): void` in `content/subtitleCoordinator.ts` that sets `state.subtitleKnobOverride`, and have existing message handler call it. Prefs calls that helper.
  - `export async function setActiveGlossaryList(listId: string | null): Promise<void>` — `setSiteListSelection` + `updateSettings`
  - `export function getChromeStatus(): ChromeStatus` — `disabled` if `!enabled`; else `translating` if `isInOverlayMode()`; else `idle` (waiting optional later)

- [ ] **Step 1: Write failing prefs tests**

```ts
/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const loadSettings = vi.fn();
const updateSettings = vi.fn();
const updateConfig = vi.fn();
const isInOverlayMode = vi.fn();
const applySubtitleKnobOverride = vi.fn();
const detectCurrentHandler = vi.fn();

vi.mock('@/lib/config', () => ({
  loadSettings: (...a: unknown[]) => loadSettings(...a),
  updateSettings: (...a: unknown[]) => updateSettings(...a),
}));

vi.mock('@/content/subtitleOverlay', () => ({
  updateConfig: (...a: unknown[]) => updateConfig(...a),
  getConfig: () => ({
    fontSize: 20,
    position: 'bottom',
    backgroundOpacity: 0.75,
    displayMode: 'bilingual',
  }),
}));

vi.mock('@/content/subtitleCoordinator', () => ({
  isInOverlayMode: (...a: unknown[]) => isInOverlayMode(...a),
  applySubtitleKnobOverride: (...a: unknown[]) => applySubtitleKnobOverride(...a),
}));

vi.mock('@/inject/subtitleHandlers/registry', () => ({
  detectCurrentHandler: (...a: unknown[]) => detectCurrentHandler(...a),
}));

import {
  loadMiniStudioSnapshot,
  setSubtitlesEnabled,
  setAppearance,
  setTabKnob,
  setActiveGlossaryList,
  getChromeStatus,
} from '@/content/playerChrome/prefs';

describe('playerChrome prefs', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    loadSettings.mockResolvedValue({
      subtitleSettings: {
        enabled: false,
        fontSize: 18,
        position: 'bottom',
        backgroundOpacity: 0.5,
        displayMode: 'bilingual',
        disabledSubtitleSites: ['youtube'],
        knobOverrides: {},
      },
      namedGlossaryLists: [{ id: 'l1', name: 'Show', entries: [], updatedAt: 1 }],
      subtitleListBySite: {},
    });
    updateSettings.mockImplementation(async (p: unknown) => p);
    detectCurrentHandler.mockReturnValue({ platform: 'youtube' });
    isInOverlayMode.mockReturnValue(false);
  });

  it('loadMiniStudioSnapshot maps settings', async () => {
    const snap = await loadMiniStudioSnapshot();
    expect(snap.enabled).toBe(false);
    expect(snap.fontSize).toBe(18);
    expect(snap.lists).toHaveLength(1);
    expect(snap.status).toBe('disabled');
  });

  it('setSubtitlesEnabled true clears site disable and sets enabled', async () => {
    await setSubtitlesEnabled(true);
    expect(updateSettings).toHaveBeenCalled();
    const arg = updateSettings.mock.calls[0][0] as {
      subtitleSettings: { enabled: boolean; disabledSubtitleSites: string[] };
    };
    expect(arg.subtitleSettings.enabled).toBe(true);
    expect(arg.subtitleSettings.disabledSubtitleSites).not.toContain('youtube');
  });

  it('setAppearance updates settings and live overlay config', async () => {
    await setAppearance({ fontSize: 22, displayMode: 'translation-only' });
    expect(updateSettings).toHaveBeenCalled();
    expect(updateConfig).toHaveBeenCalledWith(
      expect.objectContaining({ fontSize: 22, displayMode: 'translation-only' }),
    );
  });

  it('setTabKnob auto clears key via applySubtitleKnobOverride', () => {
    setTabKnob('faithfulness', 'literal');
    expect(applySubtitleKnobOverride).toHaveBeenCalledWith({ faithfulness: 'literal' });
    setTabKnob('faithfulness', 'auto');
    expect(applySubtitleKnobOverride).toHaveBeenCalledWith({});
  });

  it('setActiveGlossaryList writes subtitleListBySite', async () => {
    await setActiveGlossaryList('l1');
    expect(updateSettings).toHaveBeenCalledWith(
      expect.objectContaining({
        subtitleListBySite: expect.any(Object),
      }),
    );
  });

  it('getChromeStatus reflects overlay mode', () => {
    loadSettings.mockResolvedValue({
      subtitleSettings: { enabled: true },
    });
    // getChromeStatus is sync using last known or isInOverlayMode only:
    isInOverlayMode.mockReturnValue(true);
    // Implementation: getChromeStatus({ enabled: true }) or sync via isInOverlayMode + param
  });
});
```

Refine the last test in implementation to:

```ts
  it('getChromeStatus reflects enabled and overlay', () => {
    expect(getChromeStatus({ enabled: false, overlayActive: false })).toBe('disabled');
    expect(getChromeStatus({ enabled: true, overlayActive: false })).toBe('idle');
    expect(getChromeStatus({ enabled: true, overlayActive: true })).toBe('translating');
  });
```

- [ ] **Step 2: Run — expect FAIL**

- [ ] **Step 3: Implement coordinator export + prefs**

In `content/subtitleCoordinator.ts`, near knob message handling, add:

```ts
export function applySubtitleKnobOverride(knobs: Partial<ProfileKnobs> | null | undefined): void {
  state.subtitleKnobOverride = knobs ?? undefined;
}

export function getSubtitleKnobOverride(): Partial<ProfileKnobs> {
  return state.subtitleKnobOverride ?? {};
}
```

Change message handler to:

```ts
if (msg.action === 'setSubtitleKnobOverride') {
  const o = (message as { knobOverrides?: Partial<ProfileKnobs> | null }).knobOverrides;
  applySubtitleKnobOverride(o);
}
if (msg.action === 'getSubtitleKnobOverride') {
  _sendResponse({ knobOverrides: getSubtitleKnobOverride() });
}
```

Implement `content/playerChrome/prefs.ts`:

```ts
import { loadSettings, updateSettings } from '@/lib/config';
import { updateConfig } from '@/content/subtitleOverlay';
import {
  applySubtitleKnobOverride,
  getSubtitleKnobOverride,
  isInOverlayMode,
} from '@/content/subtitleCoordinator';
import { detectCurrentHandler } from '@/inject/subtitleHandlers/registry';
import {
  resolveActiveSubtitleListId,
  setSiteListSelection,
  normalizeSubtitleSiteHost,
} from '@/lib/namedGlossaryLists';
import type { ProfileKnobs } from '@/lib/subtitleProfiles';
import type { NamedGlossaryList, SubtitleDisplayMode } from '@/types/config';
import type { ChromeStatus } from './types';
import { isContextInvalidated } from '@/lib/utils';

export interface MiniStudioSnapshot {
  enabled: boolean;
  displayMode: SubtitleDisplayMode;
  fontSize: number;
  position: 'top' | 'bottom';
  backgroundOpacity: number;
  knobs: Partial<ProfileKnobs>;
  lists: NamedGlossaryList[];
  activeListId: string | null;
  hostname: string;
  status: ChromeStatus;
}

export function getChromeStatus(args: {
  enabled: boolean;
  overlayActive: boolean;
}): ChromeStatus {
  if (!args.enabled) return 'disabled';
  if (args.overlayActive) return 'translating';
  return 'idle';
}

export async function loadMiniStudioSnapshot(): Promise<MiniStudioSnapshot> {
  const hostname = normalizeSubtitleSiteHost(location.hostname);
  if (isContextInvalidated()) {
    return {
      enabled: false,
      displayMode: 'bilingual',
      fontSize: 20,
      position: 'bottom',
      backgroundOpacity: 0.75,
      knobs: {},
      lists: [],
      activeListId: null,
      hostname,
      status: 'disabled',
    };
  }
  const settings = await loadSettings();
  const ss = settings.subtitleSettings;
  const activeListId = resolveActiveSubtitleListId(
    settings.namedGlossaryLists,
    settings.subtitleListBySite,
    hostname,
  );
  return {
    enabled: ss.enabled,
    displayMode: ss.displayMode,
    fontSize: ss.fontSize,
    position: ss.position,
    backgroundOpacity: ss.backgroundOpacity,
    knobs: { ...getSubtitleKnobOverride() },
    lists: settings.namedGlossaryLists ?? [],
    activeListId,
    hostname,
    status: getChromeStatus({
      enabled: ss.enabled,
      overlayActive: isInOverlayMode(),
    }),
  };
}

export async function setSubtitlesEnabled(enabled: boolean): Promise<void> {
  if (isContextInvalidated()) return;
  const settings = await loadSettings();
  const ss = { ...settings.subtitleSettings, enabled };
  if (enabled) {
    const platform = detectCurrentHandler()?.platform;
    if (platform) {
      ss.disabledSubtitleSites = (ss.disabledSubtitleSites ?? []).filter((p) => p !== platform);
    }
  }
  await updateSettings({ subtitleSettings: ss });
}

export async function setAppearance(partial: {
  fontSize?: number;
  position?: 'top' | 'bottom';
  backgroundOpacity?: number;
  displayMode?: SubtitleDisplayMode;
}): Promise<void> {
  if (isContextInvalidated()) return;
  const settings = await loadSettings();
  const next = { ...settings.subtitleSettings, ...partial };
  if (partial.fontSize != null) {
    next.fontSize = Math.max(12, Math.min(36, partial.fontSize));
  }
  if (partial.backgroundOpacity != null) {
    next.backgroundOpacity = Math.max(0, Math.min(1, partial.backgroundOpacity));
  }
  await updateSettings({ subtitleSettings: next });
  updateConfig({
    fontSize: next.fontSize,
    position: next.position,
    backgroundOpacity: next.backgroundOpacity,
    displayMode: next.displayMode,
  });
}

/** Maintain in-module knob map so sequential setTabKnob calls accumulate. */
let localKnobs: Partial<ProfileKnobs> = {};

export function hydrateLocalKnobs(knobs: Partial<ProfileKnobs>): void {
  localKnobs = { ...knobs };
}

export function setTabKnob(knob: keyof ProfileKnobs, value: string): void {
  if (value === 'auto') {
    const { [knob]: _removed, ...rest } = localKnobs;
    localKnobs = rest;
  } else {
    localKnobs = { ...localKnobs, [knob]: value } as Partial<ProfileKnobs>;
  }
  applySubtitleKnobOverride(Object.keys(localKnobs).length ? localKnobs : null);
}

export async function setActiveGlossaryList(listId: string | null): Promise<void> {
  if (isContextInvalidated()) return;
  const settings = await loadSettings();
  const hostname = normalizeSubtitleSiteHost(location.hostname);
  const subtitleListBySite = setSiteListSelection(
    settings.subtitleListBySite,
    hostname,
    listId,
  );
  await updateSettings({ subtitleListBySite });
}
```

- [ ] **Step 4: Fix tests for knob accumulation + run PASS**

Update `setTabKnob` test:

```ts
  it('setTabKnob auto clears key via applySubtitleKnobOverride', async () => {
    const { hydrateLocalKnobs, setTabKnob } = await import('@/content/playerChrome/prefs');
    hydrateLocalKnobs({});
    setTabKnob('faithfulness', 'literal');
    expect(applySubtitleKnobOverride).toHaveBeenCalledWith({ faithfulness: 'literal' });
    setTabKnob('faithfulness', 'auto');
    expect(applySubtitleKnobOverride).toHaveBeenCalledWith(null);
  });
```

Run: `pnpm exec vitest run content/__tests__/playerChrome/prefs.test.ts content/__tests__/subtitleCoordinator.test.ts`

Expected: PASS (coordinator tests still pass)

- [ ] **Step 5: Commit**

```bash
git add content/playerChrome/prefs.ts content/__tests__/playerChrome/prefs.test.ts content/subtitleCoordinator.ts
git commit -m "$(cat <<'EOF'
feat(player-chrome): wire mini studio prefs to existing settings paths

Enable, appearance, per-tab knobs, and glossary list without new schema.
EOF
)"
```

---

### Task 4: Floating mount + shadow button shell (TDD)

**Files:**
- Create: `content/playerChrome/mountFloating.ts`
- Create: `content/playerChrome/button.ts`
- Create: `content/__tests__/playerChrome/mountFallback.test.ts`

**Interfaces:**
- Produces:
  - `export interface ChromeShell { host: HTMLElement; shadow: ShadowRoot; button: HTMLButtonElement; setVisible(visible: boolean): void; setExpanded(expanded: boolean): void; destroy(): void; reposition(): void }`
  - `export function createFloatingShell(args: { playerRoot: HTMLElement; video: HTMLVideoElement; onToggle: () => void }): ChromeShell`
  - Floating host: `position: fixed; z-index: 2147483646; pointer-events: none` on host; button `pointer-events: auto`
  - Place near bottom-right of video rect with ~48px bottom offset and ~12px right inset
  - `setVisible(false)` sets `visibility/opacity` or `hidden` attribute without unmounting

- [ ] **Step 1: Write failing mount test**

```ts
/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createFloatingShell } from '@/content/playerChrome/mountFloating';
import { PLAYER_CHROME_HOST_CLASS, PLAYER_CHROME_BUTTON_CLASS } from '@/content/playerChrome/types';

describe('createFloatingShell', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('mounts host with shadow button and toggles visibility', () => {
    const root = document.createElement('div');
    document.body.appendChild(root);
    const video = document.createElement('video');
    Object.defineProperty(video, 'getBoundingClientRect', {
      value: () => ({
        top: 100, left: 100, bottom: 460, right: 740, width: 640, height: 360, x: 100, y: 100, toJSON: () => ({}),
      }),
    });
    root.appendChild(video);
    const onToggle = vi.fn();
    const shell = createFloatingShell({ playerRoot: root, video, onToggle });
    expect(document.querySelector(`.${PLAYER_CHROME_HOST_CLASS}`)).toBeTruthy();
    const btn = shell.shadow.querySelector(`.${PLAYER_CHROME_BUTTON_CLASS}`) as HTMLButtonElement;
    expect(btn).toBeTruthy();
    btn.click();
    expect(onToggle).toHaveBeenCalledTimes(1);
    shell.setVisible(false);
    expect(shell.host.style.opacity === '0' || shell.host.hidden || shell.host.style.visibility === 'hidden').toBe(true);
    shell.setVisible(true);
    shell.destroy();
    expect(document.querySelector(`.${PLAYER_CHROME_HOST_CLASS}`)).toBeNull();
  });
});
```

- [ ] **Step 2: Run — FAIL**

- [ ] **Step 3: Implement mountFloating + button**

`content/playerChrome/button.ts` — create button element with aria-label `"Subtitle translation settings"`, type button, class `PLAYER_CHROME_BUTTON_CLASS`, inner HTML simple “A⇄” or inline SVG monogram (brand cyan `#0ea5e9`).

`content/playerChrome/mountFloating.ts`:

```ts
import {
  PLAYER_CHROME_HOST_CLASS,
  PLAYER_CHROME_BUTTON_CLASS,
} from './types';
import { createChromeButton } from './button';

export interface ChromeShell {
  host: HTMLElement;
  shadow: ShadowRoot;
  button: HTMLButtonElement;
  setVisible(visible: boolean): void;
  setExpanded(expanded: boolean): void;
  destroy(): void;
  reposition(): void;
  getMountMode(): 'floating' | 'native';
}

const SHADOW_CSS = `
:host { all: initial; }
.wrap { pointer-events: none; }
.${PLAYER_CHROME_BUTTON_CLASS} {
  pointer-events: auto;
  width: 36px; height: 36px; border-radius: 999px;
  border: 1px solid rgba(255,255,255,0.18);
  background: rgba(9,9,11,0.82);
  color: #e4e4e7;
  display: inline-flex; align-items: center; justify-content: center;
  cursor: pointer;
  box-shadow: 0 4px 16px rgba(0,0,0,0.35);
  font: 600 12px/1 system-ui,sans-serif;
}
.${PLAYER_CHROME_BUTTON_CLASS}:hover { border-color: #0ea5e9; color: #fff; }
.${PLAYER_CHROME_BUTTON_CLASS}[aria-expanded="true"] {
  outline: 2px solid #0ea5e9; outline-offset: 2px;
}
`;

export function createFloatingShell(args: {
  playerRoot: HTMLElement;
  video: HTMLVideoElement;
  onToggle: () => void;
  mountParent?: Element | null;
}): ChromeShell {
  const host = document.createElement('div');
  host.className = PLAYER_CHROME_HOST_CLASS;
  host.style.cssText = 'position:fixed;z-index:2147483646;pointer-events:none;top:0;left:0;';
  const shadow = host.attachShadow({ mode: 'open' });
  const style = document.createElement('style');
  style.textContent = SHADOW_CSS;
  const wrap = document.createElement('div');
  wrap.className = 'wrap';
  const button = createChromeButton(args.onToggle);
  wrap.appendChild(button);
  shadow.append(style, wrap);
  const parent = args.mountParent ?? document.body;
  parent.appendChild(host);

  const reposition = (): void => {
    const rect = args.video.getBoundingClientRect();
    if (rect.width < 80 || rect.height < 80) {
      host.style.opacity = '0';
      return;
    }
    const bottom = window.innerHeight - rect.bottom + 48;
    const right = window.innerWidth - rect.right + 12;
    host.style.bottom = `${Math.max(8, bottom)}px`;
    host.style.right = `${Math.max(8, right)}px`;
    host.style.top = 'auto';
    host.style.left = 'auto';
  };
  reposition();

  return {
    host,
    shadow,
    button,
    getMountMode: () => 'floating',
    setVisible(visible: boolean) {
      host.style.opacity = visible ? '1' : '0';
      host.style.visibility = visible ? 'visible' : 'hidden';
      button.tabIndex = visible ? 0 : -1;
    },
    setExpanded(expanded: boolean) {
      button.setAttribute('aria-expanded', expanded ? 'true' : 'false');
    },
    destroy() {
      host.remove();
    },
    reposition,
  };
}
```

`content/playerChrome/button.ts`:

```ts
import { PLAYER_CHROME_BUTTON_CLASS } from './types';

export function createChromeButton(onToggle: () => void): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = PLAYER_CHROME_BUTTON_CLASS;
  button.setAttribute('aria-label', 'Subtitle translation settings');
  button.setAttribute('aria-expanded', 'false');
  button.title = 'AnyLLMTranslate subtitles';
  button.textContent = 'A⇄';
  button.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    onToggle();
  });
  return button;
}
```

- [ ] **Step 4: PASS tests + commit**

```bash
git add content/playerChrome/mountFloating.ts content/playerChrome/button.ts content/__tests__/playerChrome/mountFallback.test.ts
git commit -m "$(cat <<'EOF'
feat(player-chrome): add floating shadow-DOM control button

Fixed-position host tracks video rect with non-blocking pointer events.
EOF
)"
```

---

### Task 5: Mini studio panel UI + sticky open (TDD)

**Files:**
- Create: `content/playerChrome/miniStudio.ts`
- Create: `content/__tests__/playerChrome/miniStudio.test.ts`
- Modify: `content/playerChrome/mountFloating.ts` (attach panel container in shadow)

**Interfaces:**
- Produces:
  - `export interface MiniStudioControllers { open(): void; close(): void; isOpen(): boolean; refresh(): Promise<void>; destroy(): void }`
  - `export function attachMiniStudio(args: { shadow: ShadowRoot; anchorButton: HTMLButtonElement; onOpenChange: (open: boolean) => void }): MiniStudioControllers`
  - Panel contains: enable toggle, display mode segmented, font size range, position select, opacity range, 4 knob selects (auto + values), glossary select, status text, footer button “Open full Subtitle Studio”
  - Footer: `chrome.runtime.openOptionsPage()` if available, else `window.open(chrome.runtime.getURL('options.html'))`
  - Esc + outside click close (listen on document in capture phase while open)
  - Calls prefs functions on change; `refresh` reloads snapshot into controls

- [ ] **Step 1: Write failing miniStudio tests**

```ts
/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/content/playerChrome/prefs', () => ({
  loadMiniStudioSnapshot: vi.fn(async () => ({
    enabled: true,
    displayMode: 'bilingual',
    fontSize: 18,
    position: 'bottom',
    backgroundOpacity: 0.7,
    knobs: {},
    lists: [{ id: 'l1', name: 'Pack', entries: [], updatedAt: 1 }],
    activeListId: null,
    hostname: 'youtube.com',
    status: 'idle',
  })),
  setSubtitlesEnabled: vi.fn(async () => {}),
  setAppearance: vi.fn(async () => {}),
  setTabKnob: vi.fn(),
  hydrateLocalKnobs: vi.fn(),
  setActiveGlossaryList: vi.fn(async () => {}),
}));

import { attachMiniStudio } from '@/content/playerChrome/miniStudio';
import { PLAYER_CHROME_PANEL_CLASS } from '@/content/playerChrome/types';
import * as prefs from '@/content/playerChrome/prefs';

describe('attachMiniStudio', () => {
  it('opens panel, wires enable, closes on Escape', async () => {
    const host = document.createElement('div');
    const shadow = host.attachShadow({ mode: 'open' });
    document.body.appendChild(host);
    const btn = document.createElement('button');
    shadow.appendChild(btn);
    const onOpenChange = vi.fn();
    const studio = attachMiniStudio({ shadow, anchorButton: btn, onOpenChange });
    await studio.open();
    expect(onOpenChange).toHaveBeenCalledWith(true);
    const panel = shadow.querySelector(`.${PLAYER_CHROME_PANEL_CLASS}`) as HTMLElement;
    expect(panel).toBeTruthy();
    expect(panel.hidden).toBe(false);

    const enable = panel.querySelector('[data-action="enable"]') as HTMLInputElement;
    enable.checked = false;
    enable.dispatchEvent(new Event('change', { bubbles: true }));
    expect(prefs.setSubtitlesEnabled).toHaveBeenCalledWith(false);

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(studio.isOpen()).toBe(false);
    expect(onOpenChange).toHaveBeenCalledWith(false);
    studio.destroy();
  });
});
```

- [ ] **Step 2: FAIL then implement miniStudio.ts**

Implementation sketch (full file in repo during task):

- Build panel HTML structure with data-action hooks
- `open`: `panel.hidden=false`, load snapshot, hydrate knobs, `onOpenChange(true)`
- `close`: hide, `onOpenChange(false)`
- Listeners: change handlers call prefs; document keydown Escape; document pointerdown outside (composedPath includes panel or button → ignore)
- Style panel: dark zinc card, width ~280px, max-height 70vh, overflow auto, positioned above button via absolute within wrap
- Knobs options mirror popup: `auto`, plus each enum value
- Status line: `data-role="status"` text from snapshot.status

- [ ] **Step 3: PASS + commit**

```bash
git add content/playerChrome/miniStudio.ts content/__tests__/playerChrome/miniStudio.test.ts content/playerChrome/mountFloating.ts
git commit -m "$(cat <<'EOF'
feat(player-chrome): add on-player mini studio panel

Richer controls for enable, appearance, knobs, glossary, and options link.
EOF
)"
```

---

### Task 6: Lifecycle controller — visibility wiring + video observe

**Files:**
- Create: `content/playerChrome/index.ts`
- Create: `content/playerChrome/fullscreen.ts`
- Create: `content/__tests__/playerChrome/lifecycle.test.ts`

**Interfaces:**
- Produces:
  - `export function startPlayerChrome(): () => void`
  - Eligibility: `detectCurrentHandler()` non-null **OR** (`enableGenericSubtitleHandler` and a primary video exists). Phase 1 practical rule: if `detectCurrentHandler()` returns a handler (including generic when registered), and `resolvePlayerTargets().video`, start chrome.
  - Poll / MutationObserver for video appearance every 1s while eligible host, debounced
  - Wire: pointermove on playerRoot → `activity`; idle interval 500ms → `idleTick`; adapter `isControlsVisible` if present
  - Panel open/close → visibility events; apply `shell.setVisible(visual !== 'hidden')`
  - Fullscreen: on change, destroy+remount shell under `getFullscreenMountParent()` or body; call `reposition`
  - ResizeObserver on video → reposition
  - Cleanup removes all listeners/observers/shell

- [ ] **Step 1: Write lifecycle test (jsdom)**

```ts
/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@/inject/subtitleHandlers/registry', () => ({
  detectCurrentHandler: () => ({ platform: 'generic' }),
}));

vi.mock('@/content/playerChrome/prefs', () => ({
  loadMiniStudioSnapshot: vi.fn(async () => ({
    enabled: true,
    displayMode: 'bilingual',
    fontSize: 18,
    position: 'bottom',
    backgroundOpacity: 0.7,
    knobs: {},
    lists: [],
    activeListId: null,
    hostname: 'example.com',
    status: 'idle',
  })),
  setSubtitlesEnabled: vi.fn(),
  setAppearance: vi.fn(),
  setTabKnob: vi.fn(),
  hydrateLocalKnobs: vi.fn(),
  setActiveGlossaryList: vi.fn(),
}));

import { startPlayerChrome } from '@/content/playerChrome';
import { PLAYER_CHROME_HOST_CLASS } from '@/content/playerChrome/types';

describe('startPlayerChrome', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    document.body.innerHTML = '';
  });

  it('mounts when video present and cleans up', () => {
    const video = document.createElement('video');
    Object.defineProperty(video, 'readyState', { value: 2 });
    Object.defineProperty(video, 'getBoundingClientRect', {
      value: () => ({
        top: 0, left: 0, bottom: 360, right: 640, width: 640, height: 360, x: 0, y: 0, toJSON: () => ({}),
      }),
    });
    document.body.appendChild(video);
    const stop = startPlayerChrome();
    vi.advanceTimersByTime(0);
    expect(document.querySelector(`.${PLAYER_CHROME_HOST_CLASS}`)).toBeTruthy();
    stop();
    expect(document.querySelector(`.${PLAYER_CHROME_HOST_CLASS}`)).toBeNull();
  });
});
```

- [ ] **Step 2: Implement fullscreen.ts + index.ts**

`fullscreen.ts`: subscribe `fullscreenchange` + `webkitfullscreenchange`, invoke callback; return unsubscribe.

`index.ts` outline:

```ts
export function startPlayerChrome(): () => void {
  let stopped = false;
  let shell: ChromeShell | null = null;
  let studio: MiniStudioControllers | null = null;
  let vis = createVisibilityState(performance.now());
  // ... mountIfNeeded, applyVisual, wireActivity, idle timer, fullscreen unsub, mo
  return () => {
    stopped = true;
    vis = reduceVisibility(vis, { type: 'teardown' });
    studio?.destroy();
    shell?.destroy();
    // remove listeners
  };
}
```

Native mount path: if `adapter?.findNativeMount(doc)` returns node, create a thin host appended there (position static/relative) instead of floating — implement minimal `createNativeShell` in `mountNative.ts` now (even if no adapters) so Phase 2 only adds adapter. If native fails, floating.

`mountNative.ts`:

```ts
export function createNativeShell(args: {
  mountNode: HTMLElement;
  onToggle: () => void;
}): ChromeShell {
  // host position:relative; display:inline-flex; align into bar
  // same shadow button; reposition no-op or minor
}
```

Mount fallback test extension:

```ts
it('uses floating when native mount missing', () => {
  // already covered by floating create
});
```

Add to `mountFallback.test.ts` with `__setPlayerChromeAdaptersForTest`:

```ts
it('prefers native mount when adapter provides node', () => {
  const bar = document.createElement('div');
  bar.id = 'right-controls';
  document.body.appendChild(bar);
  __setPlayerChromeAdaptersForTest([{
    id: 'test',
    match: () => true,
    findNativeMount: () => bar,
  }]);
  // call internal chooseMount or startPlayerChrome with video
});
```

- [ ] **Step 3: PASS lifecycle tests**

- [ ] **Step 4: Commit**

```bash
git add content/playerChrome/index.ts content/playerChrome/fullscreen.ts content/playerChrome/mountNative.ts content/__tests__/playerChrome/lifecycle.test.ts content/__tests__/playerChrome/mountFallback.test.ts
git commit -m "$(cat <<'EOF'
feat(player-chrome): lifecycle with soft-mirror and fullscreen remount

Observe primary video, activity/idle visibility, and cleanup cleanly.
EOF
)"
```

---

### Task 7: Wire into content script + eligibility polish

**Files:**
- Modify: `entrypoints/content.ts`
- Modify: `README.md` (short feature bullet)
- Optional: Create bead via `bd create` if tracking required by project workflow

**Interfaces:**
- Consumes: `startPlayerChrome` from `@/content/playerChrome`
- Produces: chrome starts with coordinator; stops when content tears down coordinator

- [ ] **Step 1: Wire content.ts**

Near:

```ts
coordinatorCleanup = startCoordinator();
```

Add:

```ts
import { startPlayerChrome } from '@/content/playerChrome';

let playerChromeCleanup: (() => void) | null = null;
// after startCoordinator:
playerChromeCleanup = startPlayerChrome();
```

In existing cleanup paths that null `coordinatorCleanup`, also:

```ts
if (playerChromeCleanup) {
  try { playerChromeCleanup(); } catch { /* noop */ }
  playerChromeCleanup = null;
}
```

Search all `coordinatorCleanup` teardown sites in `entrypoints/content.ts` and mirror.

- [ ] **Step 2: README bullet under Video Subtitle Translation**

Add one line:

`- **In-player mini studio** — control-bar icon (native when available, else floating) opens enable/appearance/style/glossary controls; soft-hides with player chrome, including fullscreen.`

- [ ] **Step 3: Run focused tests + lint**

```bash
pnpm exec vitest run content/__tests__/playerChrome content/__tests__/subtitleCoordinator.test.ts
pnpm exec eslint content/playerChrome entrypoints/content.ts
```

Expected: PASS / 0 errors

- [ ] **Step 4: Commit**

```bash
git add entrypoints/content.ts README.md
git commit -m "$(cat <<'EOF'
feat(player-chrome): bootstrap in-player chrome from content script

Start and tear down mini studio host with the subtitle coordinator.
EOF
)"
```

---

### Task 8: Phase 2 — YouTube native adapter (TDD)

**Files:**
- Create: `content/playerChrome/adapters/youtube.ts`
- Modify: `content/playerChrome/adapters/registry.ts` — register youtube adapter
- Create: `content/__tests__/playerChrome/youtubeAdapter.test.ts`

**Interfaces:**
- Produces YouTube adapter:
  - `match`: hostname includes `youtube.com` or `youtu.be` or `youtube-nocookie.com`
  - `findNativeMount`: `doc.querySelector('.ytp-right-controls')` or `.ytp-chrome-controls .ytp-right-controls`
  - `findPlayerRoot`: `doc.querySelector('.html5-video-player')`
  - `isControlsVisible`: player root has class `ytp-autohide` → false; else if `.ytp-chrome-bottom` visible → true; if uncertain return `null`

- [ ] **Step 1: Fixture test**

```ts
/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from 'vitest';
import { youtubePlayerChromeAdapter } from '@/content/playerChrome/adapters/youtube';

describe('youtubePlayerChromeAdapter', () => {
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
    expect(youtubePlayerChromeAdapter.findPlayerRoot?.(document)?.classList.contains('html5-video-player')).toBe(true);
  });

  it('detects autohide', () => {
    document.body.innerHTML = `<div class="html5-video-player ytp-autohide"></div>`;
    expect(youtubePlayerChromeAdapter.isControlsVisible?.(document)).toBe(false);
  });
});
```

- [ ] **Step 2: Implement + register + PASS**

```ts
// adapters/youtube.ts
import type { PlayerChromeAdapter } from './types';

export const youtubePlayerChromeAdapter: PlayerChromeAdapter = {
  id: 'youtube',
  match(hostname) {
    const h = hostname.toLowerCase();
    return (
      h === 'youtu.be' ||
      h === 'youtube.com' ||
      h.endsWith('.youtube.com') ||
      h === 'youtube-nocookie.com' ||
      h.endsWith('.youtube-nocookie.com')
    );
  },
  findNativeMount(doc) {
    return (
      doc.querySelector<HTMLElement>('.ytp-right-controls') ??
      doc.querySelector<HTMLElement>('.ytp-chrome-controls .ytp-right-controls')
    );
  },
  findPlayerRoot(doc) {
    return doc.querySelector<HTMLElement>('.html5-video-player');
  },
  isControlsVisible(doc) {
    const player = this.findPlayerRoot?.(doc);
    if (!player) return null;
    if (player.classList.contains('ytp-autohide')) return false;
    return true;
  },
};
```

Register in registry `ADAPTERS` array: `youtubePlayerChromeAdapter` first.

- [ ] **Step 3: Commit**

```bash
git add content/playerChrome/adapters/youtube.ts content/playerChrome/adapters/registry.ts content/__tests__/playerChrome/youtubeAdapter.test.ts
git commit -m "$(cat <<'EOF'
feat(player-chrome): native YouTube control-bar adapter

Mount into ytp-right-controls with autohide-aware visibility.
EOF
)"
```

---

### Task 9: Phase 3 — Udemy + Coursera adapters (best-effort selectors)

**Files:**
- Create: `content/playerChrome/adapters/udemy.ts`
- Create: `content/playerChrome/adapters/coursera.ts`
- Modify: `content/playerChrome/adapters/registry.ts`
- Create: `content/__tests__/playerChrome/learningAdapters.test.ts`

**Notes:** Selectors must be validated manually; if uncertain, `findNativeMount` returns null (floating remains). Tests lock whatever selectors we ship.

Suggested starting selectors (adjust if live DOM differs before commit):

- Udemy: `[data-purpose="video-controls"]` or `.control-bar` right cluster — use fixture with a stable `data-anyllm-chrome-mount` only in tests; production query:

```ts
doc.querySelector<HTMLElement>('[data-purpose="video-controls"]') ??
doc.querySelector<HTMLElement>('.video-control-bar')
```

Prefer appending a small end-of-bar container rather than breaking progress bar.

- Coursera: `.rc-VideoControlsContainer` or `[data-testid="video-player-controls"]`

If live validation fails during implementation, ship adapter `match` + `findPlayerRoot` only and keep `findNativeMount` null with a code comment — floating still works. Do **not** block on perfect native.

- [ ] **Step 1: Tests for match + mount when fixture present**
- [ ] **Step 2: Implement adapters + register after youtube**
- [ ] **Step 3: Commit**

```bash
git commit -m "$(cat <<'EOF'
feat(player-chrome): Udemy and Coursera native mount adapters

Best-effort control-bar inject with floating fallback when selectors miss.
EOF
)"
```

---

### Task 10: Final verification + product note

**Files:** none required unless fixes

- [ ] **Step 1: Run full quality gates for touched areas**

```bash
pnpm exec vitest run content/__tests__/playerChrome content/__tests__/subtitleCoordinator.test.ts content/__tests__/subtitleOverlay.test.ts
pnpm exec eslint content/playerChrome entrypoints/content.ts content/subtitleCoordinator.ts
pnpm run compile
```

Expected: all pass, tsc clean

- [ ] **Step 2: Manual checklist (human or browser)**

1. YouTube watch: icon appears; click opens studio; font size changes overlay when captions on  
2. Disable via studio → pipeline stops accepting; icon remains  
3. Idle hide ~2.5s; open panel stays; Esc closes then idle hide resumes  
4. Fullscreen: icon still works  
5. Max or WeTV: floating icon works without native mount  

- [ ] **Step 3: Session close if this finishes the feature work**

Per project rules: commit remaining fixes, `bd` issue close if created, `git pull --rebase`, `bd dolt push`, `git push`.

---

## Spec coverage checklist (self-review)

| Spec requirement | Task |
|------------------|------|
| Hybrid mount | 4, 6, 8, 9 |
| Icon when player detected even if off | 6, 7 + prefs enable |
| Soft mirror + sticky panel | 1, 5, 6 |
| Mini studio richer set | 3, 5 |
| Fullscreen | 2, 6 |
| No new prefs schema | 3 |
| YouTube native | 8 |
| Udemy/Coursera native | 9 |
| Max/Youku/WeTV floating | 4–7 (no native adapters) |
| Tests visibility/mount/studio | 1, 4, 5, 6, 8 |
| Content bootstrap | 7 |

## Placeholder scan

No TBD/TODO left in tasks; selectors for Udemy/Coursera are best-effort with explicit floating fallback.

## Type consistency

- `ChromeShell`, `MiniStudioControllers`, `PlayerChromeAdapter`, `VisibilityState` / `reduceVisibility` names stable across tasks.
- `applySubtitleKnobOverride` / `getSubtitleKnobOverride` added on coordinator and used by prefs + existing messages.
- `getChromeStatus({ enabled, overlayActive })` pure helper.

---

## Execution handoff

Plan complete and saved to `docs/superpowers/plans/2026-07-31-player-subtitle-chrome.md`.

**Two execution options:**

1. **Subagent-Driven (recommended)** — fresh subagent per task, review between tasks  
2. **Inline Execution** — execute tasks in this session with executing-plans checkpoints  

Which approach?
