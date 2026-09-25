---
name: ui-consistency
description: Nitpick the whole app for UI drift — control heights, reused primitives, icon meanings, context menus, cross-links — and file the fixes as ready-for-agent tickets.
disable-model-invocation: true
---

# UI Consistency

Find every place the app says the same thing two different ways, and land the
fixes as tickets `/next-ticket` can build unattended.

**Be pedantic.** A one-pixel height mismatch in a toolbar, a trash glyph that
means "remove from list" on one page and "delete forever" on another, an item
name that links to the Market Browser in one table and is dead text in the next
— these are the findings. "Too minor" is never a reason to drop one. The only
reasons are the ones in step 5 and RUBRIC.md's kill-tests.

**Drift is cross-surface, so sweep by axis, not by page.** Looking at one route
can only find what is wrong with that route; it cannot see that the same
entity behaves differently on the next one. Each run takes **1–2 rubric axes**
(or one entity from the matrix in RUBRIC.md) and sweeps the _whole_ app for it.

**This skill runs unattended.** Nobody answers questions mid-run. Every choice
an interactive skill would put to the user, you decide and record in the ticket.

`$ARGUMENTS`, if present, names the axes or entities to sweep ("icons",
"context menus", "item"). Otherwise take the least-recently-swept from the
ledger. The app has had a **full pass** once the ledger's "Axes swept" lists
all of A–G and every entity in RUBRIC.md's matrix. After that, keep going,
oldest sweep first; new features bring new drift.

Reference: [RUBRIC.md](RUBRIC.md) — the axes, the canonical pattern each one
checks against, the greps, the entity matrix, and the kill-tests. Read it in
step 1.
Reference: [LEDGER.md](LEDGER.md) — axes swept, the settled icon map, findings
filed and killed. Read it in step 1; curate it in step 8.

Auditing writes no application code and needs no worktree: read, never edit,
the main checkout — Shawn keeps a dev server there and another agent may be
working in it. The mutations a run makes are `gh issue create` calls and a
curated `LEDGER.md` update. The optional render pass (step 3) and the ledger
commit (step 8) need a sibling worktree.

## 1. Fix the ground truth

A consistency finding needs a **canonical pattern** to be inconsistent _with_.
The app writes most of them down:

- `docs/DESIGN.md` — §3 (control scale, radius, borders), §4 (component
  inventory: what each primitive is for), §5 (icons), §6 (usage rules), §7
  (accessibility).
- `src/components/ui/` — the primitives. `controlStyles.ts` is the height
  scale; `icons.tsx` is the icon vocabulary; `RowActions.tsx` is the
  menu-plus-button pairing; `index.ts` is the barrel. `icons.tsx` and
  `tabStyles.ts` sit outside it, as do the entity links in `src/features`
  (RUBRIC.md axis E).
- `eslint.config.js` — patterns already enforced by lint. A lint-enforced rule
  cannot drift; do not audit it.
- `CONTEXT.md` — the glossary. A label that names a concept differently from
  the glossary is a finding under axis G.
- `LEDGER.md` — what past runs swept, settled, filed and killed.

Survey **`origin/main`, not the working tree** — the main checkout is often
dozens of commits stale. `git fetch origin main`, then `git grep <pattern>
origin/main -- src` and `git show origin/main:<path>`.

Where an axis has no written canonical pattern (the icon map often has none),
**derive it from the majority**: the usage most sites already follow is the
canonical one, and the ticket proposes writing it into DESIGN.md alongside the
fix.

Done when, for each chosen axis, you can name the canonical pattern and where
it is defined.

## 2. Sweep

Run the chosen axis's greps from RUBRIC.md across every surface it names. **A grep hit is a candidate, never a finding** — read the
component and confirm.

Build the axis's artifact while you sweep:

- **Axes A, B, F, G** — a **tally**: every distinct variant of the pattern,
  with a count and the sites. `SearchInput` ×31, hand-rolled search box ×3
  (Mail, Contacts, Assets) is a finding; the tally is its evidence.
- **Axis C** — the **glyph map**: every icon from `icons.tsx`, each meaning it
  is used for, and the sites. One glyph with two meanings, or one meaning with
  two glyphs, is a finding.
