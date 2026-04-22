/**
 * Message types for communication between extension contexts.
 * Background ↔ Content Script ↔ Popup
 */

import type { SubtitleCue, AvailableSubtitleTrack } from './subtitle';

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
  | 'statusUpdate'
  | 'SUBTITLE_CHUNK_TRANSLATED'
  | 'PRIORITIZE_SUBTITLE_CHUNK'
  | 'SUBTITLE_TRACKS_AVAILABLE'
  | 'SELECT_SUBTITLE_TRACK'
  | 'GET_AVAILABLE_TRACKS'
  | 'FLUSH_LRU';

/** Translation request from content script → background */
export interface TranslateMessage {
  action: 'translate';
  pieces: TranslationPiecePayload[];
  sourceLanguage: string;
  targetLanguage: string;
  tabId?: number;
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
}

/** Subtitle fetch request (CORS bypass) from content script → background */
export interface FetchSubtitleMessage {
  action: 'FETCH_SUBTITLE';
  url: string;
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

/** Priority queue request from content script → background */
export interface PrioritizeSubtitleChunkMessage {
  action: 'PRIORITIZE_SUBTITLE_CHUNK';
  cueIndex: number;
}

/** Union type for all messages */
/** Flush LRU cache updates on page unload */
export interface FlushLruMessage {
  action: 'FLUSH_LRU';
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
  | StatusUpdateMessage
  | SubtitleChunkTranslatedMessage
  | PrioritizeSubtitleChunkMessage
  | SubtitleTracksAvailableMessage
  | SelectSubtitleTrackMessage
  | GetAvailableTracksMessage
  | FlushLruMessage;

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
