/**
 * Pure provider-pool UI and cursor/reorder/bulk helpers (FR-1).
 */

import { describe, expect, it } from 'vitest';
import {
  buildProviderConfig,
  canRunConnectionTest,
  derivePopupConnectionStatus,
  getCredentialKey,
  getProviderTestStatus,
  toPopupConnectionStatus,
} from '../providerPoolHelpers';
import { createPoolCursor } from '../poolCursor';
import { reorderByIndex, moveProviderById } from '../poolReorder';
import { collectTestableSlots, collectTestableSlotsForProvider } from '../poolBulkTest';
import {
  providerCredentialsChanged,
  formatTestResultAge,
} from '../poolTestStatus';
import {
  getPoolDashboardView,
  formatCooldownRemaining,
} from '../poolDashboardStatus';
import type { PoolProvider } from '@/types/config';
import { DEFAULT_SETTINGS } from '@/types/config';

function makeProvider(overrides: Partial<PoolProvider> = {}): PoolProvider {
  return {
    id: 'p1',
    displayName: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    model: 'gpt-4o-mini',
    requiresApiKey: true,
    temperature: 0.3,
    maxTokens: 4096,
    enabled: true,
    keys: [{ id: 'k1', apiKey: 'sk-test', maxRpm: 60, concurrencyLimit: 0, interval: 0, enabled: true }],
    ...overrides,
  };
}

describe('provider pool UI and operational helpers', () => {
  it('picks credentials, gates tests, builds config, handles cursor/reorder/bulk/status/dashboard helpers, and maps pool lastTestResult to popup footer status', () => {
    const withThinking = makeProvider({ thinkingMode: 'off', thinkingEffort: 'high' });
    const built = buildProviderConfig(withThinking, withThinking.keys[0]!);
    expect(built.thinkingMode).toBe('off');
    expect(built.thinkingEffort).toBe('high');

    const keyed = makeProvider({
      keys: [
        { id: 'k1', apiKey: '', maxRpm: 0, concurrencyLimit: 0, interval: 0, enabled: true },
        { id: 'k2', apiKey: 'sk-2', maxRpm: 0, concurrencyLimit: 0, interval: 0, enabled: true },
      ],
    });
    expect(getCredentialKey(keyed)?.id).toBe('k2');
    expect(getCredentialKey(makeProvider({ requiresApiKey: false }))?.id).toBe('k1');
    expect(
      getCredentialKey(
        makeProvider({
          keys: [{ id: 'k1', apiKey: '', maxRpm: 0, concurrencyLimit: 0, interval: 0, enabled: true }],
        }),
      ),
    ).toBeUndefined();

    expect(canRunConnectionTest(makeProvider({ baseUrl: '' }))).toBe(false);
    expect(canRunConnectionTest(makeProvider({ model: '' }))).toBe(false);
    expect(canRunConnectionTest(makeProvider({ requiresApiKey: false }))).toBe(true);
    const p = makeProvider();
    expect(canRunConnectionTest(p, p.keys[0])).toBe(true);

    const cfg = buildProviderConfig(p, p.keys[0]!);
    expect(cfg.maxRpm).toBe(60);
    expect(cfg.baseUrl).toBe(p.baseUrl);
    expect(cfg.apiKey).toBe('sk-test');

    // Cursor
    const cursor = createPoolCursor(3);
    expect([cursor.next(), cursor.next(), cursor.next(), cursor.next()]).toEqual([0, 1, 2, 0]);
    cursor.reset();
    expect(cursor.next()).toBe(0);

    // Reorder
    expect(reorderByIndex(['a', 'b', 'c'], 0, 2)).toEqual(['b', 'c', 'a']);
    const providers = [{ id: 'p1' }, { id: 'p2' }, { id: 'p3' }] as PoolProvider[];
    expect(moveProviderById(providers, 'p2', 'up').map((pr) => pr.id)).toEqual(['p2', 'p1', 'p3']);

    // Bulk slots
    expect(collectTestableSlots([makeProvider({ id: 'p1' })])).toEqual([{ providerId: 'p1', keyId: 'k1' }]);
    expect(collectTestableSlotsForProvider([makeProvider({ id: 'p1' })], 'p1')).toEqual([{ providerId: 'p1', keyId: 'k1' }]);

    // Test status & age formatting
    const oldP = makeProvider();
    expect(providerCredentialsChanged(oldP, oldP)).toBe(false);
    expect(providerCredentialsChanged(oldP, makeProvider({ baseUrl: 'https://other/v1' }))).toBe(true);

    const at = 1700000000000;
    expect(formatTestResultAge({ success: true, at }, at + 30_000)).toBe('just now');
    expect(formatTestResultAge({ success: true, at }, at + 5 * 60_000)).toBe('5m ago');

    // Dashboard & Cooldown
    expect(formatCooldownRemaining(65_000, 0)).toMatch(/1:05|65s/);
    expect(getPoolDashboardView({ ...DEFAULT_SETTINGS, providers: [] }, null, 0)).toMatchObject({
      state: 'not-ready',
      canTranslate: false,
    });

    // Pool key lastTestResult drives the popup footer connection status.
    const successfulKey = makeProvider({
      keys: [
        {
          id: 'k1',
          apiKey: 'sk-test',
          maxRpm: 60,
          concurrencyLimit: 0,
          interval: 0,
          enabled: true,
          lastTestResult: { success: true, at: 1, latencyMs: 120 },
        },
      ],
    });
    expect(getProviderTestStatus(successfulKey).state).toBe('healthy');
    // Legacy mirror still red/error must not win over a successful pool key test.
    expect(derivePopupConnectionStatus(successfulKey, 'error')).toBe('success');
    expect(toPopupConnectionStatus('healthy', 'error')).toBe('success');

    const failedKey = makeProvider({
      keys: [
        {
          id: 'k1',
          apiKey: 'sk-bad',
          maxRpm: 60,
          concurrencyLimit: 0,
          interval: 0,
          enabled: true,
          lastTestResult: { success: false, at: 1, error: '401' },
        },
      ],
    });
    expect(derivePopupConnectionStatus(failedKey, 'success')).toBe('error');

    const untested = makeProvider();
    expect(getProviderTestStatus(untested).state).toBe('untested');
    expect(derivePopupConnectionStatus(untested, 'error')).toBe('error');
    expect(derivePopupConnectionStatus(undefined, 'success')).toBe('success');
  });
});
