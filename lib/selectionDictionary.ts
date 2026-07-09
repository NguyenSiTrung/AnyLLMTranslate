/**
 * Pure dictionary JSON parser for selection word-mode (FR-4).
 * Tolerant of partial fields; fail-open returns null so UI can use raw text.
 */

export interface SelectionDictionaryExample {
  source?: string;
  target?: string;
}

export interface SelectionDictionaryDefinition {
  pos?: string;
  meaning?: string;
  example?: SelectionDictionaryExample;
}

export interface SelectionDictionaryResult {
  phonetic?: string;
  definitions?: SelectionDictionaryDefinition[];
  translation?: string;
  contextualAnalysis?: string;
}

/** Strip model reasoning blocks (DeepSeek R1 style). */
function stripThinkBlocks(text: string): string {
  return text
    .replace(/<think>[\s\S]*?<\/think>/g, '')
    .replace(/<think>[\s\S]*$/g, '')
    .trim();
}

/** JSON.parse with trailing-comma leniency (common LLM mistake). */
function tryParseJson(text: string): Record<string, unknown> | null {
  try {
    const value: unknown = JSON.parse(text);
    if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      return value as Record<string, unknown>;
    }
    return null;
  } catch {
    const sanitized = text.replace(/,\s*([}\]])/g, '$1').trim();
    if (sanitized === text) return null;
    try {
      const value: unknown = JSON.parse(sanitized);
      if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
        return value as Record<string, unknown>;
      }
      return null;
    } catch {
      return null;
    }
  }
}

/** Extract a JSON object from LLM text using the same strategies as services/base.ts. */
function extractJsonObject(raw: string): Record<string, unknown> | null {
  const cleanText = stripThinkBlocks(raw);
  if (!cleanText) return null;

  // Strategy 1: direct parse
  let parsed = tryParseJson(cleanText);

  // Strategy 2: markdown code fences
  if (!parsed) {
    const jsonMatch = cleanText.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
    if (jsonMatch?.[1]) {
      parsed = tryParseJson(jsonMatch[1]);
    }
  }

  // Strategy 3: outermost braces
  if (!parsed) {
    const firstBrace = cleanText.indexOf('{');
    const lastBrace = cleanText.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      parsed = tryParseJson(cleanText.substring(firstBrace, lastBrace + 1));
    }
  }

  return parsed;
}

function asNonEmptyString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function parseExample(value: unknown): SelectionDictionaryExample | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const obj = value as Record<string, unknown>;
  const source = asNonEmptyString(obj.source);
  const target = asNonEmptyString(obj.target);
  if (!source && !target) return undefined;
  const example: SelectionDictionaryExample = {};
  if (source) example.source = source;
  if (target) example.target = target;
  return example;
}

function parseDefinitions(value: unknown): SelectionDictionaryDefinition[] | undefined {
  if (!Array.isArray(value)) return undefined;

  const definitions: SelectionDictionaryDefinition[] = [];
  for (const item of value) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
    const obj = item as Record<string, unknown>;
    const pos = asNonEmptyString(obj.pos);
    const meaning = asNonEmptyString(obj.meaning);
    const example = parseExample(obj.example);
    if (!pos && !meaning && !example) continue;
    const def: SelectionDictionaryDefinition = {};
    if (pos) def.pos = pos;
    if (meaning) def.meaning = meaning;
    if (example) def.example = example;
    definitions.push(def);
  }

  return definitions.length > 0 ? definitions : undefined;
}

function mapToResult(parsed: Record<string, unknown>): SelectionDictionaryResult | null {
  const phonetic = asNonEmptyString(parsed.phonetic);
  const translation = asNonEmptyString(parsed.translation);
  const contextualAnalysis =
    asNonEmptyString(parsed.contextualAnalysis) ??
    asNonEmptyString(parsed.contextual_analysis);
  const definitions = parseDefinitions(parsed.definitions);

  if (!phonetic && !translation && !contextualAnalysis && !definitions) {
    return null;
  }

  const result: SelectionDictionaryResult = {};
  if (phonetic) result.phonetic = phonetic;
  if (definitions) result.definitions = definitions;
  if (translation) result.translation = translation;
  if (contextualAnalysis) result.contextualAnalysis = contextualAnalysis;
  return result;
}

/** Parse raw LLM text into dictionary result. Returns null if unusable. */
export function parseSelectionDictionary(raw: string): SelectionDictionaryResult | null {
  if (typeof raw !== 'string' || !raw.trim()) return null;
  const parsed = extractJsonObject(raw);
  if (!parsed) return null;
  return mapToResult(parsed);
}

/** True if result has phonetic and/or non-empty definitions for dictionary UI. */
export function hasDictionaryFields(
  result: SelectionDictionaryResult | null | undefined,
): boolean {
  if (!result) return false;
  if (typeof result.phonetic === 'string' && result.phonetic.trim().length > 0) {
    return true;
  }
  if (!result.definitions || result.definitions.length === 0) return false;
  return result.definitions.some(
    (d) =>
      (typeof d.meaning === 'string' && d.meaning.trim().length > 0) ||
      (typeof d.pos === 'string' && d.pos.trim().length > 0),
  );
}

/** Best-effort plain translation string for fail-open display. */
export function extractTranslationFallback(
  raw: string,
  parsed: SelectionDictionaryResult | null,
): string {
  if (parsed?.translation && parsed.translation.trim().length > 0) {
    return parsed.translation.trim();
  }

  // Try extracting a translation field even when full map failed usable fields
  // (e.g. empty strings elsewhere) or when parse returned null but JSON has translation.
  if (typeof raw === 'string' && raw.trim()) {
    const obj = extractJsonObject(raw);
    if (obj) {
      const fromJson = asNonEmptyString(obj.translation);
      if (fromJson) return fromJson;
    }
    return stripThinkBlocks(raw);
  }

  return '';
}
