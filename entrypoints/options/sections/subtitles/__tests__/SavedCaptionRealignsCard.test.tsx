/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { SavedCaptionRealignsCard } from '../SavedCaptionRealignsCard';

const sendMessage = vi.fn();
const addListener = vi.fn();
const removeListener = vi.fn();

vi.stubGlobal('chrome', {
  runtime: {
    sendMessage,
    onMessage: {
      addListener,
      removeListener,
    },
  },
});

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

  it('force re-run deletes key', async () => {
    sendMessage.mockImplementation(async (msg: { action?: string }) => {
      if (msg?.action === 'LIST_ASR_REALIGN_CACHE') {
        return { success: true, entries: [sampleEntry] };
      }
      return { success: true };
    });
    render(<SavedCaptionRealignsCard />);
    await waitFor(() => expect(screen.getByText('Sample Video')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /Force re-run/i }));
    await waitFor(() => {
      expect(sendMessage).toHaveBeenCalledWith({
        action: 'DELETE_ASR_REALIGN_CACHE',
        key: sampleEntry.key,
      });
    });
  });

  it('clear all confirms and clears', async () => {
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
    fireEvent.click(screen.getByRole('button', { name: /Clear all/i }));
    expect(screen.getByText(/Clear all saved re-aligns/i)).toBeInTheDocument();
    const confirmButtons = screen.getAllByRole('button', { name: /^Clear all$/i });
    fireEvent.click(confirmButtons[confirmButtons.length - 1]!);
    await waitFor(() => {
      expect(sendMessage).toHaveBeenCalledWith({ action: 'CLEAR_ASR_REALIGN_CACHE' });
    });
  });
});
