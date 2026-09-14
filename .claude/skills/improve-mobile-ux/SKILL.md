---
name: improve-mobile-ux
description: Audit the app on a phone and file the fixes as ready-for-agent tickets.
disable-model-invocation: true
---

# Improve Mobile UX

Find where the app fights a thumb, and land the survivors as tickets
`/next-ticket` can build unattended.

**Two phones, one tier.** iPhone 14 is 390×844, Pixel 8 is 412×915. Both sit
below `sm` (640px) and `md` (768px), so every breakpoint in the app flips
identically on them. **Audit at 390** — the tighter of the two, and the width
the repo's own specs already use (`const PHONE = { width: 390, height: 844 }`).
412 is an arithmetic re-check for "does this row fit", never a second pass.

**This skill runs unattended.** Nobody answers questions mid-run. Every choice
an interactive skill would put to the user, you decide and record in the ticket.

`$ARGUMENTS`, if present, names the surfaces to audit ("wallet", "industry",
"assets"). Otherwise take the least-recently-audited surfaces from the ledger.

Reference: [RUBRIC.md](RUBRIC.md) — the audit axes, the greps that find each
violation, and the standing kill-tests. Read it in step 2; it is what turns
"feels cramped" into a finding an agent can act on.
Reference: [LEDGER.md](LEDGER.md) — surfaces already audited, findings already
filed, findings already killed. Read it in step 1; curate it in step 8.

Auditing writes no application code and needs no worktree: read the main
checkout and leave it untouched — Shawn keeps a dev server there and another
agent may be working in it. The mutations a run makes are `gh issue create`
calls and a curated `LEDGER.md` update. Both the optional render pass (step 4)
and the ledger commit (step 8) need a sibling worktree.

## 1. Fix the ground truth

The app's mobile contract is **written down**, and a finding that cites it is
worth ten that appeal to general mobile practice. Establish it before looking
at anything:

- `docs/DESIGN.md` §3 (touch tier), §4a (tables on a phone), §4b (filters on a
  phone), §7 (accessibility) — the rules themselves.
- `src/components/ui/controlStyles.ts` — the one place the control scale lives.
- `src/app/Layout.tsx` — the desktop rail, the `md:hidden` phone tab bar, and
  the More sheet that holds everything the bar has no room for.
- `e2e/*Narrow.spec.ts` — every narrow-viewport invariant already locked in CI.
  These are proof of fixed work, and the naming convention every ticket you
  file must extend.
- `LEDGER.md` — what past runs audited, filed and killed.

`docs/UX-REVIEW.md` is a **dated snapshot, not a finding source**. Much of it
shipped (the mobile More sheet it asks for is in `Layout.tsx` today). Mine it
for where to look; never for what is broken.

Check `git status -sb` for `[behind N]` before trusting local `grep`/`ls`. A
stale checkout produces findings against code that changed weeks ago; if
behind, `git fetch origin main` and read `git show origin/main:<path>`.

Done when you can state, for each rule in RUBRIC.md, where the app defines it.

## 2. Pick the surfaces

Audit **2–4 surfaces** per run, where a surface is one route or one panel
shared across routes. A run that sweeps twenty routes produces twenty shallow
findings; the depth is in reading one page's actual DOM decisions end to end.

Route inventory: `ls src/routes/` and `docs/ARCHITECTURE.md` §6. Prefer
surfaces that are **data-dense and phone-relevant** — a page someone checks
between docks (Wallet, Assets, Industry jobs, Orders, Contracts, Alerts) beats
one nobody opens on a phone (Styleguide, Settings).

## 3. Audit against the rubric

Walk [RUBRIC.md](RUBRIC.md) axis by axis over each chosen surface. Every axis,
every surface — an axis skipped is the one a real phone user trips on.

Each finding states, in this order:

1. **The rule** it violates, named from DESIGN.md, or the readability problem
   it creates when no rule covers it.
