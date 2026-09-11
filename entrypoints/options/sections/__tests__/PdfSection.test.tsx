/**
 * Tests: PDF tab — the transferred characterization coverage from
 * AdvancedSection.pdf.test.tsx, adapted to the dedicated page: status-first
 * panel, segmented open behavior, chip site exceptions, bridge controls.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { DEFAULT_SETTINGS, type ExtensionSettings } from '@/types/config';
import { useSettingsStore } from '@/stores/settingsStore';
import { ToastProvider } from '@/ui/ToastProvider';
import { PdfSection } from '../PdfSection';

const sendMessage = vi.hoisted(() => vi.fn());

function renderPdf(overrides: Partial<ExtensionSettings> = {}) {
  const updateSettings = vi.fn();
  useSettingsStore.setState({
    ...DEFAULT_SETTINGS,
    ...overrides,
    isLoaded: true,
    updateSettings,
  } as never);
  render(
    <ToastProvider>
      <PdfSection />
    </ToastProvider>,
  );
  return { updateSettings };
}

describe('PdfSection', () => {
  beforeEach(() => {
    sendMessage.mockReset();
    sendMessage.mockResolvedValue({ success: false, status: 'offline' });
    vi.stubGlobal('chrome', {
      runtime: {
        sendMessage,
        getURL: vi.fn((path: string) => path),
        getManifest: vi.fn(() => ({ version: '0.0.0' })),
      },
      tabs: { create: vi.fn() },
      storage: {
        local: {
          get: vi.fn(async () => ({})),
          set: vi.fn(async () => {}),
          remove: vi.fn(async () => {}),
        },
        onChanged: { addListener: vi.fn(), removeListener: vi.fn() },
      },
    });
  });

  it('persists PDF auto-open without replacing site exceptions or open mode', async () => {
    const { updateSettings } = renderPdf({
      pdfSettings: {
        autoOpen: 'prompt',
        openMode: 'new-tab',
        neverAutoOpenSites: ['arxiv.org'],
      },
    });

    fireEvent.click(await screen.findByRole('radio', { name: /automatic/i }));
    expect(updateSettings).toHaveBeenCalledWith({
      pdfSettings: {
        autoOpen: 'auto',
        openMode: 'new-tab',
        neverAutoOpenSites: ['arxiv.org'],
      },
    });
  });

  it('shows Bridge offline for a configured bridge after a failed health check', async () => {
    renderPdf({
      scientificPdf: {
        enabled: true,
        serverUrl: 'http://127.0.0.1:17890',
        setupCompletedAt: '2026-09-01T00:00:00.000Z',
      },
    });

    expect(await screen.findByText('Bridge offline')).toBeInTheDocument();
    expect(sendMessage).toHaveBeenCalledWith({ action: 'SCIENTIFIC_PDF_HEALTH' });
  });

  it('warns before using a non-loopback bridge and always shows privacy copy', () => {
    renderPdf({
      scientificPdf: { enabled: true, serverUrl: 'https://pdf.example.test' },
    });

    expect(screen.getByText(/server url is not loopback/i)).toBeInTheDocument();
    expect(
      screen.getByText(/full pdf plus short-lived provider credentials/i),
    ).toBeInTheDocument();
  });

  it('opens the setup wizard and refreshes bridge status on close', async () => {
    renderPdf({
      scientificPdf: {
        enabled: true,
        serverUrl: 'http://127.0.0.1:17890',
        setupCompletedAt: '2026-09-01T00:00:00.000Z',
      },
    });

    fireEvent.click(
      await screen.findByRole('button', { name: /check connection/i }),
    );
    await waitFor(() => expect(sendMessage).toHaveBeenCalled());

    fireEvent.click(screen.getAllByRole('button', { name: /set up/i })[0]);
    expect(
      screen.getByRole('dialog', { name: /set up scientific pdf/i }),
    ).toBeInTheDocument();

    sendMessage.mockClear();
    fireEvent.click(screen.getByRole('button', { name: /close/i }));
    await waitFor(() => expect(sendMessage).toHaveBeenCalled());
  });

  it('shows the not-configured setup action without probing health', async () => {
    renderPdf();
    expect(await screen.findByText('Not configured')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /set up pdf translation/i }),
    ).toBeInTheDocument();
    expect(sendMessage).not.toHaveBeenCalled();
  });
});
