---
name: add-missing-features
description: Survey third-party EVE tools for capability Neocom Desk lacks, kill the weak ideas with a hostile reviewer, mock up the survivors, and publish ready-for-human tickets.
disable-model-invocation: true
---

# Add Missing Features

Find what the rest of the EVE third-party ecosystem does that Neocom Desk does
not, bias hard toward **industry** and **marketing** (the ISK pipeline), and
land the survivors as tickets a human will review.

**This skill runs unattended.** Nobody answers questions mid-run. Every choice
that a interactive skill would put to the user, you decide and record in the
ticket instead. The human's review happens after the fact, on the tickets —
which is why every ticket ships `ready-for-human` and never `ready-for-agent`.

Reference: [TOOLS.md](TOOLS.md) — the survey ledger of tools already looked at
and candidates already killed. Read it in step 1; append to it in step 7.

## 1. Inventory what already exists

**Neocom Desk is far broader than it looks, and this is where the run goes
wrong.** Undercut detection, order competition, realized profit, build-vs-buy,
appraisal, PI chains, price history and reprocessing are all built. A candidate
proposed without checking is usually a feature that shipped months ago.

Establish the real surface before proposing anything:

- Routes: `ls src/routes/` — one file per page.
- Engine modules: `ls src/engine/*/` — the pure calculation surface, and the
  sharpest evidence of what is genuinely covered.
- `CONTEXT.md` glossary for the vocabulary every later step must speak.
- `docs/context/decisions/` — grep it for each candidate area. A feature
  rejected there is settled scope, not a gap.

Done when you can name, for each candidate area you are about to explore, the
engine module that covers it or the confirmed absence of one.

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

## 3. Frame candidates

Ask the question that discriminates: **what happens between "I own blueprints"
and "I banked ISK" that the app does not cover?** "What page are we missing"
produces weak candidates against a surface this broad; the pipeline question
produces depth — discovery, scheduling, restocking, routing, competition decay.

Produce **3–4** candidates. Each one carries, as a required field:

- **Verdict**: expansion of an existing page, or a new page. Name the exact
  route or engine module it extends.
- **ESI backing**: the endpoints it needs, their cache TTL, and any role gate.
- **Integration plan**: where it slots into existing navigation and data flow.

## 4. Hostile review

Dispatch a sub-agent as a **hostile reviewer** whose job is to kill candidates,
not to improve them. A reviewer that returns "all four are great" has failed;
require it to name the candidate it would cut if only two could ship.

Give it this kill-bar:

- **ESI reality**: does the endpoint exist, is it role-gated behind a corp
  director, is its cache TTL too coarse for the feature to mean anything?
- **Client-side reality**: the app is a local-first PWA — ESI data lives in
  Dexie per device and never syncs through the backend. Anything needing a
  server crawling ESI across all players is dead on arrival here, however good.
- **Overlap**: does an existing route or engine module already do this?
- **Maintenance**: what breaks on the next SDE or ESI change?

Carry survivors forward with the reviewer's objections attached. A candidate
that survives with a scoped-down shape is a win; record the narrower shape.

## 5. Mock up the UI-significant survivors

Any survivor that adds a tab, adds a page, or reshapes an existing one gets
mockups before it gets a ticket. Use the `design` skill, constrained to the
tokens and components in `docs/DESIGN.md` — a mockup inventing its own visual
language is not an integration plan.

Show the feature in place: the surrounding navigation, the empty state, and the
populated state. A survivor that only deepens existing math skips this step.

## 6. Publish the tickets

Invoke `/to-tickets`, stating both departures below in the invocation. If it
does not appear in the invocable skill list for this run, follow its
`<issue-template>` and create each issue with `gh issue create` instead (see
`docs/agents/issue-tracker.md`) — the tickets are identical either way.

Two departures from that skill's defaults:

- **Unattended** — its "quiz the user" step does not run. Nobody is there.
  Record the decisions it would have asked about in the ticket body instead.
- **Label `enhancement,ready-for-human`**, never its `ready-for-agent`
  default. Every triaged issue carries one category role and one state role
  (`docs/agents/triage-labels.md`), so both labels go on. These are proposals a
  human accepts before any agent builds them; `ready-for-agent` would let
  `/next-ticket` start building unreviewed work.

Give each ticket a `## Blocked by` section reading `None` unless a candidate
genuinely gates another — `docs/agents/issue-tracker.md` treats that section as
the unblocked check, and a missing one is ambiguous. Write acceptance criteria
as observable behaviour rather than an implementation checklist: these are
unreviewed proposals, and the human may reshape the feature before any agent
touches it.

Ship only the survivors. If the hostile review killed three of four, publish
one ticket — never backfill to hit a target count.

Every ticket opens with a **TL;DR**: one or two sentences, before any other
section, saying what the feature does and whether it is an expansion or a new
page. A human reviewing the batch reads the TL;DR first and decides from it
whether to read on, so it carries the decision, not a restatement of the title.

Below the TL;DR each ticket carries the candidate's verdict, ESI backing,
integration plan, the hostile reviewer's surviving objections, and mockup links
where step 5 produced them.

## 7. Record the survey

Append this run to [TOOLS.md](TOOLS.md): the date, the tools surveyed with what
each does, and every candidate with its outcome — shipped as ticket #N, or
killed with the reason. The ledger is what stops the next run re-proposing what
this one already killed.
