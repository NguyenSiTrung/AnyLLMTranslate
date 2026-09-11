/**
 * Canonical platform-handler sets for the two extension worlds.
 *
 * Why this module exists: the MAIN world (entrypoints/inject.content) hooks
 * network traffic and stamps every intercepted payload with its handler's
 * `platform` id. The isolated world (entrypoints/content) resolves that id via
 * `getHandlerByPlatform()` and transforms the body. When a platform is
 * registered in only one world, its intercepted subtitles still reach the
 * coordinator but resolve to `null` and are silently passed through
 * untranslated — the Netflix/Disney+ bug. Keeping both lists here (built by one
 * ordered builder) lets `worldHandlers.test.ts` fail the build if they drift.
 *
 * Registration order is load-bearing: `detectCurrentHandler()` is
 * first-match-wins, so platform-specific handlers come first and
 * GenericSubtitleHandler is LAST. Its `detect()` returns false whenever any
 * earlier handler detects the host, which is also what keeps the generic URL
 * patterns off platform hosts.
 */

import type { SubtitleHandler } from './registry';
import { YouTubeHandler } from './youtube';
import { UdemyHandler } from './udemy';
import { CourseraHandler } from './coursera';
import { DeepLearningAiHandler } from './deepLearningAi';
import { LinkedInHandler } from './linkedin';
import { HboMaxHandler } from './hbomax';
import { YoukuHandler } from './youku';
import { NetflixHandler } from './netflix';
import { DisneyPlusHandler } from './disneyplus';
import { WetvHandler } from './wetv';
import { GenericSubtitleHandler } from './generic';

/** Named instances some entrypoints wire per-platform discovery against. */
export interface PlatformHandlerSet {
  handlers: SubtitleHandler[];
  youtubeHandler: YouTubeHandler;
  deepLearningAiHandler: DeepLearningAiHandler;
}

/**
 * Build a fresh, ordered handler set.
 *
 * Instances are created per call rather than shared: today the handlers are
 * stateless apart from their `platform` id, but per-world instances keep a
 * future stateful handler from leaking state between the MAIN and isolated
 * worlds.
 */
export function createPlatformHandlerSet(): PlatformHandlerSet {
  const youtubeHandler = new YouTubeHandler();
  const deepLearningAiHandler = new DeepLearningAiHandler();
  const handlers: SubtitleHandler[] = [
    youtubeHandler,
    new UdemyHandler(),
    new CourseraHandler(),
    deepLearningAiHandler,
    new LinkedInHandler(),
    new HboMaxHandler(),
    new YoukuHandler(),
    new NetflixHandler(),
    new DisneyPlusHandler(),
    new WetvHandler(),
    new GenericSubtitleHandler(), // LAST — lowest-priority fallback
  ];
  return { handlers, youtubeHandler, deepLearningAiHandler };
}

/**
 * Ordered handler list for the isolated (content-script) world.
 * Must contain the same platform ids, in the same order, as the MAIN world.
 */
export function createIsolatedWorldHandlers(): SubtitleHandler[] {
  return createPlatformHandlerSet().handlers;
}

/** Platform ids in registration (precedence) order. */
export function handlerPlatformIds(handlers: SubtitleHandler[]): string[] {
  return handlers.map((handler) => handler.platform);
}
