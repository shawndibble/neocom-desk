# Testing, hooks and CI

Detail moved out of `CLAUDE.md` so it is read on demand. The short rules stay in `CLAUDE.md`.

- A git pre-commit hook (husky + lint-staged) auto-fixes lint/format on
  staged files and runs `npm run typecheck` on every commit, _once
  installed_. `npm install`/`npm ci` install it via the `prepare` script,
  but `prepare` (like `postinstall`) is an npm lifecycle script and is
  silently skipped whenever `ignore-scripts` is set — true for this agent's
  sandboxed shell, and possibly for your own global npm config too (check
  `npm config get ignore-scripts`). husky's own CLI also exits 0
  unconditionally even when it installed nothing, so its exit code isn't
  proof either. Run `npm run verify-hooks -- --fix` once after any fresh
  clone or `npm ci` to install and _confirm_ the hook is actually live — it
  fails loudly instead of silently doing nothing (see
  `scripts/verify-husky.mjs`). Agent worktrees get this for free:
  `scripts/next-ticket/setup-worktree.mjs` runs the same verification and
  fails worktree setup outright if the hook didn't really install. While
  iterating, use narrower checks: `npm run typecheck`
  and `npx vitest run <path>` for the file(s) you're touching. **Never run
  the full suite (`npm run test:run`) or `npm run build` locally** — CI's
  `validate` job runs `check:case`, `lint`, `format:check`, `typecheck`,
  `build`, the Firestore rules tests and the `functions/`
  typecheck and tests (all but `build` in the one `static` job) on every PR (`ci.yml` is PR-only; `deploy.yml` handles pushes to `develop`/`main`, and `cache-warm.yml` saves CI's dependency caches on `develop` so a PR's first run hits them), the `test` job runs `test:run` across four shards, and the
  `e2e` job runs Playwright across six (whole spec files dealt out by
  `e2e/shard-weights.json`; a new spec needs no entry, and
  `node scripts/e2e-shard.mjs --weights <ci-log>` refreshes the table) inside
  Playwright's container image, whose tag in `ci.yml` (and `cache-warm.yml`) must match
  `@playwright/test`, plus the Corp Tax Book specs in one `e2e-book` job against the Firebase
  emulators (see "Running the app against the Firebase emulators" below); that's the gate, not a local
  pre-PR run. Both sharded jobs report through a single aggregate check
  (`test`, `e2e`) because the `develop` and `main` rulesets require those exact names. The `e2e` shards are skipped (and `e2e` still reports green) when every file a PR changes is on `scripts/lib/e2eRelevance.mjs`'s safe list (docs, `functions/`, workflows other than `ci.yml`, unit tests, and the like); any other or unlisted path runs them. The four `test-shard` jobs skip the same way (and `test` still reports green) when every changed file is prose on `scripts/lib/testRelevance.mjs`'s narrower safe list (`docs/`, root and `.claude/` Markdown, `.out-of-scope/`). In ticket-loop work (`/next-ticket`, `/implement`),
  see `.claude/commands/next-ticket.md`'s "Pre-commit hook, then CI" for the
  exact cadence. `node scripts/next-ticket/gate.mjs [--build]` still exists
  as an optional, manual full-CI-mirror for ad-hoc branches — nothing in the
  ticket loop calls it automatically. `/code-review` sub-agents are
  read-only diff review and must never run tests, lint, typecheck, or build.
- **Lint, format and typecheck results are cached.** `npm run lint` and
  `npm run format:check` run with `--cache --cache-strategy content` (into
  `.cache/eslint`, `.cache/prettier`), and `tsc -b` keeps `.cache/tsc`, so a
  rerun re-checks only the files that changed (measured on a fresh-mtime
  checkout: ESLint 169s -> 3s, Prettier 88s -> 12s, `tsc -b` 106s -> 1s).
  `check-cache-warm.yml` saves the three on `develop`, one entry a day, and
  `static` restores them (restore only: a PR run saving its own copy would
  fill the cache quota with single-use entries, the reason `cache-warm.yml`
  exists). ESLint here has no type-aware rules, so a content-keyed cache
  cannot miss an error caused by another file; adding one means dropping
  `--cache` from `lint`.
