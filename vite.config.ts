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
  type BundleLike,
  type RenderedChunkLike,
} from './src/app/lazyChunks.ts';

const { version, dependencies } = JSON.parse(
  readFileSync(new URL('./package.json', import.meta.url), 'utf-8')
) as { version: string; dependencies: Record<string, string> };

/**
 * The Sentry release: package version plus the commit it was built from. The
 * package version alone never changes between deploys, so every issue read
 * `0.1.0` and nothing could say whether a report predates a fix. Shared by
 * `define` and the sourcemap upload below — the two must name the same release
 * or the uploaded maps attach to a release no event reports.
 */
const release = `neocom-desk@${version}+${buildCommit()}`;

function buildCommit(): string {
  const fromCi = process.env.GITHUB_SHA;
  if (fromCi) return fromCi.slice(0, 12);
  try {
    return execFileSync('git', ['rev-parse', '--short=12', 'HEAD'], {
      encoding: 'utf-8',
      // No git (a source tarball): fall back quietly rather than print its error.
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return 'dev';
  }
}

// The dogma engine and its SDE snapshot are pinned exactly and bumped together
// (ADR 0016); anything saved from their answers is keyed on this.
const dogmaPins = `${dependencies['@eveshipfit/dogma-engine']}+${dependencies['@eveshipfit/sde']}`;

/**
 * A short content hash per `public/data/**` JSON file, keyed by its path
 * under `data/` with forward slashes (`types.json`, `market/types.json`).
 * Loaders fetch `data/<file>?v=<hash>` (`src/sde/sdeDataUrl.ts`) and the
 * service worker caches those URLs cache-first (`src/sw.ts`): GitHub Pages
 * re-ETags every file on every deploy, so without a content version the
 * files were refetched after nearly every deploy even when unchanged — and a
 * cache-first route on an unversioned URL would never see an SDE update.
 * Read once at config load, like `dogmaPins`.
 */
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

/**
 * The manifest description is the login hero's own subheading — one sentence,
 * one source. Read out of the catalog rather than restated here: the two had
 * already drifted once, the manifest still promising a "character, skill
 * planning, and industry companion" long after market, planetary, moon mining
 * and corp shipped.
 */
const { app: appStrings } = JSON.parse(
  readFileSync(new URL('./src/i18n/locales/en.json', import.meta.url), 'utf-8')
) as { app: { name: string; tagline: string } };

/**
 * Plain `.ts` tests that need a real `document`/`window` — a `renderHook`
 * (which mounts into a real `document`), or a browser global the module under
 * test reaches for directly (`sessionStorage`/`localStorage`, `DOMParser`,
 * `document.documentElement`, an `<a>` download link) — are named
 * `*.dom.test.ts` and run on `jsdom`. Every other `.test.ts` file (pure
 * logic) runs on `node` for its lower per-file startup cost. This replaces a
 * hand-maintained path list that rotted on renames and let a new `renderHook`
 * test land in `node`, failing with a confusing missing-`document` error;
 * `src/testEnvironmentSplit.test.ts` now guards that case.
 */
const DOM_TS_TESTS = 'src/**/*.dom.test.ts';

/**
 * Source-map upload is opt-in on the token, which only the deploy job holds:
 * a PR build, an agent worktree and `npm run build` on a laptop all skip it
 * and behave exactly as before. Without the maps a production stack trace is
 * minified rubbish, so the gate is on the credential, never on the intent.
 *
 * `hidden` emits the maps without the `//# sourceMappingURL=` comment, and
 * `filesToDeleteAfterUpload` removes them once Sentry has them — `dist/` is
 * published to GitHub Pages, so a `.map` left behind is a public one.
 */
const sentryAuthToken = process.env.SENTRY_AUTH_TOKEN;

/**
 * GitHub Pages has no SPA rewrite: it looks for a file at the requested path
 * and, finding none, serves `404.html`. So every deep link — a shared
 * `/overview`, a bookmark, and the EVE SSO redirect back to `/callback` —
 * lands on GitHub's own 404 page for anyone whose service worker is not yet
 * installed and controlling navigations (src/sw.ts handles the rest).
 *
 * Shipping `index.html` under that name too is the standard fix: Pages still
 * answers 404, but the body is the app, which boots and routes the path
 * client-side. An address that really matches nothing then reaches the `*`
 * route and its own NotFound screen, rather than a stock GitHub page.
 *
 * Last in `plugins` so `closeBundle` runs after VitePWA has taken its manifest
 * — otherwise the copy is precached as a second, identical `index.html`.
 */
/**
 * `@eveshipfit/dogma-engine`'s WASM binary and `@eveshipfit/sde`'s `sde.dat`
 * (ADR 0016) load lazily at runtime instead of bundling with the app shell —
 * `src/features/fittings/dogmaFittingEngine.ts` fetches them from
 * `/vendor/dogma/*` on first use. Vite serves `public/` as-is, so getting
 * them there just means copying out of `node_modules` once per dev/build
 * (mirrors `public/data/*.json`, which `scripts/build-sde.mjs` populates the
 * same way from an external source, committed instead of gitignored only
 * because that source is Fuzzwork's live CSVs rather than an installed
 * package already pinned in `package.json`). Not committed: `.gitignore`
 * excludes `public/vendor/dogma/`, since re-copying is one `npm ci` away and
 * the point of pinning in `package.json` is to have exactly one place the
 * version lives.
 *
 * It runs in `configResolved`, not `buildStart`: the dev server takes its
 * list of `public/` files before `buildStart` fires, so a file copied there
 * on a fresh checkout's first `vite dev` was answered with the SPA's HTML
 * page until the server restarted.
 *
 * The copy is a no-op once the destination already has a same-size file:
 * `configResolved` fires for `vite dev` as well as `vite build`, and e2e boots
 * both a `vite build` preview *and* a `vite dev` server against the same
 * checkout (`playwright.config.ts`'s `built`/`dev` projects) — an
 * unconditional copy on the second start would touch these files'
 * mtimes after `npm run build` already ran, and `scripts/e2e-preview.mjs`
 * treats all of `public/` as a build input, so it would then see `public` as
 * newer than `dist` and refuse to start, thinking the bundle was stale.
 */
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

/**
 * Fills `index.html`'s `<template id="landing-shell-template">` with the
 * prerendered landing hero (`src/app/landingShell.ts`, #3926), read from the
 * snapshot `src/features/landing/landingShell.test.tsx` keeps of the real
 * `Login` render. Read per transform so a regenerated snapshot shows in dev
 * without a restart. Throws if the marker is gone: a build without the shell
 * would ship silently slower.
 *
 * The built page links the stylesheet in `<head>`, so the shell paints styled.
 * The dev server only injects CSS once the module graph runs, so there it gets
 * the same stylesheet linked directly, or the shell would flash unstyled.
 */
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

/**
 * On the landing page, holds the app's JS until the prerendered hero has
 * painted (`src/app/deferredEntry.ts`, #3950). Build only. Runs on the emitted
 * `index.html` rather than as a `transformIndexHtml` hook: Vite writes the chunk
 * import map after every plugin's html hook, before the first module tag it
 * finds, and with the tags already swapped for the loader it found none and
 * put the map ahead of the doctype. `post`, so the page is already in the
 * bundle; VitePWA hashes and `spaFallbackHtml` copies it later, at `closeBundle`.
 */
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
        // TEMP(measure): the map-off count build has no map.
        if (problem && process.env.NEOCOM_CHUNK_IMPORT_MAP !== '0')
          throw new Error(`deferredEntryHtml: ${problem}`);
        page.source = html;
      },
    },
  };
}