2. **The surface** — route and component by name, never a line number.
3. **What a phone user cannot do** because of it. A finding that cannot finish
   this sentence is a style opinion; drop it now rather than spend a reviewer
   on it.

Findings with no user consequence die here. So does anything on RUBRIC.md's
kill-test list — those are settled decisions, and re-proposing one wastes the
whole run.

## 4. See it (optional)

A screenshot turns "this row probably wraps" into evidence, and it is the only
way to catch overflow that no grep predicts. It is optional because it needs a
worktree; skip it rather than run a dev server or a Playwright report inside
the main checkout.

Work in a sibling worktree with `npm ci` already run. Write the throwaway
screenshot spec into **that worktree's own `e2e/`** — `playwright.config.ts`
sets `testDir: './e2e'` and filters positional args against it, so a spec
anywhere else matches nothing and the run reports "no tests found". The
worktree is disposable and goes away in step 9, so the spec goes with it.

The spec sets `{ width: 390, height: 844 }`, navigates each surface, and calls
`page.screenshot({ fullPage: true, path: '<scratchpad>/<surface>.png' })`.

```
E2E_SKIP_BUILT=1 npx playwright test e2e/<spec> --project=chromium \
  --reporter=list --output=<scratchpad>/test-results
```

- `E2E_SKIP_BUILT=1` is sanctioned (see `playwright.config.ts`) — without it the
  `built` project demands a local `npm run build`, which CLAUDE.md forbids.
- `--reporter=list` with `--output` keeps both artifact directories out of the
  checkout; the config's default `html` reporter writes `playwright-report/`
  next to the config whatever `--output` says.
- **Port 5199 is `--strictPort` with `reuseExistingServer` on locally.** A
  concurrent worktree's e2e run already holding it means your screenshots come
  from _its_ code. Check the port is free first (`lsof -ti:5199`); a reused
  server is untrusted evidence.
- `npx playwright install chromium` may be needed — check, don't assume.

The suite is fully offline: `e2e/support/testBase.ts` mocks SSO, ESI, fuzzwork
and the image server, so a seeded character is one `Log in with EVE Online`
click away.

Read the screenshots. A finding the picture contradicts is dead.

## 5. Gate on prior art

Every surviving finding gets checked against **current code and the tracker**,
in this order. A hit drops the finding, or narrows it to the shape the hit
leaves open:

1. **The code itself** — re-read the component. Mobile work lands constantly;
   the most common failed run is one that files a ticket for a fix that shipped.
2. `e2e/*Narrow.spec.ts` — a spec asserting the behaviour means it is fixed
   _and_ guarded.
3. `docs/context/decisions/` — scope decisions, one file per decision, summary
   in the filename. A later decision can reverse an earlier one; read dates.
4. `.out-of-scope/*.md` — explicitly rejected, with reasoning.
5. `gh issue list --state all --search "<terms>"` — already filed, open or
   closed. Also search by date back to the ledger's last update, since
   `/next-ticket`, `/add-missing-features` and this skill all file issues
   before any of them updates a ledger. Open the body and look for the
   `> _This was generated by AI during /improve-mobile-ux._` provenance line
   before treating a hit as this skill's own prior art.

Record every drop with where you looked and what you found. A drop is a result.

## 6. Hostile review

Spawn a **hostile reviewer** as a fresh sub-agent (Agent tool, `subagent_type:
"general-purpose"` — never `fork`; the adversarial value is in the cold read).
Its job is to kill findings, not improve them. A reviewer returning "all of
these are real" has failed; require it to name the one it would cut if only
half could ship.

Its prompt carries the full finding text, the ground truth from step 1, the
prior-art results from step 5, the screenshots if step 4 ran, and — stated in
the prompt itself, since it never sees this file — these constraints:

> This is a read-only review. Read only the findings and the files they cite.
> Run no tests, lint, typecheck, build, or scripts. Edit no files. Make no `gh`
> writes.

