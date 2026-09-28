import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { TranslationModeCard } from '../subtitles/TranslationModeCard';
import { DEFAULT_SUBTITLE_SETTINGS } from '@/types/config';

describe('TranslationModeCard Plus toggle', () => {
  it('renders off by default and reports the change', () => {
    const onUpdate = vi.fn();
    render(
      <TranslationModeCard
        settings={{ ...DEFAULT_SUBTITLE_SETTINGS }}
        disabled={false}
        onUpdate={onUpdate}
      />,
    );
    const toggle = screen.getByLabelText('Full-track quality mode');
    expect(toggle).not.toBeChecked();
    fireEvent.click(toggle);
    expect(onUpdate).toHaveBeenCalledWith({ translationMode: 'plus' });
  });

  it('renders on when the setting is plus', () => {
    render(
      <TranslationModeCard
        settings={{ ...DEFAULT_SUBTITLE_SETTINGS, translationMode: 'plus' }}
        disabled={false}
        onUpdate={vi.fn()}
      />,
    );
    expect(screen.getByLabelText('Full-track quality mode')).toBeChecked();
  });

  it('dims and disables the toggle while subtitles are globally off', () => {
    render(
      <TranslationModeCard
        settings={{ ...DEFAULT_SUBTITLE_SETTINGS }}
        disabled
        onUpdate={vi.fn()}
      />,
    );
    expect(screen.getByLabelText('Full-track quality mode')).toBeDisabled();
  });
});