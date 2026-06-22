/**
 * Pick the largest visible <video> on the page (by layout area).
 * Used by DOM cue scraping and the subtitle overlay so both target the same element.
 */
export function findPrimaryVideo(doc: Document = document): HTMLVideoElement | null {
  const videos = Array.from(doc.querySelectorAll<HTMLVideoElement>('video'));
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