Give it this kill-bar:

- **Density over whitespace.** `docs/DESIGN.md` opens with "Density over
  whitespace — this is a data tool." Any finding whose fix is more padding,
  bigger gaps, or fewer columns for breathing room is pre-rejected. Larger
  _touch targets_ are a different claim and survive this.
- **The OS picker is a reversed decision.** `Select` beats `NativeSelect`
  everywhere, deliberately, because two selects side by side must open the same
  way. "Use the native picker on phones" is dead on arrival.
- **Phone reality.** Would a player actually do this on a phone? Editing a
  build plan's material tree between meetings is not the phone use case that
  checking a wallet or a job timer is. A fix serving a workflow nobody does on
  a phone is worth less than one serving the glance.
- **Already shipped.** The reviewer re-checks the component; step 5 misses
  happen.
- **One PR's worth.** A finding that cannot be built and proved in a single PR
  is too big — it must be split or narrowed.
- **Provable.** Can a narrow-viewport spec assert the fix? A finding nothing in
  CI can guard will regress by the next refactor.

Require a verdict per finding on its own line: `SHIP`, `NARROW` (state the
narrower shape precisely), or `KILL`.

**Weigh its verdicts against your own evidence.** A reviewer told to kill will
manufacture kills. Where a verdict contradicts a screenshot or a file you read,
keep your evidence and record the disagreement in the ticket. Where it cites
something you missed, verify the citation and let it stand.

## 7. Mock up the reshapes

A finding that **changes a layout** — stacks a table, moves a control, adds a
sheet, reorders a card's lines — gets a mockup before it gets a ticket. A
finding that only resizes a target or recolors a number skips this step.

Use the `design` skill, constrained to the tokens and components in
`docs/DESIGN.md` and the primitives in `src/components/ui/` — a mockup
inventing its own visual language is not an integration plan. Draw the artboard
at **390px wide**. Show the surface as it is today beside what it becomes, plus
the empty state. Publish it and link the artifact URL from the ticket.

**Also describe the layout in words in the ticket body.** The link can rot and
an unattended run can fail to publish; a ticket whose mockup exists only as a
URL is a ticket that may arrive empty.

## 8. File the tickets

One ticket per surface, `gh issue create` against `shawndibble/neocom-desk`
(`docs/agents/issue-tracker.md`, heredoc body).

**Labels: `--label enhancement --label ready-for-agent`** (`--label bug` when
the surface is outright broken on a phone rather than merely worse). Every
issue carries one category role and one state role
(`docs/agents/triage-labels.md`).

`ready-for-agent` means `/next-ticket` will build this and squash-merge it to
production with no human in between. That is the intent — and it is why the
acceptance criteria below are not optional. A ticket an agent can satisfy
without proving anything at 390px is a ticket that ships a regression.

Ship only the survivors, in the narrowed shape the review left them. Never
backfill to hit a count.

Body follows the house brief (`.claude/skills/triage/AGENT-BRIEF.md` —
behavioural not procedural, no file paths or line numbers, testable criteria):

```markdown
> _This was generated by AI during /improve-mobile-ux._

## TL;DR

One or two sentences: what is hard to do on a phone here, and what changes.
Readable on its own — a human triaging a batch reads only this.

## Agent Brief

**Category:** enhancement
**Summary:** one line
**Surface:** the route or panel, and the components involved — named, not pathed
**Rule:** the DESIGN.md rule violated (§3 touch tier, §4a tables, §4b filters,
§7 accessibility), or the readability problem when no rule covers it
**Current behavior at 390px:** what a phone user sees and cannot do
**Desired behavior at 390px:** what should happen, including the empty state and
the long-value case (a 15-digit ISK figure, a 40-character item name)
**Pointer-width behavior:** what must not change above `md` — the desktop
layout is the control, and a mobile fix that reflows the desktop is a regression
**Key interfaces:** components, tokens and props involved (`DataTable`'s
`responsive`, `FilterBar`, `controlStyles`' `sm`/`md` tiers, `Modal`'s `sheet`
placement)
**Acceptance criteria:**

- [ ] testable criterion, stated at 390px
- [ ] `e2e/<surface>Narrow.spec.ts` asserts it at `{ width: 390, height: 844 }`
      — extend the existing spec if one covers this surface
- [ ] No change to rendering at or above `md` (768px)

**Out of scope:** adjacent surfaces that stay untouched

**Hostile review:** verdict, the objections raised, and how the finding answers
them — including any objection overruled by evidence

**Mockups:** artifact URL, plus the layout described in words
```

