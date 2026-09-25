---
name: improve-ui
description: Research how surfaces present data and flow, at every width, and file the improvements as tickets. Runs /improve-mobile-ux alongside for the phone lane.
disable-model-invocation: true
---

# Improve UI

Find where a surface makes the user work harder than the data demands: the
answer buried under chrome, related things scattered, edges that almost line
up, a gap that means nothing, a power feature missing or shouting. Land the
survivors as tickets. They range from a one-line alignment fix to a rework of
a whole section.

**This is research.** A run writes no application code. It reads code, renders
surfaces, files `gh` issues and curates [LEDGER.md](LEDGER.md). Nothing else.

**This skill runs unattended.** Nobody answers questions mid-run. Every choice
an interactive skill would put to the user, you decide and record in the ticket.

`$ARGUMENTS`, if present, names the surfaces to audit ("wallet", "industry").
Otherwise take the least-recently-audited surfaces from the ledger.

## Two lanes, one run

- **The UI lane (this file)** covers pointer width (`md` and up) and anything
  true at every width: hierarchy, flow, grouping, whitespace rhythm, alignment,
  consistency, and whether the surface has the features it needs.
- **The phone lane** covers everything below `md`. It belongs to
  `/improve-mobile-ux`, which has its own rubric, ledger, tickets and ledger
  PR. Step 4 runs it on the same surfaces.

A finding that exists only below `md` goes to the phone lane, never here. A
finding true at every width stays here, and its ticket says what happens at
390px.

Reference: [RUBRIC.md](RUBRIC.md) holds the audit axes, the greps that surface
candidates, and the standing kill-tests. Read it in step 1.
Reference: [LEDGER.md](LEDGER.md) records surfaces already audited, findings
filed, and findings killed. Read it in step 1; curate it in step 10.

Work from a sibling worktree off `origin/main`, never the main checkout.
Shawn keeps a dev server running there and another agent may be working in it.

```
git -C <main-repo> fetch origin main
git -C <main-repo> worktree add --detach ../neocom-desk.worktrees/improve-ui-<slug> origin/main
```

Then run `npm ci` inside it; this worktree is for rendering only. Step 10
commits the ledger from a worktree of its own.

## 1. Fix the ground truth

This app has a written design system, and a finding that cites it is worth ten
that appeal to general taste. Read:

- `docs/DESIGN.md`, all of it. §3 (spacing scale and control heights) and §6
  (usage rules: one primary per view, tables over card grids, layering) are
  what most findings in this lane cite. The opening line is **"Density over
  whitespace — this is a data tool."** RUBRIC.md axis C says how this lane
  reads whitespace without fighting that rule.
- `src/components/ui/`: the primitives (`Panel`, `PageHeader`, `DataTable`,
  `FilterBar`, `StatChip`, `EmptyState`, `Tabs`, …) and `controlStyles.ts`. A
  fix composes these. A fix that invents a new one has to argue for it.
- `src/routes/Styleguide.tsx`: the live reference for how primitives combine.
- `CONTEXT.md`: the glossary. Tickets use its terms.
- `LEDGER.md` here, plus `.claude/skills/improve-mobile-ux/LEDGER.md` so this
  lane stays off ground the phone lane has already covered.

Then load the general UX guidance. Invoke the `ui-ux-pro-max:ui-ux-pro-max`
skill; its output names its base directory. Query only its `ux` and `chart`
domains, one intent per query:

```
python "<base>/scripts/search.py" "<2-5 terms>" --domain ux
```

If the script fails, read `<base>/references/quick-reference.md` instead.
**DESIGN.md wins every conflict.** This app's style, palette, fonts, radius
and dark-only theme are decided, so skip that skill's style, palette,
typography and design-system modes. Use its guidance to name a problem, not
to restyle the app.

Done when you can say, for each RUBRIC.md axis, which DESIGN.md rule or
primitive the app already uses for it.

## 2. Pick the surfaces

Audit **2–3 surfaces** per run. A surface is one route or one panel shared
across routes. The depth is in one page read end to end: every panel, every
toolbar, every state.

Route inventory: `ls src/routes/` and `docs/ARCHITECTURE.md` §6. Prefer the
surfaces people live in, the ones that are data-dense and opened daily
(Overview, Industry, Market, Wallet, Assets, Skills), over setup pages. Among
those, prefer surfaces this ledger has never audited or last audited before a
large rework landed (`git log --since` on the route and its feature folder).

## 3. See it

