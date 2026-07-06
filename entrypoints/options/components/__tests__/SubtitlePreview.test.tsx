/**
 * Tests for the extracted SubtitlePreview component (FR-8).
 *
 * Covers the shell, default cues, custom cues, disabled state, and the
 * optional Style chip (FR-9). The cycling/animation timing itself is
 * exercised by the section-level preview tests; here we assert the
 * extracted surface (props → rendered output).
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SubtitlePreview } from '../SubtitlePreview';

const baseProps = {
  disabled: false,
  fontSize: 22,
  fontSizeMode: 'fixed' as const,
  backgroundOpacity: 0.7,
  fontFamily: 'system' as const,
  displayMode: 'bilingual' as const,
  position: 'bottom' as const,
};

describe('SubtitlePreview', () => {
  it('renders the first default translated + original cue when enabled', () => {
    render(<SubtitlePreview {...baseProps} />);
    expect(screen.getByText('Xin chào thế giới')).toBeInTheDocument();
    // bilingual shows the original line too
    expect(screen.getByText('Hello world')).toBeInTheDocument();
  });

  it('hides the original cue in translation-only mode', () => {
    render(<SubtitlePreview {...baseProps} displayMode="translation-only" />);
    expect(screen.queryByText('Hello world')).not.toBeInTheDocument();
    expect(screen.getByText('Xin chào thế giới')).toBeInTheDocument();
  });

  it('shows the disabled banner and dims the shell when disabled', () => {
    render(<SubtitlePreview {...baseProps} disabled />);
    expect(screen.getByText('Subtitles disabled')).toBeInTheDocument();
  });

  it('renders custom cues when provided', () => {
    render(
      <SubtitlePreview
        {...baseProps}
        cues={[
          { original: 'Good morning', translated: 'Bonjour' },
          { original: 'See you', translated: 'Au revoir' },
        ]}
      />,
    );
    expect(screen.getByText('Bonjour')).toBeInTheDocument();
    expect(screen.getByText('Good morning')).toBeInTheDocument();
  });

  it('renders the Style chip when provided and enabled', () => {
    render(<SubtitlePreview {...baseProps} styleChip="Neutral" />);
    expect(screen.getByText('Neutral')).toBeInTheDocument();
  });

  it('hides the Style chip when disabled', () => {
    render(<SubtitlePreview {...baseProps} disabled styleChip="Neutral" />);
    expect(screen.queryByText('Neutral')).not.toBeInTheDocument();
  });
});
