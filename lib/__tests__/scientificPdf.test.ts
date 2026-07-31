import { describe, it, expect } from 'vitest';
import {
  DEFAULT_SCIENTIFIC_PDF_PORT,
  DEFAULT_SCIENTIFIC_PDF_SERVER_URL,
  normalizeScientificPdfServerUrl,
  isLoopbackServerUrl,
  shouldWarnNonLoopbackServerUrl,
  resolveScientificPdfStatus,
  mergeScientificPdfSettings,
  scientificPdfDockerRunCommand,
  scientificPdfDockerComposeUpCommand,
  scientificPdfSetupCommands,
} from '@/lib/scientificPdf';
import { DEFAULT_SCIENTIFIC_PDF_SETTINGS } from '@/types/config';

describe('scientificPdf helpers', () => {
  it('normalizeScientificPdfServerUrl, loopback detection, status, settings merge, and docker commands', () => {
    expect(normalizeScientificPdfServerUrl('')).toBe(DEFAULT_SCIENTIFIC_PDF_SERVER_URL);
    expect(normalizeScientificPdfServerUrl('   ')).toBe(DEFAULT_SCIENTIFIC_PDF_SERVER_URL);
    expect(normalizeScientificPdfServerUrl(null)).toBe(DEFAULT_SCIENTIFIC_PDF_SERVER_URL);
    expect(normalizeScientificPdfServerUrl('not a url :::')).toBe(DEFAULT_SCIENTIFIC_PDF_SERVER_URL);
    expect(normalizeScientificPdfServerUrl('127.0.0.1:17890')).toBe('http://127.0.0.1:17890');
    expect(normalizeScientificPdfServerUrl('http://127.0.0.1:17890/')).toBe('http://127.0.0.1:17890');
    expect(normalizeScientificPdfServerUrl('http://127.0.0.1:17890/v1/jobs')).toBe(
      'http://127.0.0.1:17890',
    );
    expect(normalizeScientificPdfServerUrl('ftp://127.0.0.1:17890')).toBe(
      DEFAULT_SCIENTIFIC_PDF_SERVER_URL,
    );

    // loopback detection, status resolution, settings merge, and docker setup commands
    expect(isLoopbackServerUrl('http://127.0.0.1:17890')).toBe(true);
    expect(isLoopbackServerUrl('http://127.0.0.42:9')).toBe(true);
    expect(isLoopbackServerUrl('http://localhost:17890')).toBe(true);
    expect(isLoopbackServerUrl('http://[::1]:17890')).toBe(true);
    expect(isLoopbackServerUrl('https://bridge.example.com')).toBe(false);
    expect(shouldWarnNonLoopbackServerUrl('https://bridge.example.com')).toBe(true);
    expect(shouldWarnNonLoopbackServerUrl('http://127.0.0.1:17890')).toBe(false);

    expect(
      resolveScientificPdfStatus({ settings: { enabled: false }, healthOk: true }),
    ).toBe('ready');
    expect(
      resolveScientificPdfStatus({ settings: { enabled: false }, healthOk: false }),
    ).toBe('not_configured');
    expect(
      resolveScientificPdfStatus({ settings: { enabled: false }, healthOk: null }),
    ).toBe('not_configured');
    expect(
      resolveScientificPdfStatus({ settings: { enabled: true }, healthOk: false }),
    ).toBe('offline');
    expect(
      resolveScientificPdfStatus({
        settings: { enabled: false, setupCompletedAt: '2026-07-17T00:00:00Z' },
        healthOk: null,
      }),
    ).toBe('offline');

    expect(mergeScientificPdfSettings()).toEqual(DEFAULT_SCIENTIFIC_PDF_SETTINGS);
    expect(mergeScientificPdfSettings(null)).toEqual(DEFAULT_SCIENTIFIC_PDF_SETTINGS);
    const merged = mergeScientificPdfSettings({
      enabled: true,
      serverUrl: '127.0.0.1:9999',
      setupCompletedAt: '2026-07-17T12:00:00Z',
    });
    expect(merged.enabled).toBe(true);
    expect(merged.serverUrl).toBe('http://127.0.0.1:9999');
    expect(merged.setupCompletedAt).toBe('2026-07-17T12:00:00Z');
    expect(merged).not.toHaveProperty('apiKey');
    expect(merged).not.toHaveProperty('preferScientific');

    // Docker run and setup commands point at the helper script
    const cmd = scientificPdfDockerRunCommand();
    expect(cmd).toContain(`-p ${DEFAULT_SCIENTIFIC_PDF_PORT}:${DEFAULT_SCIENTIFIC_PDF_PORT}`);
    expect(cmd).toContain('anyllm-scientific-pdf-bridge:latest');
    expect(cmd).toContain('docker run');

    const up = scientificPdfDockerComposeUpCommand();
    expect(up).toContain('scientific-pdf-docker.sh');
    expect(up).toContain('up');

    const cmds = scientificPdfSetupCommands();
    expect(cmds).toHaveLength(3);
    expect(cmds[0]!.command).toContain('scientific-pdf-docker.sh up');
    expect(cmds[1]!.command).toMatch(/scientific-pdf-docker\.sh health|curl.*health/);
    expect(cmds[2]!.command).toContain('scientific-pdf-docker.sh logs');
  });
});
