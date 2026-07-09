import type { DailyStatRecord, StatCounters, TranslationStatsV2 } from '@/types/stats';

/** CSV column order for daily totals export (v1). */
const CSV_COLUMNS = [
  'date',
  'characters',
  'apiCalls',
  'cacheHits',
  'cacheMisses',
  'cacheCharacters',
  'pageSessions',
  'subtitleCues',
  'selectionEvents',
  'inlineEvents',
  'pdfEvents',
] as const;

type CsvCounterKey = Exclude<(typeof CSV_COLUMNS)[number], 'date'>;

const CSV_COUNTER_KEYS = CSV_COLUMNS.filter(
  (c): c is CsvCounterKey => c !== 'date',
);

/**
 * Build a privacy-safe JSON export of stats aggregates.
 * Includes lifetime, preferences, tracking timestamps, and full daily records
 * (with dimensions). Never includes API keys or other secrets.
 */
export function buildStatsJsonExport(input: {
  summary: TranslationStatsV2;
  daily: DailyStatRecord[];
}): string {
  const { summary, daily } = input;
  const payload = {
    lifetime: summary.lifetime,
    preferences: summary.preferences,
    trackingSince: summary.trackingSince,
    lastActiveAt: summary.lastActiveAt,
    daily,
  };
  return JSON.stringify(payload, null, 2);
}

/**
 * Build CSV of daily totals only (one row per date). Dimension maps are omitted.
 */
export function buildStatsCsvExport(daily: DailyStatRecord[]): string {
  const lines: string[] = [CSV_COLUMNS.join(',')];

  for (const day of daily) {
    const totals: StatCounters = day.totals;
    const cells: string[] = [day.date];
    for (const key of CSV_COUNTER_KEYS) {
      cells.push(String(totals[key] ?? 0));
    }
    lines.push(cells.join(','));
  }

  return lines.join('\n') + '\n';
}

/**
 * Trigger a browser file download via a temporary object URL + anchor click.
 */
export function triggerDownload(
  filename: string,
  content: string,
  mime: string,
): void {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}
