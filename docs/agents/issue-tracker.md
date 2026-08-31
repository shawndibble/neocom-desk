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

## PRs as a request surface

**No.** External PRs are not triaged as feature requests. (Set to `yes` here if that changes.)

## When a skill says "publish to the issue tracker"

Create a GitHub issue.

## When a skill says "fetch the relevant ticket"

`gh issue view <number> --comments`.

## CI and merge

- On every PR to `main`, `.github/workflows/ci.yml` runs a `validate` job (`lint`, `format:check`, `typecheck`, `test:run`, `build`) and an `e2e` job (Playwright). Watch with `gh pr checks <pr> --watch`.
- `main` has no branch protection: a merge is not blocked by red checks, so any automation must enforce "green before merge" itself.
- Merging to `main` triggers the `deploy` job → GitHub Pages (production).
- Squash-merge with `Closes #<n>` in the PR body auto-closes the issue.
