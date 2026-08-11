# Scientific PDF Setup Guide Site Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Commit policy:** This repo uses the conservative Beads profile (see `AGENTS.md`) — **do NOT run `git commit`/`git push`/`bd dolt push`** unless the maintainer explicitly asks. Each task ends with a verification command, not a commit. Report changed files at the end.

**Goal:** Ship a public setup guide for the Scientific PDF bridge at `https://nguyensitrung.github.io/AnyLLMTranslate/guide/`, a GHCR workflow that publishes a prebuilt bridge image, and "view setup guide" links on every PDF-translate-unavailable surface.

**Architecture:** Static hand-authored `docs/guide/index.html` (inline CSS/JS, no build tooling) deployed to Pages by a GitHub Actions workflow. A second workflow builds `services/scientific-pdf-bridge` and pushes `ghcr.io/nguyensitrung/anyllm-scientific-pdf-bridge` (amd64+arm64). The extension gets one new constant `SCIENTIFIC_PDF_SETUP_GUIDE_URL` in `lib/scientificPdf.ts`, referenced by the PDF viewer offline card, the Options → Advanced Scientific PDF card, and the setup wizard Install step. Repo `docker-compose.scientific-pdf.yml` stays build-based for developers; the guide embeds a pull-based compose snippet.

**Tech Stack:** Static HTML/CSS/vanilla JS (guide), GitHub Actions (`deploy-pages`, `build-push-action` + GHCR), React extension (WXT), vitest + testing-library.

**Spec:** `docs/superpowers/specs/2026-08-11-scientific-pdf-setup-guide-site-design.md`

**Manual steps (maintainer, not code):** make repo public; Settings → Pages → Source: GitHub Actions. See Task 11.

---

### Task 1: Add `SCIENTIFIC_PDF_SETUP_GUIDE_URL` constant

**Files:**
- Modify: `lib/scientificPdf.ts:10-15` (after `DEFAULT_SCIENTIFIC_PDF_SERVER_URL`)
- Test: `lib/__tests__/scientificPdf.test.ts` (existing — unchanged, must keep passing)

- [ ] **Step 1: Add the constant**

Add right after the `DEFAULT_SCIENTIFIC_PDF_SERVER_URL` export (current line ~11):

```ts
/**
 * Public setup guide for the Scientific PDF bridge (GitHub Pages).
 * Deterministic URL — do not change without updating every in-extension link.
 */
export const SCIENTIFIC_PDF_SETUP_GUIDE_URL =
  'https://nguyensitrung.github.io/AnyLLMTranslate/guide/';
```

- [ ] **Step 2: Verify**

Run: `pnpm compile`
Expected: no type errors.

Run: `pnpm exec vitest run lib/__tests__/scientificPdf.test.ts`
Expected: PASS (existing assertions untouched).

---

### Task 2: Guide link on the PDF viewer offline card

**Files:**
- Modify: `entrypoints/pdf-viewer/components/BridgeSetupCard.tsx`
- Test: `entrypoints/pdf-viewer/components/__tests__/BridgeSetupCard.test.tsx`

- [ ] **Step 1: Write the failing test**

In `BridgeSetupCard.test.tsx`, inside the first `render(...)` block (after the existing `/scientific-pdf-docker\.sh up/` assertion), add:

```tsx
    const guideLink = screen.getByRole('link', { name: /full setup guide/i });
    expect(guideLink).toHaveAttribute('href', 'https://nguyensitrung.github.io/AnyLLMTranslate/guide/');
    expect(guideLink).toHaveAttribute('target', '_blank');
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run entrypoints/pdf-viewer/components/__tests__/BridgeSetupCard.test.tsx`
Expected: FAIL — "Unable to find role 'link'".

- [ ] **Step 3: Add the link to the card**

In `BridgeSetupCard.tsx`:

1. Extend the lucide import line (currently `import { ServerCrash, Settings2, RefreshCw } from 'lucide-react';`) to:

```tsx
import { ServerCrash, Settings2, RefreshCw, ExternalLink } from 'lucide-react';
```