- **Axes D, E** — the **entity matrix** from RUBRIC.md: for the entity, every
  surface that shows it, and on each whether it links, whether it has a
  context menu, whether that menu has its `RowMoreActions` twin, whether it
  shows its icon. A hole in a row is a finding.

Each finding states, in this order:

1. **The canonical pattern** — a DESIGN.md section, a primitive, or the
   majority usage with its count.
2. **The deviating sites** — every one, by route and component name. Never a
   line number; line numbers rot before the ticket is picked up.
3. **What the user reads wrong** because of it: a control that looks like it
   belongs to a different row, an icon they must re-learn, an entity they
   cannot reach from here though they could from there.

Done when every candidate is either a finding or a documented exception —
nothing is left "probably fine".

## 3. Measure it (optional)

Height and alignment findings are strongest as numbers. Use the render recipe
in [`../improve-mobile-ux/SKILL.md`](../improve-mobile-ux/SKILL.md) step 4
(sibling worktree, throwaway spec in that worktree's `e2e/`,
`E2E_SKIP_BUILT=1`, the port-5199 check), with two changes:

- Viewport **1280×800**, not 390. Phone layout belongs to `/improve-mobile-ux`.
- Beyond screenshots, have the spec log `getBoundingClientRect().height` for
  every control in each suspect row. "The `Select` is 30px beside a 28px
  `Button`" is a finding nobody can argue with.

A finding the measurement contradicts is dead.

## 4. Gate on prior art

Every finding gets checked against current code and the tracker. A hit drops
the finding, or narrows it to what the hit leaves open:

1. **The code** — re-read every deviating site on `origin/main`. Consistency
   fixes land constantly as side effects of other tickets.
2. `eslint.config.js` and any test asserting the pattern — guarded already.
3. `docs/context/decisions/` and `docs/adr/` — a decision may make the
   deviation deliberate. Read dates; a later decision can reverse an earlier.
4. `.out-of-scope/*.md` — explicitly rejected.
5. `gh issue list --state all --search "<terms>"` — already filed. Check the
   body's provenance line: `> _This was generated by AI during
/ui-consistency._` is this skill's own; `/improve-mobile-ux` and
   `/add-missing-features` file too, and their tickets count as prior art.
6. `../improve-mobile-ux/LEDGER.md` — if that skill already owns the finding
   (touch tier, 390px layout), it is not this skill's to file.

Record every drop with where you looked and what you found.

## 5. Hostile review

Spawn a **hostile reviewer** as a fresh sub-agent (Agent tool, `subagent_type:
"general-purpose"` — never `fork`; the value is the cold read). Its job is to
kill findings. A reviewer returning "all of these are real" has failed; require
at least one concrete objection per finding, even on the ones it lets through.

Its prompt carries every finding's full text and evidence (tally, glyph map or
matrix), the ground truth from step 1, the prior-art results from step 4, the
measurements if step 3 ran, and — stated in the prompt itself, since it never
sees this file:

> This is a read-only review. Read only the findings and the files they cite.
> Run no tests, lint, typecheck, build, or scripts. Edit no files. Make no `gh`
> writes.

Give it this kill-bar, also in its prompt:

- **Documented exception.** RUBRIC.md's kill-test list — the reviewer gets it
  verbatim.
- **Wrong canonical.** The claimed "canonical" is actually the minority, or
  DESIGN.md says otherwise.
- **Actually different.** The two sites only look alike; they mean different
  things, and matching them would lie to the user.
- **Already shipped.** It re-checks the code on `origin/main`.
  Two more checks can only narrow a finding, never kill it:

- **One PR's worth.** A migration touching 40 files across unrelated features
  is `NARROW`: split it by feature area.
- **Guardable.** Could a lint rule or a test stop it recurring? If so, the
  ticket must carry that guard. If not, the finding still ships.

State in the prompt, explicitly: **being small is not a kill reason, and
neither is having no possible guard.** This skill exists to catch small
things, and most small things cannot be linted.

Require a verdict per finding on its own line: `SHIP`, `NARROW` (state the
narrower shape), or `KILL`.

**Weigh its verdicts against your evidence.** A reviewer told to kill will
manufacture kills. Where a verdict contradicts a measurement or a file you
read, keep your evidence and record the disagreement in the ticket. Where it
cites something you missed, verify it and let it stand.

## 6. Group into tickets

**One ticket per pattern, sized to one PR**: "migrate the three hand-rolled
search boxes to `SearchInput`", "give Contract rows the context menu they have
everywhere else". Not one ticket per site (fifteen one-line PRs), and not one
ticket per axis (unreviewable). When a pattern spans too many feature areas for
one PR, split it by area and link the siblings.

Where a pattern can be guarded, the ticket carries the **guard**, the way
`/improve-mobile-ux` tickets carry a Narrow spec. That can be an ESLint
`no-restricted-imports` / `no-restricted-syntax` rule, a unit test on the
primitive, or an e2e assertion: whatever stops the next feature bringing the
drift back. Look for one on every ticket. Where none exists (one dead item
name, one glyph used for two meanings), say so in the ticket and file it
anyway.

## 7. File the tickets

`gh issue create` against `shawndibble/neocom-desk`
(`docs/agents/issue-tracker.md`, heredoc body). **Labels: `--label enhancement
--label ready-for-agent`** — `--label bug` when the drift misleads (an icon
whose meaning contradicts another's, a link to the wrong place). Every issue
carries one category role and one state role (`docs/agents/triage-labels.md`).

`ready-for-agent` means `/next-ticket` builds it and squash-merges it with no
human in between. The acceptance criteria are what keeps that safe.

Ship only survivors, in the shape the review left them. Never backfill to hit a
count.

Body follows the house brief (`.claude/skills/triage/AGENT-BRIEF.md` —
behavioural, no file paths or line numbers, testable criteria):

```markdown
> _This was generated by AI during /ui-consistency._

