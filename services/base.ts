/**
 * Base translation service interface and types.
 * All translation providers implement this interface.
 */

import type { TranslationRequest, TranslationResult } from '@/types/translation';
import type { ProviderConfig, PageContext } from '@/types/config';
import { getLanguageName } from '@/lib/languages';

/** Abstract base for all translation services */
export interface TranslationService {
  /** Translate a batch of texts */
  translate(request: TranslationRequest): Promise<TranslationResult>;

  /** Test the connection to the translation provider */
  testConnection(): Promise<{ success: boolean; error?: string }>;
}

/** Default system prompt template with injectable variables */
export const DEFAULT_SYSTEM_PROMPT_TEMPLATE = `You are a professional translator. Translate the given text to {{targetLanguage}}.

Rules:
- Translate naturally and fluently, preserving the original meaning and tone.
- Preserve ALL HTML tags, attributes, and structure exactly as they are.
- Do NOT translate code, URLs, email addresses, or proper nouns unless appropriate.
- If the text is already in the target language, return it unchanged.
- Respond ONLY with valid JSON in this exact format: {"translations": {"id1": "translated text 1", "id2": "translated text 2"}}
- The keys in "translations" must exactly match the input keys.
{{glossary}}`;

/** Build the system prompt for translation with optional custom template and page context */
export function buildSystemPrompt(
  targetLanguage: string,
  customTemplate?: string | null,
  glossaryBlock?: string,
  pageContext?: PageContext,
): string {
  const template = customTemplate || DEFAULT_SYSTEM_PROMPT_TEMPLATE;

  const targetLanguageName = getLanguageName(targetLanguage);
  const displayTargetLanguage = targetLanguageName !== targetLanguage 
    ? `${targetLanguageName} (${targetLanguage})` 
    : targetLanguage;

  let prompt = template.replace(/\{\{targetLanguage\}\}/g, displayTargetLanguage);

  const glossaryContent = glossaryBlock
    ? `\n${glossaryBlock}`
    : '';
  prompt = prompt.replace(/\{\{glossary\}\}/g, glossaryContent);

  // Append page context block if provided and has non-empty fields
  if (pageContext) {
    const contextLines: string[] = [];
    if (pageContext.title) contextLines.push(`- Title: ${pageContext.title}`);
    if (pageContext.description) contextLines.push(`- Topic: ${pageContext.description}`);
    if (pageContext.domain) contextLines.push(`- Domain: ${pageContext.domain}`);
    if (pageContext.category) contextLines.push(`- Category: ${pageContext.category}`);

    if (contextLines.length > 0) {
      prompt += `\n\nPage context for consistent terminology:\n${contextLines.join('\n')}`;
    }
  }

  return prompt.trim();
}

/** Prompt template validation result */
export interface PromptValidation {
  valid: boolean;
  warnings: string[];
}

/** Validate a custom prompt template for critical rules */
export function validatePromptTemplate(template: string): PromptValidation {
  const warnings: string[] = [];

  if (!template.includes('{{targetLanguage}}')) {
    warnings.push('Missing {{targetLanguage}} variable — target language will not be injected.');
  }

  if (!template.toLowerCase().includes('json')) {
    warnings.push('Missing JSON format instruction — LLM may not return parseable JSON.');
  }

  if (!template.toLowerCase().includes('translations')) {
    warnings.push('Missing "translations" key instruction — response format may be incorrect.');
  }

  return {
    valid: warnings.length === 0,
    warnings,
  };
}

/** Build the user prompt for a batch of texts */
export function buildUserPrompt(
  texts: Map<string, string>,
  sourceLanguage: string,
): string {
  const entries: Record<string, string> = {};
  for (const [id, text] of texts) {
    entries[id] = text;
  }

  let langHint = '';
  if (sourceLanguage !== 'auto') {
    const sourceLanguageName = getLanguageName(sourceLanguage);
    const displaySourceLanguage = sourceLanguageName !== sourceLanguage 
      ? `${sourceLanguageName} (${sourceLanguage})` 
      : sourceLanguage;
    langHint = ` The source language is ${displaySourceLanguage}.`;
  }

  return `Translate the following texts.${langHint}

${JSON.stringify(entries, null, 2)}`;
}

/** Parse the JSON response from the LLM */
export function parseTranslationResponse(
  responseText: string,
  expectedIds: string[],
): Map<string, string> {
  const translations = new Map<string, string>();

  // Try to parse as JSON directly
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(responseText);
  } catch {
    // Try to extract JSON from markdown code blocks
    const jsonMatch = responseText.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
    if (jsonMatch?.[1]) {
      parsed = JSON.parse(jsonMatch[1]);
    } else {
      throw new Error('Failed to parse translation response as JSON');
    }
  }

  // Handle { translations: { ... } } format
  const translationsObj = (parsed as Record<string, unknown>).translations ??  parsed;

  if (typeof translationsObj !== 'object' || translationsObj === null) {
    throw new Error('Translation response is not an object');
  }

  const missingIds: string[] = [];
  for (const id of expectedIds) {
    const value = (translationsObj as Record<string, unknown>)[id];
    if (typeof value === 'string') {
      translations.set(id, value);
    } else {
      missingIds.push(id);
    }
  }

  if (missingIds.length > 0) {
    console.warn('AnyLLMTranslate: Missing translation IDs in LLM response', missingIds);
  }

  return translations;
}

/** Validate a provider config has required fields */
export function validateProviderConfig(
  config: ProviderConfig,
): { valid: boolean; error?: string } {
  if (!config.baseUrl) {
    return { valid: false, error: 'Base URL is required' };
  }

  try {
    new URL(config.baseUrl);
  } catch {
    return { valid: false, error: 'Invalid Base URL format' };
  }

  if (config.requiresApiKey && !config.apiKey) {
    return { valid: false, error: 'API key is required for this provider' };
  }

  if (!config.model) {
    return { valid: false, error: 'Model name is required' };
  }

  return { valid: true };
}