## 9. Update the ledger — curate, don't append

[LEDGER.md](LEDGER.md) is a **reference for the next run**, not a run log.
Update it in place; never append a dated section, and never record run metadata
(dates, "crashed at step 6", merge post-mortems). Keep it under roughly 150
lines; compress or delete when a section outgrows that.

Maintain these sections, each keyed by topic, not by run:

- **Surfaces audited** — one row per surface, with what the audit concluded.
- **Contract already enforced** — mobile rules proved by a spec or a component,
  so no run re-discovers them.
- **Standing kill-tests** — reusable heuristics only. A new one earns its place
  by killing a class of finding, not one finding.
- **Filed findings** — issue number, verdict, one line.
- **Killed findings** — what, and why. This is what stops a re-pitch.

### Commit it via one shared PR, not a new one per run

Runs are concurrent and same-day. Use a **fixed branch name** every time,
`chore/improve-mobile-ux-ledger`, so "is a PR already open" is deterministic:

```
gh pr list --head chore/improve-mobile-ux-ledger --state open --json number,url
```

- **A PR is already open**: branch a sibling worktree off that branch (never
  the main checkout), rebase onto `origin/main`, merge your curated update into
  the existing content — not a second append — commit, push to the same branch.
  Do not open a second PR.
- **No open PR**: branch a sibling worktree off current `origin/main` with that
  same branch name, commit, push, and open the PR with
  `node scripts/next-ticket/open-pr.mjs "<title>" <body-file>` (which also arms
  auto-merge). The script is generic over any PR number.

`npm ci` in the worktree before committing, then `npm run verify-hooks -- --fix`
— `prepare` is skipped under `ignore-scripts` and husky exits 0 either way, so
without it the pre-commit hook is silently absent. Before pushing, run
`npx prettier --check .claude/skills/improve-mobile-ux/LEDGER.md` (`--write` to
fix) — CI's `format:check` runs repo-wide on every push, and whitespace is the
one failure a Markdown-only change actually hits.

### Get it merged — a PR left open is a run left unfinished

A stuck PR here blocks every later run's "is a PR already open" check from ever
resolving.

- If the PR was already open, auto-merge may not be armed (`open-pr.mjs` only
  arms it on creation): `gh pr merge <n> --merge --auto`. `--merge`, not
  `--squash` — this branch is reused run over run, and a squash makes the next
  rebase fight a rewritten history.
- Loop up to **3 rounds**: `node scripts/next-ticket/drive-ci.mjs <n>`, same
  status contract as `.claude/commands/next-ticket.md` documents (`conflict` /
  `green` / `missing-checks` / `pending` / `checks-failed`). On `checks-failed`,
  diagnose in a sub-agent with
  `node scripts/next-ticket/fetch-ci-failure.mjs <run-id>` (never pull raw CI
  logs into this context), fix on the branch, commit, push, restart the round.
- Still red after 3 rounds: leave the PR open, say so plainly with its URL and
  the remaining failure, and stop. The next run's "already open" check picks it
  back up.

Remove the worktree when done, merged or not.

## Report

In the terminal, short: each issue URL with its hostile verdict, and the
dropped findings with their reasons, so the next run has a head start.