## TL;DR

One or two sentences: what reads inconsistently today, and what it becomes.

## Agent Brief

**Category:** enhancement | bug
**Summary:** one line
**Axis:** the RUBRIC.md axis (A–G)
**Canonical pattern:** the DESIGN.md rule or primitive, or the majority usage
with its count — and, when it was derived rather than written, the DESIGN.md
wording to add
**Deviating sites:** every one, by route and component name
**What the user reads wrong:** the confusion each deviation causes
**Desired behavior:** every site follows the canonical pattern; state any site
that legitimately stays different and why
**Key interfaces:** the primitives, props and tokens involved
**Acceptance criteria:**

- [ ] every deviating site listed above uses the canonical pattern
- [ ] guard: the lint rule / test that fails if the drift returns (or
      "none possible" and why)
- [ ] DESIGN.md states the pattern (when it was derived, not written)

**Out of scope:** adjacent drift noticed but not fixed here

**Hostile review:** verdict, objections, and how the finding answers them

**Evidence:** the tally / glyph-map rows / matrix rows, and measurements if
taken
```

## 8. Update the ledger — curate, don't append

[LEDGER.md](LEDGER.md) is reference for the next run, not a run log. Update in
place, keep it under roughly 150 lines, never record run metadata. Its
sections are keyed by topic:

- **Axes swept** — one row per axis or entity, with what the sweep concluded.
- **Settled icon map** — glyph → its one meaning. Add every glyph confirmed
  consistent, so no run rebuilds the map from scratch.
- **Contract already enforced** — patterns guarded by lint or tests.
- **Justified exceptions** — matrix holes and deviations confirmed
  deliberate, so no run re-flags them.
- **Standing kill-tests** — reusable heuristics that kill a class of finding.
- **Filed findings** — issue number, verdict, one line.
- **Killed findings** — what, and why. This stops a re-pitch.

Commit and merge it exactly as
[`../improve-mobile-ux/SKILL.md`](../improve-mobile-ux/SKILL.md) step 9
describes — one shared PR, the `--merge --auto` arming, the 3-round
`drive-ci.mjs` loop, the prettier check — with the fixed branch
**`chore/ui-consistency-ledger`** and this skill's `LEDGER.md` path in place of
that skill's.

Remove the worktree when done, merged or not.

## Report

In the terminal, short: each issue URL with its hostile verdict, and the
dropped findings with their reasons.
