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
    permissions: ['storage', 'activeTab', 'contextMenus', 'sidePanel', 'alarms'],
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
    },
  },
});
