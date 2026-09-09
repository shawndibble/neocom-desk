---
name: add-missing-features
description: Survey third-party EVE tools for capability Neocom Desk lacks — especially industry and marketing — pressure-test each candidate with a hostile reviewer, mock up the survivors, and file them as ready-for-human tickets. Fires on explicit request only: the user typing /add-missing-features.
---

# Add Missing Features

Find what the rest of the EVE third-party ecosystem does that Neocom Desk does
not, bias hard toward **industry** and **marketing** (the ISK pipeline), and
land the survivors as tickets a human will review.

**This skill runs unattended.** Nobody answers questions mid-run. Every choice
an interactive skill would put to the user, you decide and record in the ticket
instead. The human reviews afterward, on the tickets — which is why every ticket
ships `ready-for-human` and never `ready-for-agent`.

`$ARGUMENTS`, if present, narrows the hunt to an area ("industry", "market",
"hauling"). Otherwise sweep the whole ISK pipeline.

Reference: [TOOLS.md](TOOLS.md) — the survey ledger of tools already looked at
and candidates already killed. Read it in step 1; append to it in step 7.

This run writes no application code. It needs **no worktree**: read the main
checkout and leave it untouched — Shawn keeps a dev server there and another
agent may be working in it. The mutations it makes are `gh issue create` calls
and an appended `TOOLS.md`.

## 1. Inventory what already exists

**Neocom Desk is far broader than it looks, and this is where the run goes
wrong.** Undercut detection, order competition, realized profit, build-vs-buy,
appraisal, PI chains, price history and reprocessing are all built. A candidate
proposed without checking is usually a feature that shipped months ago.

**Grep the domain concept, never your own word for it.** A past run proposed a
hub-arbitrage finder on the strength of `grep arbitrage` returning nothing. It
ships as `hubHaulGaps` in `orderExits.ts`. The app names things in `CONTEXT.md`
vocabulary, so search that way and read the module list rather than trusting a
keyword miss.

Establish the real surface before proposing anything:

- Routes: `ls src/routes/` — one file per page. `docs/ARCHITECTURE.md` §6 is the
  route inventory.
- Modules: `ls src/engine/*/` and `ls src/features/*/` — the calculation
  surface, and the sharpest evidence of what is genuinely covered.
- `CONTEXT.md` glossary for the vocabulary every later step must speak.

Done when you can name, for each area you are about to explore, the module that
covers it or the confirmed absence of one.

## 2. Survey the ecosystem

Primary source: the EVE third-party developer forum. Fetch the Discourse JSON,
not the HTML page — thread titles are JS-rendered and the HTML comes back empty:

```
https://forums.eveonline.com/c/technology-research/third-party-developers/76.json
```

Take the thread list as **pointers to tools**, not as findings. Research each
tool that touches industry or marketing until you can state what it actually
does. Seeds worth checking beyond the forum: Adam4EVE, Ravworks, EVE Tycoon,
Fuzzwork, Janice, Slipway, EVE Ref.

A dead tool still marks a real gap — players wanted it — but it kills the
"someone already serves this" objection, so note liveness either way.

## 3. Frame candidates, then gate them on prior art

Ask the question that discriminates: **what happens between "I own blueprints"
and "I banked ISK" that the app does not cover?** "What page are we missing"
produces weak candidates against a surface this broad; the pipeline question
produces depth — discovery, scheduling, restocking, routing, competition decay.

Draft **3–4** candidates, then gate each one. Grep by **domain concept**, using
`CONTEXT.md`'s vocabulary rather than your own phrasing:

1. `docs/context/decisions/` — scope decisions, one file each. Filenames carry
   the summary, so `ls | grep` on a concept usually lands it. A later decision
   can reverse an earlier one, so read dates.
2. `.out-of-scope/*.md` — explicitly rejected enhancements, with the reasoning
   and what was already considered.
3. `gh issue list --state all --search "<terms>"` — already filed, open or closed.

A hit **drops the candidate**, or narrows it to the shape the decision leaves
open. Record every drop with where you looked and what you found; a drop is a
useful result, not a failure.

Each surviving candidate carries, as required fields:

- **Verdict**: expansion of an existing page, or a new page. Name the exact
  route or module it extends.
- **ESI backing**: the endpoints it needs, their cache TTL, and any role gate.
- **Integration plan**: where it slots into existing navigation and data flow.

## 4. Hostile review

Spawn a **hostile reviewer** as a fresh sub-agent (Agent tool, `subagent_type:
"general-purpose"` — never `fork`; the adversarial value is in the cold read).
Its job is to kill candidates, not improve them. A reviewer that returns "all of
these are good" has failed; require it to name the one it would cut if only two
could ship.

