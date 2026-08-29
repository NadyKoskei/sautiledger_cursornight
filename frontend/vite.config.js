import { copyFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { themeColor } from './src/theme.js';

const root = dirname(fileURLToPath(import.meta.url));

function injectThemeColorPlugin() {
  return {
    name: 'inject-theme-color',
    transformIndexHtml(html) {
      return html.replace(/%THEME_COLOR%/g, themeColor);
    },
  };
}

function spaFallbackPlugin() {
  return {
    name: 'spa-404-fallback',
    closeBundle() {
      const index = resolve(root, 'dist/index.html');
      if (existsSync(index)) copyFileSync(index, resolve(root, 'dist/404.html'));
    },
  };
}

export default defineConfig({
  plugins: [react(), injectThemeColorPlugin(), spaFallbackPlugin()],
  server: {
    port: 5173,
  },
});
