/**
 * Append a term pair to the global user glossary.
 */

import { loadSettings, updateSettings } from '@/lib/config';
import { findDuplicateSource } from '@/lib/glossary';

export type GlossaryAddResult =
  | { status: 'added' }
  | { status: 'duplicate' }
  | { status: 'invalid'; reason: string }
  | { status: 'error'; reason: string };

export async function addToGlobalGlossary(
  source: string,
  target: string,
): Promise<GlossaryAddResult> {
  const src = source.trim();
  const tgt = target.trim();
  if (!src || !tgt) {
    return { status: 'invalid', reason: 'Missing source or translation' };
  }
  try {
    const settings = await loadSettings();
    const glossary = settings.glossary ?? [];
    if (findDuplicateSource(glossary, src)) {
      return { status: 'duplicate' };
    }
    await updateSettings({
      glossary: [
        ...glossary,
        { id: crypto.randomUUID(), source: src, target: tgt },
      ],
    });
    return { status: 'added' };
  } catch (e) {
    return {
      status: 'error',
      reason: e instanceof Error ? e.message : 'Failed to update glossary',
    };
  }
}