function spaFallbackHtml() {
  return {
    name: 'neocom-spa-fallback-html',
    // Build only. `closeBundle` also fires when a dev server shuts down, where
    // there is no `dist/` to copy and the throw would surface as a crash on
    // Ctrl+C in a fresh worktree.
    apply: 'build' as const,
    closeBundle() {
      copyFileSync('dist/index.html', 'dist/404.html');
    },
  };
}

/**
 * The chunks the install does not precache (`src/app/lazyChunks.ts`), filled by
 * `lazyChunksPlugin` while the bundle is generated and read by
 * `injectManifest.manifestTransforms`, which vite-plugin-pwa runs afterwards in
 * its own `closeBundle`. Module scope, because the two live in separate options.
 */
const lazyChunkState = { files: new Set<string>() };

/**
 * Splits the bundle into the boot graph (precached) and every other chunk (left
 * to the idle warm and `sw.ts`'s cache-first route), and emits
 * `lazy-chunks.json` naming the second set for the warm, the Offline data panel
 * and the worker's cleanup. Kept out of the precache (`globIgnores`).
 */
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

/**
 * Folds what each chunk's preload lists will name into its hash
 * (`preloadGraphSignature`), so a chunk whose lists change is renamed instead of
 * keeping its name with new bytes. The graph is `renderChunk`'s `meta.chunks`,
 * captured before any hash is computed; module ids are taken relative to the
 * root so a build elsewhere signs the same.
 */
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

