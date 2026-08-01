/**
 * Tests: Advanced tab Data Portability — full plaintext export, encrypted
 * export/import, and merge-vs-replace import behavior.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { webcrypto } from 'node:crypto';
import { DEFAULT_SETTINGS, type ExtensionSettings } from '@/types/config';
import { useSettingsStore } from '@/stores/settingsStore';
import { ToastProvider } from '@/ui/ToastProvider';
import { AdvancedSection } from '../AdvancedSection';
import { encryptBackup } from '@/lib/backup';

// jsdom's crypto lacks subtle; use Node's webcrypto for the real crypto paths.
Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true });

const cacheStatsState = vi.hoisted(() => ({
  entryCount: 0,
  totalSizeBytes: 0,
  sizeMb: 0,
  sizeLabel: '0 B',
  loading: false,
  refresh: vi.fn(),
}));

vi.mock('@/entrypoints/options/hooks/useCacheStats', () => ({
  useCacheStats: () => cacheStatsState,
}));

const blobUrl = vi.hoisted(() => vi.fn(() => 'blob:mock'));
const revokeUrl = vi.hoisted(() => vi.fn());
const anchorClick = vi.hoisted(() => vi.fn());

function renderAdvanced() {
  return render(
    <ToastProvider>
      <AdvancedSection />
    </ToastProvider>,
  );
}

function storeWith(
  overrides: Partial<ExtensionSettings> & {
    updateSettings?: unknown;
    replaceSettings?: unknown;
  },
) {
  useSettingsStore.setState({
    ...DEFAULT_SETTINGS,
    ...overrides,
    isLoaded: true,
    updateSettings: overrides.updateSettings ?? vi.fn(),
    replaceSettings: overrides.replaceSettings ?? vi.fn(),
  } as never);
}

async function readLastDownload(): Promise<Record<string, unknown>> {
  const blob = (blobUrl as unknown as ReturnType<typeof vi.fn>).mock.calls.at(-1)?.[0] as Blob;
  expect(blob).toBeTruthy();
  return JSON.parse(await blob.text()) as Record<string, unknown>;
}

describe('AdvancedSection Data Portability', () => {
  beforeEach(() => {
    blobUrl.mockClear();
    revokeUrl.mockClear();
    anchorClick.mockClear();
    Object.defineProperty(URL, 'createObjectURL', { value: blobUrl, configurable: true });
    Object.defineProperty(URL, 'revokeObjectURL', { value: revokeUrl, configurable: true });
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(anchorClick);
    storeWith({});
  });

  it('plain export downloads the FULL settings object (providers, pdf, toggles)', async () => {
    const settings = {
      ...DEFAULT_SETTINGS,
      targetLanguage: 'ja',
      theme: 'bubble',
      providers: [
        {
          id: 'p1',
          displayName: 'P',
          baseUrl: 'https://x/v1',
          model: 'm',
          requiresApiKey: true,
          temperature: 0.3,
          maxTokens: 4096,
          enabled: true,
          keys: [
            {
              id: 'k1',
              apiKey: 'sk-abc',
              maxRpm: 20,
              concurrencyLimit: 1,
              interval: 500,
              enabled: true,
            },
          ],
        },
      ],
    };
    storeWith(settings);
    renderAdvanced();

    fireEvent.click(screen.getByRole('button', { name: /export json/i }));

    const payload = await readLastDownload();
    expect(payload['providers']).toEqual(settings.providers);
    expect(payload['pdfSettings']).toBeTruthy();
    expect(payload['scientificPdf']).toBeTruthy();
    expect(payload['enableShadowDomWalk']).toBe(false);
    expect(anchorClick).toHaveBeenCalled();
  });

  it('encrypted export asks for a matching password and downloads an envelope', async () => {
    storeWith({ targetLanguage: 'ja' });
    renderAdvanced();

    fireEvent.click(screen.getByRole('button', { name: /encrypted backup/i }));
    fireEvent.change(screen.getByLabelText('Passphrase'), { target: { value: 'password123' } });
    fireEvent.change(screen.getByLabelText('Confirm passphrase'), {
      target: { value: 'password123' },
    });
    fireEvent.click(screen.getByRole('button', { name: /encrypt & download/i }));

    await waitFor(() => expect(blobUrl).toHaveBeenCalled());
    const payload = await readLastDownload();
    expect(payload['format']).toBe('anyllm-translate-backup');
    expect(payload['ciphertext']).toBeTruthy();
  });

  it('plain import merges by default — only the file keys are passed to updateSettings', async () => {
    const updateSettings = vi.fn();
    storeWith({ updateSettings });
    renderAdvanced();

    const file = new File([JSON.stringify({ targetLanguage: 'ko' })], 'settings.json', {
      type: 'application/json',
    });
    fireEvent.change(screen.getByTestId('import-settings-file'), { target: { files: [file] } });

    await screen.findByRole('dialog', { name: 'Import settings' });
    fireEvent.click(screen.getByRole('button', { name: 'Merge & import' }));

    await waitFor(() => expect(updateSettings).toHaveBeenCalledWith({ targetLanguage: 'ko' }));
    expect(screen.getByText(/settings imported successfully/i)).toBeInTheDocument();
  });

  it('plain import can exact-restore via the replace toggle', async () => {
    const replaceSettings = vi.fn();
    storeWith({ replaceSettings });
    renderAdvanced();

    const file = new File([JSON.stringify({ targetLanguage: 'ko', theme: 'paper' })], 's.json', {
      type: 'application/json',
    });
    fireEvent.change(screen.getByTestId('import-settings-file'), { target: { files: [file] } });

    await screen.findByRole('dialog', { name: 'Import settings' });
    fireEvent.click(screen.getByRole('switch', { name: 'Replace all current settings' }));
    fireEvent.click(screen.getByRole('button', { name: 'Replace & import' }));

    await waitFor(() =>
      expect(replaceSettings).toHaveBeenCalledWith({ targetLanguage: 'ko', theme: 'paper' }),
    );
  });

  it('encrypted import asks for the password, rejects wrong ones, then proceeds', async () => {
    const updateSettings = vi.fn();
    storeWith({ updateSettings });
    const envelope = await encryptBackup(
      { ...DEFAULT_SETTINGS, targetLanguage: 'fr' },
      'password123',
    );
    renderAdvanced();

    const file = new File([envelope], 'backup.json', { type: 'application/json' });
    fireEvent.change(screen.getByTestId('import-settings-file'), { target: { files: [file] } });

    await screen.findByRole('dialog', { name: 'Unlock backup' });
    fireEvent.change(screen.getByLabelText('Passphrase'), { target: { value: 'wrong-password' } });
    fireEvent.click(screen.getByRole('button', { name: 'Unlock' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      /wrong password or corrupted file/i,
    );
    expect(updateSettings).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText('Passphrase'), { target: { value: 'password123' } });
    fireEvent.click(screen.getByRole('button', { name: 'Unlock' }));

    await screen.findByRole('dialog', { name: 'Import settings' });
    fireEvent.click(screen.getByRole('button', { name: 'Merge & import' }));
    await waitFor(() => expect(updateSettings).toHaveBeenCalled());
    const arg = (updateSettings as ReturnType<typeof vi.fn>).mock.calls.at(-1)?.[0];
    expect(arg['targetLanguage']).toBe('fr');
  });
});
