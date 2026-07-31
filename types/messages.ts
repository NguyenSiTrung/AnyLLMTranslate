/**
 * Message types for communication between extension contexts.
 * Background ↔ Content Script ↔ Popup
 */

import type { SubtitleCue, AvailableSubtitleTrack } from './subtitle';
import type { PageContext } from './config';
import type { SubtitleProfile, ProfileKnobs } from '@/lib/subtitleProfiles';

/** Category resolution info returned to popup */
export interface CategoryInfo {
  /** Auto-detected category from heuristics */
  autoDetected?: string;
  /** Category set via SiteRule */
  siteRule?: string;
  /** Temporary tab-scoped override */
  override?: string;
  /** Effective category after resolution */
  effective?: string;
}

/** Actions the background service worker handles */
export type MessageAction =
  | 'translate'
  | 'restore'
  | 'getStatus'
  | 'testConnection'
  | 'updateSettings'
  | 'getNamedGlossarySuggestions'
  | 'translateSubtitle'
  | 'translateSelection'
  | 'FETCH_SUBTITLE'
  | 'FETCH_MANIFEST_SUBTITLES'
  | 'statusUpdate'
  | 'SUBTITLE_CHUNK_TRANSLATED'
  | 'SUBTITLE_CHUNK_FAILED'
  | 'PRIORITIZE_SUBTITLE_CHUNK'
  | 'CANCEL_SUBTITLE_SESSION'
  | 'SUBTITLE_TRACKS_AVAILABLE'
  | 'SELECT_SUBTITLE_TRACK'
  | 'GET_AVAILABLE_TRACKS'
  | 'FLUSH_LRU'
  | 'setCategoryOverride'
  | 'getCategoryOverride'
  | 'getPageCategory'
  | 'pageCategoryUpdate'
  | 'DETECT_PAGE_CATEGORY_LLM'
  | 'CLASSIFY_PDF_PARAGRAPHS'
  | 'EXTRACT_PDF_TERMS'
  | 'RESEGMENT_YOUTUBE_ASR'
  | 'GET_ASR_REALIGN_CACHE'
  | 'SAVE_ASR_REALIGN_CACHE'
  | 'LIST_ASR_REALIGN_CACHE'
  | 'DELETE_ASR_REALIGN_CACHE'
  | 'CLEAR_ASR_REALIGN_CACHE'
  | 'ASR_REALIGN_CACHE_STATS'
  | 'ASR_REALIGN_PROGRESS'
  | 'ASR_REALIGN_CACHE_UPDATED'
  | 'CLEAR_CACHE'
  | 'WEB_RESUME_LOAD'
  | 'WEB_RESUME_SAVE'
  | 'OPEN_PDF_VIEWER'
  | 'PDF_DETECTED'
  | 'REGISTER_PDF_SESSION'
  | 'UNREGISTER_PDF_SESSION'
  | 'TRANSLATE_PDF_STREAM'
  | 'GET_POOL_KEY_STATUSES'
  | 'SCIENTIFIC_PDF_HEALTH'
  | 'SCIENTIFIC_PDF_CREATE_JOB'
  | 'SCIENTIFIC_PDF_GET_JOB'
  | 'SCIENTIFIC_PDF_DOWNLOAD'
  | 'SCIENTIFIC_PDF_CANCEL'
  | 'SYNTHESIZE_SPEECH'
  | 'SUGGEST_SITE_RULE'
  | 'GET_DOM_OUTLINE';

/** Translation request from content script → background */
export interface TranslateMessage {
  action: 'translate';
  pieces: TranslationPiecePayload[];
  sourceLanguage: string;
  targetLanguage: string;
  tabId?: number;
  pageContext?: PageContext;
  /** Bypass the FR-4 negative (failure) cache and clear any cached failure for
   *  these pieces before re-requesting. Set on user-initiated retry (clicking the
   *  "Click to retry" error state) so the retry actually re-calls the LLM instead
   *  of re-surfacing the cached error. */
  skipFailureCache?: boolean;
  /** Pre-formatted document term-memory block (FR-11) for subsequent batches. */
  termMemoryBlock?: string;
}

