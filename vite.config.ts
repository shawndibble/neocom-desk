/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';

const { version } = JSON.parse(
  readFileSync(new URL('./package.json', import.meta.url), 'utf-8')
) as { version: string };

export default defineConfig({
  base: '/',
  // Port pinned: the EVE SSO dev callback URL must match exactly, so the
  // port cannot be allowed to drift when 5173 happens to be busy.
  server: { port: 5173, strictPort: true },
  // Read once at build/dev/test start, not hand-maintained in source — the
  // "what's new" panel (src/app/WhatsNewPanel.tsx) is the consumer.
  define: { __APP_VERSION__: JSON.stringify(version) },
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      // Hand-written src/sw.ts (originally ADR 0007, issue #176; now ADR 0009)
      // — only strategy that will support a custom `push` handler (future
      // Web Push work); generateSW's output has no room for one.
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      registerType: 'prompt',
      manifest: {
        name: 'NeoCom Desk',
        short_name: 'NeoCom',
        description: 'EVE Online character, skill planning, and industry companion',
        theme_color: '#0d1117',
        background_color: '#0d1117',
        display: 'standalone',
        start_url: '/',
        scope: '/',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          {
            src: 'icons/icon-512-maskable.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      // navigateFallback/navigateFallbackDenylist are generateSW-only — the
      // equivalent SPA-fallback routing is hand-written in src/sw.ts.
      injectManifest: {
        globPatterns: ['**/*.{js,css,html,png,svg,ico,webmanifest,json}'],
        // The Market Browser's catalogue (~1.2 MB: market groups, market
        // types, solar systems, NPC stations, market regions) is fetched
        // lazily on first visit to /market instead — most installs never
        // open it, so an install should not pay for it up front (CONTEXT.md).
        globIgnores: ['**/data/market/**'],
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
      },
    }),
  ],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./vitest.setup.ts'],
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    // Default 5000ms. A test can chain several `findBy*`/`waitFor` calls,
    // each now with up to 5000ms of its own headroom (vitest.setup.ts) for
    // CPU contention under parallel `/next-ticket` runs — give the overall
    // test enough room that a slow-but-real render doesn't hit this ceiling
    // first.
    testTimeout: 15000,
    // Vitest's default is availableParallelism() - 1 forked processes, each
    // spinning up its own jsdom — on this 16-core dev box that's ~15
    // concurrent Node processes, multiplied further by however many
    // `/next-ticket` loops are running (CLAUDE.md), which is what pegs the
    // machine. CI runners are small enough (2-4 cores) that the default is
    // already fine there, so only cap it locally.
    ...(process.env.GITHUB_ACTIONS === 'true' ? {} : { maxWorkers: 2 }),
    coverage: { reporter: ['text', 'html'] },
    // Suppresses passing-test noise, keeps full detail on failures — cuts
    // `test:run` output (read by CI logs and every agent tool call alike)
    // without losing anything actually diagnostic. An explicit `reporters`
    // array replaces Vitest's default set rather than merging with it, so
    // `github-actions` has to be re-added here or CI's PR-diff annotations
    // (on by default, undocumented in this config until now) disappear.
    reporters: process.env.GITHUB_ACTIONS === 'true' ? ['agent', 'github-actions'] : ['agent'],
  },
});
