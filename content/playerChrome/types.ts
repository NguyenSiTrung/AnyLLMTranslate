/** Shared constants and types for in-player subtitle chrome. */

export const PLAYER_CHROME_IDLE_HIDE_MS = 2500;
export const PLAYER_CHROME_HOST_CLASS = 'anyllm-player-chrome-host';
export const PLAYER_CHROME_BUTTON_CLASS = 'anyllm-player-chrome-btn';
export const PLAYER_CHROME_PANEL_CLASS = 'anyllm-player-chrome-panel';

export type ChromeVisualState = 'hidden' | 'shown' | 'shownForced';
export type ChromeStatus = 'idle' | 'waiting' | 'translating' | 'error' | 'disabled';
export type MountMode = 'native' | 'floating';
