import { defineConfig } from 'wxt';
import tailwindcss from '@tailwindcss/vite';

// See https://wxt.dev/api/config.html
export default defineConfig({
  vite: () => ({
    plugins: [tailwindcss()],
  }),
  modules: ['@wxt-dev/module-react'],
  manifest: {
    name: 'AnyLLMTranslate',
    description: 'Bilingual web page translation powered by any OpenAI-compatible LLM',
    // `activeTab` is deliberately NOT declared: it has no call sites, the
    // content scripts already match <all_urls>, and the CWS minimum-permission
    // policy forbids declaring permissions the extension does not need.
    permissions: ['storage', 'contextMenus', 'alarms', 'tabs'],
    host_permissions: [
      '*://*.prd.media.max.com/*',
      '*://*.media.max.com/*',
      '*://*.hbomax.com/*',
      '*://*.max.com/*',
      // Max CDN edges + the HBO landing host the player redirects through, and
      // the Microsoft delivery edge some Max clients stream from. Both are in
      // the background subtitle fetch allow-list (MAX-39).
      '*://*.hbo.com/*',
      '*://*.delivery.mp.microsoft.com/*',
      // YouTube watch-page + timedtext fetch for Settings → Subtitle Studio
      // "Re-align from link" (pre-warms the AI re-align cache from a pasted URL).
      // No new install warning: content scripts already match <all_urls>.
      '*://*.youtube.com/*',
      // DeepLearning.AI lesson VTT fetch (video CDN) — content-script direct
      // fetch + background CORS-bypass fallback for subtitle translation.
      '*://*.deeplearning.ai/*',
      // Scientific PDF bridge default (loopback). Custom non-loopback serverUrl
      // may need the user to grant host access later; avoid broad <all_urls>.
      // CSP already allows connect-src http: https: for extension pages.
      'http://127.0.0.1/*',
      'http://localhost/*',
      'https://inference-api.nousresearch.com/*',
    ],
    // Only `icon/128.png` is ever loaded from page context (the selection
    // translate chip, content/selectionBubble/chip.ts). Everything under
    // `assets/` — the PDF.js worker, fonts, cmaps and the CSS bundles — is
    // consumed by extension pages only (pdf-viewer.html, options.html,
    // popup.html), which are same-origin and need no web-accessible grant.
    // Exposing `assets/*` to <all_urls> would let any site fingerprint the
    // installed extension by fetching its worker and stylesheets.
    web_accessible_resources: [
      {
        resources: ['icon/128.png'],
        matches: ['<all_urls>'],
      },
    ],
    content_security_policy: {
      extension_pages: "script-src 'self'; connect-src 'self' http: https:; object-src 'none'; style-src 'self' 'unsafe-inline';",
    },
    commands: {
      'translate-page': {
        suggested_key: { default: 'Alt+A' },
        description: 'Translate the current page',
      },
      'translate-subtitles': {
        suggested_key: { default: 'Alt+S' },
        description: 'Translate video subtitles',
      },
      'toggle-display': {
        suggested_key: { default: 'Alt+Z' },
        description: 'Toggle translation display (show/hide)',
      },
      'restore-page': {
        suggested_key: { default: 'Alt+X' },
        description: 'Restore original page (remove translations)',
      },
      // 5th command — Chrome allows at most 4 suggested_key shortcuts total.
      // No default binding here; set Alt+I (or any key) at chrome://extensions/shortcuts.
      'translate-input-box': {
        description: 'Translate the focused input box (inline translate)',
      },
    },
  },
});
