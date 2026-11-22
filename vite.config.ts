import { fileURLToPath, URL } from 'node:url';
import type { IncomingMessage, ServerResponse } from 'node:http';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv, type Plugin, type ViteDevServer } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

/**
 * Sert les Vercel Functions de /api en développement (`npm run dev`),
 * sans dépendre de `vercel dev`. Même signature Web (Request → Response).
 */
function vercelApiDev(): Plugin {
  return {
    name: 'lumen:vercel-api-dev',
    apply: 'serve',
    configureServer(server: ViteDevServer) {
      Object.assign(process.env, loadEnv('development', process.cwd(), ''));
      server.middlewares.use(async (req: IncomingMessage, res: ServerResponse, next: () => void) => {
        const match = /^\/api\/([a-z-]+)(?:\?.*)?$/.exec(req.url ?? '');
        if (!match) return next();
        try {
          const mod = (await server.ssrLoadModule(`/api/${match[1]}.ts`)) as Record<string, (r: Request) => Promise<Response>>;
          const fn = mod[req.method ?? 'GET'];
          if (!fn) {
            res.statusCode = 405;
            return res.end();
          }
          const chunks: Buffer[] = [];
          for await (const c of req) chunks.push(c as Buffer);
          const headers = new Headers();
          for (const [k, v] of Object.entries(req.headers)) if (typeof v === 'string') headers.set(k, v);
          const body = chunks.length ? Buffer.concat(chunks) : null;
          const response = await fn(new Request(`http://${req.headers.host}${req.url}`, { method: req.method ?? 'GET', headers, body }));
          res.statusCode = response.status;
          response.headers.forEach((v, k) => res.setHeader(k, v));
          res.end(Buffer.from(await response.arrayBuffer()));
        } catch (err) {
          server.ssrFixStacktrace(err as Error);
          console.error(err);
          res.statusCode = 500;
          res.end('dev api error');
        }
      });
    },
  };
}

export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      '@shared': fileURLToPath(new URL('./shared', import.meta.url)),
    },
  },
  plugins: [
    react(),
    tailwindcss(),
    vercelApiDev(),
    VitePWA({
      registerType: 'prompt',
      injectRegister: false,
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        id: '/',
        name: 'Lumen — Lecture à voix haute',
        short_name: 'Lumen',
        description: 'Vos livres lus à voix haute, dans votre langue. Voix homme & femme, traduction instantanée, hors-ligne.',
        lang: 'fr',
        start_url: '/app?source=pwa',
        scope: '/',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#0A0E1A',
        theme_color: '#0A0E1A',
        categories: ['books', 'education', 'productivity'],
        icons: [
          { src: '/pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/pwa-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/pwa-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
        shortcuts: [{ name: 'Bibliothèque', url: '/app', icons: [{ src: '/pwa-192.png', sizes: '192x192' }] }],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2,webmanifest,txt}'],
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api\//],
        cleanupOutdatedCaches: true,
        // La nouvelle version prend le contrôle seule, sans attendre l'ancienne page
        // (débloque aussi les anciennes installations qui attendaient un clic).
        // Retrait automatique du service worker sur l'ancienne adresse (redirigée).
        importScripts: ['/sw-retire.js'],
        skipWaiting: true,
        clientsClaim: true,
        // L'audio et les traductions sont mis en cache dans IndexedDB par l'app, pas par le SW.
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.pathname === '/api/health',
            handler: 'NetworkFirst',
            options: { cacheName: 'lumen-health', networkTimeoutSeconds: 3, expiration: { maxEntries: 1 } },
          },
        ],
      },
      devOptions: { enabled: false },
    }),
  ],
  build: {
    target: 'es2022',
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/epubjs') || id.includes('node_modules/jszip')) return 'epub';
          if (id.includes('node_modules/pdfjs-dist')) return 'pdf';
          if (id.includes('node_modules/react-dom') || id.includes('node_modules/scheduler') || /node_modules\/react\//.test(id)) return 'react';
          return undefined;
        },
      },
    },
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    setupFiles: ['fake-indexeddb/auto'],
  },
} as import('vite').UserConfig & { test: unknown });
