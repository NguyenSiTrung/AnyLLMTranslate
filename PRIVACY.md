# Privacy Policy — AnyLLMTranslate

**Last updated:** September 25, 2026

## Summary

AnyLLMTranslate is a **BYOK (Bring Your Own Key)** translation extension. It sends the text you ask it to translate to the LLM API endpoint **you** configure, and to nothing else. The extension has **no servers of its own**: it never contacts any service operated by the extension developers, and it contains no analytics, telemetry, advertising, or crash reporting.

The only external destinations the extension can reach are:

1. **Your LLM provider** — the base URL you enter, or a provider preset you pick from the catalog.
2. **Your text-to-speech provider** — only if you enable provider-based speech.
3. **Your Scientific PDF bridge** — only if you enable it; default is loopback only (`http://127.0.0.1:17890`).
4. **The website you are already on** — its own subtitle/caption files, fetched so they can be translated and displayed.

## Limited Use disclosure

The use of information received from Google APIs will adhere to the [Chrome Web Store User Data Policy](https://developer.chrome.com/docs/webstore/program-policies/user-data-policy), including the [Limited Use](https://developer.chrome.com/docs/webstore/program-policies/limited-use) requirements.

AnyLLMTranslate does not use or transfer user data for personalized advertising, does not sell user data, does not transfer user data to data brokers or information resellers, and does not use user data to determine credit-worthiness or for lending purposes. No human reads your data.

## User data the extension handles

Because the extension clips and translates content from pages you visit, it handles user data. The complete list:

| Data | Why it is handled | Where it goes |
|------|-------------------|---------------|
| **Page text** (the text of the page you translate) | To produce the translation | Your configured LLM endpoint only |
| **Selected text** (dictionary / selection translate) | To produce a definition or translation | Your configured LLM endpoint only |
| **Focused input text** (inline input translation) | To produce a translation you can insert | Your configured LLM endpoint only |
| **Subtitle / caption text** | To produce bilingual subtitles | Your configured LLM endpoint only |
| **The PDF you open** (Scientific PDF mode) | To produce a translated PDF | Your configured PDF bridge only — opt-in |
| **Page hostname** (e.g. `example.com`) | Local usage statistics per site | Your device only — never transmitted |
| **API credentials** | To authenticate to your provider | Your configured provider, and your PDF bridge if you enable it |
| **Extension settings, glossaries, translation cache** | To make the extension work | Your device only — never transmitted |
| **Spoken text** (text-to-speech) | To synthesize audio | Your configured provider, if you enable provider speech |

Page text, selected text, and subtitle text are **not** stored by the extension beyond a local translation cache, and are never sent anywhere other than the endpoint you chose.

## Prominent disclosure and consent

Before AnyLLMTranslate sends any text to a provider, the first-run setup wizard displays a **Data & privacy** step that lists the data types above and their destinations, and requires you to take an explicit action to accept it. Translation is blocked until that consent is recorded. You can review the same disclosure at any time in **Options → Statistics → Data & privacy**, and you can revoke consent there.

## What the extension does NOT do

- ❌ No analytics, telemetry, crash reporting, or usage tracking of any kind
- ❌ No advertising, no ad targeting, no affiliate links or codes
- ❌ No selling or sharing of user data with third parties
- ❌ No accounts, logins, or OAuth
- ❌ No cookies, fingerprinting, or persistent identifiers
- ❌ No reading of your credentials by anyone other than you — there is no developer-side service to read them
- ❌ No collection of your browsing history beyond the local per-site statistics described above

## Where data goes, in detail

### Your LLM provider (the normal path)

When you translate, the text you asked to translate is sent in an HTTP request to the API base URL **you** configure (for example `https://api.openai.com/v1` or `http://localhost:11434/v1`). The request carries your API key in an `Authorization` header and nothing else about you. No proxy, no middleware, no developer-operated relay.

Under the Chrome Web Store User Data Policy, a user-specified server is treated as a client/server relationship: the Limited Use restrictions do not apply to the data you choose to send to the provider **you** specify. See the [User Data FAQ](https://developer.chrome.com/docs/webstore/program-policies/user-data-faq) §15.

### Your text-to-speech provider (optional)

If you turn on provider-based speech instead of the browser voice, the text to be spoken is sent to the TTS endpoint in your provider pool.

### Your Scientific PDF bridge (optional, off by default)

PDF translation runs **only** through a local bridge you run yourself:

1. When you start a job, the **full PDF file** and **short-lived provider credentials** (base URL, API key if any, model, language settings, throttle settings) are sent to the **bridge URL you configure**.
2. The default and recommended URL is **loopback only** (`http://127.0.0.1:17890`). The Options UI warns you if you point it at a non-loopback host.
3. The bridge may forward extracted text to **your** LLM provider. It does not send anything to AnyLLMTranslate operators — there are none.
4. PDF Translate is **opt-in** and requires the bridge. If the bridge is offline or unconfigured, PDF Translate is unavailable; there is no in-browser fallback that bypasses it.
5. Transmissions between the extension and a program running on your own computer are exempt from the Chrome Web Store transmission-encryption requirement ([User Data FAQ](https://developer.chrome.com/docs/webstore/program-policies/user-data-faq) §16). Use the loopback default; a remote bridge should be served over HTTPS.

### The website you are already on

To translate video subtitles, the extension reads the caption data the page's own player has already loaded, and may re-request the same caption files from the site's own CDN. Those requests go to the site you are visiting, carry only the URL the site itself issued (which may contain that site's own session token), and send no cookies from the extension's background context. The extension never decrypts protected media, never requests a DRM licence, and never touches video or audio streams.

When you use the YouTube caption re-alignment feature, the extension fetches the public YouTube watch page and caption track for the video ID you supplied, and loads the video's public thumbnail from `i.ytimg.com` for display in the settings list.

## Credential storage

- API keys are stored in `chrome.storage.local`, encrypted with **AES-256-GCM** (a random 96-bit IV per value, PBKDF2-SHA256 key derivation at 100,000 iterations).
- The encryption key is derived from your browser profile's extension installation identity plus a per-install random salt, both of which live in the same browser profile as the ciphertext. This protects keys against casual inspection of a storage dump. It is **not** protection against someone who can already read your browser profile — treat your browser profile as the security boundary.
- Keys are never exposed to page content, never written to logs, and never sent anywhere except the provider endpoint you configured (and your PDF bridge, if you enable it).
- Settings backups you export yourself do contain your API keys in a password-encrypted archive. Guard those files.

## Permissions explained

| Permission / scope | Why it is needed |
|--------------------|------------------|
| `storage` | Save your settings, encrypted API keys, glossaries, and the local translation cache |
| `contextMenus` | Add right-click "Translate page / selection / section / subtitles" and "Open PDF translator" items |
| `alarms` | Keep the service worker alive while a subtitle or PDF translation you started is running, and run a daily local cache eviction |
| `tabs` | Read the active tab's URL so the extension can decide whether the current page is translatable, and reuse an already-open tab when suggesting a site rule |
| Content scripts on all sites | Read the page's text and caption nodes so they can be translated and displayed in place. This is the core function and the source of Chrome's "read and change all your data on all websites" install warning |
| `*.max.com`, `*.hbomax.com`, `*.hbo.com`, `*.media.max.com`, `*.prd.media.max.com`, `*.delivery.mp.microsoft.com` | Fetch the caption files the Max player already uses, so they can be translated |
| `*.youtube.com` | Fetch YouTube caption tracks for subtitle translation and the optional caption re-alignment feature |
| `*.deeplearning.ai` | Fetch DeepLearning.AI lesson caption files |
| `http://127.0.0.1/*`, `http://localhost/*` | Talk to local LLM runtimes (Ollama, LM Studio) and to the optional local Scientific PDF bridge |
| `https://inference-api.nousresearch.com/*` | Predefined BYOK provider preset. Contacted **only** if you select "Nous Portal" and supply your own key |
| Web-accessible resource: `icon/128.png` | The in-page selection-translate chip displays the extension's own icon |

There is no `activeTab` permission, no `scripting`, `debugger`, `cookies`, `webRequest`, `declarativeNetRequest`, `proxy`, `history`, `bookmarks`, `identity`, `management`, or `downloads` permission.

## Local statistics

The extension keeps local usage statistics (characters translated, request counts, cache hits, error counts) so the **Statistics** page can show you your own usage. These counters live in `chrome.storage.local` and IndexedDB and are **never transmitted**.

When **per-site tracking** is enabled (it is on by default), the statistics also record the **hostname** of pages you translate, capped at 25 hosts per day, retained for 90 days, and shown only to you. You can turn this off in **Options → Statistics**, and you can export or erase all statistics at any time from the same page.

## Children's privacy

AnyLLMTranslate does not knowingly collect information from children under 13.

## Changes

If this privacy policy changes, the update date at the top will be revised. Continued use after changes constitutes acceptance.

## Contact

For privacy inquiries, please open an issue on the [GitHub repository](https://github.com/NguyenSiTrung/AnyLLMTranslate).
