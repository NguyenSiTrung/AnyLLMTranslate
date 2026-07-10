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
  it('formats minutes and seconds', () => {
    expect(formatCooldownRemaining(65_000, 0)).toMatch(/1:05|65s/);
  });

  it('clamps expired cooldown to 0:00', () => {
    expect(formatCooldownRemaining(1000, 2000)).toMatch(/0:00|0s/);
  });
});

describe('getKeyChipView', () => {
  const p = provider({ id: 'p1', keys: [] });

  it('marks disabled keys off', () => {
    const chip = getKeyChipView(p, key({ id: 'k1', enabled: false }), undefined, 0);
    expect(chip.kind).toBe('off');
  });

  it('marks provider-disabled keys off', () => {
    const disabledP = provider({ id: 'p1', enabled: false, keys: [] });
    const chip = getKeyChipView(disabledP, key({ id: 'k1' }), undefined, 0);
    expect(chip.kind).toBe('off');
  });

  it('marks credentialInvalid as invalid over failed test', () => {
    const chip = getKeyChipView(
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
    );
    expect(chip.kind).toBe('invalid');
  });

  it('marks open breaker as cooling when not credentialInvalid', () => {
    const chip = getKeyChipView(
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
    expect(chip.kind).toBe('cooling');
    expect(chip.openUntil).toBe(30_000);
  });

  it('marks last test success as healthy when live closed', () => {
    const chip = getKeyChipView(
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
    expect(chip.kind).toBe('healthy');
    expect(chip.latencyMs).toBe(50);
  });

  it('marks untested when no result and not live-open', () => {
    const chip = getKeyChipView(p, key({ id: 'k1' }), undefined, 0);
    expect(chip.kind).toBe('untested');
  });

  it('marks failed when last test failed', () => {
    const chip = getKeyChipView(
      p,
      key({ id: 'k1', lastTestResult: { success: false, at: 1, error: 'nope' } }),
      undefined,
      0,
    );
    expect(chip.kind).toBe('failed');
  });
});

describe('getPoolDashboardView', () => {
  it('not-ready when no providers', () => {
    const view = getPoolDashboardView({ ...DEFAULT_SETTINGS, providers: [] }, null, 0);
    expect(view.state).toBe('not-ready');
    expect(view.canTranslate).toBe(false);
  });

  it('ready when one healthy enabled key and no live degradation', () => {
    const settings: ExtensionSettings = {
      ...DEFAULT_SETTINGS,
      providers: [
        provider({
          id: 'p1',
          keys: [key({ id: 'k1', lastTestResult: { success: true, at: 1 } })],
        }),
      ],
    };
    const view = getPoolDashboardView(settings, null, 0);
    expect(view.state).toBe('ready');
    expect(view.canTranslate).toBe(true);
    expect(view.healthyKeyCount).toBe(1);
  });

  it('partial when one healthy and one failed among enabled', () => {
    const settings: ExtensionSettings = {
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
    const view = getPoolDashboardView(settings, null, 0);
    expect(view.state).toBe('partial');
    expect(view.canTranslate).toBe(true);
  });

  it('degraded when ≥50% enabled slots are live open and can still translate', () => {
    const settings: ExtensionSettings = {
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
    const view = getPoolDashboardView(settings, live, 0);
    expect(view.state).toBe('degraded');
    expect(view.canTranslate).toBe(true);
    expect(view.coolingKeyCount).toBe(1);
  });

  it('partial when canTranslate but all keys untested', () => {
    const settings: ExtensionSettings = {
      ...DEFAULT_SETTINGS,
      providers: [
        provider({
          id: 'p1',
          keys: [key({ id: 'k1' })],
        }),
      ],
    };
    const view = getPoolDashboardView(settings, null, 0);
    expect(view.canTranslate).toBe(true);
    expect(view.state).toBe('partial');
    expect(view.untestedKeyCount).toBe(1);
  });
});
