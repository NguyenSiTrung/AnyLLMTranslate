import { PLAYER_CHROME_IDLE_HIDE_MS, type ChromeVisualState } from './types';

export { PLAYER_CHROME_IDLE_HIDE_MS } from './types';
export type { ChromeVisualState } from './types';

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
