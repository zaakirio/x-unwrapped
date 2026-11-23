import { readFileSync } from 'node:fs';
import { defineConfig, type Plugin } from 'vite';

// The extension is the same app as the website plus the collector scripts.
const files: Record<string, URL> = {
  'manifest.json': new URL('./extension/manifest.json', import.meta.url),
  'background.js': new URL('./extension/background.js', import.meta.url),
  'bridge.js': new URL('./extension/bridge.js', import.meta.url),
  'flag.js': new URL('./extension/flag.js', import.meta.url),
  'threads-capture.js': new URL('./extension/threads-capture.js', import.meta.url),
  'x-export.user.js': new URL('../x-export.user.js', import.meta.url),
  'icon-16.png': new URL('./extension/icon-16.png', import.meta.url),
  'icon-48.png': new URL('./extension/icon-48.png', import.meta.url),
  'icon-128.png': new URL('./extension/icon-128.png', import.meta.url),
};

const extensionFiles: Plugin = {
  name: 'extension-files',
  generateBundle() {
    for (const [fileName, url] of Object.entries(files)) this.emitFile({ type: 'asset', fileName, source: readFileSync(url) });
  },
};

export default defineConfig({
  base: './',
  plugins: [extensionFiles],
  build: { outDir: 'extension-dist', emptyOutDir: true },
});
