import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { defineConfig } from 'vite';

const rootDir = path.dirname(fileURLToPath(import.meta.url));

function syncVersionJsonPlugin() {
  const sync = () => {
    try {
      const versionFile = fs.readFileSync(path.resolve(rootDir, 'src/version.ts'), 'utf-8');
      const match = versionFile.match(/APP_VERSION\s*=\s*['"]([^'"]+)['"]/);
      const version = match?.[1];
      if (!version) return;

      // 1. Đồng bộ sang public/version.json
      const versionJsonPath = path.resolve(rootDir, 'public/version.json');
      const nextJson = JSON.stringify({ version }, null, 2) + '\n';
      if (!fs.existsSync(versionJsonPath) || fs.readFileSync(versionJsonPath, 'utf-8') !== nextJson) {
        fs.writeFileSync(versionJsonPath, nextJson);
      }

      // 2. Đồng bộ CACHE_NAME trong public/sw.js
      const swPath = path.resolve(rootDir, 'public/sw.js');
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

  const injectBuiltAssetsIntoDistSw = () => {
    try {
      const distDir = path.resolve(rootDir, 'dist');
      const distSwPath = path.resolve(distDir, 'sw.js');
      const assetsDir = path.resolve(distDir, 'assets');
      if (!fs.existsSync(distSwPath) || !fs.existsSync(assetsDir)) return;

      const assetFiles = fs
        .readdirSync(assetsDir)
        .filter((file) => /\.(js|css|svg|png|jpg|jpeg|webp|woff2?)$/i.test(file))
        .sort()
        .map((file) => `/assets/${file}`);

      if (assetFiles.length === 0) return;

      const swContent = fs.readFileSync(distSwPath, 'utf-8');
      const precacheMatch = swContent.match(/const PRECACHE_URLS\s*=\s*\[([\s\S]*?)\];/);
      if (!precacheMatch) return;

      const existingUrls = Array.from(precacheMatch[1].matchAll(/['"]([^'"]+)['"]/g)).map((m) => m[1]);
      const mergedUrls = Array.from(new Set([...existingUrls, ...assetFiles]));
      const formattedArray = `const PRECACHE_URLS = [\n${mergedUrls.map((u) => `  '${u}',`).join('\n')}\n];`;

      const nextSwContent = swContent.replace(/const PRECACHE_URLS\s*=\s*\[[\s\S]*?\];/, formattedArray);
      fs.writeFileSync(distSwPath, nextSwContent);
    } catch {
      // Ignore post-build injection errors
    }
  };

  return {
    name: 'sync-version-json',
    buildStart: sync,
    handleHotUpdate: sync,
    closeBundle: injectBuiltAssetsIntoDistSw,
  };
}

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss(), syncVersionJsonPlugin()],
    resolve: {
      alias: {
        '@': path.resolve(rootDir, '.'),
      },
    },
    server: {
      port: 3000,
      host: '0.0.0.0',
    },
  };
});

