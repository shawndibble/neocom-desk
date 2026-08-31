---
description: Pick the next unblocked ready-for-agent issue, implement it on a branch, open a PR, drive CI green, then squash-merge and close.
argument-hint: '[issue number] (optional — otherwise auto-picks the next unblocked ticket)'
allowed-tools: Bash, Read, Write, Edit, Glob, Grep, Skill, Task, TodoWrite, WebFetch, WebSearch
---

You are running one iteration of the autonomous ticket loop for **NeoCom Desk**
(`shawndibble/neocom-desk`). Do exactly one ticket, end to end, then stop.

Tracker conventions: `docs/agents/issue-tracker.md`. Domain: `CONTEXT.md`,
`docs/adr/`. Coding rules: `CLAUDE.md`.

If `$ARGUMENTS` contains an issue number, use that issue instead of auto-picking
(still run every check in step 2 against it; if it's assigned to someone else or
blocked, report that and stop).

## 1. Prepare

- `git switch main && git pull --ff-only`.
- Confirm a clean tree with a **content-based** check: `git diff --quiet HEAD`
  (exit 0 = clean). Do **not** rely on `git status --porcelain` — this repo lives
  under OneDrive, which churns file mtimes and makes `git status` show phantom
  modifications even when content is unchanged. If `git diff --quiet HEAD` reports
  changes, stop and report — do not stash.
- `gh auth status` must succeed. If not, stop and report.

## 2. Pick the ticket

- `gh issue list --label ready-for-agent --state open --json number,title,body,assignees --jq 'sort_by(.number)'`
- Drop any issue that has an assignee (someone else is on it).
- For each remaining issue, read its `## Blocked by` section:
  - "None" / "None — can start immediately" → unblocked.
  - Otherwise, for every `#<n>` it lists, run `gh issue view <n> --json state`.
    The ticket is unblocked only if **every** referenced issue is `CLOSED`.
- Pick the **lowest-numbered** unblocked, unassigned ticket.
- **If none qualify: report "no unblocked ready-for-agent tickets" and STOP.**

## 3. Claim and branch

- `gh issue edit <n> --add-assignee @me`
- `git switch -c claude/<n>-<short-slug>` (slug from the issue title)

## 4. Revalidate — `/triage <n>` (revalidation mode)

Invoke the `triage` skill in revalidation mode (see its "Revalidation mode"
section). It runs the redundancy check and prior-rejection check only — no
grilling, no inventing answers.

- If triage closes the ticket as `wontfix` (already implemented / prior
  rejection), or hands it back as `needs-info` / `ready-for-human`: it has
  already unassigned and commented. Delete the branch
  (`git switch main && git branch -D claude/<n>-...`) and **STOP**.
- Otherwise continue.

## 5. Implement — `/implement <n>`

Invoke the `implement` skill against issue `<n>`. It drives `/tdd` at the
seams, runs `/code-review`, and commits to the current branch. During
implementation, confirm the ticket still matches the codebase; if a detail is
stale, adjust to the ticket's **intent** and note the deviation in the PR body.
Use WebFetch / WebSearch for external API facts (ESI, Fuzzwork) if needed.

## 6. Local gate (mirror CI)

Run, in order, and fix until all pass:

```
npm run format:check   # npm run format to auto-fix
npm run lint
npm run typecheck
npm run test:run
npm run build
```

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
  1. `gh run view <run-id> --log-failed` for the failing job. For an `e2e`
     failure also pull the report:
     `gh run download <run-id> -n playwright-report -D /tmp/pw-report` and read
     it.
  2. Diagnose the real cause. Fix it on the branch (code or test, whichever is
     actually wrong — do not delete a failing test to make it pass).
  3. Re-run the local gate (step 6), commit, `git push`.
  4. `gh pr checks <pr> --watch --interval 30` again.
- If still red after 5 rounds: comment on the PR **and** the issue with a
  precise summary of the remaining failure, leave the PR open,
  `gh issue edit <n> --remove-assignee @me`, and **STOP**.

## 9. Merge and close

- All checks green → `gh pr merge <pr> --squash --delete-branch`.
- The squash commit carries `Closes #<n>`, so the issue auto-closes on merge to
  `main`. Verify with `gh issue view <n> --json state`; if still `OPEN`, run
  `gh issue close <n> --comment "Merged in <pr-url>"`.
- Note in your final report: merging to `main` triggered the `deploy` job
  (GitHub Pages).

## 10. Report

One tight summary: ticket number + title, PR URL, what was built, CI rounds
needed, merge status, and whether the issue closed. Then stop — do not pick up
another ticket this run.
