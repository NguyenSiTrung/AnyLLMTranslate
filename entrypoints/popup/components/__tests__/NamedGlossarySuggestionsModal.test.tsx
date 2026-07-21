import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { NamedGlossarySuggestionsModal } from '../NamedGlossarySuggestionsModal';

describe('NamedGlossarySuggestionsModal', () => {
  it('selects suggestions, edits targets, and pushes selected rows', () => {
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

  it('disables push and prompts for a list when none is active', () => {
    render(
      <NamedGlossarySuggestionsModal
        rows={[{ source: 'Alice', target: '爱丽丝' }]}
        activeListName={null}
        onClose={vi.fn()}
        onPush={vi.fn()}
      />,
    );

    expect(screen.getByText('Select or create a list first')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Push selected' })).toBeDisabled();
  });
});
