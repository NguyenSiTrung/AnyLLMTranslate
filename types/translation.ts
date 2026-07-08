/**
 * Translation-related types used across the extension.
 */

import type { PageContext } from './config';
import type { ProfileKnobs } from '@/lib/subtitleProfiles';
import type { RichVariable } from '@/lib/richTranslate';

/** A translatable piece of content extracted from the DOM */
export interface TranslationPiece {
  /** Unique identifier for this piece */
  id: string;
  /** The parent block element containing this piece */
  parentElement: Element;
  /** Text nodes that make up this piece */
  textNodes: Text[];
  /** Extracted text content for translation */
  text: string;
  /** Whether this piece has been translated */
  isTranslated: boolean;
  /** The translated text (if translated) */
  translatedText?: string;
  /**
   * Inline-markup variables for rich translate (FR-1). Present when
   * `enableRichTranslate` is on and the piece carried inline elements; the
   * LLM receives `<z id="N">…</z>` tokens in `text` and these variables
   * reconstruct the markup on decode. Absent for plain-text pieces.
   */
  variables?: RichVariable[];
  /** FR-3: true when the piece's nearest block ancestor is an article/main
   *  container; false for sidebar/nav content. Used to partition batches so
   *  article prose and chrome text don't interleave in the same LLM request. */
  inArticleContext?: boolean;
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
  /** When set, the request is a subtitle translation: the service routes to
   *  buildSubtitleSystemPrompt() and ignores customSystemPrompt. */
  subtitleKnobs?: ProfileKnobs;
  /** Rolling proper-noun glossary block for subtitle cross-chunk continuity.
   *  Injected into the subtitle system prompt after the user's global glossary. */
  rollingGlossaryBlock?: string;
  /** When set, the service uses this string verbatim as the system prompt and
   *  skips both buildSystemPrompt and buildSubtitleSystemPrompt. Used by the
   *  per-film pre-scan (services/subtitleNameScanner.ts) to inject its own
   *  name-extraction prompt. */
  preScanSystemPrompt?: string;
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
  /** True when the LLM omitted some IDs and they were back-filled with the
   *  original text (success, but content was repaired — useful for stats). */
  partial?: boolean;
  /** Proper nouns extracted from the response (subtitle path only).
   *  Populated when the model returns a "properNouns" field alongside
   *  "translations". Undefined on the web-page translation path. */
  properNouns?: Record<string, string>;
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
  /** When true, request a streamed SSE response. The caller must consume the
   *  response body as a ReadableStream of SSE deltas (Phase 2 streaming path). */
  stream?: boolean;
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
