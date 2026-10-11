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
  `validate` job runs `lint`, `format:check`, `typecheck` and `build` on
  every push, the `test` job runs `test:run` across four shards, and the
  `e2e` job runs Playwright across four more; that's the gate, not a local
  pre-PR run. Both sharded jobs report through a single aggregate check
  (`test`, `e2e`) because the `main` ruleset requires those exact names. In ticket-loop work (`/next-ticket`, `/implement`),
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
- **A flaky CI test blocking your PR gets fixed, not reran or ignored — even
  when it's unrelated to your change.** Rerunning the job (or, worse, merging
  past a known-flaky check) hides the flake instead of closing it, and it
  will cost the next PR the same CI round trip. Reproduce locally
  (`npx vitest run <path>`) to tell a real regression from your change apart
  from a pre-existing flake; if it passes locally but fails intermittently in
  CI, fix the flake in the same PR before merging, even though the file
  isn't otherwise part of your diff.
- **Tests stay under 10 seconds each.** `testTimeout` is 10000 in
  `vite.config.ts`, and that is a budget to stay under, not a number to raise.
  A test that needs more is too slow: make it faster instead of adding a
  per-test timeout or a longer `findBy*` wait. Find out where the time goes
  first. The usual culprit in a route test is the worker's first cold `App`
  render (lazy route chunks, jsdom, React warm-up), which lands on whichever
  test happens to run first. Pay it once in a `beforeAll` warm-up render with
  its own hook timeout, as `src/routes/IndustryPlanPage.test.tsx` does.
