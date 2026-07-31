import type { PlayerChromeAdapter } from './types';
import { youtubePlayerChromeAdapter } from './youtube';
import { udemyPlayerChromeAdapter } from './udemy';
import { courseraPlayerChromeAdapter } from './coursera';

/** Site adapters (first match wins). Floating fallback when native mount is null. */
const ADAPTERS: PlayerChromeAdapter[] = [
  youtubePlayerChromeAdapter,
  udemyPlayerChromeAdapter,
  courseraPlayerChromeAdapter,
];

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
