import { defineConfig } from 'vite';
import { configDefaults } from 'vitest/config';
import react from '@vitejs/plugin-react';
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
import { phosphorWeightsPlugin } from './src/components/ui/phosphorWeightsPlugin';
import { localeSplitPlugin } from './src/i18n/localeSplitPlugin';

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
 * Plain `.test.ts` files that need a real `document`/`window` even though
 * nothing in them is `.tsx` — either `@testing-library/react`'s `renderHook`
 * (which mounts into a real `document`), or a browser global the module
 * under test reaches for directly (`sessionStorage`/`localStorage`,
 * `DOMParser`, `document.documentElement`, an `<a>` element for a download
 * link). None of these exist in a plain Node environment, so these files
 * stay on `jsdom` while every other `.test.ts` file (pure logic, verified by
 * actually running the full suite under `node` and fixing up whatever
 * failed) moves to `node` below for its per-file startup cost instead of
 * jsdom's.
 */
const DOM_TS_TESTS = [
  // renderHook
  'src/app/onboardingBannerSlot.test.ts',
  'src/app/useGrantedScopes.test.ts',
  'src/features/character/characterFilterValue.test.ts',
  'src/features/corp/owner.test.ts',
  'src/features/corp/useCorpAccess.test.ts',
  'src/features/corp/useCorpRouteGate.test.ts',
  'src/features/corp/useCorpSnapshot.test.ts',
  'src/features/contractSearch/offerLocations.test.ts',
  'src/features/industry/buildPlanPricingInputs.test.ts',
  'src/features/industry/corpOwnedBlueprints.test.ts',
  'src/features/industry/corpOwnedStock.test.ts',
  'src/features/industry/useComparedBuildResults.test.ts',
  'src/features/industry/useDetectedOwnedStock.test.ts',
  'src/features/industry/useMarketSnapshot.test.ts',
  'src/features/industry/useRunCountsByPlan.test.ts',
  'src/features/fittings/useModuleVariations.test.ts',
  'src/features/fittings/useSkillGains.test.ts',
  'src/features/fittings/useSkillLevelGain.test.ts',
  'src/features/market/useAppraisal.test.ts',
  'src/features/market/useCompareAttributes.test.ts',
  'src/features/market/useCompareRows.test.ts',
  'src/features/skills/useAccountSkillLevels.test.ts',
  'src/features/skills/useTargetPlan.test.ts',
  'src/lib/useAutoDismiss.test.ts',
  'src/lib/useLazyRowCache.test.ts',
  // sessionStorage / localStorage
  'src/app/loginFlow.test.ts',
  'src/auth/session.test.ts',
  'src/auth/loginReturnTo.test.ts',
  'src/sync/deviceId.test.ts',
  // document / window
  'src/lib/download.test.ts',
  'src/lib/fontScale.test.ts',
  'src/sync/deviceRegistration.test.ts',
  'src/features/market/appraisalShareData.test.ts',
  // DOMParser
  'src/features/fittings/fittingXmlDocument.test.ts',
  'src/features/skills/planner/planXmlDocument.test.ts',
  'src/features/skills/planner/planXmlImport.test.ts',
];

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

export default defineConfig({
  base: '/',
  build: {
    sourcemap: sentryAuthToken ? 'hidden' : false,
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
    tailwindcss(),
    copyDogmaEngineAssets(),
    phosphorWeightsPlugin(),
    localeSplitPlugin(),
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
        globPatterns: ['**/*.{js,css,html,png,svg,ico,webmanifest,json}'],
        // The Market Browser's catalogue (~1.2 MB: market groups, market
        // types, solar systems, NPC stations, market regions) is fetched
        // lazily on first visit to /market instead — most installs never
        // open it, so an install should not pay for it up front (CONTEXT.md).
        // The dogma engine's WASM binary and its SDE data file (ADR 0016,
        // ~10 MB together) are fetched lazily on first Fitting open instead —
        // same reasoning as the market catalogue above.
        // The large single-feature SDE files (~9 MB of the ~10.5 MB in
        // public/data) load on demand too, cached cache-first under their
        // content-versioned URL by src/sw.ts — see
        // docs/context/decisions/*-feature-sde-files-load-on-demand-not-precached.md.
        // What stays precached is what the shell and most routes need
        // (types, skills, pi, the small id lists).
        // The 512px install icons and the brand lockup are fetched by the
        // OS installer / docs, never by the running app.
        globIgnores: [
          '**/data/market/**',
          '**/vendor/dogma/**',
          '**/data/masteries.json',
          '**/data/marketWideTrees.json',
          '**/data/reprocessing.json',
          '**/data/pi-planet-radius.json',
          '**/data/blueprints.json',
          '**/data/shipTree.json',
          '**/icons/icon-512*.png',
          '**/brand/**',
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
            release: { name: release },
            sourcemaps: { filesToDeleteAfterUpload: ['dist/**/*.map'] },
          }),
        ]
      : []),
    spaFallbackHtml(),
  ],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    globals: true,
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
    coverage: { reporter: ['text', 'html'] },
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
    // investigation) that plain logic tests get zero benefit from and 283 of
    // this repo's 388 test files never touch a DOM at all. `extends: true`
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
          exclude: [...configDefaults.exclude, ...DOM_TS_TESTS],
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
          include: ['src/**/*.{test,spec}.tsx', ...DOM_TS_TESTS],
        },
      },
    ],
  },
});
