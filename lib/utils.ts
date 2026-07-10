/**
 * Recursively merge objects at all levels.
 * Arrays are overwritten, not merged.
 */
export function deepMerge<T extends Record<string, unknown>>(target: T, source: Record<string, unknown>): T {
  const result = { ...target } as Record<string, unknown>;
  for (const key of Object.keys(source)) {
    const sourceVal = source[key];
    const targetVal = result[key];
    const isPlainObject = (v: unknown): v is Record<string, unknown> =>
      typeof v === 'object' &&
      v !== null &&
      !Array.isArray(v) &&
      !(v instanceof Date) &&
      !(v instanceof RegExp) &&
      !(v instanceof Map) &&
      !(v instanceof Set);

    if (isPlainObject(sourceVal) && isPlainObject(targetVal)) {
      // Empty source objects replace (e.g. knobOverrides: {} clears overrides).
      // Recursive merge would leave old keys when source has no keys.
      if (Object.keys(sourceVal).length === 0) {
        result[key] = sourceVal;
      } else {
        result[key] = deepMerge(targetVal, sourceVal);
      }
    } else if (sourceVal !== undefined) {
      result[key] = sourceVal;
    }
  }
  return result as T;
}

/**
 * Detects if the Chrome extension's context has been invalidated.
 * Returns true if the background service worker was updated/reloaded.
 */
export function isContextInvalidated(): boolean {
  if (typeof process !== 'undefined' && process.env.NODE_ENV === 'test') {
    return false;
  }
  try {
    return !chrome.runtime || !chrome.runtime.id;
  } catch {
    return true;
  }
}

