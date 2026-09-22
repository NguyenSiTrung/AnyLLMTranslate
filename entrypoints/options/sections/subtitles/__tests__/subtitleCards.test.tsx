import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { PrealignFromLinkCard } from '../PrealignFromLinkCard';
import { SavedCaptionRealignsCard } from '../SavedCaptionRealignsCard';

/**
 * @vitest-environment jsdom
 */

const sendMessage = vi.fn();
let messageListener: ((msg: unknown) => void) | null = null;

vi.stubGlobal('chrome', {
  runtime: {
    sendMessage,
    onMessage: {
      addListener: vi.fn((fn: (msg: unknown) => void) => {
        messageListener = fn;
      }),
      removeListener: vi.fn(),
    },
  },
});

const WATCH_URL = 'https://www.youtube.com/watch?v=abc123';

function emitProgress(videoId: string, current: number, total: number) {
  act(() => {
    messageListener?.({
      action: 'ASR_REALIGN_PROGRESS_BROADCAST',
      videoId,
      current,
      total,
    });
  });
}

describe('PrealignFromLinkCard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    messageListener = null;
    sendMessage.mockResolvedValue({ success: true, outcome: 'realigned' });
  });

  it('renders the URL input, run button, and token-cost note, and rejects an invalid URL client-side', async () => {
    render(<PrealignFromLinkCard disabled={false} />);
    // facet: renders the URL input, run button, and token-cost note.
    expect(screen.getByLabelText(/YouTube link/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Re-align now/i })).toBeInTheDocument();
    expect(screen.getByText(/token/i)).toBeInTheDocument();

    // facet: rejects an invalid URL client-side without messaging the background.
    fireEvent.change(screen.getByLabelText(/YouTube link/i), {
      target: { value: 'https://example.com/nope' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Re-align now/i }));
    expect(await screen.findByText(/valid YouTube link/i)).toBeInTheDocument();
    expect(sendMessage).not.toHaveBeenCalled();
  });

  it('accepts watch, youtu.be, shorts, and embed URLs and requests each pre-align', async () => {
    for (const url of [
      'https://www.youtube.com/watch?v=abc123&t=10',
      'https://youtu.be/abc123',
      'https://www.youtube.com/shorts/abc123',
      'https://www.youtube.com/embed/abc123',
    ]) {
      sendMessage.mockClear();
      sendMessage.mockResolvedValue({ success: true, outcome: 'realigned' });
      messageListener = null;
      const view = render(<PrealignFromLinkCard disabled={false} />);
      fireEvent.change(screen.getByLabelText(/YouTube link/i), { target: { value: url } });
      fireEvent.click(screen.getByRole('button', { name: /Re-align now/i }));
      await waitFor(() => {
        expect(sendMessage).toHaveBeenCalledWith({ action: 'REALIGN_YOUTUBE_URL', url });
      });
      expect(await screen.findByText(/Re-aligned and saved/i)).toBeInTheDocument();
      view.unmount();
    }
  });

  it('shows batch progress i/n from the runtime broadcast while running', async () => {
    let resolveRun: (value: unknown) => void = () => {};
    sendMessage.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveRun = resolve;
        }),
    );
    render(<PrealignFromLinkCard disabled={false} />);
    fireEvent.change(screen.getByLabelText(/YouTube link/i), { target: { value: WATCH_URL } });
    fireEvent.click(screen.getByRole('button', { name: /Re-align now/i }));

    expect(await screen.findByText(/Re-aligning captions/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Re-aligning/i })).toBeDisabled();

    // Progress for a different video is ignored.
    emitProgress('other-video', 4, 9);
    expect(screen.queryByText(/4\/9/)).not.toBeInTheDocument();

    emitProgress('abc123', 2, 5);
    expect(await screen.findByText(/2\/5/)).toBeInTheDocument();

    await act(async () => {
      resolveRun({ success: true, outcome: 'realigned' });
    });
    expect(await screen.findByText(/Re-aligned and saved/i)).toBeInTheDocument();
  });

  it('reports already-saved with zero LLM calls', async () => {
    sendMessage.mockResolvedValue({ success: true, outcome: 'already-saved' });
    render(<PrealignFromLinkCard disabled={false} />);
    fireEvent.change(screen.getByLabelText(/YouTube link/i), { target: { value: WATCH_URL } });
    fireEvent.click(screen.getByRole('button', { name: /Re-align now/i }));
    await waitFor(() => {
      const status = screen.getByTestId('prealign-status');
      expect(status).toHaveTextContent(/[Aa]lready saved/);
      expect(status).toHaveTextContent(/[Zz]ero LLM calls/);
    });
  });

  it('maps every typed error code to its specific message', async () => {
    const cases: Array<[string, RegExp]> = [
      ['video-unavailable', /unavailable, private, or age-gated/i],
      ['no-captions', /no caption tracks/i],
      ['no-asr', /human-uploaded captions/i],
      ['fetch-blocked', /consent or bot-check/i],
      ['provider-not-configured', /No translation provider is configured/i],
      ['llm-failure', /AI re-align failed/i],
      ['invalid-url', /valid YouTube link/i],
    ];
    for (const [errorCode, pattern] of cases) {
      sendMessage.mockClear();
      sendMessage.mockResolvedValue({ success: false, errorCode, error: 'detail' });
      messageListener = null;
      const view = render(<PrealignFromLinkCard disabled={false} />);
      fireEvent.change(screen.getByLabelText(/YouTube link/i), { target: { value: WATCH_URL } });
      fireEvent.click(screen.getByRole('button', { name: /Re-align now/i }));
      expect(await screen.findByText(pattern)).toBeInTheDocument();
      view.unmount();
    }
  });

  it('disables controls when the subtitles master toggle is off', () => {
    render(<PrealignFromLinkCard disabled={true} />);
    expect(screen.getByLabelText(/YouTube link/i)).toBeDisabled();
    expect(screen.getByRole('button', { name: /Re-align now/i })).toBeDisabled();
  });
});

