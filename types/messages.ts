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
  | 'CLEAR_CACHE'
  | 'OPEN_PDF_VIEWER'
  | 'PDF_DETECTED';

/** Translation request from content script → background */
export interface TranslateMessage {
  action: 'translate';
  pieces: TranslationPiecePayload[];
  sourceLanguage: string;
  targetLanguage: string;
  tabId?: number;
  pageContext?: PageContext;
}

/** Payload sent for translation (serializable subset of TranslationPiece) */
export interface TranslationPiecePayload {
  id: string;
  text: string;
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

/** Subtitle translation request from content script → background */
export interface TranslateSubtitleMessage {
  action: 'translateSubtitle';
  cues: SubtitleCue[];
  sourceLanguage: string;
  targetLanguage: string;
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
}

/** Translate selection request from content script → background */
export interface TranslateSelectionMessage {
  action: 'translateSelection';
  text: string;
  sourceLanguage: string;
  targetLanguage: string;
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

/** Clear cache request from options page → background */
export interface ClearCacheMessage {
  action: 'CLEAR_CACHE';
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

/** Union type for all messages */
export type ExtensionMessage =
  | TranslateMessage
  | RestoreMessage
  | GetStatusMessage
  | TestConnectionMessage
  | UpdateSettingsMessage
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
  | ClearCacheMessage
  | OpenPdfViewerMessage
  | PdfDetectedMessage;

/** Translation result from background → content script */
export interface TranslationResultMessage {
  success: boolean;
  results?: TranslationResultItem[];
  error?: string;
}

/** Single translation result item */
export interface TranslationResultItem {
  id: string;
  translatedText: string;
}

/** Tab translation status */
export type TabTranslationStatus = 'idle' | 'translating' | 'done' | 'error';

/** Status response from background → popup */
export interface StatusResponse {
  status: TabTranslationStatus;
  translatedCount: number;
  totalCount: number;
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
