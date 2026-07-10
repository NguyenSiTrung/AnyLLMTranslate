import { describe, it, expect, vi } from 'vitest';
import { queryPoolKeyStatuses } from '../poolStatusQuery';
import { ProviderPoolCoordinator } from '../providerPool';
import type { TranslationService } from '@/services/base';

describe('queryPoolKeyStatuses', () => {
  it('returns empty statuses when service is not a pool coordinator', async () => {
    const stub = {} as TranslationService;
    const result = await queryPoolKeyStatuses(async () => stub);
    expect(result.success).toBe(true);
    expect(result.statuses).toEqual({});
  });

  it('returns getAllKeyStatuses from the coordinator', async () => {
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
    } as any);

    const result = await queryPoolKeyStatuses(async () => coord);
    expect(result.success).toBe(true);
    expect(result.statuses?.k1).toMatchObject({
      keyId: 'k1',
      providerId: 'p1',
      open: false,
      disabled: false,
    });
  });

  it('returns success false on getService throw', async () => {
    const result = await queryPoolKeyStatuses(async () => {
      throw new Error('boom');
    });
    expect(result.success).toBe(false);
    expect(result.error).toBe('boom');
  });
});
