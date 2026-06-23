/**
 * Recursively merge objects at all levels.
 * Arrays are overwritten, not merged.
 */
export function deepMerge<T extends Record<string, unknown>>(target: T, source: Record<string, unknown>): T {
  const result = { ...target } as Record<string, unknown>;
  for (const key of Object.keys(source)) {
    const sourceVal = source[key];
    const targetVal = result[key];
    if (
      typeof sourceVal === 'object' &&
      sourceVal !== null &&
      !Array.isArray(sourceVal) &&
      !(sourceVal instanceof Date) &&
      !(sourceVal instanceof RegExp) &&
      !(sourceVal instanceof Map) &&
      !(sourceVal instanceof Set) &&
      typeof targetVal === 'object' &&
      targetVal !== null &&
      !Array.isArray(targetVal) &&
      !(targetVal instanceof Date) &&
      !(targetVal instanceof RegExp) &&
      !(targetVal instanceof Map) &&
      !(targetVal instanceof Set)
    ) {
      result[key] = deepMerge(targetVal as Record<string, unknown>, sourceVal as Record<string, unknown>);
    } else if (sourceVal !== undefined) {
      result[key] = sourceVal;
    }
  }
  return result as T;
}
