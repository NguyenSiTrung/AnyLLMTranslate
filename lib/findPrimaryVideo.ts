/**
 * Pick the largest visible <video> on the page (by layout area).
 * Used by DOM cue scraping and the subtitle overlay so both target the same element.
 * Filters by readyState >= 1 (HAVE_METADATA) and gives bonus score to videos with a src.
 */
export function findPrimaryVideo(doc: Document = document): HTMLVideoElement | null {
  const videos = Array.from(doc.querySelectorAll<HTMLVideoElement>('video'));
  if (videos.length === 0) return null;
  if (videos.length === 1) return videos[0];

  // Score by visible area × srcBonus, filtered by readyState
  const scored = videos
    .filter((v) => v.readyState >= 1) // HAVE_METADATA or more
    .map((v) => {
      const rect = v.getBoundingClientRect();
      const area = rect.width * rect.height;
      const srcBonus = v.currentSrc ? 2 : 1;
      return { video: v, score: area * srcBonus };
    })
    .sort((a, b) => b.score - a.score);

  return scored[0]?.video ?? null;
}