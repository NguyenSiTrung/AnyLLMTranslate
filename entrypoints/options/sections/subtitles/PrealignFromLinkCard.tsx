/**
 * Re-align from link — paste a YouTube URL to run AI caption re-alignment
 * ahead of playback (pre-warms the AI re-align cache). Never translates.
 * Spec: conductor/tracks/youtube-link-prealign_20260804/spec.md
 */

import { useEffect, useRef, useState } from 'react';
import { Link2, WandSparkles } from 'lucide-react';
import { Card } from '@/ui/Card';
import { Badge } from '@/ui/Badge';
import { Button } from '@/ui/Button';
import { Input } from '@/ui/Input';
import { DisabledDimmer } from '@/ui/DisabledDimmer';
import { extractYoutubeVideoIdFromUrl } from '@/lib/youtubeAsrRealignCache';
import type {
  AsrRealignProgressBroadcastMessage,
  RealignYoutubeUrlErrorCode,
  RealignYoutubeUrlResult,
} from '@/types/messages';

export interface PrealignFromLinkCardProps {
  /** True when the subtitles master toggle is off. */
  disabled?: boolean;
}

type RunState =
  | { kind: 'idle' }
  | { kind: 'running'; progress: { current: number; total: number } | null }
  | { kind: 'realigned' }
  | { kind: 'already-saved' }
  | { kind: 'error'; code: RealignYoutubeUrlErrorCode; detail?: string };

const ERROR_MESSAGES: Record<RealignYoutubeUrlErrorCode, string> = {
  'invalid-url': 'Enter a valid YouTube link (watch, share, shorts, or embed).',
  'video-unavailable': 'This video is unavailable, private, or age-gated.',
  'no-captions': 'This video has no caption tracks.',
  'no-asr':
    'Only human-uploaded captions found — AI re-align applies to auto-generated captions.',
  'fetch-blocked': 'YouTube served a consent or bot-check page instead of the video. Try again later.',
  'provider-not-configured':
    'No translation provider is configured. Set one up in the Providers tab first.',
  'llm-failure': 'The AI re-align failed. Playback is unaffected — you can try again.',
};

export function PrealignFromLinkCard({ disabled = false }: PrealignFromLinkCardProps) {
  const [url, setUrl] = useState('');
  const [urlError, setUrlError] = useState<string | null>(null);
  const [state, setState] = useState<RunState>({ kind: 'idle' });
  const runVideoIdRef = useRef<string | null>(null);

  const running = state.kind === 'running';

  // Batch progress arrives via runtime broadcast (options page has no tab id).
  useEffect(() => {
    const onMsg = (msg: unknown) => {
      const m = msg as AsrRealignProgressBroadcastMessage | undefined;
      if (m?.action !== 'ASR_REALIGN_PROGRESS_BROADCAST') return;
      if (!runVideoIdRef.current || m.videoId !== runVideoIdRef.current) return;
      setState((prev) =>
        prev.kind === 'running'
          ? { kind: 'running', progress: { current: m.current, total: m.total } }
          : prev,
      );
    };
    chrome.runtime.onMessage.addListener(onMsg);
    return () => {
      chrome.runtime.onMessage.removeListener(onMsg);
    };
  }, []);

  const handleRun = async () => {
    const trimmed = url.trim();
    const videoId = extractYoutubeVideoIdFromUrl(trimmed);
    if (!videoId) {
      setUrlError('Enter a valid YouTube link (watch, share, shorts, or embed).');
      return;
    }
    setUrlError(null);
    runVideoIdRef.current = videoId;
    setState({ kind: 'running', progress: null });
    try {
      const result = (await chrome.runtime.sendMessage({
        action: 'REALIGN_YOUTUBE_URL',
        url: trimmed,
      })) as RealignYoutubeUrlResult | undefined;
      if (result?.success && result.outcome === 'already-saved') {
        setState({ kind: 'already-saved' });
      } else if (result?.success) {
        setState({ kind: 'realigned' });
      } else {
        setState({
          kind: 'error',
          code: result?.errorCode ?? 'llm-failure',
          detail: result?.error,
        });
      }
    } catch (error) {
      setState({
        kind: 'error',
        code: 'llm-failure',
        detail: error instanceof Error ? error.message : String(error),
      });
    } finally {
      runVideoIdRef.current = null;
    }
  };

  return (
    <Card
      title="Re-align from link"
      description="Paste a YouTube link to AI re-align its auto captions ahead of playback — no need to open the video."
      icon={<Link2 className="w-3.5 h-3.5" />}
      variant="bordered"
      headerExtra={<Badge variant="info">YouTube</Badge>}
    >
      <DisabledDimmer disabled={disabled}>
        <div className="space-y-3">
          <div>
            <label
              htmlFor="prealign-youtube-url"
              className="block text-sm text-zinc-200 mb-1.5"
            >
              YouTube link
            </label>
            <div className="flex items-start gap-2">
              <div className="min-w-0 flex-1">
                <Input
                  id="prealign-youtube-url"
                  type="url"
                  placeholder="https://www.youtube.com/watch?v=…"
                  value={url}
                  disabled={disabled || running}
                  error={urlError ?? undefined}
                  onChange={(e) => {
                    setUrl(e.target.value);
                    if (urlError) setUrlError(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !running && !disabled) {
                      e.preventDefault();
                      void handleRun();
                    }
                  }}
                />
              </div>
              <Button
                size="md"
                variant="primary"
                className="shrink-0"
                disabled={disabled || url.trim().length === 0}
                loading={running}
                icon={<WandSparkles className="w-3.5 h-3.5" />}
                onClick={() => void handleRun()}
              >
                {running ? 'Re-aligning…' : 'Re-align now'}
              </Button>
            </div>
          </div>

          <p className="text-xs text-zinc-500 leading-relaxed">
            Runs the AI re-align once per video caption body — this uses your LLM tokens.
            The result is saved on this device; watching the video later reuses it and only
            translation runs. Repeat runs on an unchanged video make zero LLM calls.
          </p>

          {state.kind === 'running' && (
            <p className="text-xs text-cyan-300" data-testid="prealign-status" role="status">
              {state.progress
                ? `Re-aligning captions… ${state.progress.current}/${state.progress.total}`
                : 'Re-aligning captions…'}
            </p>
          )}

          {state.kind === 'realigned' && (
            <p className="text-xs text-emerald-400" data-testid="prealign-status" role="status">
              Re-aligned and saved — the next watch reuses it and only translates. See Saved
              caption re-aligns below.
            </p>
          )}

          {state.kind === 'already-saved' && (
            <p className="text-xs text-emerald-400" data-testid="prealign-status" role="status">
              Already saved — this video’s re-align is on this device. Zero LLM calls made.
            </p>
          )}

          {state.kind === 'error' && (
            <div className="text-xs text-rose-400" data-testid="prealign-status" role="alert">
              <p>{ERROR_MESSAGES[state.code]}</p>
              {state.detail && (
                <p className="mt-0.5 text-rose-400/70 break-words">{state.detail}</p>
              )}
            </div>
          )}
        </div>
      </DisabledDimmer>
    </Card>
  );
}
