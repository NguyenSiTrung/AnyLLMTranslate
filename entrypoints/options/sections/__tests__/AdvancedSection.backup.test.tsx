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
import { BUILT_IN_RULES } from '@/lib/siteRules';
import {
  clearPreImportSnapshot,
  loadPreImportSnapshot,
  savePreImportSnapshot,
} from '@/lib/config';

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

vi.mock('@/lib/config', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    savePreImportSnapshot: vi.fn(async () => {}),
    loadPreImportSnapshot: vi.fn(async () => null),
    clearPreImportSnapshot: vi.fn(async () => {}),
  };
});

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
    vi.mocked(savePreImportSnapshot).mockClear();
    vi.mocked(clearPreImportSnapshot).mockClear();
    vi.mocked(loadPreImportSnapshot).mockResolvedValue(null);
  });

  it('plain export warns about cleartext keys, downloads the FULL settings object, and shows a success toast', async () => {
    const settings: ExtensionSettings = {
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
    const { unmount } = renderAdvanced();

    fireEvent.click(screen.getByRole('button', { name: /export/i }));
    // Warning is shown BEFORE anything is downloaded.
    expect(
      await screen.findByText(/will contain your api keys in cleartext/i),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('radio', { name: /plain json/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));

    const payload = await readLastDownload();
    expect(payload['providers']).toEqual(settings.providers);
    expect(payload['pdfSettings']).toBeTruthy();
    expect(payload['scientificPdf']).toBeTruthy();
    expect(payload['enableShadowDomWalk']).toBe(false);
    expect(anchorClick).toHaveBeenCalled();

    expect(await screen.findByText(/settings exported successfully/i)).toBeInTheDocument();
    // The old post-hoc error toast is gone.
    expect(screen.queryByText(/keep it private/i)).not.toBeInTheDocument();
    unmount();
  });

  it('encrypted export asks for a matching password and downloads an envelope', async () => {
    storeWith({ targetLanguage: 'ja' });
    renderAdvanced();

    fireEvent.click(screen.getByRole('button', { name: /export/i }));
    // Encrypted backup is pre-selected in the chooser.
    fireEvent.click(await screen.findByRole('button', { name: 'Continue' }));
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

  it('plain import merges by default and can exact-restore via the replace toggle', async () => {
    const updateSettings = vi.fn();
    storeWith({ updateSettings });
    const { unmount } = renderAdvanced();

    const file = new File([JSON.stringify({ targetLanguage: 'ko' })], 'settings.json', {
      type: 'application/json',
    });
    fireEvent.change(screen.getByTestId('import-settings-file'), { target: { files: [file] } });

    await screen.findByRole('dialog', { name: 'Import settings' });
    fireEvent.click(screen.getByRole('button', { name: 'Merge & import' }));

    await waitFor(() => expect(updateSettings).toHaveBeenCalledWith({ targetLanguage: 'ko' }));
    expect(screen.getByText(/settings imported successfully/i)).toBeInTheDocument();

    // Exact restore via the replace toggle.
    unmount();
    const replaceSettings = vi.fn();
    storeWith({ replaceSettings });
    renderAdvanced();
    const replaceFile = new File([JSON.stringify({ targetLanguage: 'ko', theme: 'paper' })], 's.json', {
      type: 'application/json',
    });
    fireEvent.change(screen.getByTestId('import-settings-file'), {
      target: { files: [replaceFile] },
    });

    await screen.findByRole('dialog', { name: 'Import settings' });
    fireEvent.click(screen.getByRole('switch', { name: 'Replace all current settings' }));
    fireEvent.click(screen.getByRole('button', { name: 'Replace & import' }));

    await waitFor(() =>
      expect(replaceSettings).toHaveBeenCalledWith({ targetLanguage: 'ko', theme: 'paper' }),
    );
    unmount();
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

  it('import summary shows overwritten settings and reveals reset-to-defaults on replace toggle', async () => {
    storeWith({ targetLanguage: 'ja', theme: 'bubble' });
    const { unmount } = renderAdvanced();

    const file = new File([JSON.stringify({ targetLanguage: 'ko' })], 's.json', {
      type: 'application/json',
    });
    fireEvent.change(screen.getByTestId('import-settings-file'), { target: { files: [file] } });

    await screen.findByRole('dialog', { name: 'Import settings' });
    expect(screen.getByText(/1 setting will be overwritten/i)).toBeInTheDocument();
    expect(screen.getByText('targetLanguage')).toBeInTheDocument();

    // Replace toggle reveals the reset-to-defaults list, excluding built-in site rules.
    unmount();
    storeWith({
      targetLanguage: 'ja',
      theme: 'bubble',
      siteRules: BUILT_IN_RULES.map((r) => ({ ...r })),
    });
    renderAdvanced();

    fireEvent.change(screen.getByTestId('import-settings-file'), { target: { files: [file] } });
    await screen.findByRole('dialog', { name: 'Import settings' });
    expect(screen.queryByText(/reset to defaults/i)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('switch', { name: 'Replace all current settings' }));
    expect(
      screen.getByText(/customized setting.*will reset to defaults/i),
    ).toBeInTheDocument();
    expect(screen.getByText('theme')).toBeInTheDocument();
    expect(screen.queryByText('siteRules')).not.toBeInTheDocument();
    unmount();
  });

  it('saves a pre-import snapshot before applying the import', async () => {
    storeWith({ targetLanguage: 'ja' });
    renderAdvanced();

    const file = new File([JSON.stringify({ targetLanguage: 'ko' })], 's.json', {
      type: 'application/json',
    });
    fireEvent.change(screen.getByTestId('import-settings-file'), { target: { files: [file] } });

    await screen.findByRole('dialog', { name: 'Import settings' });
    fireEvent.click(screen.getByRole('button', { name: 'Merge & import' }));

    await waitFor(() => expect(savePreImportSnapshot).toHaveBeenCalled());
    const arg = vi.mocked(savePreImportSnapshot).mock.calls.at(-1)?.[0] as ExtensionSettings;
    expect(arg.targetLanguage).toBe('ja');
  });

  it('undo toast and the persistent restore button both roll back the pre-import snapshot and consume it', async () => {
    // Undo-toast path.
    const snapshot = { ...DEFAULT_SETTINGS, theme: 'bubble', targetLanguage: 'ja' } as ExtensionSettings;
    vi.mocked(loadPreImportSnapshot).mockResolvedValue(snapshot);
    storeWith({ targetLanguage: 'ja' });
    const { unmount } = renderAdvanced();

    const file = new File([JSON.stringify({ targetLanguage: 'ko' })], 's.json', {
      type: 'application/json',
    });
    fireEvent.change(screen.getByTestId('import-settings-file'), { target: { files: [file] } });
    await screen.findByRole('dialog', { name: 'Import settings' });
    fireEvent.click(screen.getByRole('button', { name: 'Merge & import' }));

    await screen.findByText('Settings imported successfully!');
    fireEvent.click(screen.getByRole('button', { name: 'Undo import' }));

    await waitFor(() => expect(useSettingsStore.getState().theme).toBe('bubble'));
    expect(useSettingsStore.getState().targetLanguage).toBe('ja');
    expect(clearPreImportSnapshot).toHaveBeenCalled();
    await waitFor(() =>
      expect(
        screen.queryByRole('button', { name: 'Restore previous settings' }),
      ).not.toBeInTheDocument(),
    );

    // Persistent-restore-button path.
    unmount();
    vi.mocked(clearPreImportSnapshot).mockClear();
    const snapshot2 = { ...DEFAULT_SETTINGS, theme: 'paper', targetLanguage: 'fr' } as ExtensionSettings;
    vi.mocked(loadPreImportSnapshot).mockResolvedValue(snapshot2);
    storeWith({ targetLanguage: 'ja' });
    renderAdvanced();

    fireEvent.click(
      await screen.findByRole('button', { name: 'Restore previous settings' }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Restore' }));

    await waitFor(() => expect(useSettingsStore.getState().theme).toBe('paper'));
    expect(useSettingsStore.getState().targetLanguage).toBe('fr');
    expect(clearPreImportSnapshot).toHaveBeenCalled();
    await waitFor(() =>
      expect(
        screen.queryByRole('button', { name: 'Restore previous settings' }),
      ).not.toBeInTheDocument(),
    );
    unmount();
  });
});
