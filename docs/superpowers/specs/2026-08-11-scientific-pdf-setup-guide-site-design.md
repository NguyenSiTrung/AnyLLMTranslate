# Scientific PDF Setup Guide Site (GitHub Pages + GHCR image)

## Problem

PDF Translate requires a local Docker bridge, but the only setup instructions
live inside the repo (`docs/scientific-pdf-setup.md`). A user who installed the
extension from the store and has not cloned the repo cannot see the guide, and
the only supported path requires cloning the repo and building the image from
source (several minutes, needs git + full source tree). The offline surfaces in
the extension (PDF viewer card, Options → Advanced → Scientific PDF, wizard
Install step) do not link to any guide.

Verified constraint: the repo is currently private, and on the GitHub Free plan
GitHub Pages requires a public repository (GitHub docs: "If the account that
owns the repository uses GitHub Free… the repository must be public"). GHCR
storage is free only for public packages ("GitHub Packages usage is free for
public packages"). Decision: make the repo public; both the Pages site and the
GHCR image are then free.

## Goal

- A public, nicely rendered setup guide at a deterministic URL:
  `https://nguyensitrung.github.io/AnyLLMTranslate/guide/`
- A prebuilt bridge image on GHCR so users without the repo can be running in
  ~1 minute (`docker compose up -d`, image pull, no build).
- A "view setup guide" link on every surface that reports PDF Translate as
  unavailable, plus the README.

## Design

### 1. Guide site — `docs/guide/index.html`

Static, hand-authored HTML with inline CSS/JS (no build tooling, no new deps).
Dark theme matching the extension, sticky table of contents, copy-to-clipboard
buttons on every command block (vanilla JS).

Sections:

1. What this is / why Docker is required
2. Prerequisites — Docker Desktop (macOS/Windows), Docker Engine + Compose
   plugin (Linux), with official install links
3. **Path A — Quick Start (pull prebuilt image):** copy-paste compose file
   (below) + `docker compose up -d` + health check. No git, no clone, no build.
4. **Path B — Build from source (developer):** `git clone` + repo root +
   `./scripts/scientific-pdf-docker.sh up`
5. Verify health — expected `GET /health` JSON
6. Connect in the extension — Options → Advanced → Scientific PDF → Set up…
   wizard walkthrough
7. Everyday commands — `start` / `down` / `status` / `logs`
8. Rebuild / update — when bridge code changes, `git pull` + rebuild; for the
   pull path, re-run `docker compose pull && docker compose up -d`
9. Common problems — table ported from `docs/scientific-pdf-setup.md`
10. Privacy — full PDF + short-lived credentials go to `serverUrl` (default
    loopback only); link to `PRIVACY.md`
11. Links — bridge API doc, repo

Quick Start compose snippet (must mirror the env/volumes/ports of the repo
compose; `image` tag is `latest`):

```yaml
services:
  scientific-pdf-bridge:
    image: ghcr.io/nguyensitrung/anyllm-scientific-pdf-bridge:latest
    container_name: anyllm-scientific-pdf
    ports:
      - "17890:17890"
    environment:
      MOCK_TRANSLATE: "${MOCK_TRANSLATE:-0}"
      JOB_TTL_SECONDS: "${JOB_TTL_SECONDS:-3600}"
      SCIENTIFIC_PDF_DATA_DIR: /data
      HF_ENDPOINT: "${HF_ENDPOINT:-}"
      HF_HOME: /root/.cache/huggingface
    volumes:
      - scientific-pdf-data:/data
      - scientific-pdf-models:/root/.cache
    restart: unless-stopped

volumes:
  scientific-pdf-data:
  scientific-pdf-models:
```

Only `docs/guide/` is published; `docs/superpowers/`, `docs/PUBLISHING.md`,
etc. stay off the site. `docs/scientific-pdf-setup.md` stays as the repo-local
mirror and is updated to match the guide.

### 2. GHCR image publishing — `.github/workflows/bridge-image.yml`

- Triggers: push to `main` with paths `services/scientific-pdf-bridge/**`
  (includes the bridge `Dockerfile`); `v*` tags; `workflow_dispatch`.
- `docker/login-action` with `GITHUB_TOKEN` (permissions: `packages: write`,
  `contents: read`). Public repo → package is public → free storage/bandwidth.
- `docker/build-push-action` (buildx) pushes
  `ghcr.io/nguyensitrung/anyllm-scientific-pdf-bridge` with tags `latest`,
  `sha-<7>`, and `v<tag>` when building from a tag.
- Platforms: `linux/amd64` + `linux/arm64` (Apple Silicon). If the arm64 build
  fails (wheel availability), fall back to amd64-only — Docker Desktop emulates
  amd64 on M-series via Rosetta.
- Repo `docker-compose.scientific-pdf.yml` stays build-based for developers.

### 3. In-extension links

New constant in `lib/scientificPdf.ts`:

```ts
export const SCIENTIFIC_PDF_SETUP_GUIDE_URL =
  'https://nguyensitrung.github.io/AnyLLMTranslate/guide/';
```

| Surface | Change |
|---|---|
| `entrypoints/pdf-viewer/components/BridgeSetupCard.tsx` | Add "Read the full setup guide" link below the steps; opens via `chrome.tabs.create` (pattern already used in the codebase) |
| `entrypoints/options/sections/AdvancedSection.tsx` (Scientific PDF card) | Add "Setup guide" link button beside "Set up…" — always visible |
| `entrypoints/options/components/ScientificPdfWizard.tsx` (Install step) | Replace the `docs/scientific-pdf-setup.md` code text with a real link to the guide; keep the "rebuild only when bridge code changes" note |
| `README.md` PDF section | Add the guide URL next to the repo-doc link |

### 4. One-time repo operations (manual, done by maintainer)

1. Repo Settings → change visibility to **public**.
2. Repo Settings → Pages → Source: **GitHub Actions** (deploy workflow uses
   `actions/deploy-pages`).
3. First GHCR push auto-creates the package; visibility defaults to public for
   a public repo. Nothing else required.

## Non-goals

- No change to the bridge application, wizard flow, or provider pool handling.
- No version-pinning UX for the image (stays `latest`; `sha-` tags exist for
  reproducibility).
- No i18n.
- No in-app "start Docker for me" capability.

## Validation

- `docs/guide/index.html` renders correctly in a browser; copy buttons copy the
  right command blocks; TOC anchors work.
- `pnpm compile` passes; `vitest run` passes for the touched suites
  (`BridgeSetupCard.test.tsx` updated to assert the guide link).
- Bridge image workflow: on merge, the workflow builds and pushes the image;
  `docker compose up -d` with the guide's snippet pulls it and `GET
  /health` returns `{"status":"ok",…}`.
- Pages workflow: on merge, the site is reachable at
  `https://nguyensitrung.github.io/AnyLLMTranslate/guide/` and the extension
  links resolve there.
