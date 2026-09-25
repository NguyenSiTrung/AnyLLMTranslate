/**
 * Consent gate tests for the background message dispatcher.
 *
 * Chrome Web Store User Data FAQ §10 requires the extension to obtain consent
 * inside the product UI before any user data is handled. These tests pin the
 * enforcement side of that requirement: a message that would handle user data
 * must be refused while no valid consent is recorded, and must not be refused
 * once it is.
 */
import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import {
  handleMessage,
  __resetSettingsCacheForTest,
  initPdfStreamPortListener,
} from '../background';
import { CONSENT_REQUIRED_ERROR, PRIVACY_POLICY_VERSION } from '@/lib/privacyConsent';
import { PDF_STREAM_PORT } from '@/types/messages';
import type { ExtensionMessage } from '@/types/messages';

const SETTINGS_KEY = 'anyllm-translate-settings';

const mockStorage: Record<string, unknown> = {};

let onConnectListener: ((port: chrome.runtime.Port) => void) | null = null;

vi.stubGlobal('chrome', {
  storage: {
    local: {
      get: vi.fn(async (key: string) => ({ [key]: mockStorage[key] })),
      set: vi.fn(async (items: Record<string, unknown>) => {
        Object.assign(mockStorage, items);
      }),
    },
    onChanged: {
      addListener: vi.fn(),
      removeListener: vi.fn(),
    },
  },
  runtime: {
    sendMessage: vi.fn().mockResolvedValue(undefined),
    onConnect: {
      addListener: vi.fn((listener: (port: chrome.runtime.Port) => void) => {
        onConnectListener = listener;
      }),
    },
  },
  tabs: {
    sendMessage: vi.fn().mockResolvedValue(undefined),
    onRemoved: { addListener: vi.fn() },
  },
  alarms: {
    create: vi.fn(),
    get: vi.fn(),
    clear: vi.fn(),
    onAlarm: { addListener: vi.fn(), removeListener: vi.fn() },
  },
});

/** Seed stored settings with a consent record (or none). */
function seedConsent(consent: unknown): void {
  mockStorage[SETTINGS_KEY] = consent === undefined ? {} : { privacyConsent: consent };
  __resetSettingsCacheForTest();
}

interface GateResult {
  success: boolean;
  error?: string;
}

/** A gated action with a cheap, network-free failure path once the gate passes. */
const FETCH_SUBTITLE_MESSAGE = {
  action: 'FETCH_SUBTITLE',
  url: 'https://not-in-the-allowlist.example/subs.vtt',
} as unknown as ExtensionMessage;

async function dispatchFetchSubtitle(): Promise<GateResult> {
  return (await handleMessage(
    FETCH_SUBTITLE_MESSAGE,
    {} as chrome.runtime.MessageSender,
  )) as GateResult;
}

describe('background consent gate', () => {
  beforeEach(() => {
    delete mockStorage[SETTINGS_KEY];
    __resetSettingsCacheForTest();
  });

  it('refuses a user-data message while no consent is recorded', async () => {
    seedConsent(undefined);

    const result = await dispatchFetchSubtitle();

    expect(result.success).toBe(false);
    expect(result.error).toBe(CONSENT_REQUIRED_ERROR);
  });

  it('refuses when consent exists but the disclosure version is stale', async () => {
    seedConsent({ accepted: true, acceptedAt: 1, version: '2000-01-01' });

    const result = await dispatchFetchSubtitle();

    expect(result.error).toBe(CONSENT_REQUIRED_ERROR);
  });

  it('refuses when the record exists but was never accepted', async () => {
    seedConsent({ accepted: false, acceptedAt: null, version: PRIVACY_POLICY_VERSION });

    const result = await dispatchFetchSubtitle();

    expect(result.error).toBe(CONSENT_REQUIRED_ERROR);
  });

  it('lets the message reach its handler once consent is accepted', async () => {
    seedConsent({ accepted: true, acceptedAt: 1, version: PRIVACY_POLICY_VERSION });

    const result = await dispatchFetchSubtitle();

    // The gate opened: the handler ran and rejected the URL on its own merits.
    expect(result.success).toBe(false);
    expect(result.error).not.toBe(CONSENT_REQUIRED_ERROR);
    expect(result.error).toMatch(/allow-list/i);
  });

  it('leaves non-user-data messages ungated so the consent prompt stays reachable', async () => {
    seedConsent(undefined);

    const result = await handleMessage(
      { action: 'getCategoryOverride', tabId: 7 } as unknown as ExtensionMessage,
      {} as chrome.runtime.MessageSender,
    );

    expect(result).toEqual({ override: undefined });
  });

  it('refuses PDF streaming requests on the port channel too', async () => {
    seedConsent(undefined);
    onConnectListener = null;
    initPdfStreamPortListener();
    expect(onConnectListener).not.toBeNull();

    const posted: unknown[] = [];
    const port = {
      name: PDF_STREAM_PORT,
      sender: { tab: { id: 1 } },
      postMessage: vi.fn((message: unknown) => posted.push(message)),
      onMessage: { addListener: vi.fn() },
      onDisconnect: { addListener: vi.fn() },
    } as unknown as chrome.runtime.Port;

    onConnectListener!(port);

    const addListener = port.onMessage.addListener as unknown as Mock;
    const messageListener = addListener.mock.calls[0][0] as (message: unknown) => Promise<void>;

    await messageListener({ type: 'request', pieces: [] });

    expect(posted).toEqual([{ type: 'error', error: CONSENT_REQUIRED_ERROR }]);
  });
});
