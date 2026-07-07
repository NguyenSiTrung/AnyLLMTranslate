/**
 * Tests for the per-film proper-noun pre-scan call.
 * Sub-project 3.
 */
import { describe, it, expect, vi } from 'vitest';
import { preScanNames, buildPreScanPrompt } from '@/services/subtitleNameScanner';
import { PROFILE_PRESETS } from '@/lib/subtitleProfiles';
import type { TranslationService, TranslationResult } from '@/types/translation';
import type { SubtitleCue } from '@/types/subtitle';

const cue = (text: string): SubtitleCue => ({ startTime: 0, endTime: 1, text });

/** Build a fake TranslationService whose translate() returns a canned response. */
function fakeService(
  response: TranslationResult,
  capture?: { req?: unknown },
): TranslationService {
  return {
    translate: vi.fn(async (req) => {
      if (capture) capture.req = req;
      return response;
    }),
    testConnection: vi.fn(),
  };
}

const okResponse = (properNouns: Record<string, string>): TranslationResult => ({
  success: true,
  translations: new Map(),
  properNouns,
});

describe('buildPreScanPrompt', () => {
  it('is a name-extraction task that injects the target language and routes profile knobs', () => {
    // cinematic: identity + knob line present, placeholder dropped
    const cinematic = buildPreScanPrompt('vi', PROFILE_PRESETS.cinematic);
    expect(cinematic.toLowerCase()).toContain('proper noun');
    expect(cinematic).toContain('properNouns');
    expect(cinematic).not.toContain('{{targetLanguage}}');
    expect(cinematic).toContain('idiomatic');
    // media (all defaults): knob lines absent
    const media = buildPreScanPrompt('vi', PROFILE_PRESETS.media);
    expect(media).not.toContain('idiomatic');
    expect(media).not.toContain('how people actually talk');
  });
});

describe('preScanNames', () => {
  it('sends the deduplicated corpus in the user prompt', async () => {
    const captured: { req?: unknown } = {};
    const svc = fakeService(okResponse({ Dumbledore: 'Phù thủy' }), captured);
    const cues = [cue('Hello'), cue('Hello'), cue('World')];
    await preScanNames(svc, 'en', 'vi', cues, PROFILE_PRESETS.media);
    expect(svc.translate).toHaveBeenCalledTimes(1);
    const req = captured.req as { texts: Map<string, string> };
    const values = [...req.texts.values()];
    // deduped: "Hello" once, "World" once.
    expect(values.filter((v) => v === 'Hello')).toHaveLength(1);
    expect(values).toContain('World');
  });

  it('returns the parsed properNouns from the response', async () => {
    const svc = fakeService(okResponse({ Dumbledore: 'Phù thủy', Hogwarts: 'Hogwarts' }));
    const result = await preScanNames(svc, 'en', 'vi', [cue('Hi')], PROFILE_PRESETS.media);
    expect(result).toEqual({ Dumbledore: 'Phù thủy', Hogwarts: 'Hogwarts' });
  });

  it('returns {} (not throw) on any failure path (service-fail / no-properNouns / translate-throws / empty-cues)', async () => {
    // service returns failure
    const svcFail = fakeService({ success: false, translations: new Map(), error: 'boom' });
    await expect(preScanNames(svcFail, 'en', 'vi', [cue('Hi')], PROFILE_PRESETS.media)).resolves.toEqual({});

    // response has no properNouns field
    const svcNoNouns = fakeService({ success: true, translations: new Map() });
    await expect(preScanNames(svcNoNouns, 'en', 'vi', [cue('Hi')], PROFILE_PRESETS.media)).resolves.toEqual({});

    // translate() throws
    const svcThrow: TranslationService = {
      translate: vi.fn().mockRejectedValue(new Error('network')),
      testConnection: vi.fn(),
    };
    await expect(preScanNames(svcThrow, 'en', 'vi', [cue('Hi')], PROFILE_PRESETS.media)).resolves.toEqual({});

    // empty cue set → {} and no API call
    const svcEmpty = fakeService(okResponse({ X: 'Y' }));
    await expect(preScanNames(svcEmpty, 'en', 'vi', [], PROFILE_PRESETS.media)).resolves.toEqual({});
    expect(svcEmpty.translate).not.toHaveBeenCalled();
  });

  it('passes preScanSystemPrompt (not subtitleKnobs) on the request', async () => {
    const captured: { req?: unknown } = {};
    const svc = fakeService(okResponse({ A: 'B' }), captured);
    await preScanNames(svc, 'en', 'vi', [cue('Hi')], PROFILE_PRESETS.cinematic);
    const req = captured.req as { preScanSystemPrompt?: string; subtitleKnobs?: unknown };
    expect(req.preScanSystemPrompt).toBeTruthy();
    expect(req.subtitleKnobs).toBeUndefined();
  });
});
