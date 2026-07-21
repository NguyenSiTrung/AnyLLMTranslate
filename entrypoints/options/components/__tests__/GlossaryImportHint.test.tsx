import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { GlossaryImportHint } from '../GlossaryImportHint';
import * as templates from '@/lib/glossaryImportTemplates';

vi.mock('@/lib/glossaryImportTemplates', async () => {
  const actual = await vi.importActual<typeof import('@/lib/glossaryImportTemplates')>(
    '@/lib/glossaryImportTemplates',
  );
  return {
    ...actual,
    downloadGlossaryTemplate: vi.fn(),
  };
});

describe('GlossaryImportHint', () => {
  beforeEach(() => {
    vi.mocked(templates.downloadGlossaryTemplate).mockClear();
  });

  it('shows collapsed format line and expands to samples + downloads', () => {
    render(<GlossaryImportHint />);

    expect(screen.getByText(/Supports/i)).toBeInTheDocument();
    expect(screen.getByText(/JSON/i)).toBeInTheDocument();
    expect(screen.getByText(/CSV/i)).toBeInTheDocument();

    // Samples hidden until expand
    expect(
      screen.queryByText((_, el) => el?.tagName === 'PRE' && (el.textContent?.includes('"source": "React"') ?? false)),
    ).not.toBeInTheDocument();

    const toggle = screen.getByRole('button', { name: /See format/i });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');

    expect(screen.getByLabelText('Glossary import format')).toBeInTheDocument();
    expect(
      screen.getByText((_, el) => el?.tagName === 'PRE' && (el.textContent?.includes('"source": "React"') ?? false)),
    ).toBeInTheDocument();
    expect(
      screen.getByText((_, el) => el?.tagName === 'PRE' && (el.textContent?.includes('source,target') ?? false)),
    ).toBeInTheDocument();
    expect(screen.getByText(/appends/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Download JSON template' }));
    expect(templates.downloadGlossaryTemplate).toHaveBeenCalledWith('json');

    fireEvent.click(screen.getByRole('button', { name: 'Download CSV template' }));
    expect(templates.downloadGlossaryTemplate).toHaveBeenCalledWith('csv');
  });

  it('fires onChooseFile when Choose file is provided', () => {
    const onChooseFile = vi.fn();
    render(<GlossaryImportHint defaultExpanded onChooseFile={onChooseFile} />);

    fireEvent.click(screen.getByRole('button', { name: /Choose file/i }));
    expect(onChooseFile).toHaveBeenCalledOnce();
  });

  it('hides Choose file when onChooseFile is omitted', () => {
    render(<GlossaryImportHint defaultExpanded />);
    expect(screen.queryByRole('button', { name: /Choose file/i })).not.toBeInTheDocument();
  });
});
