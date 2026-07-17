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
  describe('normalizeScientificPdfServerUrl', () => {
    it('returns default for empty/invalid input', () => {
      expect(normalizeScientificPdfServerUrl('')).toBe(DEFAULT_SCIENTIFIC_PDF_SERVER_URL);
      expect(normalizeScientificPdfServerUrl('   ')).toBe(DEFAULT_SCIENTIFIC_PDF_SERVER_URL);
      expect(normalizeScientificPdfServerUrl(null)).toBe(DEFAULT_SCIENTIFIC_PDF_SERVER_URL);
      expect(normalizeScientificPdfServerUrl('not a url :::')).toBe(DEFAULT_SCIENTIFIC_PDF_SERVER_URL);
    });

    it('adds http:// when protocol is missing', () => {
      expect(normalizeScientificPdfServerUrl('127.0.0.1:17890')).toBe('http://127.0.0.1:17890');
    });

    it('strips trailing slash and path', () => {
      expect(normalizeScientificPdfServerUrl('http://127.0.0.1:17890/')).toBe(
        'http://127.0.0.1:17890',
      );
      expect(normalizeScientificPdfServerUrl('http://127.0.0.1:17890/v1/jobs')).toBe(
        'http://127.0.0.1:17890',
      );
    });

    it('rejects non-http(s) protocols', () => {
      expect(normalizeScientificPdfServerUrl('ftp://127.0.0.1:17890')).toBe(
        DEFAULT_SCIENTIFIC_PDF_SERVER_URL,
      );
    });
  });

  describe('isLoopbackServerUrl / shouldWarnNonLoopbackServerUrl', () => {
    it('accepts 127.0.0.0/8, localhost, and ::1', () => {
      expect(isLoopbackServerUrl('http://127.0.0.1:17890')).toBe(true);
      expect(isLoopbackServerUrl('http://127.0.0.42:9')).toBe(true);
      expect(isLoopbackServerUrl('http://localhost:17890')).toBe(true);
      expect(isLoopbackServerUrl('http://[::1]:17890')).toBe(true);
    });

    it('rejects remote hosts and warns', () => {
      expect(isLoopbackServerUrl('https://bridge.example.com')).toBe(false);
      expect(shouldWarnNonLoopbackServerUrl('https://bridge.example.com')).toBe(true);
      expect(shouldWarnNonLoopbackServerUrl('http://127.0.0.1:17890')).toBe(false);
    });
  });

  describe('resolveScientificPdfStatus', () => {
    it('returns ready when health is ok', () => {
      expect(
        resolveScientificPdfStatus({
          settings: { enabled: false },
          healthOk: true,
        }),
      ).toBe('ready');
    });

    it('returns not_configured when disabled and no setup', () => {
      expect(
        resolveScientificPdfStatus({
          settings: { enabled: false },
          healthOk: false,
        }),
      ).toBe('not_configured');
      expect(
        resolveScientificPdfStatus({
          settings: { enabled: false },
          healthOk: null,
        }),
      ).toBe('not_configured');
    });

    it('returns offline when enabled or setup done but health not ok', () => {
      expect(
        resolveScientificPdfStatus({
          settings: { enabled: true },
          healthOk: false,
        }),
      ).toBe('offline');
      expect(
        resolveScientificPdfStatus({
          settings: { enabled: false, setupCompletedAt: '2026-07-17T00:00:00Z' },
          healthOk: null,
        }),
      ).toBe('offline');
    });
  });

  describe('mergeScientificPdfSettings', () => {
    it('returns defaults for missing partial', () => {
      expect(mergeScientificPdfSettings()).toEqual(DEFAULT_SCIENTIFIC_PDF_SETTINGS);
      expect(mergeScientificPdfSettings(null)).toEqual(DEFAULT_SCIENTIFIC_PDF_SETTINGS);
    });

    it('merges partial without inventing credentials', () => {
      const merged = mergeScientificPdfSettings({
        enabled: true,
        serverUrl: '127.0.0.1:9999',
        setupCompletedAt: '2026-07-17T12:00:00Z',
      });
      expect(merged.enabled).toBe(true);
      expect(merged.serverUrl).toBe('http://127.0.0.1:9999');
      expect(merged.preferScientific).toBe(false);
      expect(merged.setupCompletedAt).toBe('2026-07-17T12:00:00Z');
      expect(merged).not.toHaveProperty('apiKey');
    });
  });

  describe('scientificPdfDockerRunCommand', () => {
    it('includes default port and image name', () => {
      const cmd = scientificPdfDockerRunCommand();
      expect(cmd).toContain(`-p ${DEFAULT_SCIENTIFIC_PDF_PORT}:${DEFAULT_SCIENTIFIC_PDF_PORT}`);
      expect(cmd).toContain('anyllm-scientific-pdf-bridge:latest');
      expect(cmd).toContain('docker run');
    });
  });

  describe('setup commands for new users', () => {
    it('compose up is the primary install path', () => {
      const up = scientificPdfDockerComposeUpCommand();
      expect(up).toContain('docker compose');
      expect(up).toContain('docker-compose.scientific-pdf.yml');
      expect(up).toContain('--build');
    });

    it('setupCommands lists build, health, and logs', () => {
      const cmds = scientificPdfSetupCommands();
      expect(cmds).toHaveLength(3);
      expect(cmds[0]!.command).toContain('up -d --build');
      expect(cmds[1]!.command).toContain('/health');
      expect(cmds[2]!.command).toContain('docker logs');
    });
  });
});
