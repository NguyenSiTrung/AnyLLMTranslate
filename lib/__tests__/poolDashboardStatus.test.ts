/**
 * Pure pool dashboard status + key chip merge (Providers ops redesign).
 */

import { describe, it, expect } from 'vitest';
import {
  getKeyChipView,
  getPoolDashboardView,
  formatCooldownRemaining,
} from '../poolDashboardStatus';
import type { ExtensionSettings, PoolProvider, PoolKey } from '@/types/config';
import { DEFAULT_SETTINGS } from '@/types/config';

function key(partial: Partial<PoolKey> & { id: string }): PoolKey {
  return {
    apiKey: 'sk-test',
    maxRpm: 0,
    concurrencyLimit: 0,
    interval: 0,
    enabled: true,
    ...partial,
  };
}

function provider(partial: Partial<PoolProvider> & { id: string; keys: PoolKey[] }): PoolProvider {
  return {
    displayName: 'OpenRouter',
    baseUrl: 'https://openrouter.ai/api/v1',
    model: 'test-model',
    requiresApiKey: true,
    temperature: 0.3,
    maxTokens: 4096,
    requestTimeoutMs: 60000,
    enabled: true,
    catalogId: 'openrouter',
    ...partial,
  };
}

describe('formatCooldownRemaining', () => {
  it('formats remaining cooldown and clamps expired to zero', () => {
    expect(formatCooldownRemaining(65_000, 0)).toMatch(/1:05|65s/);
    expect(formatCooldownRemaining(1000, 2000)).toMatch(/0:00|0s/);
  });
});

describe('getKeyChipView', () => {
  const p = provider({ id: 'p1', keys: [] });

  it('maps key/provider/live state into chip kinds', () => {
    expect(getKeyChipView(p, key({ id: 'k1', enabled: false }), undefined, 0).kind).toBe(
      'off',
    );
    expect(
      getKeyChipView(
        provider({ id: 'p1', enabled: false, keys: [] }),
        key({ id: 'k1' }),
        undefined,
        0,
      ).kind,
    ).toBe('off');

    expect(
      getKeyChipView(
        p,
        key({ id: 'k1', lastTestResult: { success: false, at: 1 } }),
        {
          keyId: 'k1',
          providerId: 'p1',
          open: true,
          openUntil: 99_999,
          credentialInvalid: true,
          disabled: false,
        },
        0,
      ).kind,
    ).toBe('invalid');

    const cooling = getKeyChipView(
      p,
      key({ id: 'k1', lastTestResult: { success: true, at: 1, latencyMs: 120 } }),
      {
        keyId: 'k1',
        providerId: 'p1',
        open: true,
        openUntil: 30_000,
        credentialInvalid: false,
        disabled: false,
      },
      0,
    );
    expect(cooling.kind).toBe('cooling');
    expect(cooling.openUntil).toBe(30_000);

    const healthy = getKeyChipView(
      p,
      key({ id: 'k1', lastTestResult: { success: true, at: 1, latencyMs: 50 } }),
      {
        keyId: 'k1',
        providerId: 'p1',
        open: false,
        openUntil: 0,
        credentialInvalid: false,
        disabled: false,
      },
      0,
    );
    expect(healthy.kind).toBe('healthy');
    expect(healthy.latencyMs).toBe(50);

    expect(getKeyChipView(p, key({ id: 'k1' }), undefined, 0).kind).toBe('untested');
    expect(
      getKeyChipView(
        p,
        key({ id: 'k1', lastTestResult: { success: false, at: 1, error: 'nope' } }),
        undefined,
        0,
      ).kind,
    ).toBe('failed');
  });
});

describe('getPoolDashboardView', () => {
  it('derives not-ready / ready / partial / degraded aggregate states', () => {
    expect(getPoolDashboardView({ ...DEFAULT_SETTINGS, providers: [] }, null, 0)).toMatchObject({
      state: 'not-ready',
      canTranslate: false,
    });

    const readySettings: ExtensionSettings = {
      ...DEFAULT_SETTINGS,
      providers: [
        provider({
          id: 'p1',
          keys: [key({ id: 'k1', lastTestResult: { success: true, at: 1 } })],
        }),
      ],
    };
    expect(getPoolDashboardView(readySettings, null, 0)).toMatchObject({
      state: 'ready',
      canTranslate: true,
      healthyKeyCount: 1,
    });

    const partialSettings: ExtensionSettings = {
      ...DEFAULT_SETTINGS,
      providers: [
        provider({
          id: 'p1',
          keys: [
            key({ id: 'k1', lastTestResult: { success: true, at: 1 } }),
            key({ id: 'k2', lastTestResult: { success: false, at: 2 } }),
          ],
        }),
      ],
    };
    expect(getPoolDashboardView(partialSettings, null, 0)).toMatchObject({
      state: 'partial',
      canTranslate: true,
    });

    const degradedSettings: ExtensionSettings = {
      ...DEFAULT_SETTINGS,
      providers: [
        provider({
          id: 'p1',
          keys: [
            key({ id: 'k1', lastTestResult: { success: true, at: 1 } }),
            key({ id: 'k2', lastTestResult: { success: true, at: 1 } }),
          ],
        }),
      ],
    };
    const live = {
      k1: {
        keyId: 'k1',
        providerId: 'p1',
        open: true,
        openUntil: 99_999,
        credentialInvalid: false,
        disabled: false,
      },
    };
    expect(getPoolDashboardView(degradedSettings, live, 0)).toMatchObject({
      state: 'degraded',
      canTranslate: true,
      coolingKeyCount: 1,
    });

    const untested: ExtensionSettings = {
      ...DEFAULT_SETTINGS,
      providers: [provider({ id: 'p1', keys: [key({ id: 'k1' })] })],
    };
    expect(getPoolDashboardView(untested, null, 0)).toMatchObject({
      canTranslate: true,
      state: 'partial',
      untestedKeyCount: 1,
    });
  });
});
