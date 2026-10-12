/**
 * IME-safe gesture detection for trailing trigger keys (refer `Pqe`).
 *
 * Two branches:
 *  - Space: taps ≤ `triggerGapMs` apart extend the burst; every tap re-arms an
 *    idle timer, and when it fires the burst counts only if
 *    `tapCount ≤ count ≤ tapCount + triggerToleranceCount` (6+ fast taps never
 *    fire, so holding/hammering Space does not translate).
 *  - Other keys: taps further apart than `triggerTimeoutMs` restart the count;
 *    the burst fires as soon as `count ≥ tapCount` (after the key's own
 *    character has landed in the field).
 *
 * Dual path: keydown (primary) for physical presses, input insertText
 * (fallback) when sites/IMEs swallow or omit keydown — deduped so one physical
 * press never counts twice.
 */

import { DEFAULT_INLINE_TRANSLATE_SETTINGS } from '@/types/config';
import { isSpaceTriggerKey, isTriggerKeyEvent, matchesTriggerChar } from './triggerKeys';

export interface GestureConfig {
  enabled: boolean;
  triggerKey: string;
  tapCount: number;
  /** Space: quiet time after the last tap before the burst is evaluated. */
  idleMs: number;
  /** Space: maximum gap between taps of one burst. */
  triggerGapMs: number;
  /** Space: extra taps above tapCount that still fire. */
  triggerToleranceCount: number;
  /** Other keys: taps further apart than this restart the count. */
  triggerTimeoutMs: number;
}

export interface GestureCallbacks {
  /** Called when the gesture fires */
  onTrigger: (target: HTMLElement) => void;
  /** Guard: is this element allowed? */
  shouldAccept: (el: Element | null) => el is HTMLElement;
  /** Optional: caret-at-end check for trailing gesture */
  isCaretAtEnd?: (el: HTMLElement) => boolean;
  /** Optional: get field text to skip empty */
  getText?: (el: HTMLElement) => string;
  /**
   * Optional: tail gate evaluated at fire time, once the burst's characters
   * are in the field (letter-after-taps, burst actually at the end).
   */
  passesTailGate?: (el: HTMLElement) => boolean;
  /**
   * Optional: deepest event target. `event.target` is retargeted to the shadow
   * host when the event crosses a shadow boundary, which hides web-component
   * composers from the gesture.
   */
  resolveTarget?: (event: Event) => Element | null;
  now?: () => number;
}

export interface GestureController {
  /** Handle a KeyboardEvent (keydown preferred for counting) */
  onKeyDown: (event: KeyboardEvent) => void;
  /** Handle compositionend / input for IME reset & dual path */
  onCompositionEnd: (event: Event) => void;
  onCompositionStart: (event: Event) => void;
  onInput: (event: Event) => void;
  /** Reset counters */
  reset: () => void;
  /** Update config */
  setConfig: (partial: Partial<GestureConfig>) => void;
  getConfig: () => GestureConfig;
  /** Test: taps counted in the current burst */
  getCount: () => number;
  dispose: () => void;
}

/** Modifier presses (e.g. Shift for `:`) neither count nor break a burst. */
const MODIFIER_KEYS = new Set([
  'Shift',
  'Control',
  'Alt',
  'AltGraph',
  'Meta',
  'CapsLock',
  'Fn',
  'OS',
  'Super',
  'Hyper',
]);

/** Match the configured trigger key (and its aliases) against a KeyboardEvent. */
export function isTriggerKey(event: KeyboardEvent, triggerKey: string): boolean {
  return isTriggerKeyEvent(event, triggerKey);
}

/** Whether inserted text from an InputEvent matches the trigger key. */
export function isTriggerInsertData(data: string | null, triggerKey: string): boolean {
  if (data == null || data.length === 0) return false;
  return matchesTriggerChar(data, triggerKey);
}

function isTestEnv(): boolean {
  // Use process.env only (no import.meta): content scripts are bundled as IIFE.
  return (
    typeof process !== 'undefined' &&
    typeof process.env === 'object' &&
    process.env.VITEST === 'true'
  );
}

/**
 * Create a gesture controller. Callers attach listeners and call the handlers.
 */
