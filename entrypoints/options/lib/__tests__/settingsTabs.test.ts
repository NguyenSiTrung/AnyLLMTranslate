/**
 * Tests: shared settings-tab registry — group ordering and generalized
 * `?section=` deep-link resolution for the options page.
 */
import { describe, expect, it } from 'vitest';
import {
  ALL_TAB_IDS,
  TAB_GROUPS,
  resolveRequestedSettingsTab,
} from '../settingsTabs';

describe('settingsTabs', () => {
  it('places Speech and PDF in Media after Subtitles', () => {
    expect(
      TAB_GROUPS.find((group) => group.label === 'MEDIA')?.tabs.map((tab) => tab.id),
    ).toEqual(['subtitles', 'speech', 'pdf']);
  });

  it('deep-links ?section=pdf to the PDF tab', () => {
    expect(resolveRequestedSettingsTab('pdf')).toBe('pdf');
  });

  it('resolves every known section and rejects invalid values', () => {
    for (const id of ALL_TAB_IDS) {
      expect(resolveRequestedSettingsTab(id)).toBe(id);
    }
    expect(resolveRequestedSettingsTab('unknown')).toBeNull();
    expect(resolveRequestedSettingsTab(null)).toBeNull();
  });
});
