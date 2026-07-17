# Privacy Policy — AnyLLMTranslate

**Last updated:** July 17, 2026

## Summary

AnyLLMTranslate does **not** collect, store, or transmit any personal data to servers operated by the extension developers. Translation processing goes to **your** configured LLM API provider (BYOK). Optional **Scientific PDF** mode may also send a PDF and short-lived credentials to a **user-controlled** local bridge you run (default: loopback only).

## Data Handling

### What we DO NOT collect
- ❌ Personal information (name, email, location)
- ❌ Browsing history or page content
- ❌ Analytics, telemetry, or usage tracking
- ❌ Cookies or fingerprinting data

### What stays on your device
- ✅ **API credentials** — stored locally in `chrome.storage.local` (encrypted at rest), never transmitted to any server except your chosen API provider (and, only if you opt in, your Scientific PDF bridge)
- ✅ **Extension settings** — language preferences, theme, shortcuts — all stored locally
- ✅ **Translation cache** — cached translations stored in IndexedDB for performance, never uploaded

### What is sent to your API provider
When you translate text, the selected text is sent to the API endpoint **you configure**. AnyLLMTranslate connects only to the URL you provide (e.g., `https://api.openai.com/v1`).

**AnyLLMTranslate never contacts any server owned by the extension developers.**

### Optional: Scientific PDF mode (local bridge)

When you enable **Scientific layout** PDF translation and start a job:

1. The **full PDF file** and **short-lived provider credentials** (base URL, API key if any, model) plus language settings are sent to the **bridge server URL you configure**.
2. The default and recommended URL is **loopback only** (`http://127.0.0.1:17890`). The Options UI warns if you set a non-loopback host.
3. The bridge (Docker process you start) may forward text to **your** LLM provider for translation; it does not send data to AnyLLMTranslate operators.
4. Scientific mode is **opt-in**. The in-browser **Fast** PDF path never requires the bridge and remains available when the bridge is offline.
5. Scientific settings store only `serverUrl` / enablement flags — **not** a second API key store.

## Bring Your Own Key (BYOK)

AnyLLMTranslate uses a **BYOK (Bring Your Own Key)** model:
- You provide your own API key and endpoint
- Your API key is stored only in your browser's local storage
- The extension communicates directly with your chosen provider — no proxy, no middleware

## Permissions Explained

| Permission | Why |
|------------|-----|
| `storage` | Save your settings and translation cache locally |
| `activeTab` | Access the current page's DOM for translation |
| `contextMenus` | Add right-click "Translate" options |
| `sidePanel` | Future: side panel translate view |

## Third-Party Services

AnyLLMTranslate does not integrate with any third-party analytics, advertising, or tracking services. The only external communication is with the LLM API provider that **you** configure.

## Children's Privacy

AnyLLMTranslate does not knowingly collect information from children under 13.

## Changes

If this privacy policy changes, the update date at the top will be revised. Continued use after changes constitutes acceptance.

## Contact

For privacy inquiries, please open an issue on the [GitHub repository](https://github.com/NguyenSiTrung/AnyLLMTranslate).
