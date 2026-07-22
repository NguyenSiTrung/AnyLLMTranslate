/**
 * Pure provider-pool UI and cursor/reorder/bulk helpers (FR-1).
 */

import { describe, expect, it } from 'vitest';
import {
  buildProviderConfig,
  canRunConnectionTest,
  getCredentialKey,
  getProviderTestStatus,
} from '../providerPoolHelpers';
import { createPoolCursor } from '../poolCursor';
import { reorderByIndex, moveProviderById, moveKeyById } from '../poolReorder';
import { collectTestableSlots, collectTestableSlotsForProvider } from '../poolBulkTest';
import {
  providerCredentialsChanged,
  keyCredentialsChanged,
  applyProviderPatch,
  applyKeyPatch,
  formatTestResultAge,
} from '../poolTestStatus';
import {
  getKeyChipView,
  getPoolDashboardView,
  formatCooldownRemaining,
} from '../poolDashboardStatus';
import type { ExtensionSettings, PoolProvider, PoolKey } from '@/types/config';
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
  it('picks credentials, gates connection tests, and builds provider config', () => {
    const withThinking = makeProvider({ thinkingMode: 'off' });
    const built = buildProviderConfig(withThinking, withThinking.keys[0]!);
    expect(built.thinkingMode).toBe('off');

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
  });

  it('handles cursor, reordering, bulk slot collection, status changes, and dashboard views', () => {
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
  });
});
