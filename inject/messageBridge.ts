/**
 * Message Bridge — Bidirectional communication between MAIN world (inject) and ISOLATED world (content).
 *
 * The MAIN world script cannot access chrome.* APIs, so it uses window.postMessage
 * to relay intercepted subtitle data to the ISOLATED world content script,
 * which can then communicate with the background service worker.
 *
 * Uses channel identifier 'anyllm-translate' with origin validation and requestId correlation.
 *
 * Early-queue: MAIN inject runs at document_start; ISOLATED coordinator at document_end.
 * Timedtext can fire before the coordinator listens. Queue critical MAIN→ISOLATED
 * messages until COORDINATOR_READY so first-load CC-on intercepts are not dropped.
 */

import type { BridgeMessage, BridgeMessageType } from '@/types/subtitle';

const CHANNEL = 'anyllm-translate';

/** Message types that must survive the MAIN document_start → ISOLATED document_end gap. */
const QUEUED_UNTIL_READY: ReadonlySet<BridgeMessageType> = new Set([
  'SUBTITLE_INTERCEPTED',
  'SUBTITLE_TRACKS_DISCOVERED',
  'SUBTITLE_METADATA',
]);

const MAX_EARLY_QUEUE = 32;

let coordinatorReady = false;
const earlyQueue: BridgeMessage[] = [];
let readyListenerInstalled = false;

function installReadyListener(): void {
  if (readyListenerInstalled) return;
  if (typeof window === 'undefined' || typeof window.addEventListener !== 'function') return;
  readyListenerInstalled = true;

  window.addEventListener('message', (event: MessageEvent) => {
    if (event.origin !== window.location.origin) return;
    if (event.data?.channel !== CHANNEL) return;
    if (event.data?.type !== 'COORDINATOR_READY') return;
    flushEarlyQueue();
  });
}

// Install ASAP so COORDINATOR_READY is never missed before the first send.
installReadyListener();

function flushEarlyQueue(): void {
  if (coordinatorReady) return;
  coordinatorReady = true;
  const pending = earlyQueue.splice(0, earlyQueue.length);
  for (const message of pending) {
    window.postMessage(message, window.location.origin);
  }
}

/** Interface for the bridge send function used by interceptors */
export interface MessageBridgeSender {
  send(type: string, payload: unknown): string;
}

/** Create a sender object that wraps sendMessage */
export function createBridgeSender(): MessageBridgeSender {
  return { send: sendMessage };
}

/** Generate a unique request ID */
function generateRequestId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * Send a message from the current world.
 * Can be called from either MAIN or ISOLATED world.
 * Pass `overrideRequestId` to preserve an existing correlation ID.
 */
export function sendMessage<T>(type: BridgeMessageType, payload: T, overrideRequestId?: string): string {
  installReadyListener();

  const requestId = overrideRequestId ?? generateRequestId();
  const message: BridgeMessage<T> = {
    type,
    requestId,
    channel: CHANNEL,
    payload,
  };

  // MAIN→ISOLATED critical types: hold until coordinator announces ready.
  // Non-queued types (CONFIG responses, TRANSLATED, etc.) always post immediately.
  if (!coordinatorReady && QUEUED_UNTIL_READY.has(type)) {
    if (earlyQueue.length >= MAX_EARLY_QUEUE) {
      earlyQueue.shift();
    }
    earlyQueue.push(message as BridgeMessage);
    return requestId;
  }

  window.postMessage(message, window.location.origin);
  return requestId;
}

/**
 * Listen for messages on the bridge channel.
 * Returns a cleanup function to remove the listener.
 */
export function onMessage(
  type: BridgeMessageType,
  handler: (payload: unknown, requestId: string) => void,
  options?: { once?: boolean },
): () => void {
  const listener = (event: MessageEvent) => {
    if (event.origin !== window.location.origin) return;
    if (event.data?.channel !== CHANNEL) return;
    if (event.data?.type !== type) return;

    handler(event.data.payload, event.data.requestId);
    if (options?.once) {
      window.removeEventListener('message', listener);
    }
  };

  window.addEventListener('message', listener);
  return () => window.removeEventListener('message', listener);
}

/** Test-only: reset queue/ready state between vitest cases. */
export function __resetMessageBridgeForTests(): void {
  coordinatorReady = false;
  earlyQueue.length = 0;
  readyListenerInstalled = false;
}
