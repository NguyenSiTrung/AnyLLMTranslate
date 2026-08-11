# README Refresh Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the stale, difficult-to-scan README with a balanced, accurate product and developer guide for the current AnyLLMTranslate repository.

**Architecture:** Keep product behavior unchanged. Rewrite `README.md` around the approved landing-page information architecture, using the current handler registry, package scripts, privacy policy, Scientific PDF guide, and WXT configuration as sources of truth. Preserve selected technical detail in compact tables and link to deeper documents rather than duplicating them. Bound Vitest file workers separately so the existing parallel test suite remains stable under CPU contention.

**Tech Stack:** Markdown, Prettier 3, WXT 0.20.x, pnpm/npm scripts, GitHub Pages Scientific PDF guide.

## Global Constraints

- Use Node.js `>=20.12.0` in prerequisites, matching `package.json`.
- Present developer-mode installation only; do not claim Chrome Web Store or Firefox Add-ons publication.
- Describe the project as BYOK and OpenAI-compatible, including cloud and local endpoints without implying a hosted AnyLLMTranslate service.
- List subtitle handlers from `inject/subtitleHandlers/registry.ts` and `lib/subtitleSites.ts`: YouTube, Udemy, Coursera, LinkedIn Learning, HBO Max/Max, Youku, Netflix, Disney+, WeTV/iFlix, and Generic auto-detect fallback.
- State that Scientific PDF translation is bridge-only and link to `https://nguyensitrung.github.io/AnyLLMTranslate/guide/`.
- Do not hard-code historical test totals, bundle sizes, or release claims.
- Add a root `LICENSE` file containing the standard MIT License text with `Copyright (c) 2026 Nguyen Si Trung`.
- Keep credentials, tokens, and user-generated content out of the documentation.
- Do not change product runtime files, package dependencies, or unrelated documentation. A narrowly scoped Vitest worker cap is allowed for the observed load-sensitive test instability.
- Do not commit or push without explicit user authorization; report the final diff and validation instead.

---

### Task 1: Rewrite the README content

**Files:**

- Modify: `README.md`
- Reference: `docs/superpowers/specs/2026-08-11-readme-refresh-design.md`
- Reference: `package.json`
- Reference: `wxt.config.ts`
- Reference: `lib/subtitleSites.ts`
- Reference: `inject/subtitleHandlers/registry.ts`
- Reference: `PRIVACY.md`
- Reference: `docs/scientific-pdf-setup.md`
- Reference: `docs/scientific-pdf-bridge-api.md`
- Reference: `docs/guide/index.html`
- Reference: `.github/workflows/pages.yml`
- Reference: `.github/workflows/bridge-image.yml`

**Interfaces:**

- Consumes: current feature and command facts from the referenced repository files.
- Produces: a README that gives a first-time reader a clear product summary, a first successful developer install, accurate subtitle/PDF expectations, and contributor entry points.

- [ ] **Step 1: Replace the opening and navigation with a product-oriented hero**

  Start `README.md` with:

  ```markdown
  # AnyLLMTranslate

  > Read the web bilingually, translate video subtitles, and bring your own LLM.
  ```

  Follow it with a short paragraph describing the open-source, privacy-first,
  BYOK browser extension, then add a compact table of contents linking to
  Features, Subtitle support, Install, Configure, Scientific PDF, Development,
  Privacy, Contributing, and License.

- [ ] **Step 2: Add the four scannable feature groups**

  Use short subsections for:
  - **Bilingual web pages:** inline original/translation display, viewport
    loading, SPA support, page-scope presets, themes, dark mode, glossary,
    site rules, cache, and restore.
  - **Video subtitles:** platform handlers, progressive bilingual overlays,
    track discovery, generic fallback, player mini studio, subtitle style
    presets, named glossary lists, and optional YouTube ASR re-alignment.
  - **Interactive translation:** selection dictionary/translation, hover,
    inline input, section translation, text-to-speech, shortcuts, and context
    menus.
  - **PDFs:** bundled reader/viewer plus optional Scientific PDF bridge with
    layout-preserving mono, dual, and side-by-side outputs.

  Keep each subsection to bullets that explain user value. Do not copy the
  existing source-file inventory or historical feature chronology.