2. Add a `SCIENTIFIC_PDF_SETUP_GUIDE_URL` import below the `ScientificPdfStatus` type import:

```tsx
import { SCIENTIFIC_PDF_SETUP_GUIDE_URL } from '@/lib/scientificPdf';
```

3. Inside the `<div className="pdf-bridge-panel-actions">` block, after the "Not now" button (or after "Check connection" when `onDismiss` is absent), add:

```tsx
        <a
          href={SCIENTIFIC_PDF_SETUP_GUIDE_URL}
          target="_blank"
          rel="noreferrer"
          className="pdf-download-btn pdf-download-btn--secondary"
        >
          <ExternalLink size={14} style={{ marginRight: 6, verticalAlign: 'middle' }} />
          Read the full setup guide
        </a>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run entrypoints/pdf-viewer/components/__tests__/BridgeSetupCard.test.tsx`
Expected: PASS.

---

### Task 3: Guide link on the Options → Advanced Scientific PDF card

**Files:**
- Modify: `entrypoints/options/sections/AdvancedSection.tsx`

- [ ] **Step 1: Add the import**

In `AdvancedSection.tsx`:
- Extend the lucide import block with `ExternalLink` (alphabetical position among the lucide imports, ~line 24).
- Extend the existing scientific import (lines 80-85, `from '@/lib/scientificPdf'`) to include:

```tsx
  SCIENTIFIC_PDF_SETUP_GUIDE_URL,
```

- [ ] **Step 2: Add the link button**

In the Scientific PDF card's buttons row (currently the `<div className="flex flex-wrap items-center gap-2">` containing "Set up…" and "Refresh status"), add a third button after "Refresh status":

```tsx
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => {
                    try {
                      chrome.tabs.create({ url: SCIENTIFIC_PDF_SETUP_GUIDE_URL });
                    } catch {
                      window.open(SCIENTIFIC_PDF_SETUP_GUIDE_URL, '_blank', 'noreferrer');
                    }
                  }}
                >
                  <ExternalLink className="w-3.5 h-3.5" style={{ marginRight: 6 }} />
                  Setup guide
                </Button>
```

(Icon inside Button: confirm from `ui/Button.tsx` whether `icon` prop is preferred — if the `Button` component supports an `icon` prop, use `icon={<ExternalLink className="w-3.5 h-3.5" />}` instead and drop the inline margin style.)

- [ ] **Step 3: Verify**

Run: `pnpm compile`
Expected: no type errors.

Run: `pnpm exec vitest run entrypoints/options/sections/__tests__/AdvancedSection.backup.test.tsx entrypoints/options/sections/__tests__/AdvancedSection.jumpNav.test.tsx`
Expected: PASS (these render the full section; they assert backup/jump-nav behavior only).

---

### Task 4: Guide link in the wizard Install step

**Files:**
- Modify: `entrypoints/options/components/ScientificPdfWizard.tsx:325-334`

- [ ] **Step 1: Replace the repo-doc code text with a real link**

Current text (lines ~328-334):

```tsx
              <p className="flex items-start gap-1.5 text-[11px] text-zinc-500">
                <Terminal className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                <span>
                  Full guide: <code className="rounded bg-zinc-800 px-1">docs/scientific-pdf-setup.md</code>
                  . Rebuild only when bridge code/Dockerfile changes (see guide). Progress UI in the
                  PDF viewer does <strong className="text-zinc-400">not</strong> require a Docker rebuild.
                </span>
              </p>
```

Replace the `<code>docs/scientific-pdf-setup.md</code>` with a real anchor:

```tsx
                  Full guide:{' '}
                  <a
                    href={SCIENTIFIC_PDF_SETUP_GUIDE_URL}
                    target="_blank"
                    rel="noreferrer"
                    className="underline decoration-zinc-600 underline-offset-2 hover:text-zinc-300"
                  >
                    setup guide ↗
                  </a>
                  . Rebuild only when bridge code/Dockerfile changes (see guide). Progress UI in the
                  PDF viewer does <strong className="text-zinc-400">not</strong> require a Docker rebuild.
```

