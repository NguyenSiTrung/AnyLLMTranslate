/**
 * Passphrase quality heuristic for the encrypted-backup export dialog.
 * Returns null for empty input so callers can hide the meter entirely.
 *
 * Evaluation order (first match wins). Character classes: lowercase,
 * uppercase, digit, symbol.
 *   strong — length >= 12 AND >= 3 classes
 *   fair   — length >= 8 AND (>= 2 classes OR length >= 12)
 *   weak   — everything else
 */

export type PassphraseStrength = 'weak' | 'fair' | 'strong';

const CLASS_RES = [/[a-z]/, /[A-Z]/, /\d/, /[^a-zA-Z0-9]/] as const;

export function passphraseStrength(password: string): PassphraseStrength | null {
  if (!password) return null;
  const classes = CLASS_RES.filter((re) => re.test(password)).length;
  if (password.length >= 12 && classes >= 3) return 'strong';
  if (password.length >= 8 && (classes >= 2 || password.length >= 12)) return 'fair';
  return 'weak';
}
