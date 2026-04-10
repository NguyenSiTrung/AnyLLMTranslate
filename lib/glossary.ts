/**
 * Glossary utility — formats glossary entries for system prompt injection.
 */

import type { GlossaryEntry } from '@/types/config';

/** Format glossary entries as a plain-text glossary block for prompt injection */
export function formatGlossary(entries: GlossaryEntry[]): string {
  if (entries.length === 0) return '';

  const lines = entries.map((e) => `- "${e.source}" → "${e.target}"`);
  return `Translation Glossary (always use these translations):\n${lines.join('\n')}`;
}

/**
 * Check which glossary entries were not honoured in the translation output.
 * An entry is flagged when its source term appears (case-insensitively) in
 * `inputText` but its target term is absent from `outputText`.
 */
export function checkGlossaryMismatches(
  entries: GlossaryEntry[],
  inputText: string,
  outputText: string,
): GlossaryEntry[] {
  const inputLower = inputText.toLowerCase();
  const outputLower = outputText.toLowerCase();

  return entries.filter(
    (e) =>
      inputLower.includes(e.source.toLowerCase()) &&
      !outputLower.includes(e.target.toLowerCase()),
  );
}

/** Parse a CSV string into GlossaryEntry objects */
export function parseGlossaryCSV(csv: string): GlossaryEntry[] {
  const entries: GlossaryEntry[] = [];
  const lines = csv.trim().split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line || (i === 0 && isHeaderLine(line))) continue;

    const parts = splitCSVLine(line);
    if (parts.length >= 2) {
      entries.push({
        id: `csv-${Date.now()}-${i}`,
        source: parts[0].trim(),
        target: parts[1].trim(),
      });
    }
  }

  return entries;
}

/** Export glossary entries as CSV string */
export function exportGlossaryCSV(entries: GlossaryEntry[]): string {
  const header = 'source,target';
  const lines = entries.map((e) => `${escapeCSV(e.source)},${escapeCSV(e.target)}`);
  return [header, ...lines].join('\n');
}

/** Export glossary entries as JSON string */
export function exportGlossaryJSON(entries: GlossaryEntry[]): string {
  return JSON.stringify(entries, null, 2);
}

/** Parse JSON string into GlossaryEntry objects */
export function parseGlossaryJSON(json: string): GlossaryEntry[] {
  const parsed = JSON.parse(json);
  if (!Array.isArray(parsed)) {
    throw new Error('Invalid glossary JSON: expected an array');
  }

  return parsed.map((entry: Record<string, unknown>, i: number) => {
    if (typeof entry.source !== 'string' || typeof entry.target !== 'string') {
      throw new Error(`Invalid entry at index ${i}: must have source and target strings`);
    }
    return {
      id: typeof entry.id === 'string' ? entry.id : `json-${Date.now()}-${i}`,
      source: entry.source,
      target: entry.target,
    };
  });
}

function isHeaderLine(line: string): boolean {
  const lower = line.toLowerCase();
  return lower.startsWith('source') && lower.includes('target');
}

function splitCSVLine(line: string): string[] {
  const parts: string[] = [];
  let current = '';
  let inQuotes = false;

  for (const char of line) {
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      parts.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  parts.push(current);
  return parts;
}

function escapeCSV(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}