Layout, whitespace and alignment are judged by eye, so render the surfaces.
Follow `/improve-mobile-ux` step 4 for the mechanics: a throwaway spec in this
worktree's `e2e/`, `E2E_SKIP_BUILT=1`, `--reporter=list`, and a check that
the suite's fixed port 5199 is free. Capture each surface:

- at **1440×900** (the main desktop read) and **1024×768** (the narrowest
  pointer layout, where side-by-side panels are tightest);
- in its **populated, empty and loading** states wherever the mocks can
  produce them;
- full page and also the first viewport. What sits above the fold is a
  finding axis of its own.

If rendering fails, audit from code and mark each finding `code-read only` so
the hostile reviewer weighs it accordingly. A finding the picture contradicts
is dead.

Every render for this run happens here, before step 4. Port 5199 is
hard-coded, `--strictPort`, with `reuseExistingServer` switched on, so while
the phone lane is rendering, any screenshot this lane takes could come from
the other worktree's server.

## 4. Launch the phone lane

Your screenshots are taken, so spawn one sub-agent (`subagent_type:
"general-purpose"`, background) with this prompt, adapted:

> Read `.claude/skills/improve-mobile-ux/SKILL.md` and follow it exactly, as if
> the user had typed `/improve-mobile-ux <surfaces>`. Its `$ARGUMENTS` are:
> `<surfaces>`. It runs unattended; decide and record rather than ask. Report
> back each filed issue URL with its verdict, and each dropped finding with
> its reason.

That run owns its tickets, its ledger and its ledger PR. Carry on to step 5
without waiting for it, and collect its report in step 11.

## 5. Audit against the rubric

Walk [RUBRIC.md](RUBRIC.md) axis by axis over each surface. Cover every axis on
every surface; an axis you skip is the one the page gets wrong.

Each finding states, in this order:

1. **The principle.** The DESIGN.md rule it breaks, or the ui-ux-pro-max
   guideline it cites (quote the guideline's name).
2. **The surface.** The route and components, by name, never a line number.
3. **The cost.** What the user cannot see, find or do, or what takes them
   longer. A finding that cannot finish this sentence is taste; drop it.
4. **The size.** Either a **tweak** (one surface, one PR, no layout decision
   left open) or a **rework** (reorders or restructures a section, or needs a
   product decision). Reworks are welcome, and a large one is still one
   finding.

## 6. Gate on prior art

Check every surviving finding against current code and the tracker, in this
order. A hit drops the finding, or narrows it to what the hit leaves open.

1. **The code itself.** Re-read the component. UI work lands constantly, and
   the most common failed run files a fix that already shipped.
2. **Specs.** A spec asserting the behaviour means it is fixed and guarded.
3. **`docs/context/decisions/` and `docs/adr/`.** Read the dates; a later
   decision can reverse an earlier one. Many of this app's odd-looking layouts
   are deliberate and documented.
4. **`.out-of-scope/*.md`.** These were rejected on purpose.
5. **`gh issue list --state all --search "<terms>"`.** Open the body of each
   hit. Treat a provenance line from **any** of these as prior art:
   `/improve-ui`, `/improve-mobile-ux` or `/add-missing-features`. The phone
   lane is filing on the same surfaces during this run, so repeat this search
   right before step 9.

Record every drop, with where you looked and what you found. A drop is a
result.

## 7. Hostile review

Spawn a **hostile reviewer** as a fresh sub-agent (`subagent_type:
"general-purpose"`, never `fork`; the value is the cold read). Its job is to
kill findings. A reviewer that returns "all of these are real" has failed, so
require it to name the one finding it would cut if only half could ship.

Its prompt carries:

- the full finding text;
- the step 1 ground truth, including DESIGN.md's opening line;
- the step 6 results;
- the screenshot paths;
- RUBRIC.md's standing kill-tests;
- and, stated in the prompt itself, these constraints:

> This is a read-only review. Read only the findings, the screenshots and the
> files they cite. Run no tests, lint, typecheck, build, or scripts. Edit no
> files. Make no `gh` writes.

Its kill-bar adds:

- **Consequence.** Does the cost in point 3 actually happen to a real user?
- **One PR's worth, for a tweak.** A rework may span PRs. It must then name
  its first slice.
- **Provable.** Can a spec or a unit test assert the fix? For alignment and
  spacing that usually means a Playwright `boundingBox()` comparison of the
  edges that should match.

Require one verdict per finding, on its own line: `SHIP`, `NARROW` (state the
narrower shape precisely), `ESCALATE`, or `KILL`. `ESCALATE` means the finding
is real but collides with a DESIGN.md rule. It goes to a human with the
tension stated. Findings that argue for more room land here, not in `KILL`.

**Weigh its verdicts against your own evidence.** A reviewer told to kill will
invent kills. Where a verdict contradicts a screenshot or a file you read,
keep your evidence and record the disagreement in the ticket. Where it cites
something you missed, verify the citation and let the verdict stand.

## 8. Mock up the reshapes

Every rework, and every tweak that moves or regroups something, gets a mockup
before it gets a ticket. A tweak that only realigns an edge or changes one
gap skips this step.

Use the `ui-ux-pro-max:design` skill (or the Artifact tool's `design` quickstart). Constrain
it to DESIGN.md tokens and the primitives in `src/components/ui/`; a mockup
with its own visual language is not an integration plan. Draw the surface as
it is today beside what it becomes, at 1440 wide, plus a 390-wide frame
whenever the change also reaches the phone. Publish it and link the URL from
the ticket.

**Also describe the layout in words in the ticket body.** Links rot, and an
unattended publish can fail.

## 9. File the tickets

File one ticket per finding, or one per surface when its tweaks are small and
touch the same components. Use `gh issue create` against
`shawndibble/neocom-desk` with a heredoc body (`docs/agents/issue-tracker.md`).

Labels (`docs/agents/triage-labels.md`: one category role, one state role):

- **Tweak with `SHIP` or `NARROW`**: `--label enhancement --label
ready-for-agent`. `/next-ticket` builds it and merges it to production with
  no human in between. That is why its acceptance criteria must be provable.
- **Rework, or any `ESCALATE`**: `--label enhancement --label
ready-for-human`. A human decides whether the section changes shape.
- **`bug` instead of `enhancement`** when the surface is broken, not merely
  worse: overlap, clipping, or content that cannot be reached.

Ship only the survivors, in the shape the review left them. Never backfill to
hit a count.

The body follows the house brief (`.claude/skills/triage/AGENT-BRIEF.md`:
behavioural, not procedural; no file paths or line numbers; testable
criteria):

```markdown
> _This was generated by AI during /improve-ui._

## TL;DR

One or two sentences: what this surface makes harder than it should, and
what changes. A human triaging a batch reads only this.

## Agent Brief

**Category:** enhancement
**Size:** tweak | rework
**Summary:** one line
**Surface:** route or panel, and the components involved, named, not pathed
**Principle:** the DESIGN.md rule or the ui-ux-pro-max guideline, by name
**Current behavior:** what the user sees and what it costs them, at 1440
and 1024
**Desired behavior:** what the user sees instead, including the empty state
and the long-value case (a 15-digit ISK figure, a 40-character item name)
**Phone behavior:** what happens below `md`: unchanged, or the stated change.
A fix at pointer width that reflows the phone is the phone lane's call; say so
**Key interfaces:** primitives, tokens and props involved
**Acceptance criteria:**

- [ ] testable criterion, stated at a named width
- [ ] a spec asserts it (alignment and gaps: compare `boundingBox()` edges)
- [ ] no change at widths the finding does not name

**Rework slices:** (rework only) the ordered PR-sized slices, first one
fully specified
**Out of scope:** adjacent surfaces that stay untouched

**Hostile review:** the verdict, the objections raised, and how the finding
answers them, including any objection overruled by evidence. On `ESCALATE`,
the DESIGN.md rule at stake and both sides of the trade.

**Mockups:** artifact URL, plus the layout described in words
```

## 10. Curate the ledger

[LEDGER.md](LEDGER.md) is a reference for the next run, not a run log. Update
it in place, following the rules and sections in the file's own header.

Commit it through one shared PR on the fixed branch
**`chore/improve-ui-ledger`**. Follow `/improve-mobile-ux` step 9 for the
mechanics, with this skill's branch and file substituted. They cover: a fresh
sibling worktree on that branch, reusing an already-open PR, `open-pr.mjs`,
`--merge --auto` (not squash), `npx prettier --check` before pushing, and up
to 3 `drive-ci.mjs` rounds.

Remove both worktrees when done, merged or not.

## 11. Report

Collect the phone lane's report from step 4. If it is still running, say so;
never summarise a result you have not received.

Keep the terminal report short:

- this lane's issue URLs, each with its size, verdict and label;
- the phone lane's issue URLs;
- dropped findings from both lanes, with reasons;
- the ledger PR's state.