/** Payload sent for translation (serializable subset of TranslationPiece) */
export interface TranslationPiecePayload {
  id: string;
  text: string;
  /** FR-3: true when the piece is inside an article/main container. Used by
   *  the background to partition batches so article prose and chrome text
   *  don't interleave in the same LLM request. */
  inArticleContext?: boolean;
}

/** Restore request from popup/content → background */
export interface RestoreMessage {
  action: 'restore';
  tabId?: number;
}

/** Status query from popup → background */
export interface GetStatusMessage {
  action: 'getStatus';
  tabId?: number;
}

/** Test connection request from options → background */
export interface TestConnectionMessage {
  action: 'testConnection';
}

/** Settings update notification */
export interface UpdateSettingsMessage {
  action: 'updateSettings';
}

/** Popup → background: fetch the latest film-name suggestions for a tab. */
export interface GetNamedGlossarySuggestionsMessage {
  action: 'getNamedGlossarySuggestions';
  tabId?: number;
}

export interface GetNamedGlossarySuggestionsResult {
  success: boolean;
  suggestions: Record<string, string>;
}

/** Subtitle translation request from content script → background */
export interface TranslateSubtitleMessage {
  action: 'translateSubtitle';
  cues: SubtitleCue[];
  sourceLanguage: string;
  targetLanguage: string;
  /** Page hostname for per-site named list resolution. */
  hostname?: string;
  pageContext?: PageContext;
  /** Subtitle profile resolved by the content script from window.location.hostname.
   *  Background falls back to 'media' when absent (backward compat). */
  profile?: SubtitleProfile;
  /** Per-tab translation-style override (session-scoped; from popup).
   *  Partial<ProfileKnobs> — set knobs override the profile/global layers.
   *  Undefined when no per-tab override is active. */
  knobOverrides?: Partial<ProfileKnobs>;
  /** Unique session ID to track progressive chunk translation. */
  sessionId?: number;
  /** Skip per-film name pre-scan (manifest/seek deltas; glossary already warm). */
  skipFilmPreScan?: boolean;
}

/** Popup → content: set or clear the active tab's per-subtitle translation-style override. */
export interface SetSubtitleKnobOverrideMessage {
  action: 'setSubtitleKnobOverride';
  /** Partial knobs to set, or null to clear the tab override entirely. */
  knobOverrides: Partial<ProfileKnobs> | null;
}

/** Subtitle fetch request (CORS bypass) from content script → background */
export interface FetchSubtitleMessage {
  action: 'FETCH_SUBTITLE';
  url: string;
}

/** Manifest subtitle fetch request from content script → background (Tier 2) */
export interface FetchManifestSubtitlesMessage {
  action: 'FETCH_MANIFEST_SUBTITLES';
  playlistUrl: string;
  preferredLanguage?: string;
}

/** Translate selection request from content script → background */
export interface TranslateSelectionMessage {
  action: 'translateSelection';
  text: string;
  sourceLanguage: string;
  targetLanguage: string;
  /**
   * Opt-in dictionary word-mode. Only the selection-translate path should set
   * this; hover and inline must omit it so they always get plain translation.
   */
  dictionaryMode?: boolean;
  /** Surrounding DOM context for dictionary prompts (optional, capped). */
  contextText?: string;
}

/** Structured dictionary payload returned when word-mode succeeds. */
export interface SelectionDictionaryPayload {
  phonetic?: string;
  definitions?: Array<{
    pos?: string;
    meaning?: string;
    example?: { source?: string; target?: string };
  }>;
  translation?: string;
  contextualAnalysis?: string;
}

/** Translate selection response from background → content script */
export interface TranslateSelectionResult {
  success: boolean;
  /** Always a displayable string (primary translation or fail-open raw text). */
  translatedText?: string;
  /** 'dictionary' when structured fields present; otherwise 'sentence'. */
  mode?: 'dictionary' | 'sentence';
  /** Present when mode is dictionary. */
  dictionary?: SelectionDictionaryPayload;
  error?: string;
}

