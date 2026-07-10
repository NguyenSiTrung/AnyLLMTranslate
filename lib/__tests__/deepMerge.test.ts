import { describe, it, expect } from 'vitest';
import { deepMerge } from '@/lib/utils';

describe('deepMerge', () => {
  it('merges nested objects', () => {
    const merged = deepMerge(
      { a: { x: 1, y: 2 }, b: 1 } as Record<string, unknown>,
      { a: { y: 9, z: 3 } },
    );
    expect(merged).toEqual({ a: { x: 1, y: 9, z: 3 }, b: 1 });
  });

  it('replaces with empty object instead of preserving nested keys', () => {
    const merged = deepMerge(
      {
        subtitleSettings: {
          knobOverrides: { register: 'casual', brevity: 'terse' },
          enabled: true,
        },
      } as Record<string, unknown>,
      {
        subtitleSettings: {
          knobOverrides: {},
          enabled: true,
        },
      },
    );
    expect(
      (merged.subtitleSettings as { knobOverrides: Record<string, unknown> }).knobOverrides,
    ).toEqual({});
  });

  it('overwrites arrays', () => {
    const merged = deepMerge(
      { list: [1, 2] } as Record<string, unknown>,
      { list: [3] },
    );
    expect(merged.list).toEqual([3]);
  });
});
