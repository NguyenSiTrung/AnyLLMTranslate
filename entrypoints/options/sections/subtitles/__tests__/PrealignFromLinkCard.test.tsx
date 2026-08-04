/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { PrealignFromLinkCard } from '../PrealignFromLinkCard';

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

  it('renders the URL input, run button, and token-cost note', () => {
    render(<PrealignFromLinkCard disabled={false} />);
    expect(screen.getByLabelText(/YouTube link/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Re-align now/i })).toBeInTheDocument();
    expect(screen.getByText(/token/i)).toBeInTheDocument();
  });

  it('rejects an invalid URL client-side without messaging the background', async () => {
    render(<PrealignFromLinkCard disabled={false} />);
    fireEvent.change(screen.getByLabelText(/YouTube link/i), {
      target: { value: 'https://example.com/nope' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Re-align now/i }));
    expect(await screen.findByText(/valid YouTube link/i)).toBeInTheDocument();
    expect(sendMessage).not.toHaveBeenCalled();
  });

  it.each([
    ['watch', 'https://www.youtube.com/watch?v=abc123&t=10'],
    ['youtu.be', 'https://youtu.be/abc123'],
    ['shorts', 'https://www.youtube.com/shorts/abc123'],
    ['embed', 'https://www.youtube.com/embed/abc123'],
  ])('accepts %s URLs and requests a pre-align', async (_label, url) => {
    render(<PrealignFromLinkCard disabled={false} />);
    fireEvent.change(screen.getByLabelText(/YouTube link/i), { target: { value: url } });
    fireEvent.click(screen.getByRole('button', { name: /Re-align now/i }));
    await waitFor(() => {
      expect(sendMessage).toHaveBeenCalledWith({ action: 'REALIGN_YOUTUBE_URL', url });
    });
    expect(await screen.findByText(/Re-aligned and saved/i)).toBeInTheDocument();
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

  it.each([
    ['video-unavailable', /unavailable, private, or age-gated/i],
    ['no-captions', /no caption tracks/i],
    ['no-asr', /human-uploaded captions/i],
    ['fetch-blocked', /consent or bot-check/i],
    ['provider-not-configured', /No translation provider is configured/i],
    ['llm-failure', /AI re-align failed/i],
    ['invalid-url', /valid YouTube link/i],
  ])('maps typed error %s to a specific message', async (errorCode, pattern) => {
    sendMessage.mockResolvedValue({ success: false, errorCode, error: 'detail' });
    render(<PrealignFromLinkCard disabled={false} />);
    fireEvent.change(screen.getByLabelText(/YouTube link/i), { target: { value: WATCH_URL } });
    fireEvent.click(screen.getByRole('button', { name: /Re-align now/i }));
    expect(await screen.findByText(pattern)).toBeInTheDocument();
  });

  it('disables controls when the subtitles master toggle is off', () => {
    render(<PrealignFromLinkCard disabled={true} />);
    expect(screen.getByLabelText(/YouTube link/i)).toBeDisabled();
    expect(screen.getByRole('button', { name: /Re-align now/i })).toBeDisabled();
  });
});
