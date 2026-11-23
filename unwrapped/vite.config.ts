import { readFileSync } from 'node:fs';
import { defineConfig, type Plugin } from 'vite';

// Ship the exporter userscript next to the app so the landing page can link to it.
const USERSCRIPT = new URL('../x-export.user.js', import.meta.url);
const userscript: Plugin = {
  name: 'userscript',
  configureServer(server) {
    server.middlewares.use('/x-export.user.js', (_req, res) => {
      res.setHeader('Content-Type', 'text/javascript');
      res.end(readFileSync(USERSCRIPT));
    });
  },
  generateBundle() {
    this.emitFile({ type: 'asset', fileName: 'x-export.user.js', source: readFileSync(USERSCRIPT) });
  },
};

export default defineConfig({ base: './', plugins: [userscript] });
