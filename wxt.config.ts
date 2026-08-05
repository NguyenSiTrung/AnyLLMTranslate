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
    permissions: ['storage', 'activeTab', 'contextMenus', 'sidePanel', 'alarms', 'tabs'],
    host_permissions: [
      '*://*.prd.media.max.com/*',
      '*://*.media.max.com/*',
      '*://*.hbomax.com/*',
      '*://*.max.com/*',
      // YouTube watch-page + timedtext fetch for Settings → Subtitle Studio
      // "Re-align from link" (pre-warms the AI re-align cache from a pasted URL).
      // No new install warning: content scripts already match <all_urls>.
      '*://*.youtube.com/*',
      // Scientific PDF bridge default (loopback). Custom non-loopback serverUrl
      // may need the user to grant host access later; avoid broad <all_urls>.
      // CSP already allows connect-src http: https: for extension pages.
      'http://127.0.0.1/*',
      'http://localhost/*',
      'https://inference-api.nousresearch.com/*',
    ],
    // PDF.js worker + standard fonts/cmaps are bundled under assets/ via Vite ?url imports.
    // Declare them as web-accessible so the pdf-viewer page can fetch them at runtime.
    web_accessible_resources: [
      {
        // icon/* — selection translate chip on web pages loads brand PNG via getURL
        resources: ['assets/*', 'icon/*', 'pdf.worker.min.mjs', 'pdf.worker.mjs'],
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
