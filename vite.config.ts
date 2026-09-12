import { defineConfig } from 'vite';
import { configDefaults } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';
import { sentryVitePlugin } from '@sentry/vite-plugin';
import { copyFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';

const { version } = JSON.parse(
  readFileSync(new URL('./package.json', import.meta.url), 'utf-8')
) as { version: string };

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
  'src/features/character/characterFilterValue.test.ts',
  'src/features/corp/owner.test.ts',
  'src/features/corp/useCorpAccess.test.ts',
  'src/features/corp/useCorpRouteGate.test.ts',
  'src/features/corp/useCorpSnapshot.test.ts',
  'src/features/industry/corpOwnedBlueprints.test.ts',
  'src/features/industry/corpOwnedStock.test.ts',
  'src/features/industry/useComparedBuildResults.test.ts',
  'src/features/industry/useDetectedOwnedStock.test.ts',
  'src/features/industry/useMarketSnapshot.test.ts',
  'src/features/industry/useRunCountsByPlan.test.ts',
  'src/features/market/useAppraisal.test.ts',
  'src/features/market/useCompareRows.test.ts',
  // sessionStorage / localStorage
  'src/app/loginFlow.test.ts',
  'src/auth/session.test.ts',
  'src/sync/deviceId.test.ts',
  // document / window
  'src/lib/download.test.ts',
  'src/lib/fontScale.test.ts',
  'src/sync/deviceRegistration.test.ts',
  'src/features/market/appraisalShareData.test.ts',
  // DOMParser
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
  build: { sourcemap: sentryAuthToken ? 'hidden' : false },
  // Port pinned: the EVE SSO dev callback URL must match exactly, so the
  // port cannot be allowed to drift when 5173 happens to be busy.
  server: { port: 5173, strictPort: true },
  // Read once at build/dev/test start, not hand-maintained in source — Sentry
  // tags every release with it (src/instrument.ts).
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
    ...(sentryAuthToken
      ? [
          sentryVitePlugin({
            org: process.env.SENTRY_ORG,
            project: process.env.SENTRY_PROJECT,
            authToken: sentryAuthToken,
            release: { name: `neocom-desk@${version}` },
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
    setupFiles: ['./vitest.setup.ts'],
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
          include: ['src/**/*.{test,spec}.ts'],
          exclude: [...configDefaults.exclude, ...DOM_TS_TESTS],
        },
      },
      {
        extends: true,
        test: {
          name: 'dom',
          environment: 'jsdom',
          include: ['src/**/*.{test,spec}.tsx', ...DOM_TS_TESTS],
        },
      },
    ],
  },
});