Also:
- Add `SCIENTIFIC_PDF_SETUP_GUIDE_URL` to the existing `from '@/lib/scientificPdf'` import block in this file (line ~11).
- No new icon import needed (the "↗" is text).

- [ ] **Step 2: Verify**

Run: `pnpm compile`
Expected: no type errors.

Run: `pnpm exec vitest run lib/__tests__/scientificPdfWizard.test.ts`
Expected: PASS.

---

### Task 5: README update

**Files:**
- Modify: `README.md:389-402`

- [ ] **Step 1: Add the guide URL**

In the "Docker bridge (required for PDF Translate)" section, replace:

```md
**New users — full guide:** [docs/scientific-pdf-setup.md](docs/scientific-pdf-setup.md)
```

with:

```md
**New users — full guide:** [Scientific PDF setup guide](https://nguyensitrung.github.io/AnyLLMTranslate/guide/) (public site) · [docs/scientific-pdf-setup.md](docs/scientific-pdf-setup.md) (repo copy)

**Two setup paths** (details in the guide):

1. **Quick Start — pull the prebuilt image** (no clone, no build): copy the compose file from the guide, then `docker compose up -d`
2. **Build from source:** clone the repo and run `./scripts/scientific-pdf-docker.sh up`
```

Also update the bullet list at line ~401 from `- Setup guide: [docs/scientific-pdf-setup.md](docs/scientific-pdf-setup.md)` to:

```md
- Setup guide: [public site](https://nguyensitrung.github.io/AnyLLMTranslate/guide/) · [docs/scientific-pdf-setup.md](docs/scientific-pdf-setup.md)
```

- [ ] **Step 2: Verify**

Run: `pnpm compile` (README is not compiled — this is a no-op sanity check; skip)
Run: `git diff --stat README.md` via the diff of the working tree at the end (Task 11) to confirm only the intended lines changed.

---

### Task 6: Create the guide page `docs/guide/index.html`

**Files:**
- Create: `docs/guide/index.html`

Complete file content (self-contained; no external assets):

