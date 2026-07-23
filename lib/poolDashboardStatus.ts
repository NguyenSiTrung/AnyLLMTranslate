/**
 * Pure pool dashboard status + key chip merge for the Providers ops UI.
 *
 * Side-effect free — unit-tested without chrome. Does not replace
 * {@link getPoolReadinessStatus} (popup contract); this module adds Partial /
 * Degraded presentation states for the options command bar.
 */

import type { ExtensionSettings, PoolKey, PoolProvider } from '@/types/config';
import { getPoolReadinessStatus } from '@/lib/providerReadiness';

/** Serializable live key status (mirrors coordinator KeyStatus without importing services). */
export interface PoolKeyLiveStatus {
  keyId: string;
  /** Breaker identity — keyId for single-model, keyId::model for multi-model. */
  slotId?: string;
  /** Model id for this slot (multi-model). */
  model?: string;
  providerId: string;
  open: boolean;
  openUntil: number;
  credentialInvalid: boolean;
  lastFailureKind?: string;
  disabled: boolean;
}

/** All live statuses belonging to a PoolKey (one or more model slots). */
export function statusesForKey(
  statuses: Record<string, PoolKeyLiveStatus> | null | undefined,
  keyId: string,
): PoolKeyLiveStatus[] {
  if (!statuses) return [];
  const byKey = Object.values(statuses).filter((s) => s.keyId === keyId);
  if (byKey.length > 0) return byKey;
  const direct = statuses[keyId];
  return direct ? [direct] : [];
}

/**
 * Pick the most severe live status for a key across multi-model slots.
 * Priority: credentialInvalid → open/cooling (earliest openUntil) → first.
 */
export function aggregateLiveStatusForKey(
  statuses: Record<string, PoolKeyLiveStatus> | null | undefined,
  keyId: string,
  now: number,
): PoolKeyLiveStatus | undefined {
  const list = statusesForKey(statuses, keyId);
  if (list.length === 0) return undefined;
  const invalid = list.find((s) => s.credentialInvalid);
  if (invalid) return invalid;
  const cooling = list
    .filter((s) => s.open && s.openUntil > now)
    .sort((a, b) => a.openUntil - b.openUntil)[0];
  if (cooling) return cooling;
  return list[0];
}

export type PoolDashboardState = 'ready' | 'partial' | 'degraded' | 'not-ready';

export type KeyChipKind =
  | 'healthy'
  | 'failed'
  | 'cooling'
  | 'invalid'
  | 'off'
  | 'untested';

export interface KeyChipView {
  keyId: string;
  kind: KeyChipKind;
  label: string;
  title: string;
  latencyMs?: number;
  openUntil?: number;
}

export interface PoolDashboardView {
  state: PoolDashboardState;
  title: string;
  description: string;
  action: string;
  canTranslate: boolean;
  providerCount: number;
  healthyKeyCount: number;
  coolingKeyCount: number;
  invalidKeyCount: number;
  failedKeyCount: number;
  untestedKeyCount: number;
  enabledKeyCount: number;
}

const CHIP_LABEL: Record<KeyChipKind, string> = {
  healthy: 'Healthy',
  failed: 'Failed',
  cooling: 'Cooling',
  invalid: 'Invalid key',
  off: 'Off',
  untested: 'Untested',
};

/**
 * Format remaining cooldown as `m:ss` (or `0:00` when expired).
 */
