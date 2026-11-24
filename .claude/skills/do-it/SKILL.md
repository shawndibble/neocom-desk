---
name: do-it
description: 'Finish the work in the current session end to end: implement (if anything is still unbuilt), commit, run the four-axis /code-review, fix findings, then push, open the PR and arm auto-merge. Use when the work is not coming from a /next-ticket ticket, e.g. you have been working in a session and want it shipped as a PR.'
---

Take the work in this session from "done-ish" to "PR open". It is the non-ticket
sibling of `/next-ticket` steps 5-7: same review, same PR script, no claim lock,
no triage, no CI-driving loop (the user can type `/ship` or `/steward` to watch
the PR; never invoke them yourself).

If the source is an issue labelled `hold-for-review`, stop and use `/next-ticket`
instead: `/do-it` has no hold mode and would arm auto-merge.

## Preconditions

- Be in a worktree on a feature branch, never the main checkout and never
  `develop` or `main` (see `CLAUDE.md`). If not, create one first:
  `git worktree add ../neocom-desk.worktrees/<name> -b <branch> origin/develop`,
  then `npm ci` and `npm run verify-hooks -- --fix` inside it, and move the
  work over by committing it on the current branch and creating the worktree from
  that commit, or with `git diff HEAD > patch` + `git apply`. Never `git stash`:
  the stash is shared across worktrees and a parallel agent's pop can grab it.
- If the user gave a spec, issue number or description, that is the input.
  Otherwise the input is the work already in this session: do not reopen the plan.

## Steps, in order

1. **Implement, only if work remains.** Unbuilt work (a spec, an issue, a
   described change) → invoke the `implement` skill on it. It drives `/tdd`,
   runs `/code-review` and commits. `implement` ends in `/code-review` plus a commit, so that
   counts as this run's one review: skip steps 2-4 and go to step 5, and carry any
   unaddressed notes from `implement`'s review into the PR body.
   Work already written in this session → skip to step 2.
2. **Commit.** Everything on the branch committed, Conventional Commit subject.
   If an issue is the source, the body ends `Closes #<n>` (or `Part of #<n>`
   when it finishes only part of it). The pre-commit hook lints, formats and
   typechecks; fix what it rejects.
3. **Review before the PR** (only when step 1 skipped `implement`). Run `/code-review` against the merge-base with
   `origin/develop` (`git merge-base origin/develop HEAD`). It runs four
   parallel read-only sub-agents: Standards, Spec, Ponytail, Thermo-nuclear.
   With no issue the Spec axis reports "no spec available" unless the user gave
   a description; pass that description as the spec argument.
4. **Fix the findings** per `/code-review`'s "Acting on the findings". List
   what you leave for the PR body. Commit the fixes. One review pass only: do not loop the review
   until it is clean, since each round costs four sub-agents.
5. **Sync with develop.** `git fetch origin develop`; if the branch is behind,
   merge `origin/develop` in, resolving conflicts (mention non-trivial
   resolutions in Review notes: they were never reviewed), and re-run only the test files
   you touched (`npx vitest run <file>`, plus `npm run typecheck`).
6. **Open the PR.** If the branch already has one (`gh pr list --head <branch>
--json url,number`), just `git push` and run `gh pr merge --merge --auto`
   instead of the script. Otherwise write the body to a scratch file: what changed and why,
   `Closes #<n>` when there is one, and a **Review notes** section for the
   unaddressed judgement calls and suggestions. Then:
   `node scripts/next-ticket/open-pr.mjs "<type>: <summary>" <body-file>`
   It pushes, opens the PR against `develop`, and arms auto-merge (a merge
   commit, per the script). Report the
   PR URL and whether `autoMergeArmed` is true.

## Rules

- `/code-review` runs before the PR is opened, never after.
- Never run the full suite or `npm run build` locally: CI is the gate.
- Never open a PR against `main`.
- Stop at the open PR. Do not merge it yourself, and do not poll CI.
- Note for a later turn: after the PR merges (the user will say), remove the worktree and local branch.