- [ ] **Step 3: Add the current subtitle support matrix**

  Add a table with columns `Platform`, `Coverage`, and `Notes`, using these
  entries:

  | Platform          | Coverage            | Notes                                                          |
  | ----------------- | ------------------- | -------------------------------------------------------------- |
  | YouTube           | Dedicated handler   | Includes native track discovery and optional ASR re-alignment  |
  | Udemy             | Dedicated handler   | Course captions                                                |
  | Coursera          | Dedicated handler   | Lecture subtitles and transcript tracks                        |
  | LinkedIn Learning | Dedicated handler   | VTT and transcript metadata paths                              |
  | HBO Max / Max     | Dedicated handler   | VTT/manifest/DOM fallback paths vary by player                 |
  | Youku             | Dedicated handler   | ASS/manifest/DOM fallback paths                                |
  | Netflix           | Dedicated handler   | Player metadata and timed-text paths                           |
  | Disney+           | Dedicated handler   | Player metadata and VTT paths                                  |
  | WeTV / iFlix      | Dedicated handler   | VTT interception                                               |
  | Generic fallback  | Last-resort handler | Common VTT, SRT, TTML, content-type, and DOM caption detection |

  Add one note that subtitle behavior depends on the platform player, track
  availability, account/region, and future site changes. Make clear that
  Generic is a fallback and does not override dedicated handlers.

- [ ] **Step 4: Explain the BYOK and data-flow model**

  Add a compact architecture table:

  | Layer                              | Responsibility                                                  |
  | ---------------------------------- | --------------------------------------------------------------- |
  | Popup / Options / Side panel       | User controls and setup                                         |
  | Content script                     | DOM translation, overlays, selection, hover, and inline tools   |
  | MAIN-world injectors               | Subtitle/network and player integration                         |
  | Background service worker          | Provider pool, retries, cache, rate limits, and message routing |
  | PDF viewer + Scientific PDF bridge | Reader UI plus optional local layout-preserving PDF jobs        |

  Follow it with explicit privacy bullets:
  - No developer telemetry, analytics, or crash reporting.
  - Settings, statistics, cache, and encrypted API keys stay in browser storage.
  - Page or subtitle text is sent only to the provider the user configures.
  - Scientific PDF jobs additionally send the PDF and short-lived provider
    credentials to the configured bridge URL, defaulting to
    `http://127.0.0.1:17890`.

  Link to `PRIVACY.md` for the complete data contract.

- [ ] **Step 5: Write the developer-mode installation and first-run path**

  Add prerequisites:

  ```text
  Node.js >= 20.12.0
  pnpm (recommended) or npm
  Chrome or Firefox for unpacked-extension testing
  ```

  Add both install options without duplicating every command:

  ```bash
  git clone https://github.com/NguyenSiTrung/AnyLLMTranslate.git
  cd AnyLLMTranslate

  pnpm install
  pnpm build
  ```

  Include the npm equivalents:

  ```bash
  npm install
  npm run build
  ```

  Explain Chrome loading from `chrome://extensions/` into `.output/chrome-mv3`
  and Firefox loading from the corresponding WXT output after
  `pnpm build:firefox`. State that these are developer-mode instructions, not
  store-release instructions.

  Add the first-run sequence:
  1. Open the AnyLLMTranslate popup and let the setup wizard start.
  2. Choose a provider from the catalog or enter a custom endpoint.
  3. Test the connection and select a target language.
  4. Open a normal webpage and choose **Translate Page** or press `Alt+A`.

