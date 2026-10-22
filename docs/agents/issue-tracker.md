# Issue tracker: GitHub

Issues and specs for this repo live as GitHub issues in `shawndibble/neocom-desk`. Use the `gh` CLI for all operations. `gh` infers the repo from `git remote -v` when run inside a clone.

## Conventions

- **Create an issue**: `gh issue create --title "..." --body "..."`. Use a heredoc for multi-line bodies.
- **Read an issue**: `gh issue view <number> --comments`, plus labels.
- **List issues**: `gh issue list --state open --json number,title,body,labels,assignees,comments --jq '[.[] | {number, title, body, labels: [.labels[].name], assignees: [.assignees[].login], comments: [.comments[].body]}]'` with `--label` / `--state` filters.
- **Comment**: `gh issue comment <number> --body "..."`
- **Apply / remove labels**: `gh issue edit <number> --add-label "..."` / `--remove-label "..."`
- **Claim / release**: `gh issue edit <number> --add-assignee @me` / `--remove-assignee @me`
- **Close**: `gh issue close <number> --comment "..."`

## Blocking edges

Tickets from `/to-tickets` record blockers as free text in a `## Blocked by` section of the issue body — **not** GitHub's native issue dependencies. To decide whether a ticket is unblocked:

1. Read the issue body, find the `## Blocked by` section.
2. "None" / "None — can start immediately" → unblocked.
3. Otherwise extract every `#<n>` reference and check each with `gh issue view <n> --json state`. The ticket is unblocked only when every referenced issue is `CLOSED`.

## Author guard

`/next-ticket` only picks up `ready-for-agent` issues authored by the
authenticated `gh` user (Shawn). This is enforced in
`scripts/next-ticket/select-ticket.mjs`, including when an issue number is
given explicitly. Anything else — a collaborator opening and self-labelling
an issue under their own account, for instance — is skipped even if it's
`ready-for-agent` and unblocked, so the loop never autonomously implements
and auto-merges a ticket Shawn didn't file himself (his own automation,
which authenticates as him, still counts).

## Concurrency claim

`/next-ticket` can run as several parallel processes on one machine, each in
its own `git worktree`. A ticket is **claimed** by an assignee (`@me`) _and_
the `in-progress` label — the label is the real guard, since parallel runs all
authenticate as the same `gh` user, so "assigned to me" alone can't tell two
concurrent runs apart. Ticket selection is additionally serialized by a local
lock file under the shared `.git` dir, so two runs can never select the same
ticket in the first place. Release both the assignee and the label
(`gh issue edit <n> --remove-assignee @me --remove-label in-progress`) on any
early exit so the ticket becomes pickable again.

## PRs as a request surface

**No.** External PRs are not triaged as feature requests. (Set to `yes` here if that changes.)

## When a skill says "publish to the issue tracker"

Create a GitHub issue.

## When a skill says "fetch the relevant ticket"

`gh issue view <number> --comments`.

## CI and merge

- Work branches target `develop`, the integration branch; `main` is production. On every PR to `develop` or `main`, `.github/workflows/ci.yml` runs a `validate` job (the `static` job: `check:case`, `lint`, `format:check`, `typecheck`; plus `build`, and `rules`: the Firestore rules tests and the `functions/` typecheck and tests), a `test` job (`test:run`, sharded) and an `e2e` job (Playwright, sharded). `ci.yml` is PR-only. Watch with `gh pr checks <pr> --watch`.
- `develop` and `main` are each protected by a ruleset requiring the `validate` and `e2e` checks to pass (plus no force-push/deletion) — GitHub blocks merge on red checks itself. There is no review requirement.
- A push to `develop` runs the `deploy-dev` job (in `.github/workflows/deploy.yml`) → Cloudflare Pages at `https://dev.neocomdesk.com` (the `dev` GitHub environment holds its own EVE client ID and the Cloudflare secrets). It never touches production. A push to `main` triggers the `deploy` job → GitHub Pages (production), so production ships only when `develop` is promoted: open a PR `develop` → `main` and **merge it with a merge commit, never squash** (a squash makes `develop` diverge from `main` and every later promotion conflicts). `gh pr create --base main --head develop`, then `gh pr merge --merge`.
- `Closes #<n>` only auto-closes an issue when merged into the repo's default branch; `scripts/next-ticket/finish.mjs` closes the issue itself either way.
