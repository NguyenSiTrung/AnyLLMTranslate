/**
 * DASH segment presentation-time offset extraction.
 *
 * Given an MPD body + base URL, enumerate subtitle segment URLs and map each to
 * its DASH presentation-time offset (SegmentTimeline t ÷ timescale), in ms.
 *
 * Offsets are the authoritative source for converting segment-relative WebVTT
 * cue timestamps (cues that restart near 0 in each segment) into absolute
 * timeline times. Without this, cues from every segment collapse into the
 * first few seconds and the overlay finds nothing at later playback positions.
 *
 * The offset math itself lives in maxMpdSubtitles.computeSegmentOffsetsMs; this
 * module is the thin public entry point that runs the full MPD parse + track
 * extraction and flattens the result into a URL→offset lookup.
 */
import { parseMpd, extractSubtitleTracks, type MpdSubtitleTrack } from '@/lib/maxMpdSubtitles';

export function buildSegmentOffsetMap(mpdBody: string, baseUrl: string): Map<string, number> {
  const map = new Map<string, number>();
  if (!mpdBody || mpdBody.trim().length === 0) return map;

  const mpdXml = parseMpd(mpdBody, baseUrl);
  if (!mpdXml) return map;

  const tracks = extractSubtitleTracks(mpdXml, baseUrl);
  for (const track of tracks) {
    fillFromTrack(track, map);
  }
  return map;
}

function fillFromTrack(track: MpdSubtitleTrack, map: Map<string, number>): void {
  const urls = track.segmentUrls ?? (track.url ? [track.url] : []);
  const offsets = track.segmentOffsetsMs ?? urls.map(() => 0);
  for (let i = 0; i < urls.length && i < offsets.length; i++) {
    if (!map.has(urls[i])) map.set(urls[i], offsets[i]);
  }
}
