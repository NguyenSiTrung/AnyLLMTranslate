/** Fullscreen change subscription for player chrome remount. */

export function subscribeFullscreenChange(onChange: () => void): () => void {
  const handler = (): void => {
    onChange();
  };
  document.addEventListener('fullscreenchange', handler);
  document.addEventListener('webkitfullscreenchange', handler as EventListener);
  return () => {
    document.removeEventListener('fullscreenchange', handler);
    document.removeEventListener('webkitfullscreenchange', handler as EventListener);
  };
}
