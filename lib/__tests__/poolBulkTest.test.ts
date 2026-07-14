import { describe, it, expect } from 'vitest';
import { collectTestableSlots, collectTestableSlotsForProvider } from '../poolBulkTest';
import type { PoolProvider } from '@/types/config';

function p(partial: Partial<PoolProvider> & { id: string }): PoolProvider {
  return {
    displayName: 'P',
    baseUrl: 'https://api.example.com/v1',
    model: 'm',
    requiresApiKey: true,
    temperature: 0.3,
    maxTokens: 1024,
    enabled: true,
    keys: [
      {
        id: 'k1',
        apiKey: 'sk-x',
        maxRpm: 0,
        concurrencyLimit: 0,
        interval: 0,
        enabled: true,
      },
    ],
    ...partial,
  };
}

describe('collectTestableSlots', () => {
  it('includes credentialed keys, skips disabled/empty, allows keyless, filters by provider', () => {
    expect(collectTestableSlots([p({ id: 'p1' })])).toEqual([{ providerId: 'p1', keyId: 'k1' }]);
    expect(collectTestableSlots([p({ id: 'p1', enabled: false })])).toEqual([]);
    expect(
      collectTestableSlots([
        p({
          id: 'p1',
          keys: [
            { id: 'k1', apiKey: '', maxRpm: 0, concurrencyLimit: 0, interval: 0, enabled: true },
          ],
        }),
      ]),
    ).toEqual([]);
    expect(
      collectTestableSlots([
        p({
          id: 'p1',
          requiresApiKey: false,
          keys: [
            { id: 'k1', apiKey: '', maxRpm: 0, concurrencyLimit: 0, interval: 0, enabled: true },
          ],
        }),
      ]),
    ).toEqual([{ providerId: 'p1', keyId: 'k1' }]);

    const providers = [
      p({ id: 'p1' }),
      p({
        id: 'p2',
        keys: [{ id: 'k2', apiKey: 'sk', maxRpm: 0, concurrencyLimit: 0, interval: 0, enabled: true }],
      }),
    ];
    expect(collectTestableSlotsForProvider(providers, 'p2')).toEqual([
      { providerId: 'p2', keyId: 'k2' },
    ]);
  });
});
