/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/config', () => ({
  loadSettings: vi.fn(),
  updateSettings: vi.fn(),
}));

import { loadSettings, updateSettings } from '@/lib/config';
import { addToGlobalGlossary } from '@/content/selectionBubble/glossaryAdd';

describe('addToGlobalGlossary', () => {
  beforeEach(() => {
    vi.mocked(loadSettings).mockReset();
    vi.mocked(updateSettings).mockReset();
  });

  it('returns invalid for empty source/target, duplicate when the source exists, and appends a new entry otherwise', async () => {
    await expect(addToGlobalGlossary('  ', 'x')).resolves.toEqual({
      status: 'invalid',
      reason: 'Missing source or translation',
    });

    vi.mocked(loadSettings).mockResolvedValue({
      glossary: [{ id: '1', source: 'Hello', target: 'Xin chào' }],
    } as never);
    await expect(addToGlobalGlossary('hello', 'xin chào')).resolves.toEqual({
      status: 'duplicate',
    });
    expect(updateSettings).not.toHaveBeenCalled();

    vi.mocked(loadSettings).mockResolvedValue({ glossary: [] } as never);
    vi.mocked(updateSettings).mockImplementation(async (p) => p as never);
    const r = await addToGlobalGlossary('foo', 'bar');
    expect(r).toEqual({ status: 'added' });
    expect(updateSettings).toHaveBeenCalledOnce();
    const arg = vi.mocked(updateSettings).mock.calls[0][0];
    expect(arg.glossary).toHaveLength(1);
    expect(arg.glossary![0].source).toBe('foo');
    expect(arg.glossary![0].target).toBe('bar');
    expect(arg.glossary![0].id).toBeTruthy();
  });
});
