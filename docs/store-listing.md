# Chrome Web Store listing — copy, justifications, and assets

Everything to paste into the [Developer Dashboard](https://chrome.google.com/webstore/devconsole) when submitting AnyLLMTranslate. Keep this file in sync with the shipped manifest (`wxt.config.ts`) and with [PRIVACY.md](../PRIVACY.md).

> **Rule for all listing text:** never claim a feature the extension cannot deliver, never name a streaming brand, and never state a data practice that contradicts `PRIVACY.md`. The dashboard privacy fields, the privacy policy, and the extension's behaviour must agree — a mismatch is itself a policy violation.

---

## 1. Item metadata

| Field | Value |
|---|---|
| **Name** | `AnyLLMTranslate` |
| **Short description** | Taken from `wxt.config.ts` `manifest.description` (max 132 characters). |
| **Category** | Accessibility (secondary: Productivity) |
| **Language** | English |
| **Privacy policy URL** | `https://nguyensitrung.github.io/AnyLLMTranslate/guide/privacy.html` |
| **Support URL** | `https://github.com/NguyenSiTrung/AnyLLMTranslate/issues` |
| **Homepage URL** | `https://github.com/NguyenSiTrung/AnyLLMTranslate` |

**Single purpose field** (the dashboard requires a plain statement of the one narrow purpose):

```
Translate web content — page text, selected text, focused input fields, video subtitles, and
PDF documents — into a language the user chooses, by sending that text to an LLM API endpoint
the user configures and displays the returned translation in place.
```

---

## 2. Store description

### Short (use for the manifest `description` field, ≤132 chars)

> Bilingual web page translation powered by any OpenAI-compatible LLM

### Long (store description field)

```
AnyLLMTranslate reads the web bilingually. It translates pages, video subtitles, selected
text, input fields, and PDFs into the language you choose — and it does it with your own LLM
API key, not ours.

BRING YOUR OWN KEY

There is no AnyLLMTranslate server. You point the extension at any OpenAI-compatible
endpoint — a cloud provider or a local runtime such as Ollama or LM Studio — and your text
goes straight there. Your API key is encrypted in your browser and never leaves it except to
the provider you chose. No account, no sign-up, no proxy.

WHAT IT DOES

• Bilingual pages — show the original and the translation together, above, below, beside, or
  translation-only. Visible content is translated first, with batching, streaming, caching,
  and prefetch, and single-page apps keep working as you navigate.
• Video subtitles — translate captions progressively and show them in the player or in a
  resilient overlay, with reading-speed timing, line wrapping, and per-site profiles.
• Selection and hover — select a word for a dictionary-style definition or a sentence for a
  focused translation; hover a paragraph to translate it after a delay you set.
• Inline input — translate what you type in inputs, textareas, and contenteditable fields
  with a key gesture or a keyboard shortcut.
• PDF — open PDFs in a bundled reader, and optionally translate scientific PDFs through a
  local Docker bridge you run yourself, preserving layout, math, and figures.
• Your terms — named glossaries, per-site rules and excludes, custom prompts, themes, and
  keyboard shortcuts.

PRIVACY

• No telemetry, no analytics, no advertising, no affiliate links.
• Your API key is stored encrypted in your browser and is only ever sent to the provider you
  configured.
• The first-run setup shows you exactly which data leaves your browser and where it goes, and
  asks you to accept it before anything is translated.
• Local usage statistics stay on your device and can be exported or erased at any time.

WHAT YOU NEED

An API key and an endpoint from an OpenAI-compatible provider, or a local runtime such as
Ollama or LM Studio. PDF translation additionally requires the optional local bridge, which is
off by default.

Open source under the MIT license.
```

**Do not** add a list of supported site names, a list of provider brand names, or repeated keywords — that is keyword spam under the Listing Requirements policy and it also invites the "unauthorized access to content" policy review.

---

## 3. Permission justifications

Paste one row per permission into the dashboard's justification fields. These must match the manifest exactly.

### API permissions

| Permission | Justification |
|---|---|
| `storage` | Stores the user's settings, glossary lists, translation cache, and their own encrypted API credentials locally in the browser. Required for every feature to persist between sessions. |
| `contextMenus` | Adds the right-click menu entries "Translate page", "Translate selection", "Translate section", "Translate subtitles", and "Open PDF translator" so the user can start a translation without opening the popup. |
| `alarms` | Two uses. (1) While a subtitle or PDF translation the user started is still running, a short repeating alarm keeps the Manifest V3 service worker alive so a long job is not killed mid-request. (2) A daily alarm runs a local cache eviction to bound disk use. Both are cleared as soon as no session remains. |
| `tabs` | Reads the active tab's URL so the extension can tell whether the current page is translatable and pick the right translator, including while the options page is open. Also used to reuse an already-open tab when the user asks the extension to suggest a site rule. No browsing history is read or stored. |

`activeTab` is deliberately **not** requested: the extension has no call site that needs it, and the content scripts already match all URLs.

### Host permissions

| Host | Justification |
|---|---|
| `*://*.max.com/*`, `*://*.hbomax.com/*`, `*://*.hbo.com/*`, `*://*.media.max.com/*`, `*://*.prd.media.max.com/*`, `*://*.delivery.mp.microsoft.com/*` | Fetch the caption files the video player on that site has already loaded, so they can be translated and displayed. Only text caption tracks are read; no video or audio stream is accessed. |
| `*://*.youtube.com/*` | Fetch the caption track for the video being watched, and fetch the public watch page for the optional caption re-alignment feature the user can trigger from Settings. |
| `*://*.deeplearning.ai/*` | Fetch the lesson caption files for the course video being watched. |
| `http://127.0.0.1/*`, `http://localhost/*` | Reach LLM runtimes the user runs locally (Ollama, LM Studio) and the optional local Scientific PDF bridge, which defaults to loopback. |
| `https://inference-api.nousresearch.com/*` | One of the predefined BYOK provider presets offered in the setup wizard. It is contacted only if the user selects that preset and supplies their own API key. |

### Web-accessible resources

| Resource | Justification |
|---|---|
| `icon/128.png` | The in-page selection-translate chip renders the extension's own icon inside the page. It is the only resource the extension exposes to page context. |

---

## 4. Data usage disclosures

The dashboard asks whether the extension collects each category. Answer as follows, and make sure `PRIVACY.md` says the same thing.

| Category | Answer | Notes |
|---|---|---|
| Personally identifiable information | **No** | No accounts, no email, no identifiers. |
| Health information | **No** | — |
| Financial and payment information | **No** | — |
| Authentication information | **Yes** | The user's own API key for their own provider, entered by the user, stored locally encrypted, and transmitted only to the endpoint they configured. |
| Personal communications | **No** | — |
| Location | **No** | — |
| Web history | **Yes** | The extension reads the active tab's URL to decide whether the page is translatable, and the optional local statistics feature records page hostnames on the user's own device. Nothing is transmitted. |
| User activity | **Yes** | Page text, selected text, input text, and subtitle text are read to be translated. |
| Website content | **Yes** | Page text and caption text are read to be translated. |

**Justification text to paste:**

```
AnyLLMTranslate reads the text of the page, the user's selection, the focused input field, and
video caption tracks, and sends that text to the LLM API endpoint the user configured, so the
translation can be displayed back to the user. This is the extension's entire function.

The extension has no server of its own. No user data is transmitted to the developer, and no
data is sold, shared, or used for advertising, profiling, or credit assessment. API
credentials are supplied by the user, stored encrypted in their browser, and sent only to the
endpoint the user chose. Local usage statistics, including page hostnames when per-site
tracking is enabled, are stored on the user's device only and can be exported or erased by the
user at any time.

A prominent in-product disclosure listing every data type and its destination is shown during
first-run setup, and the user must accept it before any translation is sent.
```

**Certifications:** confirm all three (not sold to third parties; not used for purposes unrelated to the single purpose; not used to determine credit-worthiness or for lending).

---

## 5. Screenshots and promotional assets

The Listing Requirements policy rejects any submission with missing screenshots, so these are mandatory.

| Asset | Size | Required | What it must show |
|---|---|---|---|
| Screenshot 1 | 1280×800 | **Yes** | A bilingual web page: original paragraph with the translation directly beneath it, on a neutral, text-heavy page (a news article or documentation site — **not** a streaming service). |
| Screenshot 2 | 1280×800 | **Yes** | The popup open on a normal page, showing the target-language selector and the translate/restore controls. |
| Screenshot 3 | 1280×800 | **Yes** | Options → Providers, showing the provider pool with at least one configured provider (redact the API key field). |
| Screenshot 4 | 1280×800 | Recommended | The subtitle overlay on a free, openly licensed video (e.g. a Creative Commons video or the extension's own test page) with original + translated cues visible. |
| Screenshot 5 | 1280×800 | Recommended | The Data & privacy step of the setup wizard, showing the in-product disclosure. |
| Promo tile | 440×280 | Optional | Brand mark plus a short tagline. |
| Marquee | 1400×560 | Optional | Only if you want featured placement consideration. |

### Capture runbook

```bash
# 1. Build and load the unpacked extension
pnpm build
#    → chrome://extensions → Developer mode → Load unpacked → .output/chrome-mv3

# 2. Configure a provider in Options → Providers (use a throwaway key), set the target language,
#    and complete the setup wizard so the consent step is recorded.

# 3. For each shot: open the page, set the browser window to exactly 1280×800 of *content* area
#    (Chrome DevTools → Cmd/Ctrl+Shift+M → Responsive → 1280×800 gives an exact canvas),
#    then capture:
#      DevTools → Cmd/Ctrl+Shift+P → "Capture screenshot"   (captures the 1280×800 viewport)
#    Save as PNG.

# 4. Redact anything sensitive: API key fields, account names, personal email, real URLs you
#    do not want published.

# 5. Verify every image is exactly 1280×800 and shows the extension actually working.
```

**Screenshot content rules:**

- Show the product working. Never mock up a result the extension does not produce.
- No streaming-service UI in any screenshot — use a generic page or openly licensed video.
- No real API keys, account names, or personal data.
- No text in the image that contradicts `PRIVACY.md`.

---

## 6. Answers to questions a reviewer is likely to ask

Keep these ready; they are the substance behind the listing.

**"Your extension intercepts network requests on sites that host copyrighted media. How is that not facilitating unauthorized access?"**

> The extension translates video captions for the user's own viewing session. It only reads the caption text that the page's own player has already fetched and rendered for that logged-in user. It does not decrypt or bypass any technical protection measure: there is no Widevine, PlayReady, or ClearKey code, no licence request, no key handling, and no interaction with encrypted media buffers. It never accesses video or audio streams, never downloads or exports media, never blocks or alters playback, and never spoofs a region or a login. It reads no cookies and rewrites no authentication headers. If a caption track is not already available to the user in their own session, the extension cannot obtain it.

**"Why does the extension need to run on all sites?"**

> Translation is the single purpose, and it must work on whatever page the user is reading. The content script is what reads the page text and writes the translation back. It is inert until the user triggers a translation: the interceptors pass every response through untouched unless the payload is a caption file on a host the extension has a handler for.

**"Why `tabs` rather than `activeTab`?"**

> `activeTab` is not requested. The extension needs the active tab's URL from the options page as well as the popup, which `activeTab` does not grant, and it needs to enumerate open tabs to reuse one that already has the target page loaded when suggesting a site rule.

**"Is any data sent to you?"**

> No. There is no developer-operated server. The complete set of destinations is: the user's configured LLM endpoint, the user's configured text-to-speech endpoint, the user's configured local PDF bridge, and the CDN of the site the user is already on. All four are enumerated in the privacy policy.

---

## 7. Pre-submission checklist

- [ ] `pnpm build` succeeds and `.output/chrome-mv3/manifest.json` contains no `activeTab` and a single web-accessible resource.
- [ ] `PRIVACY.md` and the hosted `docs/guide/privacy.html` are identical in substance and reachable at the URL in §1.
- [ ] The dashboard privacy fields match §4 exactly and match `PRIVACY.md`.
- [ ] 1–5 screenshots at 1280×800 are uploaded.
- [ ] Every permission has a justification from §3.
- [ ] `pnpm test`, `pnpm compile`, `pnpm lint` pass.
- [ ] `pnpm zip` produced the submission archive; a curated source archive is ready if the reviewer asks (see [PUBLISHING.md](PUBLISHING.md)).
- [ ] 2-Step Verification is enabled on the developer account.