/** Status update notification from background → popup */
export interface StatusUpdateMessage {
  action: 'statusUpdate';
  tabId: number;
  status: StatusResponse;
}

/** Chunk of translated subtitles from background → content script */
export interface SubtitleChunkTranslatedMessage {
  action: 'SUBTITLE_CHUNK_TRANSLATED';
  cues: SubtitleCue[];
}

/** Background → Content: a background chunk failed all retries (no translation). */
export interface SubtitleChunkFailedMessage {
  action: 'SUBTITLE_CHUNK_FAILED';
  chunkStart: number;
  sessionId: number | null;
}

/** Priority queue request from content script → background */
export interface PrioritizeSubtitleChunkMessage {
  action: 'PRIORITIZE_SUBTITLE_CHUNK';
  cueIndex: number;
}

/** Cancel an in-progress subtitle translation session (Content → Background) */
export interface CancelSubtitleSessionMessage {
  action: 'CANCEL_SUBTITLE_SESSION';
  tabId?: number;
}

/** Union type for all messages */
/** Flush LRU cache updates on page unload */
export interface FlushLruMessage {
  action: 'FLUSH_LRU';
}

/** Set a temporary category override for a tab (Popup → Background) */
export interface SetCategoryOverrideMessage {
  action: 'setCategoryOverride';
  tabId?: number;
  category: string | null;
}

/** Get current category override for a tab (Popup → Background) */
export interface GetCategoryOverrideMessage {
  action: 'getCategoryOverride';
  tabId?: number;
}

/** Query full category info from content script (Popup → Content) */
export interface GetPageCategoryMessage {
  action: 'getPageCategory';
}

/** Live category update from content script → popup (auto-detection result) */
export interface PageCategoryUpdateMessage {
  action: 'pageCategoryUpdate';
  categoryInfo: CategoryInfo;
}

/** Detect page category using LLM (Content → Background) */
export interface DetectPageCategoryLlmMessage {
  action: 'DETECT_PAGE_CATEGORY_LLM';
  pageContext: PageContext;
}

/** A label assigned to a paragraph by the LLM figure/table classifier. */
export type PdfParagraphLabel = 'prose' | 'figure';

/** Classify PDF paragraphs as prose vs figure/table (Content → Background). */
export interface ClassifyPdfParagraphsMessage {
  action: 'CLASSIFY_PDF_PARAGRAPHS';
  paragraphs: Array<{ id: string; text: string }>;
}

/** Response shape for CLASSIFY_PDF_PARAGRAPHS. */
export interface ClassifyPdfParagraphsResult {
  success: boolean;
  labels?: Record<string, PdfParagraphLabel>;
  error?: string;
}

/** Extract technical term pairs from sampled PDF prose (Viewer → Background). */
export interface ExtractPdfTermsMessage {
  action: 'EXTRACT_PDF_TERMS';
  sampleText: string;
  sourceLanguage: string;
  targetLanguage: string;
}

/** Response shape for EXTRACT_PDF_TERMS. */
export interface ExtractPdfTermsResult {
  success: boolean;
  /** Parsed term pairs when available. */
  terms?: Array<{ source: string; target: string }>;
  /** Raw LLM text for client-side parse fallback. */
  raw?: string;
  error?: string;
}

/**
 * AI/BYOK YouTube ASR sentence re-alignment (Content → Background).
 * Units are timed words (preferred) or coarse cues; background batches LLM calls.
 */
export interface ResegmentYoutubeAsrMessage {
  action: 'RESEGMENT_YOUTUBE_ASR';
  language: string;
  units: Array<{ text: string; startMs: number; endMs: number }>;
  /** When set, background emits ASR_REALIGN_PROGRESS to this tab (else sender.tab.id). */
  progressTabId?: number;
}

