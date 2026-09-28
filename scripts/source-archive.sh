#!/usr/bin/env bash
#
# Build the Chrome Web Store reviewer source archive from a curated allow-list.
#
# `git archive HEAD` over every tracked file sweeps in agent tooling
# (.agents/, .claude/, .codex/), Conductor state (conductor/), planning notes
# (docs/superpowers/), the internal platform-risk audit, and the Beads issue
# database. None of that helps a reviewer, and the internal notes invite
# questions unrelated to the extension's security posture.
#
# Instead, archive exactly the paths a reviewer needs to read, build, and test
# the extension. Keep this list reproducible: `pnpm install && pnpm test &&
# pnpm build` must work from the extracted archive.
#
# Usage: scripts/source-archive.sh [output.zip]   (default: source-code.zip)
set -euo pipefail

OUT="${1:-source-code.zip}"

PATHS=(
  # Extension source
  entrypoints
  content
  inject
  services
  lib
  stores
  ui
  types
  styles
  public
  # Project test suite
  tests
  # Build, test, and lint configuration
  wxt.config.ts
  package.json
  pnpm-lock.yaml
  pnpm-workspace.yaml
  tsconfig.json
  vitest.config.ts
  vitest.setup.ts
  __mocks__
  eslint.config.mjs
  .prettierrc
  .nvmrc
  # Optional Scientific PDF bridge (compose file, helper script, bridge source)
  scripts
  docker-compose.scientific-pdf.yml
  # Reviewer-facing documents (the shipped README links to each of these)
  LICENSE
  README.md
  CONTRIBUTING.md
  PRIVACY.md
  docs/guide
  docs/scientific-pdf-bridge-api.md
  docs/scientific-pdf-setup.md
  docs/store-listing.md
)

git archive --format=zip -o "$OUT" HEAD -- "${PATHS[@]}"
echo "Wrote $OUT"