export function formatCooldownRemaining(openUntil: number, now: number): string {
  const ms = Math.max(0, openUntil - now);
  const totalSec = Math.ceil(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

/**
 * Resolve a single key chip. Priority:
 * off → invalid → cooling → failed → healthy → untested
 */
export function getKeyChipView(
  provider: PoolProvider,
  poolKey: PoolKey,
  live: PoolKeyLiveStatus | undefined,
  now: number,
): KeyChipView {
  const keyId = poolKey.id;

  if (!provider.enabled || !poolKey.enabled || live?.disabled) {
    return {
      keyId,
      kind: 'off',
      label: CHIP_LABEL.off,
      title: 'Key or provider disabled — excluded from rotation',
    };
  }

  if (live?.credentialInvalid) {
    return {
      keyId,
      kind: 'invalid',
      label: CHIP_LABEL.invalid,
      title: 'API key rejected — replace key or disable it',
      openUntil: live.openUntil,
    };
  }

  if (live?.open && live.openUntil > now) {
    const remaining = formatCooldownRemaining(live.openUntil, now);
    const modelHint = live.model ? ` (${live.model})` : '';
    return {
      keyId,
      kind: 'cooling',
      label: CHIP_LABEL.cooling,
      title: `Cooling down${modelHint} · back in ${remaining}`,
      openUntil: live.openUntil,
      latencyMs: poolKey.lastTestResult?.latencyMs,
    };
  }

  if (poolKey.lastTestResult) {
    if (poolKey.lastTestResult.success) {
      return {
        keyId,
        kind: 'healthy',
        label: CHIP_LABEL.healthy,
        title: 'In rotation',
        latencyMs: poolKey.lastTestResult.latencyMs,
      };
    }
    return {
      keyId,
      kind: 'failed',
      label: CHIP_LABEL.failed,
      title: poolKey.lastTestResult.error ?? 'Last connection test failed',
    };
  }

  return {
    keyId,
    kind: 'untested',
    label: CHIP_LABEL.untested,
    title: 'Verify connection to include health signal',
  };
}

function iterateEnabledSlots(
  settings: ExtensionSettings,
): Array<{ provider: PoolProvider; key: PoolKey }> {
  const out: Array<{ provider: PoolProvider; key: PoolKey }> = [];
  for (const provider of settings.providers ?? []) {
    if (!provider.enabled) continue;
    for (const poolKey of provider.keys ?? []) {
      if (!poolKey.enabled) continue;
      out.push({ provider, key: poolKey });
    }
  }
  return out;
}

function dashboardCopy(
  state: PoolDashboardState,
  counts: Pick<
    PoolDashboardView,
    'coolingKeyCount' | 'invalidKeyCount' | 'failedKeyCount' | 'untestedKeyCount' | 'healthyKeyCount'
  >,
): Pick<PoolDashboardView, 'title' | 'description' | 'action'> {
  switch (state) {
    case 'not-ready':
      return {
        title: 'Pool not ready',
        description: 'Add a provider with a valid endpoint, model, and API key to start translating.',
        action: 'Add provider or open the setup guide',
      };
    case 'degraded':
      return {
        title: 'Pool degraded',
        description:
          counts.coolingKeyCount + counts.invalidKeyCount > 0
            ? 'Many keys are cooling down or rejected. Traffic uses remaining healthy keys.'
            : 'A large share of keys are unhealthy. Translation may be limited.',
        action: 'Fix invalid keys or wait for cooldown',
      };
    case 'partial':
      if (counts.healthyKeyCount === 0 && counts.untestedKeyCount > 0) {
        return {
          title: 'Verify your providers',
          description: 'Keys are configured but not verified yet.',
          action: 'Run Test all keys',
        };
      }
      return {
        title: 'Pool partially healthy',
        description: 'Some keys need attention; at least one can still translate.',
        action: 'Review failed or cooling keys',
      };
    case 'ready':
    default:
      return {
        title: 'Pool ready',
        description: 'At least one provider key is healthy. Requests rotate across enabled keys.',
        action: 'Translate page',
      };
  }
}

/**
 * Aggregate dashboard view for the Providers command bar.
 *
 * `canTranslate` matches {@link getPoolReadinessStatus}.
 * Degraded: ≥50% of enabled slots are live-open or credentialInvalid while canTranslate.
 */
export function getPoolDashboardView(
  settings: ExtensionSettings,
  liveByKeyId: Record<string, PoolKeyLiveStatus> | null,
  now: number,
): PoolDashboardView {
  const readiness = getPoolReadinessStatus(settings);
  const canTranslate = readiness.canTranslate;
  const providers = settings.providers ?? [];
  const slots = iterateEnabledSlots(settings);

  let healthyKeyCount = 0;
  let coolingKeyCount = 0;
  let invalidKeyCount = 0;
  let failedKeyCount = 0;
  let untestedKeyCount = 0;

  for (const { provider, key: poolKey } of slots) {
    const live = aggregateLiveStatusForKey(liveByKeyId, poolKey.id, now);
    const chip = getKeyChipView(provider, poolKey, live, now);
    switch (chip.kind) {
      case 'healthy':
        healthyKeyCount++;
        break;
      case 'cooling':
        coolingKeyCount++;
        break;
      case 'invalid':
        invalidKeyCount++;
        break;
      case 'failed':
        failedKeyCount++;
        break;
      case 'untested':
        untestedKeyCount++;
        break;
      case 'off':
        break;
    }
  }

  const enabledKeyCount = slots.length;
  const liveBadCount = coolingKeyCount + invalidKeyCount;
  const liveDegraded =
    Boolean(liveByKeyId) &&
    enabledKeyCount > 0 &&
    liveBadCount / enabledKeyCount >= 0.5;

  // State: not-ready → degraded → partial (issues or only untested) → ready
  let state: PoolDashboardState;
  if (!canTranslate) {
    state = 'not-ready';
  } else if (liveDegraded) {
    state = 'degraded';
  } else if (
    failedKeyCount > 0 ||
    coolingKeyCount > 0 ||
    invalidKeyCount > 0 ||
    (healthyKeyCount === 0 && untestedKeyCount > 0)
  ) {
    state = 'partial';
  } else {
    // ≥1 healthy, no hard issues (extra untested siblings still ready)
    state = 'ready';
  }

  const counts = {
    healthyKeyCount,
    coolingKeyCount,
    invalidKeyCount,
    failedKeyCount,
    untestedKeyCount,
  };
  const copy = dashboardCopy(state, counts);

  return {
    state,
    ...copy,
    canTranslate,
    providerCount: providers.length,
    healthyKeyCount,
    coolingKeyCount,
    invalidKeyCount,
    failedKeyCount,
    untestedKeyCount,
    enabledKeyCount,
  };
}