/** Response shape for RESEGMENT_YOUTUBE_ASR. */
export interface ResegmentYoutubeAsrResult {
  success: boolean;
  cues?: SubtitleCue[];
  error?: string;
}

/** Cached AI re-align entry (mirrors lib/youtubeAsrRealignCache; cues optional on list). */
export interface AsrRealignCacheEntryPayload {
  key: string;
  videoId: string;
  language: string;
  mode: 'ai';
  title?: string;
  thumbnailUrl?: string;
  youtubeUrl?: string;
  cueCount: number;
  byteSize: number;
  contentHash: string;
  createdAt: number;
  lastUsedAt: number;
  cues: SubtitleCue[];
}

export type AsrRealignCacheSummaryPayload = Omit<AsrRealignCacheEntryPayload, 'cues'>;

export interface GetAsrRealignCacheMessage {
  action: 'GET_ASR_REALIGN_CACHE';
  key: string;
}

export interface GetAsrRealignCacheResult {
  success: boolean;
  entry?: AsrRealignCacheEntryPayload;
  error?: string;
}

export interface SaveAsrRealignCacheMessage {
  action: 'SAVE_ASR_REALIGN_CACHE';
  entry: AsrRealignCacheEntryPayload;
}

export interface SaveAsrRealignCacheResult {
  success: boolean;
  error?: string;
}

export interface ListAsrRealignCacheMessage {
  action: 'LIST_ASR_REALIGN_CACHE';
}

export interface ListAsrRealignCacheResult {
  success: boolean;
  entries?: AsrRealignCacheSummaryPayload[];
  error?: string;
}

export interface DeleteAsrRealignCacheMessage {
  action: 'DELETE_ASR_REALIGN_CACHE';
  key: string;
}

export interface ClearAsrRealignCacheMessage {
  action: 'CLEAR_ASR_REALIGN_CACHE';
}

export interface AsrRealignCacheStatsMessage {
  action: 'ASR_REALIGN_CACHE_STATS';
}

export interface AsrRealignCacheStatsResult {
  success: boolean;
  entryCount?: number;
  totalBytes?: number;
  error?: string;
}

/** Background → content tab during AI resegment batches */
export interface AsrRealignProgressMessage {
  action: 'ASR_REALIGN_PROGRESS';
  phase: 'realigning';
  current: number;
  total: number;
}

/** Background → extension pages after cache mutate */
export interface AsrRealignCacheUpdatedMessage {
  action: 'ASR_REALIGN_CACHE_UPDATED';
}

/** Clear cache request from options page → background */
export interface ClearCacheMessage {
  action: 'CLEAR_CACHE';
}

/**
 * Load a cross-session web-resume snapshot (content → background).
 * Resume IDB lives in the extension origin so Clear cache can wipe it;
 * content scripts must not open that IDB directly (page-origin isolation).
 */
export interface WebResumeLoadMessage {
  action: 'WEB_RESUME_LOAD';
  url: string;
  contentHash: string;
}

/** Persist a cross-session web-resume snapshot (content → background). */
export interface WebResumeSaveMessage {
  action: 'WEB_RESUME_SAVE';
  snapshot: {
    url: string;
    contentHash: string;
    targetLanguage: string;
    capturedAt: number;
    pieces: Array<{
      id: string;
      text: string;
      translatedText?: string;
      status: 'pending' | 'translated' | 'error';
      parentPath?: string;
    }>;
  };
}

/** Open the bundled PDF viewer for a given URL (Popup → Background). */
export interface OpenPdfViewerMessage {
  action: 'OPEN_PDF_VIEWER';
  url: string;
}

/** Notification from a content script that the active document is a PDF.
 *  Sent when `document.contentType === 'application/pdf'` on a non-viewer tab. */
export interface PdfDetectedMessage {
  action: 'PDF_DETECTED';
  /** The PDF document's URL (the native viewer's location.href). */
  url: string;
  /** Sending tab id (mirrors sender.tab.id; included for explicit routing). */
  tabId?: number;
}

