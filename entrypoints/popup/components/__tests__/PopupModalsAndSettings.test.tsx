import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { NamedGlossarySuggestionsModal } from '../NamedGlossarySuggestionsModal';
import { QuickSettings } from '../QuickSettings';

describe('Popup modals and quick settings', () => {
  it('selects suggestions, edits targets, and pushes selected rows in NamedGlossarySuggestionsModal', () => {
    const onPush = vi.fn();
    render(
      <NamedGlossarySuggestionsModal
        rows={[
          { source: 'Alice', target: '爱丽丝' },
          { source: 'Bob', target: '鲍勃' },
        ]}
        activeListName="Characters"
        onClose={vi.fn()}
        onPush={onPush}
      />,
    );

    fireEvent.change(screen.getByLabelText('Translation for Alice'), {
      target: { value: '艾丽丝' },
    });
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select Bob' }));
    fireEvent.click(screen.getByRole('button', { name: 'Push selected' }));
    expect(onPush).toHaveBeenCalledWith([{ source: 'Alice', target: '艾丽丝' }]);
  });

  it('handles QuickSettings named subtitle lists and disabled state', () => {
    const onSubtitleListChange = vi.fn();
    const { rerender } = render(
      <QuickSettings
        expanded={true}
        onToggle={vi.fn()}
        theme="dividing-line"
        onThemeChange={vi.fn()}
        displayMode="bilingual-below"
        onDisplayModeChange={vi.fn()}
        subtitlesEnabled={true}
        onSubtitlesToggle={vi.fn()}
        subtitleLists={[
          { id: 'people', name: 'Character names', entries: [], updatedAt: 1 },
          { id: 'terms', name: 'Technical terms', entries: [], updatedAt: 2 },
        ]}
        activeSubtitleListId="people"
        activeHostname="video.example.com"
        onSubtitleListChange={onSubtitleListChange}
        onReviewSuggestions={vi.fn()}
        styleExpanded={false}
        onStyleToggle={vi.fn()}
        tabOverrides={{}}
        onTabKnob={vi.fn()}
        onOpenMoreSettings={vi.fn()}
      />,
    );

    expect(screen.getByText('Using last choice for video.example.com')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /character names/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Technical terms' }));
    expect(onSubtitleListChange).toHaveBeenCalledWith('terms');

    rerender(
      <QuickSettings
        expanded={true}
        onToggle={vi.fn()}
        theme="dividing-line"
        onThemeChange={vi.fn()}
        displayMode="bilingual-below"
        onDisplayModeChange={vi.fn()}
        subtitlesEnabled={false}
        onSubtitlesToggle={vi.fn()}
        subtitleLists={[]}
        activeSubtitleListId={null}
        activeHostname="video.example.com"
        onSubtitleListChange={vi.fn()}
        onReviewSuggestions={vi.fn()}
        styleExpanded={false}
        onStyleToggle={vi.fn()}
        tabOverrides={{}}
        onTabKnob={vi.fn()}
        onOpenMoreSettings={vi.fn()}
      />,
    );
    expect(screen.queryByText('Subtitle dictionary')).toBeNull();
  });
});