```html
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="dark">
<title>Scientific PDF Translate — Setup Guide · AnyLLMTranslate</title>
<style>
  :root {
    --bg: #09090b; --panel: #18181b; --panel-2: #1f1f23; --border: rgba(255,255,255,.08);
    --text: #d4d4d8; --muted: #a1a1aa; --accent: #f59e0b; --accent-dim: rgba(245,158,11,.12);
    --link: #60a5fa; --code-bg: #0d0d10; --code-text: #fbbf24;
  }
  * { box-sizing: border-box; }
  html { scroll-behavior: smooth; }
  body { margin: 0; background: var(--bg); color: var(--text); font: 16px/1.6 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; }
  .layout { display: grid; grid-template-columns: 240px minmax(0, 760px); gap: 48px; max-width: 1080px; margin: 0 auto; padding: 32px 24px 96px; }
  nav.toc { position: sticky; top: 32px; align-self: start; font-size: 13px; }
  nav.toc ul { list-style: none; margin: 0; padding: 0; }
  nav.toc a { color: var(--muted); text-decoration: none; display: block; padding: 4px 8px; border-left: 2px solid transparent; }
  nav.toc a:hover { color: var(--text); border-left-color: var(--accent); }
  main { min-width: 0; }
  header h1 { font-size: 28px; margin: 0 0 8px; color: #fafafa; }
  header p { color: var(--muted); margin: 0 0 8px; }
  .badge { display: inline-block; font-size: 11px; font-weight: 600; letter-spacing: .03em; text-transform: uppercase; padding: 2px 8px; border-radius: 999px; background: var(--accent-dim); color: var(--accent); border: 1px solid rgba(245,158,11,.3); }
  section { margin-top: 48px; }
  h2 { font-size: 20px; color: #fafafa; margin: 0 0 12px; padding-top: 8px; border-bottom: 1px solid var(--border); padding-bottom: 8px; }
  h3 { font-size: 16px; color: #e4e4e7; margin: 24px 0 8px; }
  p, li { color: var(--text); }
  a { color: var(--link); }
  code { background: var(--code-bg); color: var(--code-text); padding: 1px 6px; border-radius: 4px; font: 12.5px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
  pre { position: relative; background: var(--code-bg); border: 1px solid var(--border); border-radius: 10px; padding: 14px 14px 14px 14px; overflow-x: auto; }
  pre code { background: none; color: #e4e4e7; padding: 0; display: block; white-space: pre; font-size: 12.5px; line-height: 1.55; }
  .copy-btn { position: absolute; top: 8px; right: 8px; background: var(--panel-2); color: var(--muted); border: 1px solid var(--border); border-radius: 6px; font-size: 11px; padding: 4px 8px; cursor: pointer; }
  .copy-btn:hover { color: var(--text); border-color: rgba(255,255,255,.2); }
  .card { background: var(--panel); border: 1px solid var(--border); border-radius: 12px; padding: 20px 24px; margin: 16px 0; }
  .card--recommended { border-color: rgba(245,158,11,.35); }
  .note { border-left: 3px solid var(--accent); background: var(--accent-dim); border-radius: 0 8px 8px 0; padding: 10px 14px; font-size: 14px; margin: 16px 0; }
  table { border-collapse: collapse; width: 100%; font-size: 14px; margin: 12px 0; }
  th, td { text-align: left; border: 1px solid var(--border); padding: 8px 12px; vertical-align: top; }
  th { background: var(--panel-2); color: #e4e4e7; }
  footer { margin-top: 64px; color: var(--muted); font-size: 13px; border-top: 1px solid var(--border); padding-top: 16px; }
  @media (max-width: 860px) { .layout { grid-template-columns: 1fr; } nav.toc { position: static; } nav.toc ul { display: flex; flex-wrap: wrap; gap: 4px; } }
</style>
</head>
<body>
<div class="layout">
<nav class="toc" aria-label="Table of contents">
  <ul>
    <li><a href="#overview">Overview</a></li>
    <li><a href="#prerequisites">Prerequisites</a></li>
    <li><a href="#path-a">Quick Start (pull image)</a></li>
    <li><a href="#path-b">Build from source</a></li>
    <li><a href="#verify">Verify the bridge</a></li>
    <li><a href="#connect">Connect in the extension</a></li>
    <li><a href="#commands">Everyday commands</a></li>
    <li><a href="#update">Updates &amp; rebuilds</a></li>
    <li><a href="#troubleshooting">Troubleshooting</a></li>
    <li><a href="#privacy">Privacy</a></li>
    <li><a href="#links">Links</a></li>
  </ul>
</nav>
<main>
<header>
  <h1>Scientific PDF Translate — Setup Guide</h1>
  <p><span class="badge">AnyLLMTranslate</span> &nbsp; Layout-preserving PDF translation via a local Docker bridge (pdf2zh)</p>
</header>

<section id="overview">
  <h2>Overview</h2>
  <p>PDF Translate in AnyLLMTranslate runs through a small local service called the <strong>Scientific PDF bridge</strong>. It wraps <a href="https://github.com/PDFMathTranslate/PDFMathTranslate" rel="noreferrer">pdf2zh</a> and preserves layout, math, and formulas. The bridge listens on <code>http://127.0.0.1:17890</code> and uses <strong>your existing provider pool</strong> — no second API key.</p>
  <p>There is no in-browser "Fast" PDF path: the bridge must be running for PDF Translate to appear in the viewer.</p>
  <div class="note"><strong>Two ways to run it.</strong> Pick one: <a href="#path-a">Quick Start</a> downloads a prebuilt image (~1 min, recommended for most users). <a href="#path-b">Build from source</a> compiles the image from this repo (for developers).</div>
</section>

<section id="prerequisites">
  <h2>Prerequisites</h2>
  <ul>
    <li><strong>Docker</strong>:
      <ul>
        <li>macOS / Windows: <a href="https://www.docker.com/products/docker-desktop/" rel="noreferrer">Docker Desktop</a> (start it before the steps below)</li>
        <li>Linux: Docker Engine + the <code>docker compose</code> plugin — e.g. <code>sudo apt install docker.io docker-compose-v2</code> (Ubuntu/Debian)</li>
      </ul>
    </li>
    <li><strong>Terminal</strong> — macOS/Linux: Terminal; Windows: PowerShell (or Git Bash for the shell script).</li>
    <li>The bridge image is ~2&nbsp;GB when pulled/built — first run takes a moment.</li>
  </ul>
</section>

<section id="path-a">
  <h2>Quick Start — pull the prebuilt image</h2>
  <div class="card card--recommended">
    <p>Recommended. No repository clone, no build. Docker pulls a ready-made image from the GitHub Container Registry.</p>
  </div>
  <h3>1. Create a compose file</h3>
  <p>Save this as <code>docker-compose.scientific-pdf.yml</code> in any empty folder:</p>
<pre><button class="copy-btn" data-copy>Copy</button><code>services:
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
  scientific-pdf-models:</code></pre>
  <h3>2. Start it</h3>
<pre><button class="copy-btn" data-copy>Copy</button><code>docker compose -f docker-compose.scientific-pdf.yml up -d</code></pre>
  <p>The first pull downloads ~2&nbsp;GB; subsequent starts are instant.</p>
  <h3>3. Verify</h3>
<pre><button class="copy-btn" data-copy>Copy</button><code>curl -sS http://127.0.0.1:17890/health</code></pre>
  <p>Expect: <code>{"status":"ok","version":"1.0.0","pdf2zh":"available"}</code> — then continue at <a href="#connect">Connect in the extension</a>.</p>
</section>

<section id="path-b">
  <h2>Build from source (developer path)</h2>
  <div class="card">
    <p>Use this if you develop the bridge, or prefer to build everything yourself. You need <code>git</code> plus the prerequisites above.</p>
  </div>
  <h3>1. Clone the repo</h3>
<pre><button class="copy-btn" data-copy>Copy</button><code>git clone https://github.com/NguyenSiTrung/AnyLLMTranslate.git
cd AnyLLMTranslate</code></pre>
  <h3>2. Build and start (helper script)</h3>
<pre><button class="copy-btn" data-copy>Copy</button><code>chmod +x scripts/scientific-pdf-docker.sh
./scripts/scientific-pdf-docker.sh up</code></pre>
  <p>The script stops any existing container, builds the image, starts it, and waits for <code>/health</code>. First build takes several minutes (Python packages + pdf2zh). The build log should include <code>pdf2zh import ok</code>.</p>
  <h3>Manual compose (equivalent, Windows-friendly)</h3>
<pre><button class="copy-btn" data-copy>Copy</button><code>docker compose -f docker-compose.scientific-pdf.yml down
docker compose -f docker-compose.scientific-pdf.yml up -d --build
curl -sS http://127.0.0.1:17890/health</code></pre>
</section>

<section id="verify">
  <h2>Verify the bridge</h2>
  <ul>
    <li>Container: <code>docker ps --filter name=anyllm-scientific-pdf</code> should list it as <code>Up</code>.</li>
    <li>Health: <code>curl -sS http://127.0.0.1:17890/health</code> → <code>{"status":"ok",…}</code>.</li>
    <li>Logs (if something looks wrong): <code>docker logs -f anyllm-scientific-pdf</code>.</li>
  </ul>
</section>

<section id="connect">
  <h2>Connect in the extension</h2>
  <ol>
    <li>Open <strong>Options → Advanced → Scientific PDF</strong>.</li>
    <li>Toggle <strong>Enable PDF bridge</strong> on. Leave the server URL at the default <code>http://127.0.0.1:17890</code>.</li>
    <li>Click <strong>Set up…</strong> → follow the wizard (health poll + connection test).</li>
    <li>Open a PDF in the built-in viewer — wait for <strong>Bridge ready</strong> — then click <strong>Translate</strong>.</li>
  </ol>
  <p>Jobs use your active provider pool (including rate limits and concurrency). Progress and logs appear in a modal; results download as mono / dual / side-by-side PDFs.</p>
</section>

<section id="commands">
  <h2>Everyday commands</h2>
  <p>With the repo cloned (script) or with the compose file (manual):</p>
<pre><button class="copy-btn" data-copy>Copy</button><code># script (repo root)
./scripts/scientific-pdf-docker.sh start    # start without rebuild
./scripts/scientific-pdf-docker.sh down     # stop
./scripts/scientific-pdf-docker.sh status   # container + health
./scripts/scientific-pdf-docker.sh logs     # follow logs (Ctrl+C)

# manual (any folder with the compose file)
docker compose -f docker-compose.scientific-pdf.yml up -d
docker compose -f docker-compose.scientific-pdf.yml down</code></pre>
  <div class="note">After a reboot, Docker Desktop must be started, then re-run the <code>up</code> command — the container restarts automatically (<code>restart: unless-stopped</code>), but the Docker daemon needs to be up.</div>
</section>

<section id="update">
  <h2>Updates &amp; rebuilds</h2>
  <h3>Prebuilt image (Quick Start)</h3>
<pre><button class="copy-btn" data-copy>Copy</button><code>docker compose -f docker-compose.scientific-pdf.yml pull
docker compose -f docker-compose.scientific-pdf.yml up -d</code></pre>
  <h3>Source build</h3>
  <p>Extension UI changes never need a Docker rebuild. Rebuild only when bridge code or the Dockerfile changed:</p>
<pre><button class="copy-btn" data-copy>Copy</button><code>git pull
./scripts/scientific-pdf-docker.sh rebuild</code></pre>
</section>

<section id="troubleshooting">
  <h2>Troubleshooting</h2>
  <table>
    <thead><tr><th>Symptom</th><th>Fix</th></tr></thead>
    <tbody>
      <tr><td><code>curl</code> connection refused</td><td>Container not running → <code>docker compose … up -d</code>, then check <code>docker ps</code>.</td></tr>
      <tr><td>Wizard shows "Offline"</td><td>Same — check the container and port <code>17890</code>.</td></tr>
      <tr><td><code>TextTranslateRequest</code> / pdf2zh import crash</td><td>Rebuild with the current Dockerfile (Tencent SDK pin).</td></tr>
      <tr><td><code>RateLimError</code> in logs</td><td>Use a chat/instruct model; lower concurrency; check provider RPM.</td></tr>
      <tr><td>First job is very slow</td><td>Normal — fonts/models download once into the Docker volumes.</td></tr>
      <tr><td>Permission denied on <code>docker.sock</code></td><td>Use Docker Desktop user permissions, or <code>sudo docker …</code> on Linux.</td></tr>
    </tbody>
  </table>
</section>

<section id="privacy">
  <h2>Privacy</h2>
  <p>Scientific jobs send the <strong>full PDF</strong> and <strong>short-lived provider credentials</strong> to the configured server URL — default loopback only. Prefer <code>http://127.0.0.1:17890</code>. See <a href="https://github.com/NguyenSiTrung/AnyLLMTranslate/blob/HEAD/PRIVACY.md" rel="noreferrer">PRIVACY.md</a>.</p>
</section>

<section id="links">
  <h2>Links</h2>
  <ul>
    <li>Repository: <a href="https://github.com/NguyenSiTrung/AnyLLMTranslate" rel="noreferrer">NguyenSiTrung/AnyLLMTranslate</a></li>
    <li>Bridge API reference: <a href="https://github.com/NguyenSiTrung/AnyLLMTranslate/blob/HEAD/docs/scientific-pdf-bridge-api.md" rel="noreferrer">docs/scientific-pdf-bridge-api.md</a></li>
    <li>pdf2zh upstream: <a href="https://github.com/PDFMathTranslate/PDFMathTranslate" rel="noreferrer">PDFMathTranslate/PDFMathTranslate</a></li>
  </ul>
</section>

<footer>
  AnyLLMTranslate — Scientific PDF bridge setup guide. Hosted on GitHub Pages from <code>docs/guide/</code>.
</footer>
</main>
</div>
<script>
  document.querySelectorAll('pre').forEach(function (pre) {
    var btn = pre.querySelector('.copy-btn');
    if (!btn) return;
    btn.addEventListener('click', function () {
      var text = pre.querySelector('code').innerText;
      function done() { btn.textContent = 'Copied'; setTimeout(function () { btn.textContent = 'Copy'; }, 1600); }
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(done, done);
      } else {
        var ta = document.createElement('textarea');
        ta.value = text; document.body.appendChild(ta); ta.select();
        try { document.execCommand('copy'); } catch (e) {}
        document.body.removeChild(ta); done();
      }
    });
  });
</script>
</body>
</html>
```