/** Register a PDF viewer tab as an active session (Viewer → Background).
 *  Arms the service-worker keep-alive alarm while ≥1 viewer is open so long
 *  content-heavy translation work is not interrupted by SW eviction. */
export interface RegisterPdfSessionMessage {
  action: 'REGISTER_PDF_SESSION';
}

/** Deregister a PDF viewer session (Viewer → Background).
 *  Clears the keep-alive alarm when no viewer sessions remain. */
export interface UnregisterPdfSessionMessage {
  action: 'UNREGISTER_PDF_SESSION';
}

// ---------------------------------------------------------------------------
// PDF streaming translation via chrome.runtime.connect port (Phase 2).
// The viewer opens a port named 'TRANSLATE_PDF_STREAM' with the translate
// request as the first message. The background calls service.translateStream()
// and pushes piece deltas back through the port, then a terminal result.
// ---------------------------------------------------------------------------

/** Port name for PDF streaming translation. */
export const PDF_STREAM_PORT = 'TRANSLATE_PDF_STREAM';

/** Port name for web-page streaming translation (FR-6, opt-in). */
export const WEB_STREAM_PORT = 'TRANSLATE_WEB_STREAM';

/** Initial message sent on the streaming port (Viewer → Background). */
export interface PdfStreamRequest {
  type: 'request';
  pieces: TranslationPiecePayload[];
  sourceLanguage: string;
  targetLanguage: string;
  /** FR-21: same context as non-stream web translate. */
  pageContext?: PageContext;
  termMemoryBlock?: string;
  skipFailureCache?: boolean;
}

/** A piece delta pushed from background → viewer during streaming. */
export interface PdfStreamPiece {
  type: 'piece';
  id: string;
  text: string;
}

/** Terminal success message with the full result map. */
export interface PdfStreamDone {
  type: 'done';
  results: TranslationResultItem[];
  /** True when missing ids were back-filled with source text (partial LLM response). */
  partial?: boolean;
}

/** Terminal error message (caller should fall back to non-streaming). */
export interface PdfStreamError {
  type: 'error';
  error: string;
  /** Absolute wall-clock ms when pool cooling ends (pool-level failures only). */
  retryAfter?: number;
}

/** Union of messages flowing through the PDF streaming port. */
export type PdfStreamPortMessage =
  | PdfStreamRequest
  | PdfStreamPiece
  | PdfStreamDone
  | PdfStreamError;

/** Options UI → background: snapshot live pool key circuit-breaker status */
export interface GetPoolKeyStatusesMessage {
  action: 'GET_POOL_KEY_STATUSES';
}

/** Serializable key status returned to options (mirrors coordinator KeyStatus). */
export interface PoolKeyStatusPayload {
  keyId: string;
  /** Breaker identity — keyId for single-model, keyId::model for multi-model. */
  slotId: string;
  /** Model id for this slot. */
  model: string;
  providerId: string;
  open: boolean;
  openUntil: number;
  credentialInvalid: boolean;
  lastFailureKind?: string;
  disabled: boolean;
}

export interface GetPoolKeyStatusesResponse {
  success: boolean;
  statuses?: Record<string, PoolKeyStatusPayload>;
  error?: string;
}

// ---------------------------------------------------------------------------
// Scientific PDF bridge (local pdf2zh) — Phase 3
// Credentials always come from the provider pool at job time; never stored
// on scientificPdf settings. PDF bytes travel as base64 over runtime messaging.
// ---------------------------------------------------------------------------

/** Probe bridge GET /health (Popup/Options/Viewer → Background). */
export interface ScientificPdfHealthMessage {
  action: 'SCIENTIFIC_PDF_HEALTH';
  /** Optional override; default = settings.scientificPdf.serverUrl. */
  serverUrl?: string;
}

export interface ScientificPdfHealthResult {
  success: boolean;
  status?: string;
  version?: string;
  pdf2zh?: string;
  /** Normalized server URL used for the probe. */
  serverUrl?: string;
  error?: string;
  /** Client error code: offline | timeout | parse | … */
  code?: string;
}