/**
 * Emits `version.json` (`{ release }`) beside `index.html`: the running app
 * compares it with its own `__APP_RELEASE__` to learn of a new build in one
 * small request (src/app/latestRelease.ts), instead of waiting on the service
 * worker's precache. Kept out of the precache (`globIgnores`) so it is always
 * read from the network.
 */
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
    // Chunks import each other by stable names an import map in `index.html`
    // resolves to the hashed files, so a chunk's hash follows its own code only.
    // Without it a changed leaf renamed every chunk that imported it, and every
    // importer of those, and each deploy (~15 min apart) re-downloaded hundreds
    // of unchanged chunks (docs/context/decisions/*-chunks-import-each-other-
    // through-an-import-map*). Module workers get no import map; Vite builds
    // them with `worker.rolldownOptions`, which leaves this off.
    // TEMP(measure): NEOCOM_CHUNK_IMPORT_MAP=0 turns it off for the CI count.
    chunkImportMap: process.env.NEOCOM_CHUNK_IMPORT_MAP !== '0',
    rolldownOptions: {
      output: {
        // Routes are already split per page (`src/app/routeChunks.ts`); what
        // is left in the entry is the boot-time vendor code. Pulled into
        // chunks of their own so an app deploy — which changes the entry's
        // hash every time — does not re-download React and Sentry with it.
        // Only libraries every page loads at boot: a broad `node_modules`
        // group would drag route-only ones (recharts) into the first paint.
        codeSplitting: {
          groups: [
            {
              name: 'vendor-react',
              test: /node_modules[\\/](react|react-dom|scheduler|react-router|react-router-dom)[\\/]/,
            },
            { name: 'vendor-sentry', test: /node_modules[\\/]@sentry(-internal)?[\\/]/ },
            // Same reasoning for the rest of the boot path: Dexie opens the
            // database and i18next/zustand run before first paint, so all
            // three ride in the entry's static imports on every page. Left
            // ungrouped they are re-emitted inside the entry chunk, and with a
            // deploy every ~15 minutes that re-downloads them each time the
            // service worker installs (the precache is the whole update cost).
            { name: 'vendor-dexie', test: /node_modules[\\/](dexie|dexie-react-hooks)[\\/]/ },
            {
              name: 'vendor-i18n',
              test: /node_modules[\\/](i18next|react-i18next|html-parse-stringify|void-elements)[\\/]/,
            },
            { name: 'vendor-zustand', test: /node_modules[\\/]zustand[\\/]/ },
          ],
        },
      },
    },
  },
  // Port pinned: the EVE SSO dev callback URL must match exactly, so the
  // port cannot be allowed to drift when 5173 happens to be busy.
  server: { port: 5173, strictPort: true },
  // Read once at build/dev/test start, not hand-maintained in source.
  define: {
    __APP_VERSION__: JSON.stringify(version),
    // The release tag Sentry reports, so it must match the shipped build.
    __APP_RELEASE__: JSON.stringify(release),
    __DOGMA_PINS__: JSON.stringify(dogmaPins),
    __SDE_DATA_VERSIONS__: JSON.stringify(sdeDataVersions()),
  },
  // The hull-check worker imports the dogma engine (wasm-bindgen glue): ES
  // modules, not the IIFE default, which cannot code-split its imports.
  worker: { format: 'es' },
  plugins: [
    react(),
    // Trial: compiles only files with a "use memo" directive.
    babel({ presets: [reactCompilerPreset({ compilationMode: 'annotation' })] }),
    tailwindcss(),
    copyDogmaEngineAssets(),
    // Same sentence as the manifest description (appStrings.tagline), so the two cannot drift.
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
      // Hand-written src/sw.ts (originally ADR 0007, issue #176; now ADR 0009)
      // — only strategy that will support a custom `push` handler (future
      // Web Push work); generateSW's output has no room for one.
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
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          {
            src: 'icons/icon-512-maskable.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
          // Bubblewrap reads this as the Play Store app's status-bar
          // notification icon (`monochromeIconUrl`, docs/ANDROID-TWA.md).
          // 96px is exactly the xxxhdpi size of Android's 24dp small icon.
          {
            src: 'icons/badge-96.png',
            sizes: '96x96',
            type: 'image/png',
            purpose: 'monochrome',
          },
        ],
      },
      // navigateFallback/navigateFallbackDenylist are generateSW-only — the
      // equivalent SPA-fallback routing is hand-written in src/sw.ts.
      injectManifest: {
        globPatterns: ['**/*.{js,css,html,png,svg,ico,webmanifest,json,webp}'],
        // Offline-first for data: the install precaches what a core feature needs to
        // open with no network — the Industry blueprint catalogue, the Ship
        // Tree, and the small market lookups that route planning and the
        // system/region/group/attribute pickers read (`blueprints.json`,
        // `shipTree.json`, `market/{systems,jumps,systemPositions,groups,
        // attributes,regions,globalMarkets,lpCorporations}.json`; ~3.5 MB raw)
        // and the market catalogue `market/{types,stations,variations}.json`
        // (~3.1 MB raw, ~360 KB gzip: Fittings, Show Info and station names read them)
        // — see docs/context/decisions/*-core-feature-sde-files-are-precached*.
        // Everything else under `public/data` is the lazy set,
        // `src/sde/lazySdeFiles.ts`: one list, also what the idle background
        // warm fetches, cached cache-first under its content-versioned URL by
        // src/sw.ts (docs/context/decisions/*-feature-sde-files-load-on-demand-
        // not-precached.md, amended).
        // The dogma engine's WASM binary and its SDE data file (ADR 0016,
        // ~10 MB together) are fetched lazily on first Fitting open instead.
        // The 512px install icons and the brand lockup are fetched by the
        // OS installer / docs, never by the running app. Nor are the landing
        // page's `screenshots/` (~1 MB, signed-out page only, also store
        // listing art); the small `landing/` ship art and the how-to images
        // under `images/` ARE shown by the app and are precached (webp).
        globIgnores: [
          ...lazySdeGlobIgnores(),
          '**/vendor/dogma/**',
          '**/screenshots/**',
          '**/icons/icon-512*.png',
          '**/brand/**',
          '**/version.json',
          '**/lazy-chunks.json',
          // Already inline in index.html; kept beside it only to compare deploys.
          '**/importmap.json',
        ],
        // Route code is the exception: only the boot graph is precached, the rest of
        // the chunks are warmed at idle (`lazyChunksPlugin`, docs/context/decisions/
        // *-only-the-boot-graph-is-precached-route-chunks-are-warmed-at-idle*).
        // Read at call time: the list is only known once the bundle exists.
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
            // `inject: false`: the plugin would prepend `SENTRY_RELEASE={id:<release>}`
            // to every chunk, and the release carries the commit, so every chunk
            // was renamed on every deploy whatever the import map does. Sentry
            // already reads the release from `Sentry.init` (src/instrument.ts),
            // and the maps match on the per-chunk debug ids, which stay.
            release: { name: release, inject: false },
            sourcemaps: { filesToDeleteAfterUpload: ['dist/**/*.map'] },
          }),
        ]
      : []),
    spaFallbackHtml(),
    releaseFilePlugin(),
    lazyChunksPlugin(),
    preloadGraphHashPlugin(),
  ],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    globals: true,
    // Undo `vi.stubGlobal` and restore `vi.spyOn` spies after every test, so a
    // file that forgets to clean up cannot leak into the next test (#4117).
    unstubGlobals: true,
    restoreMocks: true,
    // Tests run in UTC, matching the CI runners, so a suite that passes here
    // passes there and vice versa.
    //
    // Without this, any test asserting a *rendered* date drifts by a day for
    // developers west of UTC: ESI hands out instants like
    // "2027-01-15T00:00:00Z", `formatLocalDate` correctly renders them in the
    // viewer's own zone, and midnight UTC is the previous day everywhere in
    // the Americas. SkillPlans' remap-cooldown hint was failing exactly that
    // way on a US machine while passing in CI — a whole class of failure that
    // looks like a real bug and costs an afternoon to find, since the app
    // behaviour was right both times.
    //
    // The cost is that a genuine timezone bug will not surface from a local
    // run. That is acceptable here: local-date rendering has its own unit
    // tests (src/lib/localDate.test.ts) which set the zone deliberately, and
    // that is where a zone question belongs, not as an accident of whoever
    // happens to run the suite.
    env: { TZ: 'UTC' },
    // Shared half only. The `dom` project below adds `vitest.setup.dom.ts`;
    // the `node` project was importing `@testing-library/jest-dom` and a
    // stack of jsdom polyfills 462 times for matchers it never calls.
    setupFiles: ['./vitest.setup.ts'],
    // Default 5000ms. A test can chain several `findBy*`/`waitFor` calls,
    // each with up to 5000ms of its own headroom (vitest.setup.ts) for CPU
    // contention under parallel runs. The ceiling is 10s, and it is a budget
    // to stay under, not one to raise: a test that needs more is too slow and
    // gets made faster (CLAUDE.md, "Tests stay under 10 seconds").
    testTimeout: 10000,
    // Vitest's default is availableParallelism() - 1 forked processes, each
    // spinning up its own jsdom — on this 16-core dev box that's ~15
    // concurrent Node processes, multiplied further by however many
    // `/next-ticket` loops are running (CLAUDE.md), which is what pegs the
    // machine. CI runners are small enough (2-4 cores) that the default is
    // already fine there, so only cap it locally.
    ...(process.env.GITHUB_ACTIONS === 'true' ? {} : { maxWorkers: 2 }),
    coverage: { reporter: ['text', 'html'], exclude: ['src/mockups/**', '**/*.stories.tsx'] },
    // Suppresses passing-test noise, keeps full detail on failures — cuts
    // `test:run` output (read by CI logs and every agent tool call alike)
    // without losing anything actually diagnostic. An explicit `reporters`
    // array replaces Vitest's default set rather than merging with it, so
    // `github-actions` has to be re-added here or CI's PR-diff annotations
    // (on by default, undocumented in this config until now) disappear.
    reporters: process.env.GITHUB_ACTIONS === 'true' ? ['agent', 'github-actions'] : ['agent'],
    // Split by environment rather than one `jsdom` run for everything: jsdom
    // instantiation is real, per-file overhead (measured ~0.9s/file on this
    // repo's engine tests alone — see the /code-review test-speed
    // investigation) that plain logic tests get zero benefit from and most
    // of this repo's test files never touch a DOM at all. `extends: true`
    // on both projects inherits every other option above unchanged.
    projects: [
      {
        extends: true,
        test: {
          name: 'unit',
          environment: 'node',
          // `scripts/lib/**` is the one carve-out from the `src/`-only rule:
          // pure logic the SDE bake script (`scripts/build-sde.mjs`, plain
          // Node ESM, no TS/build step, deliberately outside `src/`) needs
          // covered by a real fixture test (issue #1084) but cannot import
          // from `src/` without pulling in a TS loader that script has never
          // needed. Kept to `scripts/lib/`, not all of `scripts/`, so the
          // rest of that directory's one-off tooling stays untested by
          // design, same as before.
          include: ['src/**/*.{test,spec}.ts', 'scripts/lib/**/*.test.mjs'],
          exclude: [...configDefaults.exclude, DOM_TS_TESTS],
        },
      },
      {
        extends: true,
        test: {
          name: 'dom',
          environment: 'jsdom',
          // The shared setup plus the DOM-only half. Listed rather than
          // inherited: `setupFiles` replaces the parent's value instead of
          // merging with it, so dropping the base file here would silently
          // lose `fake-indexeddb` and the route-snapshot reset.
          setupFiles: ['./vitest.setup.ts', './vitest.setup.dom.ts'],
          include: ['src/**/*.{test,spec}.tsx', DOM_TS_TESTS],
        },
      },
    ],
  },
});