export function createGestureController(
  initial: GestureConfig,
  callbacks: GestureCallbacks,
): GestureController {
  let config: GestureConfig = { ...initial };
  let count = 0;
  let lastTapAt = 0;
  let composing = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let pendingTarget: HTMLElement | null = null;
  const processedEvents = new WeakSet<Event>();
  /**
   * After a keydown counts a trigger, suppress the matching input insertText
   * for a short window so dual-path does not double-count one physical press.
   */
  let keydownCountUntil = 0;

  const now = () => (callbacks.now ? callbacks.now() : Date.now());

  const gapMs = () =>
    config.triggerGapMs > 0 ? config.triggerGapMs : DEFAULT_INLINE_TRANSLATE_SETTINGS.triggerGapMs;
  const timeoutMs = () =>
    config.triggerTimeoutMs >= 100
      ? config.triggerTimeoutMs
      : DEFAULT_INLINE_TRANSLATE_SETTINGS.triggerTimeoutMs;

  function clearTimer(): void {
    if (timer != null) {
      clearTimeout(timer);
      timer = null;
    }
  }

  /** Reset counters and drop any scheduled evaluation. */
  function reset(): void {
    count = 0;
    lastTapAt = 0;
    pendingTarget = null;
    clearTimer();
  }

  function fireIfGatePasses(target: HTMLElement): void {
    if (callbacks.passesTailGate && !callbacks.passesTailGate(target)) return;
    keydownCountUntil = 0;
    callbacks.onTrigger(target);
  }

  /** Space branch: idle timer expired — evaluate the burst. */
  function evaluateSpaceBurst(): void {
    timer = null;
    const target = pendingTarget;
    const taps = count;
    count = 0;
    lastTapAt = 0;
    pendingTarget = null;
    if (!target) return;
    const max = config.tapCount + Math.max(0, config.triggerToleranceCount);
    if (taps >= config.tapCount && taps <= max) fireIfGatePasses(target);
  }

  function acceptTap(target: HTMLElement): void {
    const t = now();

    if (isSpaceTriggerKey(config.triggerKey)) {
      count = count > 0 && t - lastTapAt <= gapMs() ? count + 1 : 1;
      lastTapAt = t;
      pendingTarget = target;
      clearTimer();
      timer = setTimeout(evaluateSpaceBurst, Math.max(0, config.idleMs));
      return;
    }

    if (count > 0 && t - lastTapAt > timeoutMs()) count = 0;
    count += 1;
    lastTapAt = t;
    if (count < config.tapCount) return;

    // Fire on the next task so the key's own character is already in the
    // field (the gate and removeTail read it, and its input event must not
    // look like user typing during the request).
    count = 0;
    lastTapAt = 0;
    pendingTarget = target;
    clearTimer();
    timer = setTimeout(() => {
      timer = null;
      const pending = pendingTarget;
      pendingTarget = null;
      if (pending) fireIfGatePasses(pending);
    }, 0);
  }

  /** Deepest target for an event (shadow-aware when the caller provides it). */
  function eventTarget(event: Event): Element | null {
    if (callbacks.resolveTarget) {
      try {
        const resolved = callbacks.resolveTarget(event);
        if (resolved) return resolved;
      } catch {
        // fall back to the (possibly retargeted) event.target
      }
    }
    return event.target as Element | null;
  }

  /**
   * Shared guards for keydown / input trigger paths.
   * Returns the target to count against, or null to ignore.
   */
  function resolveCountTarget(raw: Element | null): HTMLElement | null {
    if (!config.enabled) return null;
    if (!callbacks.shouldAccept(raw)) return null;
    const target = raw as HTMLElement;

    if (callbacks.isCaretAtEnd && !callbacks.isCaretAtEnd(target)) {
      // Mid-string — do not count; reset burst so partial progress does not leak
      reset();
      return null;
    }

    if (callbacks.getText) {
      const text = callbacks.getText(target);
      // Skip truly empty before any trigger landed (avoid blank-field spam)
      if (!text.trim() && count === 0) {
        return null;
      }
    }

    return target;
  }

  function onKeyDown(event: KeyboardEvent): void {
    if (processedEvents.has(event)) return;
    processedEvents.add(event);

    if (!config.enabled) return;

    // Recover from missed compositionend — sticky flag would otherwise
    // permanently swallow every subsequent Space×N attempt.
    if (!event.isComposing && composing) {
      composing = false;
    }

    // P0: ignore untrusted, composing, and key-repeat.
    // jsdom KeyboardEvents are never trusted — allow them only under Vitest.
    if (!event.isTrusted && !isTestEnv()) return;

    // During IME composition: ignore this keydown but do NOT reset taps.
    // Resetting here caused Space×(N+1): the word-commit Space or a mid-burst
    // isComposing flicker wiped tap 1, so users needed 4 spaces for tapCount 3.
    if (event.isComposing || composing) {
      return;
    }
    if (event.repeat) return;
    if (MODIFIER_KEYS.has(event.key)) return;

    if (!isTriggerKey(event, config.triggerKey)) {
      // Any other key means the user kept typing: drop the burst and any
      // pending evaluation (a letter after the taps never translates).
      reset();
      return;
    }

    const target = resolveCountTarget(eventTarget(event));
    if (!target) return;

    // Suppress the following input insertText for this physical press.
    // Some editors deliver input on the next task after keydown
    // (ProseMirror/React), so the window is wider than one tick.
    keydownCountUntil = now() + 100;
    acceptTap(target);
  }

  function onCompositionStart(_event: Event): void {
    composing = true;
    // Real IME character composition — cancel an in-progress burst.
    reset();
  }

  function onCompositionEnd(_event: Event): void {
    composing = false;
    // Do NOT reset taps or cancel pending fire.
    // Space often ends composition; wiping taps here made Space×3 require
    // a 4th press (count 1 → compositionend wipe → need 3 more).
  }

  function onInput(event: Event): void {
    if (processedEvents.has(event)) return;
    processedEvents.add(event);

    const ie = event as InputEvent;
    const inputType = ie.inputType ?? '';

    // Delete-like inputTypes reset gesture progress
    if (
      inputType.startsWith('delete') ||
      inputType === 'historyUndo' ||
      inputType === 'historyRedo'
    ) {
      reset();
      return;
    }

    if (!config.enabled) return;
    if (composing) return;

    // Dual path: count trigger inserts when keydown was swallowed / missing.
    const isInsert =
      inputType === 'insertText' ||
      inputType === 'insertCompositionText' ||
      inputType === 'insertFromPaste' ||
      inputType === '';
    if (!isInsert) return;
    if (!isTriggerInsertData(ie.data ?? null, config.triggerKey)) return;

    // keydown already counted this press
    if (now() < keydownCountUntil) return;

    // Untrusted synthetic inputs (our own write-back) — skip outside tests
    if (!event.isTrusted && !isTestEnv()) return;

    const target = resolveCountTarget(eventTarget(event));
    if (!target) return;

    acceptTap(target);
  }

  return {
    onKeyDown,
    onCompositionEnd,
    onCompositionStart,
    onInput,
    reset,
    setConfig(partial) {
      config = { ...config, ...partial };
      reset();
    },
    getConfig: () => ({ ...config }),
    getCount: () => count,
    dispose() {
      reset();
    },
  };
}
