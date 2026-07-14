import { describe, it, expect } from 'vitest';
import { deepMerge } from '@/lib/utils';

describe('deepMerge', () => {
  it('merges nested objects, replaces empty objects, and overwrites arrays', () => {
    expect(
      deepMerge({ a: { x: 1, y: 2 }, b: 1 } as Record<string, unknown>, { a: { y: 9, z: 3 } }),
    ).toEqual({ a: { x: 1, y: 9, z: 3 }, b: 1 });

    const cleared = deepMerge(
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
      (cleared.subtitleSettings as { knobOverrides: Record<string, unknown> }).knobOverrides,
    ).toEqual({});

    expect(
      deepMerge({ list: [1, 2] } as Record<string, unknown>, { list: [3] }).list,
    ).toEqual([3]);
  });
});
