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
  it('identifies itself as a name-extraction task (not a translator)', () => {
    const p = buildPreScanPrompt('vi', PROFILE_PRESETS.cinematic);
    expect(p.toLowerCase()).toContain('proper noun');
    expect(p).toContain('properNouns');
  });

  it('injects the target language and drops the placeholder', () => {
    const p = buildPreScanPrompt('vi', PROFILE_PRESETS.media);
    expect(p).not.toContain('{{targetLanguage}}');
  });

  it('carries profile knob instructions (cinematic → idiomatic)', () => {
    const p = buildPreScanPrompt('vi', PROFILE_PRESETS.cinematic);
    expect(p).toContain('idiomatic');
  });

  it('omits knob lines for media (all defaults)', () => {
    const p = buildPreScanPrompt('vi', PROFILE_PRESETS.media);
    expect(p).not.toContain('idiomatic');
    expect(p).not.toContain('how people actually talk');
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

  it('returns {} (not throw) when the service call fails', async () => {
    const svc = fakeService({ success: false, translations: new Map(), error: 'boom' });
    await expect(
      preScanNames(svc, 'en', 'vi', [cue('Hi')], PROFILE_PRESETS.media),
    ).resolves.toEqual({});
  });

  it('returns {} when the response has no properNouns field', async () => {
    const svc = fakeService({ success: true, translations: new Map() });
    await expect(
      preScanNames(svc, 'en', 'vi', [cue('Hi')], PROFILE_PRESETS.media),
    ).resolves.toEqual({});
  });

  it('returns {} when translate() throws', async () => {
    const svc: TranslationService = {
      translate: vi.fn().mockRejectedValue(new Error('network')),
      testConnection: vi.fn(),
    };
    await expect(
      preScanNames(svc, 'en', 'vi', [cue('Hi')], PROFILE_PRESETS.media),
    ).resolves.toEqual({});
  });

  it('returns {} for an empty cue set (no API call)', async () => {
    const svc = fakeService(okResponse({ X: 'Y' }));
    await expect(
      preScanNames(svc, 'en', 'vi', [], PROFILE_PRESETS.media),
    ).resolves.toEqual({});
    expect(svc.translate).not.toHaveBeenCalled();
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
