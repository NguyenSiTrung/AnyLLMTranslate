# Chrome Web Store Publishing Guide

This guide walks through publishing **AnyLLMTranslate** to the Chrome Web Store.

> Copy, permission justifications, data-usage answers, screenshot specs, and reviewer Q&A live in [store-listing.md](store-listing.md). Keep that file, [PRIVACY.md](../PRIVACY.md), and the dashboard fields in agreement — a mismatch between them is itself a policy violation.

---

## 🛠️ Step 1: Prepare the Extension Bundles

Google requires a built zip of the extension. Because the extension connects to external APIs, reviewers often ask for the original source to verify security compliance.

### 1. Build the production zip

```bash
pnpm zip
```

*Output:* `.output/anyllm-translate-<version>-chrome.zip` (version from `package.json`; `1.0.0` → `anyllm-translate-1.0.0-chrome.zip`).

### 2. Prepare a curated source archive

The current `pnpm zip:source` runs `git archive` over every tracked file, which sweeps in agent tooling (`.agents/`, `.claude/`, `.codex/`), Conductor state (`conductor/`), ~50 planning documents under `docs/superpowers/`, the internal `docs/hbomax-subtitle-risk-audit.md`, and `.beads/issues.jsonl`. None of that helps a reviewer, and the internal audit notes actively invite questions about scraping paid platforms.

Until the script is narrowed, build the reviewer archive by hand from an allow-list:

```bash
git archive -o source-code.zip HEAD \
  entrypoints content inject services lib stores ui styles public types \
  wxt.config.ts package.json pnpm-lock.yaml tsconfig.json vitest.config.ts \
  eslint.config.mjs LICENSE PRIVACY.md README.md docs/scientific-pdf-bridge-api.md
```

The archive must still be complete enough to build: if you drop a directory, keep the build reproducible from what remains.

---

## 🎨 Step 2: Store Assets

| Asset | Size / Format | Requirement | Notes |
|-------|---------------|-------------|-------|
| Extension icon | `128x128` PNG | **Required** | `public/icon/128.png` |
| Screenshots | `1280x800` PNG | **Required** | 1–5. Missing screenshots is an automatic rejection. See the capture runbook in [store-listing.md](store-listing.md) §5. |
| Promo tile | `440x280` PNG | Optional | Improves discoverability |

**Screenshot content rules:** show the product working; no streaming-service UI; no real API keys or personal data.

---

## 📝 Step 3: Listing Metadata

Use [store-listing.md](store-listing.md) §1–2 for the name, short description, category, single-purpose statement, and long description.

*   **Product name:** `AnyLLMTranslate`. Keep trademarks out of the title.
*   **Short description:** comes from `manifest.description` in [wxt.config.ts](../wxt.config.ts), capped at 132 characters.
*   **Single purpose:** the one-line statement in [store-listing.md](store-listing.md) §1.
*   **Privacy policy URL:** `https://nguyensitrung.github.io/AnyLLMTranslate/guide/privacy.html`

### Privacy policy hosting

`docs/guide/privacy.html` is the hosted, rendered form of [PRIVACY.md](../PRIVACY.md). It is deployed by [.github/workflows/pages.yml](../.github/workflows/pages.yml), which stages everything under `docs/guide/` to GitHub Pages. The workflow triggers on any change to `docs/guide/**`, so editing the privacy page redeploys it.

**Edit both files together.** `PRIVACY.md` is the canonical source; `privacy.html` is what the dashboard links to. They must say the same thing.

---

## 🛡️ Step 4: Permissions & Data Disclosures

Full text for every field is in [store-listing.md](store-listing.md) §3 (permissions) and §4 (data usage).

Summary of what the manifest declares:

*   **`storage`** — settings, encrypted API credentials, glossaries, local translation cache.
*   **`contextMenus`** — right-click translate entries.
*   **`alarms`** — (1) keep the MV3 service worker alive while a subtitle or PDF translation the user started is running; (2) a daily local cache eviction. Both cleared when no session remains.
*   **`tabs`** — read the active tab's URL to decide whether the page is translatable, and reuse an open tab when suggesting a site rule.
*   **Host permissions** — caption fetching on the supported video hosts, loopback for local LLM runtimes and the optional PDF bridge, and one predefined BYOK provider preset.
*   **Web-accessible resources** — `icon/128.png` only.

**`activeTab` is intentionally not requested.** It has no call site, and the CWS minimum-permission policy forbids declaring permissions the extension does not need. Do not re-add it without adding a call site.

---

## 🚀 Step 5: Submit for Review

1. Create a developer account and pay the one-time **$5 USD** fee.
2. Enable **2-Step Verification** — required before publishing.
3. Upload `.output/anyllm-translate-<version>-chrome.zip`.
4. Fill in the Store Listing, Privacy practices, and permission justifications from [store-listing.md](store-listing.md).
5. Submit for review.

*Review timeline:* the content script matches `<all_urls>` and the manifest declares `tabs`, so Chrome shows the "Read and change all your data on all websites" warning and the listing typically receives a **manual review**. Expect days to a few weeks.

---

## 📋 Step 6: Post-approval

*   Keep the privacy policy, dashboard fields, and extension behaviour in sync on every release.
*   A release that adds a permission forces every existing user to re-consent; add optional permissions via `optional_host_permissions` plus `chrome.permissions.request()` instead of widening the required set.
*   Re-run the pre-submission checklist in [store-listing.md](store-listing.md) §7 before each update.