- [ ] **Step 6: Add provider configuration guidance**

  Explain that the provider pool supports multiple enabled providers and keys,
  per-key rate limits, model selection, rotation, and circuit-breaker failover.
  Include a small example table:

  | Provider type           | Example                                                |
  | ----------------------- | ------------------------------------------------------ |
  | Cloud OpenAI-compatible | OpenAI, OpenRouter, Groq, Together, Fireworks, Mistral |
  | Google-compatible       | Google AI Studio / Gemini                              |
  | Local                   | Ollama or LM Studio, usually without an API key        |
  | Custom                  | Any endpoint exposing a compatible chat API            |

  Tell readers to use **Options → Providers** for model listing, connection
  tests, pool keys, and throttling. Avoid documenting provider-specific quotas
  or credentials that are not maintained in this repository.

- [ ] **Step 7: Link the Scientific PDF quick path**

  Explain in a short section that Scientific PDF translation is optional and
  bridge-only. Include:

  ```markdown
  [Open the Scientific PDF setup guide](https://nguyensitrung.github.io/AnyLLMTranslate/guide/)
  ```

  Mention the default loopback URL, Docker requirement, shared provider-pool
  credentials, bridge health check, and mono/dual/side-by-side output. Link to
  `docs/scientific-pdf-setup.md` and
  `docs/scientific-pdf-bridge-api.md` for repository-local details.

- [ ] **Step 8: Add concise development, packaging, and support links**

  Add command tables sourced from `package.json`:

  ```markdown
  | Command              | Purpose                                   |
  | -------------------- | ----------------------------------------- |
  | `pnpm dev`           | Chrome development server with hot reload |
  | `pnpm dev:firefox`   | Firefox development server                |
  | `pnpm build`         | Production Chrome build                   |
  | `pnpm build:firefox` | Production Firefox build                  |
  | `pnpm test:fast`     | Fast library/unit test subset             |
  | `pnpm test`          | Full Vitest suite                         |
  | `pnpm compile`       | TypeScript type check                     |
  | `pnpm lint`          | ESLint check                              |
  | `pnpm zip`           | Chrome distributable package              |
  | `pnpm zip:firefox`   | Firefox distributable package             |
  ```

  Add short links to `CONTRIBUTING.md`, `PRIVACY.md`, the Scientific PDF
  documentation, and `LICENSE`. End with a restrained project credit
  that does not introduce unverified release claims.

- [ ] **Step 9: Preserve only useful keyboard shortcuts**

  Include the verified shortcuts from `wxt.config.ts` and the page-level
  controls, but keep the table short:

  | Shortcut | Action                          |
  | -------- | ------------------------------- |
  | `Alt+A`  | Translate the current page      |
  | `Alt+S`  | Translate video subtitles       |
  | `Alt+Z`  | Show or hide translations       |
  | `Alt+X`  | Restore the original page       |
  | `Alt+I`  | Translate the focused input box |

  Note that Chrome global shortcuts can be changed at
  `chrome://extensions/shortcuts` and that the inline-input command has no
  default suggested key in the manifest.

### Task 2: Add the missing MIT license declaration

**Files:**

- Create: `LICENSE`

**Interfaces:**

- Consumes: the existing README claim and the approved copyright-holder decision.
- Produces: a standard, tracked MIT license declaration that the README can link to.

- [ ] **Step 1: Add the standard MIT License text**

  Create `LICENSE` with exactly:

  ```text
  MIT License

  Copyright (c) 2026 Nguyen Si Trung

  Permission is hereby granted, free of charge, to any person obtaining a copy
  of this software and associated documentation files (the "Software"), to deal
  in the Software without restriction, including without limitation the rights
  to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
  copies of the Software, and to permit persons to whom the Software is
  furnished to do so, subject to the following conditions:

  The above copyright notice and this permission notice shall be included in all
  copies or substantial portions of the Software.

  THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
  IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
  FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
  AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
  LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
  OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
  SOFTWARE.
  ```

### Task 3: Stabilize the default parallel test run

**Files:**