Its prompt must carry the full candidate text, the inventory from step 1, the
prior-art hits from step 3, and — stated in the prompt itself, since it never
sees this file — these constraints:

> This is a read-only review. Read only the candidates and the files they cite.
> Run no tests, lint, typecheck, build, or scripts. Edit no files. Make no `gh`
> writes.

Give it this kill-bar:

- **ESI reality**: does the endpoint exist, is it role-gated behind a corp
  director, is its cache TTL too coarse for the feature to mean anything?
- **Client-side reality**: the app is a local-first PWA — ESI data lives in
  Dexie per device and never syncs through the backend. Anything needing a
  server crawling ESI across all players is dead on arrival here, however good.
- **Settled scope**: does a `docs/context/decisions/` file or `.out-of-scope/`
  entry constrain this? Hand it the step 3 hits; a decision outranks the
  reviewer's own reasoning.
- **Overlap**: does an existing route or module already do this?
- **Maintenance**: what breaks on the next SDE or ESI change?

Require a verdict per candidate on its own line: `SHIP`, `NARROW` (state the
narrower shape precisely), or `KILL`.

**Weigh its verdicts against your own evidence.** A reviewer told to kill will
manufacture kills, and its most common error is a true premise with a wrong
conclusion — "ESI exposes no history for this" is true and yet would not, on its
own, kill a feature in a Dexie-backed app that can accumulate its own series.
Where a verdict contradicts something you verified in the repo, keep your
evidence and record the disagreement in the ticket. Where it cites a file or a
decision you missed, verify the citation and let it stand.

## 5. Mock up the UI-significant survivors

Any survivor that adds a tab, adds a page, or reshapes an existing one gets
mockups before it gets a ticket. A survivor that only deepens existing math
skips this step.

Use the `design` skill, constrained to the tokens and components in
`docs/DESIGN.md` and the primitives in `src/components/ui/` — a mockup inventing
its own visual language is not an integration plan. Show the feature in place:
surrounding navigation, the empty state, and the populated state. Publish it and
link the artifact URL from the ticket, the way `.out-of-scope/` entries do.

**Also describe the layout in words in the ticket body.** The link can rot and
an unattended run can fail to publish; a ticket whose mockup exists only as a
URL is a ticket that may arrive empty.

## 6. File the tickets

Invoke `/to-tickets` for the breakdown, stating both departures below, or create
the issues directly with `gh issue create` against `shawndibble/neocom-desk`
(`docs/agents/issue-tracker.md`, heredoc body) — the tickets are identical
either way.

- **Unattended** — the "quiz the user" step does not run. Nobody is there.
  Record the decisions it would have asked about in the ticket body instead.
- **Labels `--label enhancement --label ready-for-human`** — every issue carries
  one category role and one state role (`docs/agents/triage-labels.md`).
  `ready-for-agent` would let `/next-ticket` build unreviewed proposals.

Ship only the survivors. If the hostile review killed three of four, file one
ticket — never backfill to hit a target count. **Ship the narrowed shape**, not
the shape drafted in step 3: a survivor that shrank is the process working, and
a ticket that re-inflates it discards the review.

Body follows the house brief (`.claude/skills/triage/AGENT-BRIEF.md` —
behavioural not procedural, no file paths or line numbers, testable criteria):

```markdown
> _This was generated by AI during /add-missing-features._

## TL;DR

One or two sentences: what this feature does, and whether it is an expansion of
an existing page or a new one. Readable on its own — a human triaging a batch
reads only this before deciding whether to read on.

## Agent Brief

**Category:** enhancement
**Summary:** one line
**Prior art:** the third-party tool(s) that do this, and what they get right
**Current behavior:** what the app does today, and the gap
**Desired behavior:** what should happen, including edge cases
**ESI backing:** endpoints, cache TTL, scopes or role gates
**Integration plan:** expansion or new page, and where it slots into navigation
**Key interfaces:** components, tokens, and types involved — named, not pathed
**Acceptance criteria:**

- [ ] testable criterion

**Out of scope:** adjacent things that stay untouched

**Why not delegated:** the judgement call that needs a human eye

**Hostile review:** verdict, the objections raised, and how the proposal answers
them — including any objection overruled by repo evidence

**Mockups:** artifact URL, plus the layout described in words
```

## 7. Record the survey

Append this run to [TOOLS.md](TOOLS.md): the date, the tools surveyed with what
each does, and every candidate with its outcome — filed as issue #N, or dropped
with the reason and where you found it. The ledger is what stops the next run
re-proposing what this one already killed.

## Report

In the terminal, short: each issue URL with its hostile verdict, and the dropped
candidates with their reasons, so the next run has a head start.