- **`npm run typecheck` is `tsc -b` over two projects**: `tsconfig.src.json` (shipped code, emits
  declarations to `.cache/tsc`) and `tsconfig.tests.json` (tests, stories, e2e, tool configs;
  checks `src` through the reference). A single `tsc --noEmit` over everything peaked at 4.3 GB and
  OOM-aborted CI at Node's default heap; this peaks at ~2.7 GB and reruns in under a second when
  nothing changed. A new test-only file pattern goes in the `exclude` of `tsconfig.src.json` _and_
  the `include` of `tsconfig.tests.json`; a file outside `src` that `src` imports is added to
  `tsconfig.src.json`'s `include` (TS6307 says so). Ambient globals don't cross the reference, so
  `src/vite-env.d.ts` is listed in both.
- **Parallel agents stay light.** Every commit already runs a full
  `typecheck` through the pre-commit hook, so a dozen agents at once push the
  machine's load past 70 and make tests time out (they flake under load, they
  don't fail for real). So **at most three agents at once may commit or run
  tests, typecheck, lint or a build**. The limit is about that load, not about
  agents as such: agents that only read, search, research or edit files run
  in any number, and the session that owns them runs the checks once they
  are done. Each agent that does run tests runs
  only the test files it touched (`npx vitest run <file>`), never a whole
  directory like `src/routes` or `src/features`. Run an e2e spec locally only
  when you are changing that spec or the geometry it asserts, one file at a
  time (`E2E_SKIP_BUILT=1 npx playwright test e2e/<file> --project=chromium`).
  CI's fonts differ from a Mac's, so assert invariants (no overlap, no
  overflow, one line) rather than pixel-exact thresholds. Screenshot and
  review passes are one-offs, not part of a PR's checks. Everything else is
  CI's job.
- **A flaky CI test never holds up your PR, and is never left unfixed.** The
  fix for the flake ships as its own PR, straight after yours: bundling an
  unrelated test fix into a feature PR slows the feature, muddies its review
  and its revert, and a flake fix that is only "queued" is one that gets
  forgotten.
  1. Reproduce locally (`npx vitest run <path>`) to tell a real regression
     from your change apart from a pre-existing flake. If your change caused
     it, or the failing test is in a file your PR touches, it is not a
     flake: fix it in your PR.
  2. If it is unrelated, rerun the failed job (the one rerun is to get your
     PR through, not the fix) and merge once green.
  3. **Immediately after the merge**, before picking up any other work, branch
     a new worktree off `origin/develop`, fix the flake and open a separate
     PR for it. Name the test and the CI run it failed in. The fix removes the
     cause (an unawaited assertion, a race on a router or store, a timing
     assumption); never a retry, a longer timeout or a skip.
- **Cache loads settle between tests.** `vitest.setup.dom.ts` unmounts, then
  awaits `settleEsiCacheLoads()` after every dom test and warns naming any
  key still pending, so a read still writing to `esiCache` can't leak into the next
  test. Don't hand-roll drains (`waitFor(esiInFlight)`, extra ticks).
