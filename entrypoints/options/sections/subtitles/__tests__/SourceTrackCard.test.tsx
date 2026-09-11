/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SourceTrackCard } from '@/entrypoints/options/sections/subtitles/SourceTrackCard';
import { DEFAULT_SUBTITLE_SETTINGS } from '@/types/config';
import { LANGUAGES } from '@/lib/languages';

function renderCard(overrides: Partial<typeof DEFAULT_SUBTITLE_SETTINGS> = {}) {
  const onUpdate = vi.fn();
  const utils = render(
    <SourceTrackCard
      settings={{ ...DEFAULT_SUBTITLE_SETTINGS, ...overrides }}
      disabled={false}
      onUpdate={onUpdate}
    />,
  );
  return { onUpdate, ...utils };
}

describe('SourceTrackCard — preferred source language', () => {
  it('offers an explicit Auto option alongside every catalog language (MAX-36)', () => {
    renderCard();

    const select = screen.getByRole('combobox') as HTMLSelectElement;
    const values = Array.from(select.options).map((option) => option.value);

    // 'auto' means "use whichever track the platform activated", which is the
    // only way to translate a track that does not match a fixed preference.
    expect(values).toContain('auto');
    expect(values.filter((value) => value === 'auto')).toHaveLength(1);
    expect(values).toHaveLength(LANGUAGES.length);
    expect(values).toContain('en');
    expect(values).toContain('nb');

    const autoOption = Array.from(select.options).find((option) => option.value === 'auto');
    expect(autoOption?.textContent).toMatch(/auto/i);
    expect(autoOption?.textContent).toMatch(/active track/i);
  });

  it('selecting Auto updates the preference and keeps English as the default', () => {
    const { onUpdate } = renderCard({ preferredSubtitleLanguage: 'en' });
    const select = screen.getByRole('combobox') as HTMLSelectElement;
    expect(select.value).toBe('en');

    fireEvent.change(select, { target: { value: 'auto' } });
    expect(onUpdate).toHaveBeenCalledWith({ preferredSubtitleLanguage: 'auto' });
  });
});
