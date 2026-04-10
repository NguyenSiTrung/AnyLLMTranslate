import { defineConfig } from 'wxt';

// See https://wxt.dev/api/config.html
export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  manifest: {
    name: 'LinguaLens',
    description: 'Bilingual web page translation powered by any OpenAI-compatible LLM',
    permissions: ['storage', 'activeTab', 'contextMenus', 'sidePanel'],
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
