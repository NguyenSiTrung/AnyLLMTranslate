import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { CaptionQualityCard } from '../subtitles/CaptionQualityCard';
import { DEFAULT_SUBTITLE_SETTINGS } from '@/types/config';

vi.stubGlobal('chrome', {
  runtime: { sendMessage: vi.fn().mockResolvedValue({ success: true, entryCount: 0, totalBytes: 0 }), onMessage: { addListener: vi.fn(), removeListener: vi.fn() } },
});

describe('CaptionQualityCard Plus toggle', () => {
  it('renders off by default and reports the change', () => {
    const onUpdate = vi.fn();
    render(
      <CaptionQualityCard settings={{ ...DEFAULT_SUBTITLE_SETTINGS }} disabled={false} onUpdate={onUpdate} />,
    );
    const toggle = screen.getByLabelText('Full-track quality mode');
    expect(toggle).not.toBeChecked();
    fireEvent.click(toggle);
    expect(onUpdate).toHaveBeenCalledWith({ translationMode: 'plus' });
  });

  it('renders on when the setting is plus', () => {
    render(
      <CaptionQualityCard
        settings={{ ...DEFAULT_SUBTITLE_SETTINGS, translationMode: 'plus' }}
        disabled={false}
        onUpdate={vi.fn()}
      />,
    );
    expect(screen.getByLabelText('Full-track quality mode')).toBeChecked();
  });
});