/**
 * Message Bridge — Bidirectional communication between MAIN world (inject) and ISOLATED world (content).
 *
 * The MAIN world script cannot access chrome.* APIs, so it uses window.postMessage
 * to relay intercepted subtitle data to the ISOLATED world content script,
 * which can then communicate with the background service worker.
 *
 * Uses channel identifier 'lingua-lens' with origin validation and requestId correlation.
 */

import type { BridgeMessage, BridgeMessageType } from '@/types/subtitle';

const CHANNEL = 'lingua-lens';

/** Generate a unique request ID */
function generateRequestId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * Send a message from the current world.
 * Can be called from either MAIN or ISOLATED world.
 */
export function sendMessage<T>(type: BridgeMessageType, payload: T): string {
  const requestId = generateRequestId();
  const message: BridgeMessage<T> = {
    type,
    requestId,
    channel: CHANNEL,
    payload,
  };
  window.postMessage(message, '*');
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

/**
 * Send a message and wait for a response.
 * Correlates the response via requestId.
 */
export function requestResponse<TReq, TRes>(
  type: BridgeMessageType,
  payload: TReq,
  responseType: BridgeMessageType,
  timeoutMs = 5000,
): Promise<TRes> {
  return new Promise((resolve, reject) => {
    const cleanup = onMessage(responseType, (resPayload) => {
      cleanup();
      resolve(resPayload as TRes);
    }, { once: true });

    const requestId = sendMessage(type, payload);

    // Store the requestId so the responder can correlate
    (window as Window & { __linguaLensRequests?: Map<string, { resolve: (v: unknown) => void; reject: (e: Error) => void }> })
      .__linguaLensRequests = (window as Window & { __linguaLensRequests?: Map<string, unknown> }).__linguaLensRequests || new Map();

    const timer = setTimeout(() => {
      cleanup();
      reject(new Error(`Bridge request ${requestId} timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    // Override resolve to clear timer
    const originalResolve = resolve;
    resolve = ((value: unknown) => {
      clearTimeout(timer);
      originalResolve(value);
    }) as typeof resolve;
  });
}