/**
 * Create a scientific translation job (Viewer → Background).
 * Background injects pool baseUrl/apiKey/model + languages.
 */
export interface ScientificPdfCreateJobMessage {
  action: 'SCIENTIFIC_PDF_CREATE_JOB';
  /** Source PDF as base64 (preferred for chrome.runtime messaging). */
  fileBase64: string;
  fileName?: string;
  /** Override settings.sourceLanguage when set. */
  sourceLanguage?: string;
  /** Override settings.targetLanguage when set. */
  targetLanguage?: string;
  /** Optional bridge URL override. */
  serverUrl?: string;
}

export interface ScientificPdfCreateJobResult {
  success: boolean;
  jobId?: string;
  state?: string;
  error?: string;
  code?: string;
}

/** Poll job state (Viewer → Background). */
export interface ScientificPdfGetJobMessage {
  action: 'SCIENTIFIC_PDF_GET_JOB';
  jobId: string;
  serverUrl?: string;
}

export interface ScientificPdfGetJobResult {
  success: boolean;
  job?: {
    id: string;
    state: string;
    progress?: number;
    message?: string;
    error?: { code: string; message: string };
    artifacts?: { mono?: boolean; dual?: boolean };
  };
  error?: string;
  code?: string;
}

/** Download mono or dual artifact as base64 PDF (Viewer → Background). */
export interface ScientificPdfDownloadMessage {
  action: 'SCIENTIFIC_PDF_DOWNLOAD';
  jobId: string;
  artifact: 'mono' | 'dual';
  serverUrl?: string;
}

export interface ScientificPdfDownloadResult {
  success: boolean;
  /** PDF bytes as base64. */
  fileBase64?: string;
  artifact?: 'mono' | 'dual';
  error?: string;
  code?: string;
}

/** Optional cancel / cleanup (Viewer → Background). */
export interface ScientificPdfCancelMessage {
  action: 'SCIENTIFIC_PDF_CANCEL';
  jobId: string;
  serverUrl?: string;
}

export interface ScientificPdfCancelResult {
  success: boolean;
  error?: string;
  code?: string;
}

/** Content → background: synthesize speech via OpenAI-compatible /audio/speech */
export interface SynthesizeSpeechMessage {
  action: 'SYNTHESIZE_SPEECH';
  text: string;
  /** Optional BCP-47 hint (unused by most TTS APIs; reserved). */
  lang?: string;
}

export interface SynthesizeSpeechResult {
  success: boolean;
  audioBase64?: string;
  mimeType?: string;
  error?: string;
}

/** Options → Background: suggest a site rule from a page URL. */
export interface SuggestSiteRuleMessage {
  action: 'SUGGEST_SITE_RULE';
  url: string;
}

/** Background → Options: draft site rule (or error). */
export interface SuggestSiteRuleResult {
  success: boolean;
  draft?: import('@/lib/siteRuleSuggest/types').SuggestSiteRuleDraft;
  error?: string;
}

/** Background → Content: request a capped DOM outline of the current page. */
export interface GetDomOutlineMessage {
  action: 'GET_DOM_OUTLINE';
}

/** Content → Background: DOM outline payload. */
export interface GetDomOutlineResult {
  success: boolean;
  outline?: import('@/lib/siteRuleSuggest/types').DomOutline;
  error?: string;
}

