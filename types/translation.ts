/**
 * Translation-related types used across the extension.
 */

import type { PageContext } from './config';

/** A translatable piece of content extracted from the DOM */
export interface TranslationPiece {
  /** Unique identifier for this piece */
  id: string;
  /** The parent block element containing this piece */
  parentElement: Element;
  /** Text nodes that make up this piece */
  textNodes: Text[];
  /** Original HTML content (for restore) */
  originalHTML: string;
  /** Extracted text content for translation */
  text: string;
  /** Whether this piece has been translated */
  isTranslated: boolean;
  /** The translated text (if translated) */
  translatedText?: string;
}

/** Request to the translation service */
export interface TranslationRequest {
  /** Texts to translate, keyed by piece ID */
  texts: Map<string, string>;
  /** Source language (ISO 639-1 or 'auto') */
  sourceLanguage: string;
  /** Target language (ISO 639-1) */
  targetLanguage: string;
  /** Pre-formatted glossary block from formatGlossary() — injected into system prompt */
  glossaryBlock?: string;
  /** User's custom system prompt template override */
  customSystemPrompt?: string | null;
  /** Page context for context-aware translation */
  pageContext?: PageContext;
}

/** Result from the translation service */
export interface TranslationResult {
  /** Whether the translation succeeded */
  success: boolean;
  /** Translated texts, keyed by piece ID */
  translations: Map<string, string>;
  /** Error message if failed */
  error?: string;
  /** Detected source language (if auto-detect was used) */
  detectedLanguage?: string;
}

/** Translation service interface */
export interface TranslationService {
  /** Translate a batch of texts */
  translate(request: TranslationRequest): Promise<TranslationResult>;
  /** Test the connection to the translation provider */
  testConnection(): Promise<{ success: boolean; error?: string }>;
}

/** OpenAI-compatible chat completion request */
export interface ChatCompletionRequest {
  model: string;
  messages: ChatMessage[];
  temperature?: number;
  max_tokens?: number;
  response_format?: { type: 'json_object' };
}

/** Chat message */
export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

/** OpenAI-compatible chat completion response */
export interface ChatCompletionResponse {
  id: string;
  choices: Array<{
    message: {
      role: string;
      content: string;
    };
    finish_reason: string;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

/** Cache entry stored in IndexedDB */
export interface CacheEntry {
  /** Cache key (SHA-256 hash) */
  key: string;
  /** Translated text */
  translatedText: string;
  /** Source language */
  sourceLanguage: string;
  /** Target language */
  targetLanguage: string;
  /** Timestamp when cached */
  cachedAt: number;
  /** Timestamp of last access (for LRU) */
  lastAccessedAt: number;
  /** Approximate size in bytes */
  sizeBytes: number;
}
