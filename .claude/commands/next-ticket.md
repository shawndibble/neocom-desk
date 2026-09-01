---
description: Pick the next unblocked ready-for-agent issue, work it in an isolated git worktree, open a PR, drive CI green, then squash-merge and close.
argument-hint: '[issue number] (optional — otherwise auto-picks the next unblocked ticket)'
allowed-tools: Bash, Read, Write, Edit, Glob, Grep, Skill, Agent, Task, TodoWrite, WebFetch, WebSearch
---

You are running one iteration of the autonomous ticket loop for **NeoCom Desk**
(`shawndibble/neocom-desk`). Do exactly one ticket, end to end, then stop.

**This run is safe to execute concurrently with other `/next-ticket` runs on the
same machine.** It never touches the checkout it's invoked from — it fetches
`main`, then does all its work in its own `git worktree`. Ticket selection and
claiming are serialized through a local lock so two concurrent runs can't grab
the same ticket.

Tracker conventions: `docs/agents/issue-tracker.md`. Domain: `CONTEXT.md`,
`docs/adr/`. Coding rules: `CLAUDE.md`.

If `$ARGUMENTS` contains an issue number, use that issue instead of auto-picking
in step 2 (still run every check against it — unblocked, unassigned, no
`in-progress` label; if it fails any, report that and stop).

## Token discipline (applies to every step)

A run costs roughly **turns x context size**: the whole conversation is re-sent
on every turn, so a call made late in a long run costs far more than the same
call made early. A recent 315-turn run spent 58M tokens to produce 75k tokens
of actual tool output. Context, not reading, is the expense.

- **Use the scripts in `scripts/next-ticket/` for every mechanical step below**
  (selection, worktree setup, the gate, sync-with-main, PR creation, CI
  driving, CI-failure fetch, merge/cleanup). Each one replaces a multi-call
  sequence with a single Bash call and prints one line of JSON — read that
  JSON, don't re-derive what it already tells you. Measured across 58 real
  runs, models did not reliably batch independent tool calls even with
  explicit prose telling them to (0/58 batched); these scripts remove the
  choice instead of asking for it again.
- **Edit each file once.** Collect every change you intend to make to a file,
  then apply them in a single Edit (or one Write for a rewrite). Nine small
  edits to one file cost nine full context re-reads.
- **Delegate read-heavy phases to sub-agents** (steps 4, 5 and 8 say where). A
  sub-agent reads in its own fresh context and returns only a summary; the
  same work done inline sits in this context for every remaining turn.
  Delegate anything over ~10 turns of reading — below that the sub-agent's own
  startup costs more than it saves.
- **Do not narrate.** Short status lines only; your own output accumulates
  into the context too.

Measured on real runs (2026-09-01, 51 post-batching-fix runs): the mechanical
steps below (1, 2, 3, 7, 9) average well under a minute combined. Step 5
(implement) averages ~28 of an average ~31-minute run. The scripts here cut
token cost and make selection/setup deterministic; they are not primarily a
wall-clock fix — step 5 is where a run's time actually goes.

## Abandon procedure (referenced by later steps)

Whenever a step below says "abandon": release the claim
(`gh issue edit <n> --remove-assignee @me --remove-label in-progress`), `cd`
back to the main checkout, `git worktree remove "$WORKTREE_PATH" --force`,
`git worktree prune`, then stop per that step's instructions (report and
STOP, or continue to pick a different ticket, as stated).

## Resilience: merge conflicts and failing tests

Both failure classes below are expected, not exceptional — concurrent
`/next-ticket` runs (or a human) can land on `main` while this one is still
working, and a gate can fail mid-implementation. Neither should kill the run;
both procedures are bounded, so if a bound is exceeded the run abandons
cleanly per the procedure above instead of looping unboundedly.

### Sync-with-main / conflict resolution procedure

Referenced by steps 6 and 8 whenever the branch is behind `main` or a PR
reports `mergeStateStatus: CONFLICTING`/`DIRTY`. Up to **3 attempts**:

1. `node scripts/next-ticket/sync-main.mjs` — fetches and merges
   `origin/main`. Prints `{"status":"already-up-to-date"}`,
   `{"status":"merged"}`, or `{"status":"conflict","files":[...]}`.
2. On `already-up-to-date` or `merged`: skip to step 4.
3. On `conflict`: invoke the `resolving-merge-conflicts` skill to resolve
   the listed files in place — it resolves and commits; never
   `git merge --abort`.
4. Re-run the gate (`node scripts/next-ticket/gate.mjs --build`) against the
   merged tree. If it fails, follow the local gate failure procedure below.
5. If the merge left anything uncommitted, commit it.

If a 3rd attempt still leaves conflicts (main moving faster than this run can
converge — very unlikely), abandon and report that `main` would not settle.

### Local gate failure procedure

Referenced by step 6, and by step 8 whenever a post-merge re-check is needed.
Up to **5 rounds**:

1. Read the failing command's output directly from the gate script's JSON
   (`output.<check-name>`) — it's local, not a CI log, so no sub-agent is
   needed here.
2. Fix the actual cause: code or test, whichever is wrong. Never delete,
   skip, or loosen a test just to make it pass.
3. If a failure looks pre-existing and unrelated to this ticket's diff (e.g.
   a flaky or environment-dependent test), confirm before ignoring it: `git
stash`, run just that one check, `git stash pop`. If it fails identically
   without this ticket's changes, note it in the PR's Review notes instead of
   trying to fix it.
4. Re-run `node scripts/next-ticket/gate.mjs` (no `--build` — that only needs
   to run once the rest is green, as the final check before step 7 or before
   pushing a step 8 fix).

If still failing after 5 rounds: comment on the issue with a precise summary
of the remaining failure, then abandon per the procedure above.

## 1. Prepare

- `gh auth status` must succeed. If not, stop and report.
- `git fetch origin main:main` — updates the local `main` ref to match
  `origin/main` (fast-forward only). This does **not** touch whatever branch
  is currently checked out here, so it's safe to run from any worktree,
  including one already mid-ticket.
- `git worktree prune` — clears references to worktrees whose directories were
  already deleted (e.g. by a crashed prior run).

Run these as one chained Bash call.

## 2. Pick and claim the ticket (lock-protected)

