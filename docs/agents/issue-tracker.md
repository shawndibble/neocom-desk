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

### Stale-claim reclaim

A crashed or stalled run (process killed, or hung waiting on a step with
nobody to nudge it) never runs its own cleanup — that cleanup is prose the
model executes in its own turn loop, and none of it runs if the loop itself
never resumes. Without a backstop, such a claim blocks its ticket forever.
`scripts/next-ticket/select-ticket.mjs` sweeps for this before every
selection: any issue that is `in-progress` + assigned, idle (`updatedAt`)
for more than `NEXT_TICKET_RECLAIM_HOURS` (default 3h), and has no open PR
referencing it gets its assignee and `in-progress` label removed, with a
comment on the issue explaining why. An open PR is treated as proof the run
is (or was) alive regardless of age, since step 8's CI wait can legitimately
run long.

## PRs as a request surface

**No.** External PRs are not triaged as feature requests. (Set to `yes` here if that changes.)

## When a skill says "publish to the issue tracker"

Create a GitHub issue.

## When a skill says "fetch the relevant ticket"

`gh issue view <number> --comments`.

## CI and merge

- On every PR to `main`, `.github/workflows/ci.yml` runs a `validate` job (`lint`, `format:check`, `typecheck`, `test:run`, `build`) and an `e2e` job (Playwright). Watch with `gh pr checks <pr> --watch`.
- `main` is protected by a ruleset requiring the `validate` and `e2e` checks to pass (plus no force-push/deletion) — GitHub blocks merge on red checks itself. There is no review requirement.
- Merging to `main` triggers the `deploy` job → GitHub Pages (production).
- Squash-merge with `Closes #<n>` in the PR body auto-closes the issue.
