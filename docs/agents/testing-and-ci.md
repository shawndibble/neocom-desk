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
  `@playwright/test`; that's the gate, not a local
  pre-PR run. Both sharded jobs report through a single aggregate check
  (`test`, `e2e`) because the `develop` and `main` rulesets require those exact names. The `e2e` shards are skipped (and `e2e` still reports green) when every file a PR changes is on `scripts/lib/e2eRelevance.mjs`'s safe list (docs, `functions/`, workflows other than `ci.yml`, unit tests, and the like); any other or unlisted path runs them. The four `test-shard` jobs skip the same way (and `test` still reports green) when every changed file is prose on `scripts/lib/testRelevance.mjs`'s narrower safe list (`docs/`, root and `.claude/` Markdown, `.out-of-scope/`). In ticket-loop work (`/next-ticket`, `/implement`),
  see `.claude/commands/next-ticket.md`'s "Pre-commit hook, then CI" for the
  exact cadence. `node scripts/next-ticket/gate.mjs [--build]` still exists
  as an optional, manual full-CI-mirror for ad-hoc branches — nothing in the
  ticket loop calls it automatically. `/code-review` sub-agents are
  read-only diff review and must never run tests, lint, typecheck, or build.
- **Parallel agents stay light.** Every commit already runs a full
  `typecheck` through the pre-commit hook, so a dozen agents at once push the
  machine's load past 70 and make tests time out (they flake under load, they
  don't fail for real). Run **at most three agents at once**. Each agent runs
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
- **Tests stay under 10 seconds each.** `testTimeout` is 10000 in
  `vite.config.ts`, and that is a budget to stay under, not a number to raise.
  A test that needs more is too slow: make it faster instead of adding a
  per-test timeout or a longer `findBy*` wait. Find out where the time goes
  first. The usual culprit in a route test is the worker's first cold `App`
  render (lazy route chunks, jsdom, React warm-up), which lands on whichever
  test happens to run first. Pay it once in a `beforeAll` warm-up render with
  its own hook timeout, as `src/routes/IndustryPlanPage.test.tsx` does.
- **Bumping the dogma engine or SDE: run the reference fits.** Bump
  `@eveshipfit/dogma-engine` and `@eveshipfit/sde` together (ADR 0016), then run
  `npx vitest run src/features/fittings/dogmaFittingEngine.reference.integration.test.ts`.
  It pins eight standard All V fits (Drake, Hurricane, Omen, Vexor, Myrmidon,
  Hulk, Guardian, Tengu), each value with its source beside it. A value that
  moves must be justified in the PR from the engine or SDE change that caused
  it. Never re-pin blind. A bug the suite reveals is filed, and today's value
  stays pinned with a `TODO(#issue)`.

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
   issued, unpaid Statement with its verify token) in the schema of
   `functions/src/corpTaxBookStore.ts`, then prints the verify URL. The officer
   record carries `--owner-hash`; the Firestore rules compare it to the signed-in
   token's `ownerHash` claim. The seeded value is a placeholder, and opening
   `/corp/moons` as a real officer of that corporation rewrites the record with
   your real hash through `verifyCorpOfficerCallable`. The live role check reads real ESI, so use your real corporation id for `--corp` when you want that route. Otherwise pass your own
   (the `ownerHash` claim of your signed-in ID token). The member and guest
   Characters see their own lines on the personal tab; the verify page needs no
   sign-in.

**Known emulator noise.** The Firestore emulator logs `Cannot find field:
structuredQuery in message Document` when a query runs under a parent document
whose id has a colon (`characters/char:<id>`). Its REST adapter mis-routes
`:runQuery` for such ids (`abc` works; `char:1` and percent-encoded forms
fail). It is not an index problem and does not happen in production. Firestore
lite is REST-only, so no tooling-side fix exists; ignore it.