- Modify: `vitest.config.ts`
- Validate: `entrypoints/options/sections/__tests__/AdvancedSection.backup.test.tsx`
- Validate: full Vitest suite via `npm test`

**Interfaces:**

- Consumes: Vitest's existing file-level parallel execution and the repository's
  real jsdom/Web Crypto test workload.
- Produces: a normal `npm test` run with bounded file parallelism and unchanged
  five-second test semantics.

- [ ] **Step 1: Reproduce and isolate the load-sensitive timeout**

  Run the affected UI file in isolation, then run the full suite with one
  worker:

  ```bash
  npx vitest run entrypoints/options/sections/__tests__/AdvancedSection.backup.test.tsx
  npx vitest run --no-file-parallelism --maxWorkers=1 --minWorkers=1
  ```

  Expected: the focused file and serial suite pass, while the default
  parallel run identifies moving five-second timeouts under CPU contention.

- [ ] **Step 2: Set the bounded worker cap**

  In `vitest.config.ts`, add the following inside `test`:

  ```ts
  // Keep jsdom and Web Crypto-heavy files from timing out on oversubscribed
  // hosts while preserving bounded file-level parallelism.
  maxWorkers: 4,
  ```

  Do not change `testTimeout`, production PBKDF2 iterations, subtitle
  timeouts, or file-level parallelism.

- [ ] **Step 3: Verify the focused and full suites**

  Run:

  ```bash
  npx vitest run entrypoints/options/sections/__tests__/AdvancedSection.backup.test.tsx
  npm test
  ```

  Expected: the focused suite reports 7 passing tests and `npm test` reports
  198 passing files and 544 passing tests with exit code 0.

### Task 4: Validate documentation accuracy and formatting

**Files:**

- Modify: `README.md` only if validation finds a documentation defect.
- Validate: `README.md`, `LICENSE`, `vitest.config.ts`, `docs/superpowers/specs/2026-08-11-readme-refresh-design.md`

**Interfaces:**

- Consumes: rewritten README and repository source-of-truth files.
- Produces: a clean Markdown document with resolvable local links and no stale
  claims.

- [ ] **Step 1: Check Markdown formatting**

  Run:

  ```bash
  npx prettier --check README.md docs/superpowers/specs/2026-08-11-readme-refresh-design.md docs/superpowers/plans/2026-08-11-readme-refresh.md
  ```

  Expected: both files are reported as formatted. If Prettier reports a
  difference, run `npx prettier --write README.md` and inspect the diff.

- [ ] **Step 2: Check every local README link**

  Run:

  ```bash
  python3 - <<'PY'
  from pathlib import Path
  import re

  root = Path.cwd()
  readme = root / "README.md"
  links = re.findall(r"\[[^\]]+\]\(([^)]+)\)", readme.read_text())
  local = [link.split("#", 1)[0] for link in links if not re.match(r"^[a-z]+://", link)]
  missing = sorted({link for link in local if link and not (root / link).exists()})
  if missing:
      raise SystemExit("Missing local README links:\n" + "\n".join(missing))
  print(f"Checked {len(local)} local README links: all exist")
  PY
  ```

  Expected: the command exits successfully and reports that all local links
  exist.

- [ ] **Step 3: Review the final documentation diff**

  Run:

  ```bash
  git diff --check
  git diff -- README.md docs/superpowers/specs/2026-08-11-readme-refresh-design.md docs/superpowers/plans/2026-08-11-readme-refresh.md
  git status --short
  ```

  Confirm that only the intended README, design, and plan files are changed,
  plus `LICENSE`, are changed; that no API key or token appears; that the
  README does not claim a published store release; that the support matrix
  matches the registered handlers; and that the README's license link resolves.

- [ ] **Step 4: Report validation without changing repository history**

  Report the formatting check, local-link check, `git diff --check`, changed
  files, license-file check, focused/full test results, and any broader
  checks not run. Do not create a commit or push unless the user explicitly
  authorizes those actions.
