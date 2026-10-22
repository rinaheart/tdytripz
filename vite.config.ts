import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import fs from 'fs';
import path from 'path';
import { defineConfig } from 'vite';

function syncVersionJsonPlugin() {
  const sync = () => {
    try {
      const versionFile = fs.readFileSync(path.resolve(__dirname, 'src/version.ts'), 'utf-8');
      const match = versionFile.match(/APP_VERSION\s*=\s*['"]([^'"]+)['"]/);
      const version = match?.[1];
      if (!version) return;

      // 1. Đồng bộ sang public/version.json
      const versionJsonPath = path.resolve(__dirname, 'public/version.json');
      const nextJson = JSON.stringify({ version }, null, 2) + '\n';
      if (!fs.existsSync(versionJsonPath) || fs.readFileSync(versionJsonPath, 'utf-8') !== nextJson) {
        fs.writeFileSync(versionJsonPath, nextJson);
      }

      // 2. Đồng bộ CACHE_NAME trong public/sw.js
      const swPath = path.resolve(__dirname, 'public/sw.js');
      if (fs.existsSync(swPath)) {
        const swContent = fs.readFileSync(swPath, 'utf-8');
        const nextSw = swContent.replace(
          /const CACHE_NAME\s*=\s*['"][^'"]+['"];/,
          `const CACHE_NAME = 'tdytime-pwa-${version}';`
        );
        if (swContent !== nextSw) {
          fs.writeFileSync(swPath, nextSw);
        }
      }
    } catch {
      // Ignore sync errors
    }
  };
  return {
    name: 'sync-version-json',
    buildStart: sync,
    handleHotUpdate: sync,
  };
}

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss(), syncVersionJsonPlugin()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      port: 3000,
      host: '0.0.0.0',
    },
  };
});



