import { describe, it, expect } from 'vitest';
import { shouldTeardownSubtitleSession } from '@/lib/subtitleTeardown';
import type { SubtitleSettings } from '@/types/config';

function settings(overrides: Partial<SubtitleSettings> = {}): SubtitleSettings {
  return {
    position: 'bottom',
    fontSize: 16,
    fontSizeMode: 'fixed',
    backgroundOpacity: 0.7,
    enabled: true,
    fontFamily: 'system',
    stylePreset: 'classic',
    styleOverrides: {},
    displayMode: 'bilingual',
    translationTimeout: 30,
    preferredSubtitleLanguage: 'en',
    autoActivateSubtitles: false,
    disabledSubtitleSites: [],
    ...overrides,
  } as SubtitleSettings;
}

describe('shouldTeardownSubtitleSession', () => {
  it('tears down when subtitles are switched off', () => {
    expect(
      shouldTeardownSubtitleSession(settings({ enabled: true }), settings({ enabled: false }), 'hbomax'),
    ).toBe(true);
  });

  it('does not tear down when subtitles are switched on', () => {
    expect(
      shouldTeardownSubtitleSession(settings({ enabled: false }), settings({ enabled: true }), 'hbomax'),
    ).toBe(false);
  });

  it('tears down when the active platform is added to the disabled list', () => {
    expect(
      shouldTeardownSubtitleSession(
        settings({ disabledSubtitleSites: [] }),
        settings({ disabledSubtitleSites: ['hbomax'] }),
        'hbomax',
      ),
    ).toBe(true);
  });

  it('tears down when subtitles turn off and the platform is disabled at once', () => {
    expect(
      shouldTeardownSubtitleSession(
        settings({ enabled: true, disabledSubtitleSites: [] }),
        settings({ enabled: false, disabledSubtitleSites: ['hbomax'] }),
        'hbomax',
      ),
    ).toBe(true);
  });

  it('does not tear down when the platform was already disabled before the change', () => {
    expect(
      shouldTeardownSubtitleSession(
        settings({ disabledSubtitleSites: ['hbomax'] }),
        settings({ disabledSubtitleSites: ['hbomax', 'youtube'] }),
        'hbomax',
      ),
    ).toBe(false);
  });

  it('does not tear down when a different platform is disabled', () => {
    expect(
      shouldTeardownSubtitleSession(
        settings({ disabledSubtitleSites: [] }),
        settings({ disabledSubtitleSites: ['youtube'] }),
        'hbomax',
      ),
    ).toBe(false);
  });

  it('does not tear down for unrelated settings changes', () => {
    expect(
      shouldTeardownSubtitleSession(
        settings({ fontSize: 16 }),
        settings({ fontSize: 24, displayMode: 'translation-only' }),
        'hbomax',
      ),
    ).toBe(false);
  });

  it('treats a missing disabledSubtitleSites list as empty', () => {
    expect(
      shouldTeardownSubtitleSession(
        settings({ disabledSubtitleSites: undefined as unknown as string[] }),
        settings({ disabledSubtitleSites: ['hbomax'] }),
        'hbomax',
      ),
    ).toBe(true);
  });
});
