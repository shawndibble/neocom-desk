# Scope decisions — Industry one-level sub-builds

_Recorded 2026-09-04._

- **A Build Plan can produce a material instead of buying it, one level deep,
  and only by manufacturing.** The make-or-buy marker already says a material
  is worth building; this is the player acting on it. The row's control swaps it
  for what its own job consumes, in the materials table, the shopping list and
  the CSV alike. Depth stops at one because the tree does not: a Raven's
  components reach planetary commodities in one step and raw planet resources in
  three, and nothing below the first level is reliably something a market sells.
  Planetary materials are therefore never expanded even when a schematic exists
  — a colony is not a job you can queue, and its inputs are grown over days.

- **This supersedes the third bullet of
  `20260904-230515-industry-shopping-list-and-planetary-build-marker.md`.** That
  one kept an advised-build material on the shopping list on the grounds that
  "the sub-inputs that would replace such a row do not exist on this plan". They
  exist now, but only when the player asks for them: an unexpanded plan behaves
  exactly as that bullet describes, so the rule it states is now the default
  rather than the only behaviour.

- **The sub-job is sized in runs, against what is still needed.** A recipe's
  output per run is what makes this worth computing — 150 seals at three a run
  is 50 runs, not 150 — and the count is derived from the material's remaining
  quantity, so units the plan already records as owned are never re-manufactured.
  Where the output does not divide evenly the overshoot is shown rather than
  hidden; 76 seals is 26 runs and two spare.

- **Each sub-job rounds its own materials before anything is merged.** EVE
  rounds material use once per job, so two jobs that each want 4.5 units of the
  same input cost five and five, not nine. `mergeSubBuildMaterials` therefore
  sums quantities the jobs have already rounded and must never re-derive them
  from a combined run count. This is the reason the feature is a tested engine
  module rather than a view that reshapes rows.

- **A recipe input is listed once, not once per parent.** Three components of a
  battleship that each consume the same reinforced fibre are one order, so the
  inputs merge by type across every expanded row, and an input the plan already
  buys directly simply gains the extra units on its existing row rather than
  starting an indented one. The expanded material keeps its own row instead of
  vanishing — it is still being acquired, and a row that disappeared on click
  would leave nothing to click again to undo it.

- **Two cost figures, never one rewritten in place.** The materials panel
  reports what the expanded plan buys plus the sub-jobs' installation fees,
  beside what buying those materials ready-made would have cost. The Results
  panel below is deliberately left pricing the plan as written: a sub-build
  changes what you shop for, not what the parent job installs or sells, and its
  estimated item value is computed from the parent blueprint's own ME0
  quantities either way. The wall-clock the sub-jobs add is stated for the same
  reason — 1500 seals is 500 runs, which is over ten days, and that is honest
  rather than a bug.

- **Known limits, accepted for a first cut.** The quote assumes the player can
  actually install the job: it does not check that a blueprint copy is owned,
  and a BPC's finite run count may be smaller than the runs suggested. Sub-job
  duration is quoted at TE 0, matching `makeOrBuy`'s existing manufacturing
  quote, because the recipe lookup carries the owned copy's ME but not its TE.
  And the bundled SDE is not complete: `blueprints.json` has no producer for
  Reinforced Carbon Fiber or Pressurized Oxidizers, and `pi.json` carries 68
  schematics, so some inputs stop at "buy it" whether or not EVE would let you
  make them.