`node scripts/next-ticket/select-ticket.mjs [issue-number]` does the whole
of this step in one call: acquires a local lock shared by every worktree
(they share one `.git`, so concurrent runs can't select the same ticket),
lists `ready-for-agent` issues, drops any with an assignee or an
`in-progress` label, resolves each remaining issue's `## Blocked by` section
(unblocked only if every referenced issue is `CLOSED`), picks the
lowest-numbered unblocked one (or checks the given issue number against the
same rules, if `$ARGUMENTS` has one), claims it
(`--add-assignee @me --add-label in-progress`), and releases the lock. It
retries lock acquisition internally (12 attempts over ~2 minutes, reclaiming
a lock older than 90s as crashed) — that whole wait, if it happens, is inside
this one call.

It prints one line of JSON on stdout:

- `{"status":"claimed","number":<n>,"title":"...","slug":"..."}` → proceed.
- `{"status":"no-ticket"}` → report "no unblocked ready-for-agent tickets"
  and **STOP**.
- `{"status":"lock-timeout"}` → report the lock could not be acquired and
  **STOP** with `RESULT ticket=none pr=none status=blocked`.
- `{"status":"override-unavailable","reason":"not-found|assigned-or-in-progress|blocked"}`
  (only when `$ARGUMENTS` gave an issue number) → report the reason and
  **STOP**.

## 3. Create the worktree

`node scripts/next-ticket/setup-worktree.mjs <n> <slug>` does the rest of
this step in one call: removes a stale worktree dir at the target path if one
exists, `git worktree add`s a new one on branch `claude/<n>-<slug>` off
`main`, copies `.env` from the checkout this session started in (gitignored,
per-directory — the worktree won't have it otherwise) if that file exists
there, and runs `npm ci` inside the new worktree.

It prints `{"status":"ready","worktreePath":"...","branch":"..."}` or
`{"status":"error","step":"worktree-add|npm-ci","message":"..."}`.

- On `ready`: `cd "$WORKTREE_PATH"` (the path from the JSON).
- On `error`: abandon per the procedure above, report the failure, and
  **STOP**.

**Everything from here on runs inside `$WORKTREE_PATH`.**

## 4. Revalidate — `/triage <n>` (revalidation mode)

Run this in a **sub-agent** (`Agent`, `subagent_type: general-purpose`). It
reads the full issue and its comments, `.out-of-scope/*.md`, and searches the
codebase for an existing implementation — all of which would otherwise sit in
this context for the rest of the run.

Instruct the sub-agent to invoke the `triage` skill in revalidation mode (see
its "Revalidation mode" section: redundancy check and prior-rejection check
only — no grilling, no inventing answers), to apply any outcome itself, and to
report back a single line: `PROCEED`, or the outcome it applied
(`wontfix` / `needs-info` / `ready-for-human`) with a one-line reason.

- If triage closes the ticket as `wontfix` (already implemented / prior
  rejection), or hands it back as `needs-info` / `ready-for-human`: it has
  already commented and unassigned — also strip the `in-progress` label
  (`gh issue edit <n> --remove-label in-progress`), then abandon the worktree
  (skip the assignee/label removal in the abandon procedure — already done)
  and **STOP**.
- Otherwise continue.

## 5. Implement — `/implement <n>`

Invoke the `implement` skill against issue `<n>`. It drives `/tdd` at the
seams, runs `/code-review`, and commits to the current branch. During
implementation, confirm the ticket still matches the codebase; if a detail is
stale, adjust to the ticket's **intent** and note the deviation in the PR body.
Use WebFetch / WebSearch for external API facts (ESI, Fuzzwork) if needed.

This is the longest phase, so the token discipline above matters most here:
batch the exploration reads, and make one edit per file rather than a stream of
small ones. `/code-review` runs its two axes as parallel sub-agents — do not
run them inline.

## 6. Sync with main, then the local gate (mirror CI)

`main` may have moved since step 3 (another `/next-ticket` run or a human
merge) — catch that now rather than at PR-merge time. Run the sync-with-main
procedure above once, unconditionally, before the gate.

Then run `node scripts/next-ticket/gate.mjs --build`. It runs
`format:check`, `lint`, `typecheck`, and `test:run` concurrently (they're
independent — this is faster than the old sequential `&&` chain, and one
Bash call either way), then `build` if the rest passed. It prints
`{"status":"pass"}` or
`{"status":"fail","failed":["lint", ...],"output":{"lint":"...tail...", ...}}`
(each failed check's output, truncated to its last ~4000 characters — read
`output.<check-name>` directly rather than re-running the check yourself).

If it fails, follow the local gate failure procedure above (bounded to 5
rounds) rather than looping freely. `npm run format` auto-fixes formatting.

Do **not** run `npm run test:e2e` locally — one spec
(`e2e/plans.spec.ts` clipboard export) fails only on Windows due to a clipboard
round-trip quirk; CI runs e2e on Linux where it passes. If you genuinely changed
export/clipboard behaviour, reason about e2e impact from the spec instead.

## 7. Open the PR

- Ensure everything is committed. Conventional Commit subject; body ends with
  `Closes #<n>`.
- Write the PR body to a scratch file (what changed and why, `Closes #<n>`,
  any deviations from the ticket, and a "Review notes" section for
  unaddressed judgement-call findings from `/code-review`).
- `node scripts/next-ticket/open-pr.mjs "<type>: <summary> (#<n>)" <body-file>`
  — pushes the branch (`-u origin HEAD`), creates the PR against `main`, and
  arms auto-merge (`gh pr merge --squash --auto --delete-branch`) so GitHub
  squash-merges it itself the instant it's mergeable and green — no need to
  win a manual race in step 9, and a check-watch hiccup in step 8 can't
  strand an otherwise-green PR. Prints
  `{"status":"open","number":<pr>,"url":"...","autoMergeArmed":true}` or
  `{"status":"error","message":"..."}`. On `error`, follow the local gate /
  abandon procedures as appropriate to the failure. If `autoMergeArmed` is
  `false`, note it and continue — step 9 still merges directly as a fallback.

## 8. Drive to a mergeable, green PR

Loop up to **5 rounds** (this budget is shared across both triggers below —
it is not 5 conflict rounds plus 5 CI rounds):

- `node scripts/next-ticket/drive-ci.mjs <pr>` — checks mergeability, and if
  clean, blocks on `gh pr checks --watch` until `validate` + `e2e` finish
  (this is the CI runtime itself, not overhead — nothing to speed up here).
  Prints one of:
  - `{"status":"conflict"}` — follow the sync-with-main / conflict resolution
    procedure above (it includes the gate re-run and commit), push, and
    restart this round.
  - `{"status":"green","mergeable":true}` — proceed to step 9.
  - `{"status":"checks-failed","failedRunIds":[<run-id>, ...]}` — for each
    id, within the same round budget:
    1. Diagnose in a **sub-agent** — CI logs run to tens of thousands of
       tokens and you only need the conclusion. Give it the run id and have
       it run `node scripts/next-ticket/fetch-ci-failure.mjs <run-id>` (one
       call gets the filtered failed-step log, plus a note if the failing
       job looks like `e2e` so it knows to also `gh run download <run-id> -n
playwright-report`), then report back: the failing job and test, the
       error message, the `file:line`, and its best read of the cause. Never
       pull raw CI logs into this context. On rounds 2+, tell it what
       previous rounds already tried — each sub-agent starts fresh and will
       otherwise re-propose a fix you have already ruled out.
    2. Fix it on the branch from that report (code or test, whichever is
       actually wrong — do not delete a failing test to make it pass).
    3. Re-run the gate (`node scripts/next-ticket/gate.mjs --build`), commit,
       `git push`.
    4. Restart this round (`drive-ci.mjs` again against the new commit).
- If still not both mergeable and green after 5 rounds: comment on the PR
  **and** the issue with a precise summary of the remaining failure, leave the
  PR open, abandon per the procedure above (this removes the claim so a
  human — or a future run, once someone fixes the blocker — can pick it back
  up), and **STOP**.

## 9. Merge, close, and clean up

`cd` back to the checkout this session started in (not the worktree — this
script removes it), then:

`node scripts/next-ticket/finish.mjs <pr> <n> "$WORKTREE_PATH"` —
squash-merges and deletes the branch (a no-op if auto-merge, armed in step 7,
already merged it — the script detects `state == MERGED` and treats that as
success rather than a failure), polls the issue for auto-close (the squash
commit carries `Closes #<n>`; closes it directly if auto-close hasn't landed
after a few seconds), strips the `in-progress` label, then removes and prunes
the worktree. Prints `{"status":"merged","issueClosed":true}` or
`{"status":"merge-failed","message":"..."}`.

- On `merge-failed`: this can be a last-second race (something merged to
  `main` between step 8's check and now) — re-run
  `node scripts/next-ticket/drive-ci.mjs <pr>` once more; if it now reports
  `conflict`, handle it per step 8 and retry `finish.mjs`. If it still won't
  merge, abandon per the procedure above.
- Note in your final report: merging to `main` triggered the `deploy` job
  (GitHub Pages).

## 10. Report

One tight summary: ticket number + title, PR URL, what was built, CI rounds
needed, merge status, and whether the issue closed.

End your final message with exactly one machine-parseable line, so a wrapper
script can extract it — nothing after it:

```
RESULT ticket=#<n> pr=<pr-url|none> status=<merged|blocked|no-ticket>
```

- `no-ticket` — step 2 found nothing unblocked (`ticket=none pr=none`).
- `blocked` — step 4 handed the ticket back, step 3's worktree setup failed, or
  step 8 gave up after 5 rounds (`pr=none` if no PR was opened, otherwise the
  PR URL).
- `merged` — step 9 completed.

Then stop — do not pick up another ticket this run.