- [ ] **Step 2: Verify locally**

Open in a browser: `file:///home/ubuntu/Documents/project/AnyLLMTranslate/docs/guide/index.html` (browser tool: `open` then `tab.observe()`; click a copy button and confirm the button label flips to "Copied"; confirm all TOC anchors jump).

Expected: dark themed page, sticky TOC, all sections render, copy buttons work.

---

### Task 7: Add `.nojekyll`

**Files:**
- Create: `docs/guide/.nojekyll`

- [ ] **Step 1: Create empty file**

Run: `touch docs/guide/.nojekyll`

Expected: file exists, zero bytes. (Prevents any Jekyll processing of the guide folder on Pages.)

---

### Task 8: Update the repo-local setup doc to match

**Files:**
- Modify: `docs/scientific-pdf-setup.md`

- [ ] **Step 1: Add the public guide link at the top**

After the first paragraph block (after the "**Default URL:** … **Port:** …" lines), add:

```md
**Public guide (no repo needed):** https://nguyensitrung.github.io/AnyLLMTranslate/guide/

---

## Two setup paths

1. **Quick Start — pull the prebuilt image** (recommended, no clone): copy the compose file from the public guide into any folder, then `docker compose up -d`. Image: `ghcr.io/nguyensitrung/anyllm-scientific-pdf-bridge:latest`.
2. **Build from source** (developer): use the helper script below.
```

