/**
 * Pure helpers for Scientific job modal download-format selection and copy.
 * Kept free of React so unit tests stay fast and deterministic.
 */

export type ScientificDownloadFormat = 'mono' | 'dual' | 'side-by-side';

export function availableFormats(flags: {
  hasMono: boolean;
  hasDual: boolean;
}): ScientificDownloadFormat[] {
  const out: ScientificDownloadFormat[] = [];
  // Side-by-side needs mono (+ original assembled in the job hook)
  if (flags.hasMono) out.push('side-by-side');
  if (flags.hasDual) out.push('dual');
  if (flags.hasMono) out.push('mono');
  return out;
}

export function defaultFormat(flags: {
  hasMono: boolean;
  hasDual: boolean;
}): ScientificDownloadFormat | null {
  const list = availableFormats(flags);
  return list[0] ?? null;
}

export function formatCardCopy(format: ScientificDownloadFormat): {
  title: string;
  hint: string;
  downloadLabel: string;
} {
  switch (format) {
    case 'side-by-side':
      return {
        title: 'Side-by-side',
        hint: 'Original on the left, translation on the right.',
        downloadLabel: 'Download side-by-side',
      };
    case 'dual':
      return {
        title: 'Bilingual (bridge)',
        hint: 'Original and translation paired by the layout engine.',
        downloadLabel: 'Download bilingual',
      };
    case 'mono':
      return {
        title: 'Translated only',
        hint: 'Layout-preserving pages in the target language.',
        downloadLabel: 'Download translated PDF',
      };
  }
}

export function openResultPrefer(
  selected: ScientificDownloadFormat | null,
  flags: { hasMono: boolean; hasDual: boolean },
): 'dual' | 'mono' | null {
  if (selected === 'dual' && flags.hasDual) return 'dual';
  if ((selected === 'side-by-side' || selected === 'mono') && flags.hasMono) return 'mono';
  if (flags.hasMono) return 'mono';
  if (flags.hasDual) return 'dual';
  return null;
}

export function isRecommended(
  format: ScientificDownloadFormat,
  flags: { hasMono: boolean; hasDual: boolean },
): boolean {
  return defaultFormat(flags) === format;
}
