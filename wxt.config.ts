import { defineConfig } from 'wxt';

// See https://wxt.dev/api/config.html
export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  manifest: {
    name: 'LinguaLens',
    description: 'Bilingual web page translation powered by any OpenAI-compatible LLM',
    permissions: ['storage', 'activeTab', 'contextMenus', 'sidePanel'],
  },
});
