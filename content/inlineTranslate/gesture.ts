/**
 * IME-safe gesture detection for trailing trigger keys (e.g. triple-space).
 *
 * Dual path:
 *  - keydown (primary) for physical presses
 *  - input insertText (fallback) when sites/IMEs swallow or omit keydown
 * Deduped so the same physical press never counts twice.
 */

export interface GestureConfig {
  enabled: boolean;
  triggerKey: string;
  tapCount: number;
  timeWindowMs: number;
  idleMs: number;
  triggerGapMs: number;
  triggerToleranceCount: number;
}

export interface GestureCallbacks {
  /** Called when gesture fires (after optional idle debounce) */
  onTrigger: (target: HTMLElement) => void;
  /** Guard: is this element allowed? */
  shouldAccept: (el: Element | null) => el is HTMLElement;
  /** Optional: caret-at-end check for trailing gesture */
  isCaretAtEnd?: (el: HTMLElement) => boolean;
  /** Optional: get field text to skip empty */
  getText?: (el: HTMLElement) => string;
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
  /** Test: current tap timestamps */
  getTimestamps: () => number[];
  dispose: () => void;
}

/**
 * Match the configured trigger key against a KeyboardEvent.
 * Space is special-cased: many IME/OS layouts report a non-space `event.key`
 * while `event.code` remains `"Space"`. Accept either so Space×N stays reliable.
 */
export function isTriggerKey(event: KeyboardEvent, triggerKey: string): boolean {
  if (event.key === triggerKey) return true;
  if (triggerKey === ' ' || triggerKey === 'Space') {
    return event.code === 'Space' || event.key === 'Spacebar' || event.key === 'Space';
  }
  return false;
}

/** Whether inserted text from an InputEvent matches the trigger key. */
export function isTriggerInsertData(data: string | null, triggerKey: string): boolean {
  if (data == null || data.length === 0) return false;
  if (triggerKey === ' ' || triggerKey === 'Space') {
    // Single space, or NBSP which some editors insert for trailing spaces
    return data === ' ' || data === '\u00a0';
  }
  return data === triggerKey;
}

/**
 * Create a gesture controller. Callers attach listeners and call the handlers.
 */
export function createGestureController(
  initial: GestureConfig,
  callbacks: GestureCallbacks,
): GestureController {
  let config: GestureConfig = { ...initial };
  let keyTimestamps: number[] = [];
  let composing = false;
  let idleTimer: ReturnType<typeof setTimeout> | null = null;
  let pendingTarget: HTMLElement | null = null;
  /** Bumped to cancel a scheduled fire without racing element identity. */
  let fireToken = 0;
  const processedEvents = new WeakSet<Event>();
  /**
   * After a keydown counts a trigger, suppress the matching input insertText
   * for a short window so dual-path does not double-count one physical press.
   */
  let keydownCountUntil = 0;

  const now = () => (callbacks.now ? callbacks.now() : Date.now());

  function clearIdle(): void {
    if (idleTimer != null) {
      clearTimeout(idleTimer);
      idleTimer = null;
    }
    pendingTarget = null;
    fireToken += 1;
  }

  function resetTaps(): void {
    keyTimestamps = [];
  }

  function reset(): void {
    resetTaps();
    clearIdle();
  }

  function fire(target: HTMLElement): void {
    // Invalidate any other scheduled fires, then trigger once.
    if (idleTimer != null) {
      clearTimeout(idleTimer);
      idleTimer = null;
    }
    pendingTarget = null;
    fireToken += 1;
    keyTimestamps = [];
    keydownCountUntil = 0;
    callbacks.onTrigger(target);
  }

  function scheduleFire(target: HTMLElement): void {
    if (idleTimer != null) {
      clearTimeout(idleTimer);
      idleTimer = null;
    }
    pendingTarget = target;
    const token = ++fireToken;
    const idle = config.idleMs > 0 ? config.idleMs : 0;
    const delay = idle <= 0 ? 0 : idle;
    idleTimer = setTimeout(() => {
      idleTimer = null;
      // Only fire if this schedule is still current
      if (token === fireToken && pendingTarget === target) {
        fire(target);
      }
    }, delay);
  }

  function acceptTap(target: HTMLElement): void {
    const t = now();

    keyTimestamps.push(t);
    keyTimestamps = keyTimestamps.filter((ts) => t - ts <= config.timeWindowMs);

    if (
      config.triggerToleranceCount > 0 &&
      keyTimestamps.length > config.tapCount + config.triggerToleranceCount
    ) {
      keyTimestamps = keyTimestamps.slice(-config.tapCount);
    }

    if (keyTimestamps.length >= config.tapCount) {
      scheduleFire(target);
    }
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
      resetTaps();
      return null;
    }

    if (callbacks.getText) {
      const text = callbacks.getText(target);
      // Skip truly empty before any trigger landed (avoid blank-field spam)
      if (!text.trim() && keyTimestamps.length === 0) {
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
    // Use process.env only (no import.meta): content scripts are bundled as IIFE.
    const isTestEnv =
      typeof process !== 'undefined' &&
      typeof process.env === 'object' &&
      process.env.VITEST === 'true';
    if (!event.isTrusted && !isTestEnv) return;
    if (event.isComposing || composing) {
      // Do not cancel a pending fire — composition noise after the Nth space
      // previously wiped scheduleFire via full reset().
      resetTaps();
      return;
    }
    if (event.repeat) return;

    if (!isTriggerKey(event, config.triggerKey)) {
      // Non-trigger key resets gesture progress (user continued typing)
      // but does not cancel a pending fire already scheduled.
      resetTaps();
      return;
    }

    const target = resolveCountTarget(event.target as Element | null);
    if (!target) return;

    // Suppress the following input insertText for this physical press
    keydownCountUntil = now() + 50;
    acceptTap(target);
  }

  function onCompositionStart(_event: Event): void {
    composing = true;
    resetTaps();
  }

  function onCompositionEnd(_event: Event): void {
    composing = false;
    // Clear tap progress only — never cancel a pending scheduled fire.
    // Space often commits IME composition; compositionend used to call reset()
    // and wipe setTimeout(0) fires right as the gesture completed.
    resetTaps();
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
      resetTaps();
      return;
    }

    if (!config.enabled) return;
    if (composing) return;

    // Dual path: count trigger inserts when keydown was swallowed / missing.
    // insertText with space data, or insertCompositionText that ends with space.
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
    const isTestEnv =
      typeof process !== 'undefined' &&
      typeof process.env === 'object' &&
      process.env.VITEST === 'true';
    if (!event.isTrusted && !isTestEnv) return;

    const target = resolveCountTarget(event.target as Element | null);
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
    getTimestamps: () => [...keyTimestamps],
    dispose() {
      reset();
    },
  };
}
