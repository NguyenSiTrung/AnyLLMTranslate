/** Per-site player chrome adapter contract. */

export interface PlayerChromeAdapter {
  id: string;
  match(hostname: string): boolean;
  /** Control-bar container to append the button into, or null if unavailable. */
  findNativeMount(doc: Document): HTMLElement | null;
  /** true/false when known; null → use activity heuristic. */
  isControlsVisible?(doc: Document): boolean | null;
  /** Player shell for floating geometry / activity bounds / fullscreen root hints. */
  findPlayerRoot?(doc: Document): HTMLElement | null;
}
