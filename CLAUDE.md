# Neocom Desk — agent instructions

- **All work happens in a git worktree, never in this main checkout.** The
  main repo directory (`C:/Users/shawn/OneDrive/Documents/GitHub/neocom-desk`)
  is reserved for manually running/testing the app in a browser (`npm run
dev`) — Shawn frequently has another agent working there at the same
  time, and editing it races with that. Branch into a sibling worktree
  first: `git worktree add ../neocom-desk.worktrees/<name> -b <branch> origin/develop` (or
  `../neocom-desk-<short-name>`), then `npm ci` inside it — `node_modules`
  isn't shared across worktrees. `scripts/next-ticket/setup-worktree.mjs`
  does this automatically for the ticket loop. For cleanup or admin git
  commands that must target the main repo, use `git -C <main-repo-path>
...` rather than `cd`, so the other agent's working tree isn't disturbed.
- **Branches: PRs target `develop`; `main` is production.** Never open a PR against
  `main` or push to it except the `develop` → `main` promotion (merge commit, not
  squash), which is what deploys. Branch worktrees off `origin/develop`. See
  `docs/agents/issue-tracker.md` "CI and merge". Every merge to `develop` ships to
  `https://dev.neocomdesk.com` (its own EVE app and client ID); Cloud Functions are
  not auto-deployed, so a new client ID also goes in `functions/.env`'s `EVE_CLIENT_ID`.
  Dev and production share one Firebase project and its data, so Firestore changes from
  `develop` stay additive and backward-compatible (docs/context/decisions/).
- Architecture map: docs/ARCHITECTURE.md — read before locating or adding features.
- `GLOSSARY.md` is the glossary. Use its terms exactly. Don't read it whole: `grep -n -i "<term>" GLOSSARY.md` for the terms in your task.
- **Never append a scope decision to `GLOSSARY.md`.** Scope decisions live one
  per file in `docs/context/decisions/`, named `YYYYMMDD-HHMMSS-<slug>.md`.
  Create one with `node scripts/new-decision.mjs "<title>" [--issue <n>]`.
  Never number these files and never work out "the next" number for anything —
  parallel `/next-ticket` agents all claim the same number, and appending to
  one shared file conflicted on nearly every merge, which is exactly what this
  layout removes. Genuinely new vocabulary still goes in `GLOSSARY.md`'s
  glossary. See `docs/context/decisions/README.md`.
- **UI work follows `docs/DESIGN.md`.** Read it before building a new page,
  rewriting one, or adding a component or interactive element: tokens,
  the `src/components/ui` primitives to compose, and §6c's interaction
  grammar (how a link, tooltip, menu, row or gesture looks, and what it
  does). Use the cue §6c assigns to the intent; if §6c has none, add it there
  in the same PR. §6c's restraint rules apply before adding any control: if the
  row click, a link or the detail view already carries the action, add nothing.
  Decisions: `docs/adr/`. **Before building or changing UI, look components
  up: `npm run ui:catalog` (list) or `npm run ui:catalog <Name>` (props, story
  ids).** Never re-implement a primitive that exists. A new
  `src/components/ui` primitive ships with a `<Component>.stories.tsx`. Mockups
  are stories, not hand-written HTML: `docs/design/mockups/README.md`.
- TDD for all calculation/logic modules (`src/engine`, `src/auth`, industry
  math): failing test first, then code.
- Pure engines stay pure: no fetch/DOM/Dexie imports in `src/engine`.
- ESI calls always send `X-Compatibility-Date` and a descriptive
  `X-User-Agent`; respect `X-Ratelimit-*` and `Retry-After`.
- Refresh tokens live in Dexie only. The one exception is the opt-in Alerts
  Grant (ADR 0020): its notifications-only refresh token is handed to the
  `saveAlertGrant` callable. Never send any other refresh token to Firebase,
  and never log any.
- **Never run the full suite (`npm run test:run`) or `npm run build` locally.** CI is
  the gate. While iterating: `npm run typecheck` and `npx vitest run <file>` for
  the files you touched, never a whole directory. `/code-review` sub-agents are
  read-only and must never run tests, lint, typecheck or build.
- A pre-commit hook (husky + lint-staged) lints/formats staged files and
  typechecks, but only once installed — run `npm run verify-hooks -- --fix`
  after any fresh clone or `npm ci` (`prepare` is skipped when
  `ignore-scripts` is set). Worktree setup does this for you.
- **Run at most three agents at once**, each running only the test files it
  touched. Run an e2e spec locally only when changing it, one file at a time.
- **A flaky CI test never holds up your PR, and is never left unfixed.** If an
  unrelated test fails CI, confirm it's unrelated (`npx vitest run <path>`),
  rerun the failed job, merge your PR, then **immediately** fix the flake as its
  own separate branch and PR, before picking up any other work. A flake your
  change caused, or in a file your PR touches, is fixed in your PR.
- **Tests stay under 10 seconds each.** Make a slow test faster; never raise
  `testTimeout` or add a per-test timeout.
- Full detail and rationale for the rules above: `docs/agents/testing-and-ci.md`.
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

Single-context: root `GLOSSARY.md` (glossary) + `docs/context/decisions/`
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