- [ ] **Step 2: Verify**

Run: `git diff --stat docs/scientific-pdf-setup.md` (at Task 11 end) — confirm only the intended addition.

---

### Task 9: Pages deploy workflow

**Files:**
- Create: `.github/workflows/pages.yml`

- [ ] **Step 1: Create the workflow**

```yaml
name: Deploy guide to GitHub Pages

on:
  push:
    branches: [master]
    paths:
      - 'docs/guide/**'
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: pages
  cancel-in-progress: true

jobs:
  deploy:
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v4
      - name: Setup Pages
        uses: actions/configure-pages@v5
      - name: Stage guide under /guide/
        run: |
          mkdir -p _site/guide
          cp -r docs/guide/. _site/guide/
      - name: Upload artifact
        uses: actions/upload-pages-artifact@v3
        with:
          path: _site
          include-hidden-files: true
      - name: Deploy to GitHub Pages
        id: deployment
        uses: actions/deploy-pages@v4
```

> **Why the staging step:** `upload-pages-artifact` tars the *contents* of `path` at the artifact root, so uploading `docs/guide` directly would serve the guide at the site root (`/AnyLLMTranslate/`), while every in-extension link targets `/guide/`. Staging under `_site/guide/` makes the artifact contain `guide/index.html`, which deploys at `https://nguyensitrung.github.io/AnyLLMTranslate/guide/`. `include-hidden-files: true` ships the `.nojekyll`.

