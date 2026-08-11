# AnyLLMTranslate README Refresh Design

**Date:** 2026-08-11
**Beads task:** `AnyLLMTranslate-xqg`

## Context

`README.md` is feature-rich but has become difficult to scan and contains
historical claims that no longer match the current codebase. The repository
now includes a multi-provider pool, expanded subtitle handlers, a bridge-only
Scientific PDF workflow, a public PDF setup guide, and current CI packaging
paths. The README should present those capabilities accurately without
becoming a generated source-tree inventory.

## Goals

- Make the README professional, scannable, and useful to first-time users.
- Describe the current product surface using information verified against the
  code, package scripts, privacy policy, and repository documentation.
- Keep developer-mode installation as the only installation promise. Do not
  claim a Chrome Web Store or Firefox Add-ons release.
- Explain BYOK, local storage, provider routing, and the Scientific PDF
  bridge boundary clearly.
- Preserve selected technical detail for contributors while linking to deeper
  documentation.
- Avoid brittle historical metrics such as stale test totals or bundle sizes.
- Make the existing MIT licensing claim verifiable by adding the missing root
  license file.
- Keep the default Vitest run stable under this repository's parallel jsdom
  workload without changing product behavior.

## Non-goals

- No product runtime changes. A narrowly scoped test-runner worker cap is
  allowed to prevent load-sensitive test timeouts.
- No new release process or store listing.
- No rewrite of `CONTRIBUTING.md`, `PRIVACY.md`, or the Scientific PDF guide.
- No new documentation taxonomy beyond the README links and one design note.
- No license change: add the standard MIT declaration that the README already
  claims, using `Nguyen Si Trung` as the copyright holder for 2026.

## Information Architecture

The README will be organized in this order:

1. Hero and orientation
2. Feature groups
3. Supported subtitle platform matrix
4. How the extension works
5. Developer-mode installation
6. Provider configuration
7. Scientific PDF quick path
8. Development and verification commands
9. Privacy and security summary
10. Contributing and license

The opening sections will answer what the extension does, who supplies the
LLM, and how to reach the first successful translation. Optional internals
will appear later or in linked documents.

## Content Decisions

### Product positioning

Present AnyLLMTranslate as an open-source, privacy-first browser extension for
bilingual web reading, subtitle translation, interactive translation tools,
and optional scientific PDF translation. Emphasize that it is BYOK and works
with OpenAI-compatible cloud or local endpoints.

### Feature groups

Use four concise groups:

- Web pages: bilingual inline display, viewport-aware translation, SPA
  support, page-scope controls, themes, glossary, cache, and site rules.
- Video subtitles: progressive bilingual overlays, track discovery, player
  mini studio, subtitle style controls, and YouTube ASR re-alignment.
- Interactive tools: selection dictionary/translation, hover translation,
  inline input translation, section translation, TTS, shortcuts, and context
  menu actions.
- PDFs: bundled reader/viewer plus the optional local Scientific PDF bridge
  for layout-preserving mono, dual, and side-by-side output.

### Subtitle support matrix

List the handlers currently registered in
`inject/subtitleHandlers/registry.ts` and
`lib/subtitleSites.ts`:

- YouTube
- Udemy
- Coursera
- LinkedIn Learning
- HBO Max / Max
- Youku
- Netflix
- Disney+
- WeTV / iFlix
- Generic auto-detect fallback

The matrix will identify the generic entry as a fallback and note that
platform/player changes, subtitle availability, and regional behavior can
affect results. It will not imply that every site uses the same interception
path.

### Privacy and PDF boundary

State that settings, encrypted API keys, statistics, and caches remain in
browser storage and that the extension does not operate developer telemetry.
Translation content is sent only to the configured provider.

State separately that Scientific PDF translation is bridge-only: when a user
starts a job, the PDF and short-lived provider credentials are sent to the
configured bridge URL, which defaults to loopback. Link to `PRIVACY.md` and
the maintained public setup guide for the complete contract.

### Installation promise

Document:

1. Node.js `>=20.12.0`.
2. `pnpm install` as the recommended path, with npm equivalents.
3. Chrome production build and unpacked extension loading.
4. Firefox development/build commands without claiming a published add-on.
5. Setup wizard, provider test, target-language selection, and first page
   translation.

### Development commands

Use commands present in `package.json`, including:

- `pnpm dev`
- `pnpm dev:firefox`
- `pnpm build`
- `pnpm build:firefox`
- `pnpm test:fast`
- `pnpm test`
- `pnpm compile`
- `pnpm lint`
- `pnpm zip`
- `pnpm zip:firefox`

Include npm equivalents only for the common install/build/test/lint path so
the command tables stay readable.

### License declaration

Add a root `LICENSE` file containing the standard MIT License text with
`Copyright (c) 2026 Nguyen Si Trung`. Link the README's license section to
that file rather than leaving a broken reference.

### Technical overview

Keep architecture to a short diagram or table covering:

- WXT entrypoints and React UIs
- background service worker
- isolated content script
- MAIN-world subtitle interceptors
- provider pool and cache/retry/rate limiting
- bundled PDF viewer and external Scientific PDF bridge

Do not copy the full source directory listing from the current README.

### Test-runner stability

The repository's real Web Crypto and jsdom tests can exceed Vitest's default
five-second per-test budget when too many files compete for CPU. Keep normal
file-level parallelism, but cap Vitest at four workers. This addresses the
observed load-sensitive timeout class without raising all test timeouts or
changing production crypto/subtitle behavior.

## Validation

Before declaring the README refresh complete:

- Compare all feature and support claims against the current repository files.
- Check every relative documentation link exists.
- Run Prettier or an equivalent Markdown formatting check on the changed
  documentation.
- Run the narrow documentation-relevant quality checks available in the
  repository, and report any broader checks that were intentionally skipped.
- Review the final diff for stale release claims, secrets, duplicated
  instructions, and contradictory Node/package-manager versions.
