import { defineConfig } from 'vite';
import { configDefaults } from 'vitest/config';
import react, { reactCompilerPreset } from '@vitejs/plugin-react';
import babel from '@rolldown/plugin-babel';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';
import { sentryVitePlugin } from '@sentry/vite-plugin';
import { copyFileSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { phosphorWeightsPlugin } from './src/components/ui/phosphorWeightsPlugin.ts';
import { localeSplitPlugin } from './src/i18n/localeSplitPlugin.ts';
import { buildPwaShortcuts, type PwaShortcutStrings } from './src/app/pwaShortcuts.ts';
import { deferEntryHtml, importMapProblem } from './src/app/deferredEntry.ts';
import { lazySdeGlobIgnores } from './src/sde/lazySdeFiles.ts';
import {
  bootClosure,
  chunkImportMapping,
  dropLazyFromManifest,
  entryFile,
  entryNamesRelease,
  missingShellChunks,
  lazyChunkFiles,
  lazyChunksJson,
  preloadGraphSignature,
  PUBLIC_ROUTE_SUFFIXES,
  SHELL_MODULE_SUFFIXES,
  shellChunkGroups,
  throughBarrel,
  type BundleLike,
  type RenderedChunkLike,
} from './src/app/lazyChunks.ts';

const { version, dependencies } = JSON.parse(
  readFileSync(new URL('./package.json', import.meta.url), 'utf-8')
) as { version: string; dependencies: Record<string, string> };

const release = `neocom-desk@${version}+${buildCommit()}`;

function buildCommit(): string {
  const fromCi = process.env.GITHUB_SHA;
  if (fromCi) return fromCi.slice(0, 12);
  try {
    return execFileSync('git', ['rev-parse', '--short=12', 'HEAD'], {
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return 'dev';
  }
}

const dogmaPins = `${dependencies['@eveshipfit/dogma-engine']}+${dependencies['@eveshipfit/sde']}`;

function sdeDataVersions(): Record<string, string> {
  const dataDir = fileURLToPath(new URL('./public/data/', import.meta.url));
  const versions: Record<string, string> = {};
  for (const entry of readdirSync(dataDir, { recursive: true, encoding: 'utf8' })) {
    if (!entry.endsWith('.json')) continue;
    const hash = createHash('sha256')
      .update(readFileSync(join(dataDir, entry)))
      .digest('hex');
    versions[entry.replaceAll('\\', '/')] = hash.slice(0, 12);
  }
  return versions;
}

const { app: appStrings } = JSON.parse(
  readFileSync(new URL('./src/i18n/locales/en.json', import.meta.url), 'utf-8')
) as { app: { name: string; tagline: string; shortcuts: PwaShortcutStrings } };

const DOM_TS_TESTS = 'src/**/*.dom.test.ts';

const UI_PRIMITIVE_MODULE = new RegExp(
  '^' +
    fileURLToPath(new URL('./src/components/ui/', import.meta.url))
      .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      .replace(/\\\\|\//g, '[\\\\/]') +
    '[^\\\\/]+\\.tsx?$'
);

const sentryAuthToken = process.env.SENTRY_AUTH_TOKEN;

const require = createRequire(import.meta.url);
function copyDogmaEngineAssets() {
  const copies: ReadonlyArray<readonly [string, string]> = [
    ['@eveshipfit/dogma-engine/esf_dogma_engine_bg.wasm', 'esf_dogma_engine_bg.wasm'],
    ['@eveshipfit/sde/dist/sde.dat', 'sde.dat'],
    ['@eveshipfit/sde/LICENSE.EVE', 'LICENSE.EVE'],
  ];
  return {
    name: 'neocom-dogma-engine-assets',
    configResolved() {
      const destDir = join(process.cwd(), 'public', 'vendor', 'dogma');
      mkdirSync(destDir, { recursive: true });
      for (const [pkgPath, destName] of copies) {
        const src = require.resolve(pkgPath);
        const dest = join(destDir, destName);
        const alreadyCopied =
          statSync(dest, { throwIfNoEntry: false })?.size === statSync(src).size;
        if (!alreadyCopied) copyFileSync(src, dest);
      }
    },
  };
}

function landingShellTemplate() {
  const marker = '<!-- landing-shell -->';
  const snapshot = fileURLToPath(
    new URL('./src/features/landing/landingShell.snapshot.html', import.meta.url)
  );
  let serve = false;
  return {
    name: 'neocom-landing-shell',
    configResolved(config: { command: 'build' | 'serve' }) {
      serve = config.command === 'serve';
    },
    transformIndexHtml(html: string) {
      if (!html.includes(marker)) throw new Error(`index.html has no ${marker} marker`);
      const filled = html.replace(marker, readFileSync(snapshot, 'utf-8').trim());
      return serve
        ? filled.replace('</head>', '<link rel="stylesheet" href="/src/styles/index.css" /></head>')
        : filled;
    },
  };
}

function deferredEntryHtml() {
  return {
    name: 'neocom-deferred-entry',
    apply: 'build' as const,
    generateBundle: {
      order: 'post' as const,
      handler(_options: unknown, bundle: BundleLike) {
        const page = bundle['index.html'];
        if (page?.source === undefined) throw new Error('deferredEntryHtml: no index.html');
        const html = deferEntryHtml(
          typeof page.source === 'string' ? page.source : new TextDecoder().decode(page.source)
        );
        const problem = importMapProblem(html);
        if (problem) throw new Error(`deferredEntryHtml: ${problem}`);
        page.source = html;
      },
    },
  };
}

function spaFallbackHtml() {
  return {
    name: 'neocom-spa-fallback-html',
    apply: 'build' as const,
    closeBundle() {
      copyFileSync('dist/index.html', 'dist/404.html');
    },
  };
}

const lazyChunkState = { files: new Set<string>() };

const shellGroupState = {
  shell: new Set<string>(),
  publicShared: new Set<string>(),
  entryLazy: new Set<string>(),
};

function shellGroupsPlugin() {
  return {
    name: 'neocom-shell-groups',
    apply: 'build' as const,
    buildEnd(
      this: {
        getModuleIds: () => Iterable<string>;
        getModuleInfo: (id: string) => {
          importedIds: readonly string[];
          dynamicallyImportedIds: readonly string[];
          isEntry: boolean;
          code: string | null;
        } | null;
        warn: (message: string) => void;
      },
      error?: Error
    ) {
      if (error) return;
      const ids = [...this.getModuleIds()];
      const matching = (suffixes: readonly string[]) => {
        const found = ids.filter((id) =>
          suffixes.some((suffix) => id.replaceAll('\\', '/').endsWith(suffix))
        );
        if (found.length !== suffixes.length) {
          throw new Error(
            `shellGroupsPlugin: found ${found.length} of ${suffixes.join(', ')} (src/app/lazyChunks.ts)`
          );
        }
        return found;
      };
      const untraced = new Set<string>();
      const shellRoots = matching(SHELL_MODULE_SUFFIXES);
      const [routeChunks] = matching(['/src/app/routeChunks.ts']);
      Object.assign(
        shellGroupState,
        shellChunkGroups({
          entries: ids.filter((id) => this.getModuleInfo(id)?.isEntry),
          shellRoots,
          publicRoots: matching(PUBLIC_ROUTE_SUFFIXES),
          routeModules: this.getModuleInfo(routeChunks)?.dynamicallyImportedIds ?? [],
          importedIds: throughBarrel({
            barrel: matching(['/src/components/ui/index.ts'])[0],
            specifier: '@/components/ui',
            importedIds: (id) => this.getModuleInfo(id)?.importedIds,
            code: (id) => this.getModuleInfo(id)?.code,
            onFallback: (id) => untraced.add(id),
          }),
          dynamicallyImportedIds: (id) => this.getModuleInfo(id)?.dynamicallyImportedIds,
        })
      );
      const inShell = (id: string) =>
        shellRoots.includes(id) ||
        shellGroupState.shell.has(id) ||
        shellGroupState.publicShared.has(id) ||
        shellGroupState.entryLazy.has(id);
      for (const id of untraced) {
        if (inShell(id)) {
          this.warn(
            `${id} imports @/components/ui in a way throughBarrel cannot trace (src/app/lazyChunks.ts), so every UI primitive counts as the shell's`
          );
        }
      }
    },
  };
}

function lazyChunksPlugin() {
  return {
    name: 'neocom-lazy-chunks',
    apply: 'build' as const,
    generateBundle(
      this: { emitFile: (file: object) => void },
      _options: unknown,
      bundle: BundleLike
    ) {
      const missing = missingShellChunks(bundle);
      if (missing.length > 0) {
        throw new Error(
          `lazyChunksPlugin: no chunk named ${missing.join(', ')}; the boot graph would lose it (src/app/lazyChunks.ts SHELL_CHUNK_NAMES)`
        );
      }
      if (!entryNamesRelease(bundle, release)) {
        throw new Error(
          'lazyChunksPlugin: the entry chunk no longer carries the release, so its name could repeat across builds and lazy-chunks.json `entry` would match the wrong one (src/app/lazyChunks.ts entryNamesRelease)'
        );
      }
      const importMap = chunkImportMapping(bundle, '/');
      const files = lazyChunkFiles(bundle, bootClosure(bundle, importMap));
      lazyChunkState.files = new Set(files);
      this.emitFile({
        type: 'asset',
        fileName: 'lazy-chunks.json',
        source: lazyChunksJson(files, release, entryFile(bundle)),
      });
    },
  };
}

function preloadGraphHashPlugin() {
  let root = '';
  let graph: Record<string, RenderedChunkLike> | undefined;
  let relative: Record<string, RenderedChunkLike> | undefined;
  return {
    name: 'neocom-preload-graph-hash',
    apply: 'build' as const,
    configResolved(config: { root: string }) {
      root = `${config.root}/`;
    },
    renderStart() {
      graph = undefined;
      relative = undefined;
    },
    renderChunk(
      _code: string,
      _chunk: unknown,
      _options: unknown,
      meta: { chunks: Record<string, RenderedChunkLike> }
    ) {
      graph ??= meta.chunks;
      return null;
    },
    augmentChunkHash(chunk: { fileName: string; dynamicImports: readonly string[] }) {
      if (chunk.dynamicImports.length === 0) return;
      if (!graph) throw new Error('preloadGraphHashPlugin: no chunk graph before hashing');
      relative ??= Object.fromEntries(
        Object.entries(graph).map(([file, c]) => [
          file,
          {
            name: c.name,
            imports: c.imports,
            dynamicImports: c.dynamicImports,
            moduleIds: c.moduleIds.map((id) => (id.startsWith(root) ? id.slice(root.length) : id)),
          },
        ])
      );
      return createHash('sha256')
        .update(preloadGraphSignature(chunk.fileName, relative))
        .digest('hex');
    },
  };
}

function releaseFilePlugin() {
  return {
    name: 'neocom-release-file',
    apply: 'build' as const,
    generateBundle(this: { emitFile: (file: object) => void }) {
      this.emitFile({
        type: 'asset',
        fileName: 'version.json',
        source: JSON.stringify({ release }),
      });
    },
  };
}

export default defineConfig({
  base: '/',
  build: {
    sourcemap: sentryAuthToken ? 'hidden' : false,
    chunkImportMap: true,
    rolldownOptions: {
      treeshake: {
        moduleSideEffects: [
          { test: UI_PRIMITIVE_MODULE, external: false, sideEffects: false },
          { test: /^(?![\s\S]*[\\/]node_modules[\\/])/, external: false, sideEffects: true },
        ],
      },
      output: {
        codeSplitting: {
          groups: [
            {
              name: 'vendor-react',
              test: /node_modules[\\/](react|react-dom|scheduler|react-router|react-router-dom)[\\/]/,
            },
            { name: 'vendor-sentry', test: /node_modules[\\/]@sentry(-internal)?[\\/]/ },
            { name: 'vendor-dexie', test: /node_modules[\\/](dexie|dexie-react-hooks)[\\/]/ },
            {
              name: 'vendor-i18n',
              test: /node_modules[\\/](i18next|react-i18next|html-parse-stringify|void-elements)[\\/]/,
            },
            { name: 'vendor-zustand', test: /node_modules[\\/]zustand[\\/]/ },
            { name: 'boot', tags: ['$initial'] },
            { name: 'shell-public', test: (id) => shellGroupState.publicShared.has(id) },
            { name: 'shell-lazy', test: (id) => shellGroupState.entryLazy.has(id) },
            { name: 'shell', test: (id) => shellGroupState.shell.has(id) },
          ],
        },
      },
    },
  },
  server: { port: 5173, strictPort: true },
  define: {
    __APP_VERSION__: JSON.stringify(version),
    __APP_RELEASE__: JSON.stringify(release),
    __DOGMA_PINS__: JSON.stringify(dogmaPins),
    __SDE_DATA_VERSIONS__: JSON.stringify(sdeDataVersions()),
  },
  worker: { format: 'es' },
  plugins: [
    react(),
    babel({ presets: [reactCompilerPreset({ compilationMode: 'annotation' })] }),
    tailwindcss(),
    copyDogmaEngineAssets(),
    {
      name: 'meta-description',
      transformIndexHtml: () => [
        {
          tag: 'meta',
          attrs: { name: 'description', content: appStrings.tagline },
          injectTo: 'head',
        },
      ],
    },
    phosphorWeightsPlugin(),
    localeSplitPlugin(),
    landingShellTemplate(),
    deferredEntryHtml(),
    VitePWA({
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      registerType: 'prompt',
      manifest: {
        name: appStrings.name,
        short_name: appStrings.name,
        description: appStrings.tagline,
        theme_color: '#0d1117',
        background_color: '#0d1117',
        display: 'standalone',
        start_url: '/',
        scope: '/',
        shortcuts: buildPwaShortcuts(appStrings.shortcuts),
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          {
            src: 'icons/icon-512-maskable.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
          {
            src: 'icons/badge-96.png',
            sizes: '96x96',
            type: 'image/png',
            purpose: 'monochrome',
          },
        ],
      },
      injectManifest: {
        globPatterns: ['**/*.{js,css,html,png,svg,ico,webmanifest,json,webp}'],
        globIgnores: [
          ...lazySdeGlobIgnores(),
          '**/vendor/dogma/**',
          '**/screenshots/**',
          '**/promo/**',
          '**/icons/icon-512*.png',
          '**/brand/**',
          '**/version.json',
          '**/lazy-chunks.json',
          '**/importmap.json',
        ],
        manifestTransforms: [
          async (entries) => dropLazyFromManifest(lazyChunkState.files)(entries),
        ],
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
      },
    }),
    ...(sentryAuthToken
      ? [
          sentryVitePlugin({
            org: process.env.SENTRY_ORG,
            project: process.env.SENTRY_PROJECT,
            authToken: sentryAuthToken,
            release: { name: release, inject: false },
            sourcemaps: { filesToDeleteAfterUpload: ['dist/**/*.map'] },
          }),
        ]
      : []),
    spaFallbackHtml(),
    releaseFilePlugin(),
    shellGroupsPlugin(),
    lazyChunksPlugin(),
    preloadGraphHashPlugin(),
  ],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    globals: true,
    unstubGlobals: true,
    restoreMocks: true,
    env: { TZ: 'UTC' },
    setupFiles: ['./vitest.setup.ts'],
    runner: './vitest.runner.ts',
    testTimeout: 10000,
    fakeTimers: {
      toFake: [
        'setTimeout',
        'clearTimeout',
        'setInterval',
        'clearInterval',
        'Date',
        'hrtime',
        'performance',
        'requestAnimationFrame',
        'cancelAnimationFrame',
        'requestIdleCallback',
        'cancelIdleCallback',
        'Intl' as 'Date',
      ],
    },
    ...(process.env.GITHUB_ACTIONS === 'true' ? {} : { maxWorkers: 2 }),
    coverage: { reporter: ['text', 'html'], exclude: ['src/mockups/**', '**/*.stories.tsx'] },
    reporters: process.env.GITHUB_ACTIONS === 'true' ? ['agent', 'github-actions'] : ['agent'],
    projects: [
      {
        extends: true,
        test: {
          name: 'unit',
          environment: 'node',
          include: [
            'src/**/*.{test,spec}.ts',
            'scripts/lib/**/*.test.mjs',
            'workers/**/*.test.mjs',
          ],
          exclude: [...configDefaults.exclude, DOM_TS_TESTS],
        },
      },
      {
        extends: true,
        test: {
          name: 'dom',
          environment: 'jsdom',
          setupFiles: ['./vitest.setup.ts', './vitest.setup.dom.ts'],
          include: ['src/**/*.{test,spec}.tsx', DOM_TS_TESTS],
        },
      },
    ],
  },
});
