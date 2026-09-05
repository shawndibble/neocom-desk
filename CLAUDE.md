# NeoCom Desk — agent instructions

- Architecture map: docs/ARCHITECTURE.md — read before locating or adding features.
- Read `CONTEXT.md` first: the glossary. Use its terms exactly.
- **Never append a scope decision to `CONTEXT.md`.** Scope decisions live one
  per file in `docs/context/decisions/`, named `YYYYMMDD-HHMMSS-<slug>.md`.
  Create one with `node scripts/new-decision.mjs "<title>" [--issue <n>]`.
  Never number these files and never work out "the next" number for anything —
  parallel `/next-ticket` agents all claim the same number, and appending to
  one shared file conflicted on nearly every merge, which is exactly what this
  layout removes. Genuinely new vocabulary still goes in `CONTEXT.md`'s
  glossary. See `docs/context/decisions/README.md`.
- Design tokens/components: `docs/DESIGN.md`. Decisions: `docs/adr/`.
- TDD for all calculation/logic modules (`src/engine`, `src/auth`, industry
  math): failing test first, then code.
- Pure engines stay pure: no fetch/DOM/Dexie imports in `src/engine`.
- ESI calls always send `X-Compatibility-Date` and a descriptive
  `X-User-Agent`; respect `X-Ratelimit-*` and `Retry-After`.
- Refresh tokens live in Dexie only. Never send them to Firebase or logs.
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
  `validate` job runs `lint`, `format:check`, `typecheck`, `test:run`, and
  `build` on every push, and the `e2e` job runs Playwright; that's the gate,
  not a local pre-PR run. In ticket-loop work (`/next-ticket`, `/implement`),
  see `.claude/commands/next-ticket.md`'s "Pre-commit hook, then CI" for the
  exact cadence. `node scripts/next-ticket/gate.mjs [--build]` still exists
  as an optional, manual full-CI-mirror for ad-hoc branches — nothing in the
  ticket loop calls it automatically. `/code-review` sub-agents are
  read-only diff review and must never run tests, lint, typecheck, or build.
- i18n: all UI strings through i18next (`src/i18n/locales/en.json`). English only for now.

## Agent skills

### Issue tracker

Work is tracked as GitHub issues in `shawndibble/neocom-desk` via the `gh` CLI.
Blocking edges are free text in a `## Blocked by` section, not native GitHub
dependencies. See `docs/agents/issue-tracker.md`.

### Triage labels

Default vocabulary; label string equals the canonical role name. See
`docs/agents/triage-labels.md`.

### Domain docs

Single-context: root `CONTEXT.md` (glossary) + `docs/context/decisions/`
(scope decisions, one file each) + `docs/adr/`. See `docs/agents/domain.md`.

### Autonomous ticket loop

`/next-ticket` (`.claude/commands/next-ticket.md`) picks the next unblocked
`ready-for-agent` issue, claims it (`in-progress` label + assignee), does the
work in its own `git worktree`, opens a PR, waits for CI to go green (fixing
failures), then squash-merges, closes the issue, and removes the worktree.
Selection is lock-serialized so multiple `/next-ticket` runs are safe to fire
concurrently on one machine — see `docs/agents/issue-tracker.md`
"Concurrency claim". Run it headless in a loop, e.g.
`claude -p "/next-ticket"` on an interval, or several such loops in parallel.
Local execution copies of `triage`, `implement`, `tdd`, and `code-review` live
under `.claude/skills/` so the loop can invoke them.
