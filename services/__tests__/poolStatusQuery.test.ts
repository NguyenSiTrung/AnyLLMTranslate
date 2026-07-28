import { describe, it, expect } from 'vitest';
import { queryPoolKeyStatuses } from '../poolStatusQuery';
import { ProviderPoolCoordinator } from '../providerPool';
import type { TranslationService } from '@/services/base';
import type { ExtensionSettings } from '@/types/config';

describe('queryPoolKeyStatuses', () => {
  it('handles non-pool services, coordinator statuses, and getService throws', async () => {
    // Non-pool service → empty statuses.
    const stub = {} as TranslationService;
    const empty = await queryPoolKeyStatuses(async () => stub);
    expect(empty.success).toBe(true);
    expect(empty.statuses).toEqual({});

    // Pool coordinator → getAllKeyStatuses surfaced.
    const coord = new ProviderPoolCoordinator({ clock: () => 0 });
    coord.rebuild({
      providers: [
        {
          id: 'p1',
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
        },
      ],
    } as ExtensionSettings);

    const fromCoord = await queryPoolKeyStatuses(async () => coord);
    expect(fromCoord.success).toBe(true);
    expect(fromCoord.statuses?.k1).toMatchObject({
      keyId: 'k1',
      providerId: 'p1',
      open: false,
      disabled: false,
    });

    // getService throw → success false with the error message.
    const thrown = await queryPoolKeyStatuses(async () => {
      throw new Error('boom');
    });
    expect(thrown.success).toBe(false);
    expect(thrown.error).toBe('boom');
  });
});