- [ ] **Step 2: Validate YAML**

Run:
```bash
python3 -c "import yaml,sys; yaml.safe_load(open('.github/workflows/pages.yml')); print('pages.yml OK')"
```
Expected: `pages.yml OK`

---

### Task 10: GHCR image publishing workflow

**Files:**
- Create: `.github/workflows/bridge-image.yml`

- [ ] **Step 1: Create the workflow**

> Image name is hardcoded lowercase — GHCR requires lowercase, and `github.repository` contains uppercase (`AnyLLMTranslate`).

```yaml
name: Build and publish scientific-pdf-bridge image

on:
  push:
    branches: [master]
    paths:
      - 'services/scientific-pdf-bridge/**'
    tags:
      - 'v*'
  workflow_dispatch:

permissions:
  contents: read
  packages: write

jobs:
  publish:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v4
      - name: Set up Docker Buildx
        uses: docker/setup-buildx-action@v3
      - name: Log in to GitHub Container Registry
        uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}
      - name: Extract metadata
        id: meta
        uses: docker/metadata-action@v5
        with:
          # Hardcoded lowercase name (GHCR requires lowercase; repo name has uppercase).
          images: ghcr.io/nguyensitrung/anyllm-scientific-pdf-bridge
          tags: |
            type=raw,value=latest,enable={{is_default_branch}}
            type=sha,prefix=sha-,format=short
            type=ref,event=tag
      - name: Build and push
        uses: docker/build-push-action@v6
        with:
          context: ./services/scientific-pdf-bridge
          platforms: linux/amd64,linux/arm64
          push: true
          tags: ${{ steps.meta.outputs.tags }}
          labels: ${{ steps.meta.outputs.labels }}
```

