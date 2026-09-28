/**
 * Tests: the Chrome Web Store reviewer source archive is built from a curated
 * allow-list — it must carry everything needed to build/test the extension and
 * nothing that leaks internal workflow state.
 */
import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const REPO_ROOT = process.cwd();

/** Paths the archive must contain to stay buildable and reviewer-useful. */
const REQUIRED = [
  // Build, test, and lint inputs.
  'package.json',
  'pnpm-lock.yaml',
  'pnpm-workspace.yaml',
  'wxt.config.ts',
  'tsconfig.json',
  'vitest.config.ts',
  'vitest.setup.ts',
  'eslint.config.mjs',
  '.prettierrc',
  '__mocks__/wxt/sandbox.ts',
  'entrypoints/background.ts',
  'services/statsCollector.ts',
  // Documents the shipped README links to.
  'README.md',
  'LICENSE',
  'PRIVACY.md',
  'CONTRIBUTING.md',
  'docs/scientific-pdf-bridge-api.md',
  'docs/scientific-pdf-setup.md',
];

/** Workflow state, agent tooling, and internal notes that must never ship. */
const FORBIDDEN_PREFIXES = [
  '.agents/',
  '.claude/',
  '.codex/',
  '.beads/',
  '.github/',
  '.output/',
  'coverage/',
  'conductor/',
  'docs/superpowers/',
  'node_modules/',
];

describe('source archive allow-list', () => {
  it('builds a reviewer archive from an allow-list: ships build/test inputs, drops internal tooling', () => {
    expect(existsSync(join(REPO_ROOT, 'package.json'))).toBe(true);

    const dir = mkdtempSync(join(tmpdir(), 'anyllm-source-archive-'));
    let entries: string[];
    try {
      const out = join(dir, 'source-code.zip');
      execFileSync('bash', ['scripts/source-archive.sh', out], {
        cwd: REPO_ROOT,
        stdio: 'pipe',
      });
      entries = execFileSync('unzip', ['-Z1', out], { cwd: REPO_ROOT, encoding: 'utf8' })
        .split('\n')
        .filter((line) => line.length > 0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }

    for (const path of REQUIRED) {
      expect(entries, `archive must include ${path}`).toContain(path);
    }
    expect(
      entries.some((entry) => entry.startsWith('tests/')),
      'archive must include the project test suite',
    ).toBe(true);

    const leaked = entries.filter(
      (entry) =>
        FORBIDDEN_PREFIXES.some((prefix) => entry.startsWith(prefix)) ||
        entry === 'docs/hbomax-subtitle-risk-audit.md' ||
        entry === 'docs/PUBLISHING.md',
    );
    expect(leaked, 'archive must not contain internal workflow files').toEqual([]);
  });
});