/**
 * @vitest-environment jsdom
 */



const sampleEntry = {
  key: 'ai:vid1:en:hash',
  videoId: 'vid1',
  language: 'en',
  mode: 'ai' as const,
  title: 'Sample Video',
  thumbnailUrl: 'https://i.ytimg.com/vi/vid1/mqdefault.jpg',
  youtubeUrl: 'https://www.youtube.com/watch?v=vid1',
  cueCount: 12,
  byteSize: 2048,
  contentHash: 'hash',
  createdAt: 1_700_000_000_000,
  lastUsedAt: 1_700_000_100_000,
};

describe('SavedCaptionRealignsCard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sendMessage.mockImplementation(async (msg: { action?: string; key?: string }) => {
      if (msg?.action === 'LIST_ASR_REALIGN_CACHE') {
        return { success: true, entries: [] };
      }
      if (msg?.action === 'DELETE_ASR_REALIGN_CACHE') {
        return { success: true };
      }
      if (msg?.action === 'CLEAR_ASR_REALIGN_CACHE') {
        return { success: true };
      }
      return { success: true };
    });
  });

  it('renders empty state', async () => {
    render(<SavedCaptionRealignsCard />);
    await waitFor(() => {
      expect(screen.getByText(/No saved AI re-aligns yet/i)).toBeInTheDocument();
    });
  });

  it('lists entries and deletes one', async () => {
    sendMessage.mockImplementation(async (msg: { action?: string }) => {
      if (msg?.action === 'LIST_ASR_REALIGN_CACHE') {
        return { success: true, entries: [sampleEntry] };
      }
      if (msg?.action === 'DELETE_ASR_REALIGN_CACHE') {
        return { success: true };
      }
      return { success: true };
    });

    render(<SavedCaptionRealignsCard />);
    await waitFor(() => {
      expect(screen.getByText('Sample Video')).toBeInTheDocument();
    });
    expect(screen.getByRole('link', { name: /Open on YouTube/i })).toHaveAttribute(
      'href',
      sampleEntry.youtubeUrl,
    );

    // After delete, list becomes empty
    sendMessage.mockImplementation(async (msg: { action?: string }) => {
      if (msg?.action === 'LIST_ASR_REALIGN_CACHE') {
        return { success: true, entries: [] };
      }
      if (msg?.action === 'DELETE_ASR_REALIGN_CACHE') {
        return { success: true };
      }
      return { success: true };
    });

    fireEvent.click(screen.getByRole('button', { name: /^Delete$/i }));
    await waitFor(() => {
      expect(sendMessage).toHaveBeenCalledWith({
        action: 'DELETE_ASR_REALIGN_CACHE',
        key: sampleEntry.key,
      });
    });
  });

  it('force re-run deletes the key, and clear all confirms and clears', async () => {
    sendMessage.mockImplementation(async (msg: { action?: string }) => {
      if (msg?.action === 'LIST_ASR_REALIGN_CACHE') {
        return { success: true, entries: [sampleEntry] };
      }
      if (msg?.action === 'CLEAR_ASR_REALIGN_CACHE') {
        return { success: true };
      }
      return { success: true };
    });
    render(<SavedCaptionRealignsCard />);
    await waitFor(() => expect(screen.getByText('Sample Video')).toBeInTheDocument());

    // facet: force re-run deletes key.
    fireEvent.click(screen.getByRole('button', { name: /Force re-run/i }));
    await waitFor(() => {
      expect(sendMessage).toHaveBeenCalledWith({
        action: 'DELETE_ASR_REALIGN_CACHE',
        key: sampleEntry.key,
      });
    });

    // facet: clear all confirms and clears.
    await waitFor(() => expect(screen.getByText('Sample Video')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /Clear all/i }));
    expect(screen.getByText(/Clear all saved re-aligns/i)).toBeInTheDocument();
    const confirmButtons = screen.getAllByRole('button', { name: /^Clear all$/i });
    fireEvent.click(confirmButtons[confirmButtons.length - 1]!);
    await waitFor(() => {
      expect(sendMessage).toHaveBeenCalledWith({ action: 'CLEAR_ASR_REALIGN_CACHE' });
    });
  });
});
