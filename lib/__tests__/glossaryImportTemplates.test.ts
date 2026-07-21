/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { parseGlossaryCSV, parseGlossaryJSON } from '@/lib/glossary';
import {
  GLOSSARY_CSV_TEMPLATE,
  GLOSSARY_CSV_TEMPLATE_FILENAME,
  GLOSSARY_JSON_TEMPLATE,
  GLOSSARY_JSON_TEMPLATE_FILENAME,
  downloadGlossaryTemplate,
} from '@/lib/glossaryImportTemplates';

describe('glossary import templates', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('JSON template parses to the three example terms', () => {
    const entries = parseGlossaryJSON(GLOSSARY_JSON_TEMPLATE);
    expect(entries).toHaveLength(3);
    expect(entries.map((e) => e.source)).toEqual([
      'React',
      'API',
      'machine learning',
    ]);
    expect(entries.map((e) => e.target)).toEqual([
      'React',
      'API',
      'machine learning',
    ]);
  });

  it('CSV template parses to the three example terms', () => {
    const entries = parseGlossaryCSV(GLOSSARY_CSV_TEMPLATE);
    expect(entries).toHaveLength(3);
    expect(entries[0]).toMatchObject({ source: 'React', target: 'React' });
    expect(entries[1]).toMatchObject({ source: 'API', target: 'API' });
    expect(entries[2]).toMatchObject({
      source: 'machine learning',
      target: 'machine learning',
    });
  });

  it('downloadGlossaryTemplate creates a blob download with the right name', () => {
    const createObjectURL = vi.fn((blob: Blob) => {
      expect(blob).toBeInstanceOf(Blob);
      return 'blob:template';
    });
    const revokeObjectURL = vi.fn();
    vi.stubGlobal('URL', {
      createObjectURL,
      revokeObjectURL,
    });

    const click = vi.fn();
    const anchor = {
      href: '',
      download: '',
      click,
    } as unknown as HTMLAnchorElement;
    const createElement = vi
      .spyOn(document, 'createElement')
      .mockReturnValue(anchor);

    downloadGlossaryTemplate('json');

    expect(createElement).toHaveBeenCalledWith('a');
    expect(createObjectURL).toHaveBeenCalledOnce();
    expect(createObjectURL.mock.calls[0]![0].type).toBe('application/json');
    expect(anchor.download).toBe(GLOSSARY_JSON_TEMPLATE_FILENAME);
    expect(anchor.href).toBe('blob:template');
    expect(click).toHaveBeenCalledOnce();
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:template');

    downloadGlossaryTemplate('csv');
    expect(anchor.download).toBe(GLOSSARY_CSV_TEMPLATE_FILENAME);
    expect(createObjectURL.mock.calls[1]![0].type).toBe('text/csv');
  });
});
