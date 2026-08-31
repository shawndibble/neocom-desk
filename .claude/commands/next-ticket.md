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

- **Batch independent tool calls into one message.** Do not spend a turn on a
  lone `git status` when you already know the next two calls. Issue
  independent reads, `gh` queries, and searches together.
- **Chain shell commands that always run together.** The step 6 gate is one
  Bash call, not five.
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

## Abandon procedure (referenced by later steps)

Whenever a step below says "abandon": release the claim
(`gh issue edit <n> --remove-assignee @me --remove-label in-progress`), `cd`
back to the main checkout, `git worktree remove "$WORKTREE_PATH" --force`,
`git worktree prune`, then stop per that step's instructions (report and
STOP, or continue to pick a different ticket, as stated).

## 1. Prepare

- `gh auth status` must succeed. If not, stop and report.
- `git fetch origin main:main` — updates the local `main` ref to match
  `origin/main` (fast-forward only). This does **not** touch whatever branch
  is currently checked out here, so it's safe to run from any worktree,
  including one already mid-ticket.
- `git worktree prune` — clears references to worktrees whose directories were
  already deleted (e.g. by a crashed prior run).

## 2. Pick and claim the ticket (lock-protected)

Concurrent runs must not select the same ticket. Serialize selection with a
local lock shared by every worktree (they share one `.git`):

```
LOCK_DIR="$(git rev-parse --git-common-dir)/next-ticket.lock"
```

Acquire it before listing issues. **Each attempt is its own Bash tool call —
never a shell-level `for`/`while` retry loop.** A multi-minute wait folded into
one Bash call is invisible to anyone watching the run (nothing prints until
that one call returns); one call per attempt keeps the run observable and lets
you say a line like "lock held, waiting" between tries.

- Attempt: `mkdir "$LOCK_DIR"` (atomic — fails if it already exists).
  - On success: `date +%s > "$LOCK_DIR/owner"`, proceed to list issues below.
  - On failure: read `$LOCK_DIR/owner`. If it's older than **90s**, the
    holder almost certainly crashed without releasing it (a normal
    select-and-claim critical section is a handful of `gh` calls, seconds not
    minutes) — `rm -rf "$LOCK_DIR"` and retry immediately.
  - Otherwise: report "lock held, waiting", `sleep 10`, and retry.
- After **12 attempts** (~2 minutes of real waiting — comfortably longer than
  it ever takes to either finish a legitimate claim or age past the 90s
  staleness bar) with no success: release nothing (never held it), report
  that the lock could not be acquired, and **STOP** with
  `RESULT ticket=none pr=none status=blocked`.

While holding the lock:

- `gh issue list --label ready-for-agent --state open --json number,title,body,assignees,labels --jq 'sort_by(.number)'`
- Drop any issue that has an assignee **or** already carries the
  `in-progress` label (claimed by another run, human or automated).
- For each remaining issue, read its `## Blocked by` section:
  - "None" / "None — can start immediately" → unblocked.
  - Otherwise, for every `#<n>` it lists, run `gh issue view <n> --json state`.
    The ticket is unblocked only if **every** referenced issue is `CLOSED`.
- Pick the **lowest-numbered** unblocked, unclaimed ticket (or the
  `$ARGUMENTS` issue if one was given, after the same checks).
- **If none qualify:** release the lock (`rmdir "$LOCK_DIR"`), report "no
  unblocked ready-for-agent tickets", and **STOP**.
- Otherwise, immediately claim it: `gh issue edit <n> --add-assignee @me --add-label in-progress`.

Release the lock (`rmdir "$LOCK_DIR"`) as soon as the claim above lands — do
**not** hold it through implementation. Other runs can now select the next
ticket while this one proceeds.

## 3. Create the worktree

- `SLUG=<short-kebab-slug-from-issue-title>`
- `WORKTREE_ROOT="$(dirname "$(git rev-parse --show-toplevel)")/neocom-desk.worktrees"`
- `WORKTREE_PATH="$WORKTREE_ROOT/<n>-$SLUG"`
- If `$WORKTREE_PATH` already exists (stale leftover), `rm -rf` it first.
- `git worktree add "$WORKTREE_PATH" -b claude/<n>-$SLUG main`
- Copy local dev config the worktree won't have (gitignored, per-directory):
  `cp .env "$WORKTREE_PATH/.env"` from the checkout this session started in,
  if that file exists there.
- `cd "$WORKTREE_PATH"`, then `npm ci` (fast — reuses the shared npm cache).

**Everything from here on runs inside `$WORKTREE_PATH`.** If this step fails
(worktree add or `npm ci` errors), abandon per the procedure above, report the
failure, and **STOP**.

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

## 6. Local gate (mirror CI)

Run the gate as **one Bash call** — these always run together, and five
separate calls cost five full context re-reads:

```
npm run format:check && npm run lint && npm run typecheck && npm run test:run && npm run build
```

`&&` stops at the first failure, which is the one you need to see. Fix it, then
re-run the whole chain. `npm run format` auto-fixes formatting.

Do **not** run `npm run test:e2e` locally — one spec
(`e2e/plans.spec.ts` clipboard export) fails only on Windows due to a clipboard
round-trip quirk; CI runs e2e on Linux where it passes. If you genuinely changed
export/clipboard behaviour, reason about e2e impact from the spec instead.

## 7. Open the PR

- Ensure everything is committed. Conventional Commit subject; body ends with
  `Closes #<n>`.
- `git push -u origin HEAD`
- `gh pr create --base main --title "<type>: <summary> (#<n>)" --body "<body>"`
  - Body: what changed and why, `Closes #<n>`, any deviations from the ticket,
    and a "Review notes" section for unaddressed judgement-call findings from
    `/code-review`.

## 8. Drive CI green

- `gh pr checks <pr> --watch --interval 30` (blocks until `validate` + `e2e`
  finish).
- **If any check fails**, up to **5 rounds**:
  1. Diagnose in a **sub-agent** — CI logs run to tens of thousands of tokens
     and you only need the conclusion. Give it the run id and have it fetch
     `gh run view <run-id> --log-failed` (and, for an `e2e` failure,
     `gh run download <run-id> -n playwright-report -D /tmp/pw-report`), then
     report back: the failing job and test, the error message, the
     `file:line`, and its best read of the cause. Never pull raw CI logs into
     this context.
  2. Fix it on the branch from that report (code or test, whichever is
     actually wrong — do not delete a failing test to make it pass).
  3. Re-run the local gate (step 6), commit, `git push`.
  4. `gh pr checks <pr> --watch --interval 30` again.
- If still red after 5 rounds: comment on the PR **and** the issue with a
  precise summary of the remaining failure, leave the PR open, abandon per the
  procedure above (this removes the claim so a human — or a future run, once
  someone fixes the blocker — can pick it back up), and **STOP**.

## 9. Merge, close, and clean up

- All checks green → `gh pr merge <pr> --squash --delete-branch`.
- The squash commit carries `Closes #<n>`, so the issue auto-closes on merge to
  `main`. Verify with `gh issue view <n> --json state`; if still `OPEN`, run
  `gh issue close <n> --comment "Merged in <pr-url>"`.
- Also strip the claim label if it somehow survived close:
  `gh issue edit <n> --remove-label in-progress` (ignore errors — closing
  usually leaves labels as-is, this is just cleanup).
- `cd` back to the checkout this session started in, then
  `git worktree remove "$WORKTREE_PATH" --force` and `git worktree prune`.
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