/** Union type for all messages */
export type ExtensionMessage =
  | TranslateMessage
  | RestoreMessage
  | GetStatusMessage
  | TestConnectionMessage
  | UpdateSettingsMessage
  | GetNamedGlossarySuggestionsMessage
  | TranslateSubtitleMessage
  | TranslateSelectionMessage
  | FetchSubtitleMessage
  | FetchManifestSubtitlesMessage
  | StatusUpdateMessage
  | SubtitleChunkTranslatedMessage
  | PrioritizeSubtitleChunkMessage
  | CancelSubtitleSessionMessage
  | SubtitleTracksAvailableMessage
  | SelectSubtitleTrackMessage
  | GetAvailableTracksMessage
  | FlushLruMessage
  | SetCategoryOverrideMessage
  | GetCategoryOverrideMessage
  | GetPageCategoryMessage
  | PageCategoryUpdateMessage
  | DetectPageCategoryLlmMessage
  | ClassifyPdfParagraphsMessage
  | ExtractPdfTermsMessage
  | ResegmentYoutubeAsrMessage
  | GetAsrRealignCacheMessage
  | SaveAsrRealignCacheMessage
  | ListAsrRealignCacheMessage
  | DeleteAsrRealignCacheMessage
  | ClearAsrRealignCacheMessage
  | AsrRealignCacheStatsMessage
  | AsrRealignProgressMessage
  | AsrRealignCacheUpdatedMessage
  | ClearCacheMessage
  | WebResumeLoadMessage
  | WebResumeSaveMessage
  | OpenPdfViewerMessage
  | PdfDetectedMessage
  | RegisterPdfSessionMessage
  | UnregisterPdfSessionMessage
  | GetPoolKeyStatusesMessage
  | ScientificPdfHealthMessage
  | ScientificPdfCreateJobMessage
  | ScientificPdfGetJobMessage
  | ScientificPdfDownloadMessage
  | ScientificPdfCancelMessage
  | SynthesizeSpeechMessage
  | SuggestSiteRuleMessage
  | GetDomOutlineMessage;

/** Translation result from background → content script */
export interface TranslationResultMessage {
  success: boolean;
  results?: TranslationResultItem[];
  error?: string;
  /** True when at least one sub-batch returned a partial (back-filled) result (FR-2). */
  partial?: boolean;
  /** Per-piece failures (from negative-cache hits or batch failures) so the content
   *  script can show error states per piece without a batch-level failure (FR-4). */
  failed?: Array<{ id: string; error: string }>;
  /**
   * Absolute wall-clock ms when the provider pool is expected to accept traffic
   * again after a cooling / rate-limit exhaustion. Present only for pool-level
   * failures (all slots open). PDF viewer uses this for a retry countdown.
   */
  retryAfter?: number;
}

/** Single translation result item */
export interface TranslationResultItem {
  id: string;
  translatedText: string;
  /**
   * PDF pipeline content kind (optional elsewhere).
   * `math` / `figure` are kept verbatim and never masked in Layout mode.
   */
  kind?: 'prose' | 'math' | 'figure';
  /**
   * PDF composition segments (prose vs formula) after placeholder reassembly.
   * Used by Layout overlay / download for selective masking of mixed paragraphs.
   */
  compositions?: Array<{
    kind: 'prose' | 'formula';
    text: string;
  }>;
}

/** Tab translation status */
export type TabTranslationStatus = 'idle' | 'translating' | 'done' | 'error';

/** Status response from background → popup */
export interface StatusResponse {
  status: TabTranslationStatus;
  translatedCount: number;
  totalCount: number;
  /**
   * Untranslated pieces currently in/near the reading viewport or in-flight.
   * Optional for backward compatibility with older content scripts mid-upgrade.
   */
  visiblePending?: number;
  /**
   * True when the reading strip is idle (no visible pending / in-flight work).
   * When true with `translatedCount < totalCount`, more content remains as you scroll.
   */
  viewportComplete?: boolean;
  error?: string;
}

/** Available subtitle tracks notification from content → popup */
export interface SubtitleTracksAvailableMessage {
  action: 'SUBTITLE_TRACKS_AVAILABLE';
  tracks: AvailableSubtitleTrack[];
}

/** Select a subtitle track request from popup → content */
export interface SelectSubtitleTrackMessage {
  action: 'SELECT_SUBTITLE_TRACK';
  language: string;
}

/** Query available tracks from popup → content */
export interface GetAvailableTracksMessage {
  action: 'GET_AVAILABLE_TRACKS';
}
