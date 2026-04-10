# Privacy Policy — LinguaLens

**Last updated:** April 10, 2026

## Summary

LinguaLens does **not** collect, store, or transmit any personal data. All translation processing happens through your own configured API provider.

## Data Handling

### What we DO NOT collect
- ❌ Personal information (name, email, location)
- ❌ Browsing history or page content
- ❌ Analytics, telemetry, or usage tracking
- ❌ Cookies or fingerprinting data

### What stays on your device
- ✅ **API credentials** — stored locally in `chrome.storage.local`, never transmitted to any server except your chosen API provider
- ✅ **Extension settings** — language preferences, theme, shortcuts — all stored locally
- ✅ **Translation cache** — cached translations stored in IndexedDB for performance, never uploaded

### What is sent to your API provider
When you translate text, the selected text is sent to the API endpoint **you configure**. This is the only external network request the extension makes. LinguaLens connects only to the URL you provide (e.g., `https://api.openai.com/v1`).

**LinguaLens never contacts any server owned by the extension developers.**

## Bring Your Own Key (BYOK)

LinguaLens uses a **BYOK (Bring Your Own Key)** model:
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

LinguaLens does not integrate with any third-party analytics, advertising, or tracking services. The only external communication is with the LLM API provider that **you** configure.

## Children's Privacy

LinguaLens does not knowingly collect information from children under 13.

## Changes

If this privacy policy changes, the update date at the top will be revised. Continued use after changes constitutes acceptance.

## Contact

For privacy inquiries, please open an issue on the [GitHub repository](https://github.com/NguyenSiTrung/AnyLLMTranslate).
