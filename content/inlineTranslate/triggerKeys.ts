/**
 * Trigger / starting key equivalence (refer `inputStartingTriggerKeyAlias`).
 *
 * Space matches NBSP (editors pad trailing spaces with it) and the ideographic
 * space U+3000 (CJK IMEs in full-width mode); punctuation keys match the
 * full-width forms an IME produces for the same physical key.
 */

const KEY_ALIASES: Readonly<Record<string, readonly string[]>> = {
  ' ': [' ', ' ', '　'],
  '/': ['/', '、'],
  '.': ['.', '。'],
  ',': [',', '，'],
  ';': [';', '；'],
  ':': [':', '：'],
  '=': ['=', '＝'],
};

/** Stored key in canonical form (`'Space'` → `' '`). */
export function normalizeTriggerKey(key: string): string {
  return key === 'Space' ? ' ' : key;
}

export function isSpaceTriggerKey(key: string): boolean {
  return normalizeTriggerKey(key) === ' ';
}

/** Every character that counts as `key` (the key itself first). */
export function triggerCharClass(key: string): readonly string[] {
  const normalized = normalizeTriggerKey(key);
  return KEY_ALIASES[normalized] ?? [normalized];
}

/** Whether a single character (or key name) counts as the trigger key. */
export function matchesTriggerChar(ch: string, key: string): boolean {
  return triggerCharClass(key).includes(ch);
}

/** Prefix (starting key) characters share the trigger alias table. */
export function startingKeyAliases(key: string): readonly string[] {
  return triggerCharClass(key);
}

/**
 * Match a keydown against the trigger key. Space also accepts
 * `code === 'Space'`: many IME/OS layouts report a non-space `event.key`
 * while the physical code stays `"Space"`.
 */
export function isTriggerKeyEvent(event: KeyboardEvent, key: string): boolean {
  if (matchesTriggerChar(event.key, key)) return true;
  if (isSpaceTriggerKey(key)) {
    return event.code === 'Space' || event.key === 'Spacebar' || event.key === 'Space';
  }
  return false;
}
