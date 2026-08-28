import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { themeColor } from './src/theme.js';

function injectThemeColorPlugin() {
  return {
    name: 'inject-theme-color',
    transformIndexHtml(html) {
      return html.replace(/%THEME_COLOR%/g, themeColor);
    },
  };
}

export default defineConfig({
  plugins: [react(), injectThemeColorPlugin()],
  server: {
    port: 5173,
  },
});
