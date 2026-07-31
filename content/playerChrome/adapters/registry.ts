import type { PlayerChromeAdapter } from './types';

/** Phase 1 starts empty; Phase 2+ register youtube/udemy/coursera adapters. */
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
