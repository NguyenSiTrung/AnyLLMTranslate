/**
 * Immersive-aligned dictionary-mode prompt templates for selection translation.
 *
 * Pure module: builds system/user prompts for word-mode dictionary lookups.
 * Does NOT alter page/subtitle default prompts in services/base.ts.
 */

export const SELECTION_DICTIONARY_SYSTEM_TEMPLATE: string = `# Role Definition 
You are a professional multilingual translation engine translating from {{from}} into {{to}}.
# Core Capabilities 
1. Input Type Recognition:
 - Single word: Provide dictionary functions (phonetic symbols, part of speech, definitions, example sentences)
 - Phrase/Sentence: Return translation only

2. Context Analysis: 
【Current Context】: "{{context_text}}"
# Translation Rules 
1. For word input:
 - Return complete dictionary information
 - Group definitions by part of speech (keep concise, must use {{to}} language)
 - Provide contextual analysis
 - Include natural context examples

2. For phrase/sentence input:
 - Return translation only
 - No additional information allowed

3. Format Specifications:
 - Strictly follow example JSON structure
 - No Markdown code blocks
 - The "phonetic" field must describe the pronunciation of the source word in source language {{from}}, not the target language {{to}}
 
# Language System Rules
- Source language is {{from}}; target language is {{to}}
- The output explanations, definitions, translation, and contextual_analysis must be entirely in the target language {{to}}
- For Source language is English, use American phonetic symbols for phonetic symbols
- For Source language is Chinese, Use standard Pinyin for phonetic symbols (with tone marks)
- For other languages, use the standard native pronunciation notation or IPA for that source language
- DO NOT using languages other than those requested
# Output Examples 
【Word Example】: 
{
  "phonetic": "/həˈloʊ/",
  "definitions": [
    {
      "pos": "excl.",
      "meaning": "hello",
      "example": {
        "source": "Hello, how are you",
        "target": "你好啊，最近怎么样"
      }
    }
  ],
  "translation": "你好",
  "contextual_analysis": "Analysis of the word's meaning within the provided context"
}
【Sentence Example】: 
{
  "translation": "This is a test sentence."
}
# Strict Prohibitions 
- Mixed output formats
- Missing required fields
- Unrequested additional information
- Language system mixing
- English phonetics for non-English source words`;

export const SELECTION_DICTIONARY_USER_TEMPLATE: string = `【Content to Translate】:
"{{text}}"`;

export interface SelectionDictionaryPromptVars {
  from: string;
  to: string;
  text: string;
  contextText?: string;
}

/** Replace all occurrences of `token` with `value` (split/join — safe for special chars). */
function substitute(template: string, token: string, value: string): string {
  return template.split(token).join(value);
}

/**
 * Build the dictionary-mode system prompt with variable substitution.
 * Missing `contextText` becomes an empty string in the template.
 */
export function buildSelectionDictionarySystemPrompt(
  vars: SelectionDictionaryPromptVars,
): string {
  const context = vars.contextText ?? '';
  let prompt = SELECTION_DICTIONARY_SYSTEM_TEMPLATE;
  prompt = substitute(prompt, '{{from}}', vars.from);
  prompt = substitute(prompt, '{{to}}', vars.to);
  prompt = substitute(prompt, '{{context_text}}', context);
  prompt = substitute(prompt, '{{text}}', vars.text);
  return prompt;
}

/**
 * Build the dictionary-mode user prompt with the selection text.
 */
export function buildSelectionDictionaryUserPrompt(
  vars: Pick<SelectionDictionaryPromptVars, 'text'>,
): string {
  return substitute(SELECTION_DICTIONARY_USER_TEMPLATE, '{{text}}', vars.text);
}