- [ ] **Step 2: Validate YAML**

Run:
```bash
python3 -c "import yaml,sys; yaml.safe_load(open('.github/workflows/bridge-image.yml')); print('bridge-image.yml OK')"
```
Expected: `bridge-image.yml OK`

> **Contingency:** if the arm64 build fails at merge time (missing aarch64 wheels for a dependency), drop `linux/arm64` from `platforms` — amd64-only still serves Apple Silicon via Docker Desktop's Rosetta emulation. Record the fallback in a bd issue.

---

### Task 11: Full verification + report

**Files:** none (verification only)

- [ ] **Step 1: Typecheck**

Run: `pnpm compile`
Expected: exit 0, no errors.

- [ ] **Step 2: Affected test suites**

Run:
```bash
pnpm exec vitest run \
  entrypoints/pdf-viewer/components/__tests__/BridgeSetupCard.test.tsx \
  entrypoints/options/sections/__tests__/AdvancedSection.backup.test.tsx \
  entrypoints/options/sections/__tests__/AdvancedSection.jumpNav.test.tsx \
  lib/__tests__/scientificPdf.test.ts \
  lib/__tests__/scientificPdfWizard.test.ts
```
Expected: all PASS.

- [ ] **Step 3: Render the guide in a browser**

Browser tool: open `file:///home/ubuntu/Documents/project/AnyLLMTranslate/docs/guide/index.html`; screenshot/observe — dark theme, TOC present, copy buttons flip to "Copied" on click, all sections readable.

- [ ] **Step 4: Diff review**

Run: `git status --short`
Expected: exactly these changes, nothing else:
- `lib/scientificPdf.ts` (constant)
- `entrypoints/pdf-viewer/components/BridgeSetupCard.tsx` + its test
- `entrypoints/options/sections/AdvancedSection.tsx`
- `entrypoints/options/components/ScientificPdfWizard.tsx`
- `README.md`, `docs/scientific-pdf-setup.md`
- new: `docs/guide/index.html`, `docs/guide/.nojekyll`, `.github/workflows/pages.yml`, `.github/workflows/bridge-image.yml`
- new (from this process): `docs/superpowers/specs/2026-08-11-scientific-pdf-setup-guide-site-design.md`

- [ ] **Step 5: Report**

Summarize changes + verification results. Do NOT commit/push (repo policy). List the maintainer's manual steps:
1. Repo Settings → make public.
2. Repo Settings → Pages → Source: **GitHub Actions**.
3. Push to `main`; the Pages workflow publishes the guide; the bridge-image workflow builds/pushes the GHCR image (first push auto-creates the public package).

---

## Self-review notes

- **Spec coverage:** guide site → Task 6/7; GHCR workflow → Task 10; Pages workflow → Task 9; extension links (viewer card, Advanced card, wizard, README) → Tasks 2-5; repo doc mirror → Task 8; manual ops → Task 11 Step 5; `latest` tag → Task 6 snippet + Task 10 metadata.
- **Type consistency:** single constant `SCIENTIFIC_PDF_SETUP_GUIDE_URL` used identically across Tasks 1-5; image name `ghcr.io/nguyensitrung/anyllm-scientific-pdf-bridge` identical in Tasks 6 and 10.
- **Placeholder scan:** all code blocks are complete; no TBD/TODO.
