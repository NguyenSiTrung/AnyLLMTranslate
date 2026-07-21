import { describe, expect, it, vi } from 'vitest';
import type { ComponentProps } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { QuickSettings } from '../QuickSettings';

function renderSettings(overrides: Partial<ComponentProps<typeof QuickSettings>> = {}) {
  const props: ComponentProps<typeof QuickSettings> = {
    expanded: true,
    onToggle: vi.fn(),
    theme: 'dark',
    onThemeChange: vi.fn(),
    displayMode: 'bilingual-below',
    onDisplayModeChange: vi.fn(),
    subtitlesEnabled: true,
    onSubtitlesToggle: vi.fn(),
    subtitleLists: [
      { id: 'people', name: 'Character names', entries: [], updatedAt: 1 },
      { id: 'terms', name: 'Technical terms', entries: [], updatedAt: 2 },
    ],
    activeSubtitleListId: 'people',
    activeHostname: 'video.example.com',
    onSubtitleListChange: vi.fn(),
    onReviewSuggestions: vi.fn(),
    styleExpanded: false,
    onStyleToggle: vi.fn(),
    tabOverrides: {},
    onTabKnob: vi.fn(),
    onOpenMoreSettings: vi.fn(),
    ...overrides,
  };
  render(<QuickSettings {...props} />);
  return props;
}

function settingsProps(overrides: Partial<ComponentProps<typeof QuickSettings>> = {}) {
  return {
    expanded: true,
    onToggle: vi.fn(),
    theme: 'dark' as const,
    onThemeChange: vi.fn(),
    displayMode: 'bilingual-below' as const,
    onDisplayModeChange: vi.fn(),
    subtitlesEnabled: true,
    onSubtitlesToggle: vi.fn(),
    subtitleLists: [],
    activeSubtitleListId: null,
    activeHostname: 'video.example.com',
    onSubtitleListChange: vi.fn(),
    onReviewSuggestions: vi.fn(),
    styleExpanded: false,
    onStyleToggle: vi.fn(),
    tabOverrides: {},
    onTabKnob: vi.fn(),
    onOpenMoreSettings: vi.fn(),
    ...overrides,
  } satisfies ComponentProps<typeof QuickSettings>;
}

describe('QuickSettings named subtitle list', () => {
  it('shows the remembered list and changes to a list id or null', () => {
    const props = renderSettings();

    expect(screen.getByText('Using last choice for video.example.com')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /character names/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Technical terms' }));
    expect(props.onSubtitleListChange).toHaveBeenCalledWith('terms');

    fireEvent.click(screen.getByRole('button', { name: /character names/i }));
    fireEvent.click(screen.getByRole('button', { name: 'None' }));
    expect(props.onSubtitleListChange).toHaveBeenCalledWith(null);
  });

  it('shows no-site helper and hides selector when subtitles are disabled', () => {
    const { rerender } = render(<QuickSettings {...settingsProps()} />);
    expect(screen.getByText('No list for this site')).toBeTruthy();
    rerender(<QuickSettings {...settingsProps({ subtitlesEnabled: false })} />);
    expect(screen.queryByText('Subtitle dictionary')).toBeNull();
  });
});