- **Teardown is deterministic** (`src/test/teardown.ts`, both projects). Every
  `fetch` a test makes is aborted the moment its body ends, before any
  `afterEach` (`vitest.runner.ts`), so a late response can't write after the
  file's resets or call `setState` once jsdom is gone. A `fetch` the test's
  leftover work starts after that (a load that was still reading IndexedDB)
  is refused with the same `AbortError` until the next test, or the next
  suite once those leftovers are drained;
  `beforeAll` requests (warm-up renders) still run, but an `afterEach` or
  `afterAll` can't fetch. The runner step also drains IndexedDB (real timers
  only), so such a load fails before the file's resets. Then the shared
  `afterEach` puts real timers and the real `Date` back and waits for pending
  IndexedDB opens and transactions (Dexie, and Firebase's heartbeat probe that
  failed shards with "self is not defined"). A test that fakes timers still
  restores them itself. A bare `vi.useFakeTimers()` leaves `setImmediate` and
  `clearImmediate` real: the config default (`test.fakeTimers.toFake` in
  `vite.config.ts`) is vitest's own list without them, because fake-indexeddb
  schedules every request on `setImmediate`, and a Dexie request parked on the
  fake clock is dropped when real timers come back, so it never finishes and
  `VITEST_FAIL_ON_LEFTOVER_WORK=1` (CI) fails the test (#6267). A test that
  needs `setImmediate` faked passes its own `toFake` (it replaces the default
  list) and settles its IndexedDB work before restoring real timers. Dexie is not wiped between tests: files seed in
  `beforeAll`, so each file keeps clearing the tables it uses. Because that
  state is per file, `it.concurrent` / `describe.concurrent` are banned by lint,
  and `src/test/teardownOrder.test.ts` pins the runner order the abort relies on.
  Work still pending a second after the test ends fails the test on CI
  (`VITEST_FAIL_ON_LEFTOVER_WORK=1` in `ci.yml`'s unit shards) and only logs a
  `[teardown]` warning locally; set the variable to reproduce a CI failure. Under
  fake timers the usual cause is a faked `setImmediate`, which is
  fake-indexeddb's scheduler: a Dexie request queued on it is dropped when the
  timers are restored and never finishes. Fake only what the test needs,
  e.g. `toFake: ['setTimeout', 'clearTimeout']` or `['Date']`.
- **Tests stay under 10 seconds each.** `testTimeout` is 10000 in
  `vite.config.ts`, and that is a budget to stay under, not a number to raise.
  A test that needs more is too slow: make it faster instead of adding a
  per-test timeout or a longer `findBy*` wait. Find out where the time goes
  first. The usual culprit in a route test is the worker's first cold `App`
  render (lazy route chunks, jsdom, React warm-up), which lands on whichever
  test happens to run first. Pay it once in a `beforeAll` warm-up render with
  its own hook timeout, as `src/routes/IndustryPlanPage.test.tsx` does.
- **Test a page through `renderPageRoute` / `renderPageRoutes`
  (`src/test/renderPage.tsx`), not `<App />`.** It mounts the route with
  App's own per-page wiring (`src/app/appWiring.tsx`: ScopeGate, TabRoute,
  info modals, ESI token provider, store hydration) and none of its boot,
  shell or pollers, which is what cost a whole-App route test seconds per
  scenario. Keep only one to three `<App />` tests per route, for what only
  App does: the URL is reachable, legacy paths and redirects, the shell, auth
  gating. Wrap it in a one-line area helper (`renderMarketRoute`) if a page's
  tests need one; never copy its wiring.
- **Unit shards are dealt out by file run time, not by hash.** `ci.yml`'s
  `test-shard` jobs run the files `scripts/test-shard.mjs` assigns them, using
  `scripts/test-shard-weights.json` (seconds per file). A new test file needs
  no edit (it counts as median). Refresh the table every so often from the
  `vitest-timing-shard-N` artifacts of a recent run:
  `node scripts/test-shard.mjs --weights vitest-timing-*.json`. Vitest's own
  `--shard` hashes the path and ignores run time.
- **Aim for under 1s per unit test and under 10s per e2e test.** Each CI
  `test-shard` job prints the tests over 1s in its job summary
  (`scripts/test-budget.mjs`) and uploads the full per-test report as
  `vitest-timing-shard-N`. The list never fails a run: runner speed swings
  by half between runs, so one run proves little. A test that stays on the
  list across runs gets a faster rewrite (a smaller render, a pure test, a
  shared warm-up) or a comment above it saying why it is slow. Do not run the
  whole suite locally to measure; read the artifact. Vitest in worker threads
  (`pool: 'threads'`) was tried and fails the tests that set `process.env.TZ`.
- **Bumping the dogma engine or SDE: run the reference fits.** Bump
  `@eveshipfit/dogma-engine` and `@eveshipfit/sde` together (ADR 0016), then run
  `npx vitest run src/features/fittings/dogmaFittingEngine.reference.integration.test.ts`.
  It pins eight standard All V fits (Drake, Hurricane, Omen, Vexor, Myrmidon,
  Hulk, Guardian, Tengu), each value with its source beside it. A value that
  moves must be justified in the PR from the engine or SDE change that caused
  it. Never re-pin blind. A bug the suite reveals is filed, and today's value
  stays pinned with a `TODO(#issue)`.

## Wait for a signal, never a duration

Most past flake fixes were a test asserting before async work settled. Lint
(`eslint.config.js`) stops the patterns that cause it:

- **eslint-plugin-testing-library** on every jsdom test (`*.test.tsx`,
  `*.dom.test.ts`): async queries, utils and events are awaited; a `waitFor`
  holds one assertion and no side effects (fire the event before it, wait for the
  outcome inside it); `findBy*` instead of `waitFor` + `getBy*`; no `act` that
  wraps nothing (`await act(async () => {})`) or wraps a call that already acts.
- **No sleeps in a test's own flow.** An awaited `new Promise(… setTimeout …)` in
  a test, hook, `act` callback or helper is an error, and so is a helper that is
  only such a promise. A delay inside a stub (an argument to `mockImplementation`
  or `vi.fn`, a property of a fake) simulates latency and stays legal; write
  it inline, as a named helper that is only a timed promise is flagged too.
- **e2e: no `page.waitForTimeout`.** Use a web-first `expect`, `expect.poll` on
  the real condition, or `page.waitForResponse`.

What to wait on instead:

- The outcome itself: `findBy*`, or `waitFor` on the state you assert.
- Timer-driven code (a debounce, a hover delay): fake timers and
  `vi.advanceTimersByTime(THE_DELAY_CONSTANT)`. Where Dexie (fake-indexeddb) is
  in play, fake only `setTimeout`/`clearTimeout` with `shouldAdvanceTime: true`,
  or its own scheduling deadlocks.
- A promise you control: `deferred()` (`src/test/deferred.ts`), settled inside
  `await act(async () => d.resolve(x))`.
- A spied module function: `vi.mock(path, importOriginal)` wrapping it in
  `vi.fn(actual.fn)`, then `waitFor(() => expect(fn).toHaveResolvedTimes(fn.mock.calls.length))`.
- **Asserting absence ("renders nothing", "never calls X")**: first wait for a
  positive signal that the work finished, then assert. For a live query, render
  a control beside the subject that reads the same table and does show, wait for
  it, then assert the subject is empty (`GrantNote.test.tsx`). An effect that
  bails out synchronously needs no wait at all: its render's `act` already ran it.

A sleep that is genuinely the only option (a real timer the code races and
fake timers deadlock, or Node's unhandled-rejection turn) takes an
`eslint-disable-next-line no-restricted-syntax -- <reason>` on that line. Keep
those rare; grep for the existing ones before adding another.

## Running the app against the Firebase emulators (local only)

CI doesn't deploy Cloud Functions or rules, and agents can't deploy to prod, so
anything that needs a callable or a rules change (the Corp Tax Book, epic
#4055) is checked in a browser against local emulators instead. Nothing here
touches a real Firebase project: the project id is `demo-neocom-desk`.

1. **Java.** The Firestore emulator is a JAR, so a JRE (11+, 21 is fine) must be
   on `PATH`. WSL/Ubuntu: `sudo apt install openjdk-21-jre-headless`. Without
   root, unpack a portable Temurin JRE and prepend its `bin/` to `PATH` for the
   shell that runs the emulators and the seed.
2. **Flag.** Add `VITE_FIREBASE_EMULATORS=1` to `.env.local` and restart
   `npm run dev`. `src/sync/firebaseApp.ts` then connects Auth (9099), Firestore
   lite (8080) and Functions (5001), the ports in `firebase.json`, and uses the
   project id `demo-neocom-desk` instead of `VITE_FIREBASE_PROJECT_ID` (data and
   function URLs are namespaced by it). It is off by
   default and also requires `import.meta.env.DEV`, so a production build never
   connects to an emulator (`src/sync/firebaseApp.test.ts` pins both).
3. **Emulators.** `npm run emulators` builds `functions/` and starts
   `auth,firestore,functions`. It passes `EVE_CLIENT_ID` through from the
   environment, else from `VITE_EVE_CLIENT_ID` in `.env.local`/`.env`: the
   emulator's function discovery doesn't read `functions/.env`. `mintFirebaseToken`
   still verifies your EVE access token against CCP SSO (real network), then
   signs the custom token through the Auth emulator, so sign in with EVE as usual.
4. **Seed.** With the emulators up:
   `npm run emulators:seed -- --corp <corporationId> --corp-name "<name>" --officer <characterId> --member <characterId> [--guest <characterId>] [--owner-hash <hash>] [--port <vite port>]`.
   It wipes the Firestore emulator and writes a sample book (settings, officer
   access, Observed Mining Entries, Extractions in every state, matched /
   Unmatched / not-tax / manual Tax Payments, a dismissal, a declaration and an
   issued notice for unpaid days, with its verify token) in the schema of
   `functions/src/corpTaxBookStore.ts`, then prints the verify URL. The officer
   record carries `--owner-hash`; the Firestore rules compare it to the signed-in
   token's `ownerHash` claim. The seeded value is a placeholder, and opening
   `/corp/moons` as a real officer of that corporation rewrites the record with
   your real hash through `verifyCorpOfficerCallable`. The live role check reads real ESI, so use your real corporation id for `--corp` when you want that route. Otherwise pass your own
   (the `ownerHash` claim of your signed-in ID token). The member and guest
   Characters see their own lines on the personal tab; the verify page needs no
   sign-in.

Without a real EVE login (a fake officer, mocked SSO/ESI, a larger seed of six refineries and
fifteen miners), use the `manual-testing` skill: `.claude/skills/manual-testing/SKILL.md`.

**Corp Tax Book browser tests** (`e2e/*.book.spec.ts`) run the officer pages, the verify page
and the member tab against these emulators, with the real callables and rules. The main suite
and its CI shards skip them; they have their own config and CI job.

- **Locally:** `npx playwright test -c playwright.book.config.ts e2e/<file>.book.spec.ts`, one
  file at a time like any e2e spec. Needs a JRE and `npm ci --prefix functions`. The config
  starts everything: `scripts/e2e-book/emulators.mjs` builds `functions/` and starts the
  emulators (a fresh per-run key signs fake EVE tokens; `ccpStub.mjs`, loaded into the Functions
  runtime, answers SSO's key set and ESI's who-is-who), and a Vite dev server on 5197 points at
  them. A global warm-up (`e2e/support/taxBook/warmUp.ts`) signs the officer in and opens the
  book's pages once, so no test pays the cold start (Vite's first compile, the Functions
  emulator loading each function), and the emulators stop on SIGINT at the end.
  **A run never reuses a server already up**, locally included: the ports (8080, 9099, 5001, 5197) are fixed and shared by every worktree on the machine, so a server already up may be
  another worktree's, serving its code. Such a run fails at once ("is already used"): wait for
  the other worktree's run to end, or stop your own servers, `npm run emulators` too. Run one
  book spec file at a time, `--workers=1`. If your Playwright browser build is not the pinned one, point
  `launchOptions.executablePath` at yours in an uncommitted wrapper config; never commit it.
- **In CI:** the `e2e-book` job in `ci.yml`, one runner in the Playwright container (the pinned
  browser) with Java added, ~5 minutes in all. It runs from the dev server, not `build`'s
  `dist/`: the app reaches the emulators only in a dev build (`emulatorsOn`). It is gated by
  `needsBookE2e` (`scripts/lib/e2eRelevance.mjs`), which unlike the e2e shards' gate runs it for
  `functions/`, the rules and the emulator config, and it reports through the required `e2e`
  check. Its report uploads as `playwright-report-book` on failure.
- **Writing one:** one worker, so each test wipes the emulator and seeds its own book
  (`e2e/support/taxBook`: `BookSeed` writes the server's layout with flat prices, so one mined
  day owes exactly 1,000,000; `bookScenarios.ts` holds the books specs share; `memberSeed.ts` the
  member side's). Assert what the page shows, and read the emulator (`readDoc`) only for what a
  server write leaves behind.

**Known emulator noise.** The Firestore emulator logs `Cannot find field:
structuredQuery in message Document` when a query runs under a parent document
whose id has a colon (`characters/char:<id>`). Its REST adapter mis-routes
`:runQuery` for such ids (`abc` works; `char:1` and percent-encoded forms
fail). It is not an index problem and does not happen in production. Firestore
lite is REST-only, so no tooling-side fix exists; ignore it.
