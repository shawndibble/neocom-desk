# Scope decisions — Industry materials table is flat, one row per material

_Recorded 2026-09-06._

- **The materials table is a flat list, merged by typeID: one row per
  material, its quantity summed over every branch of the build tree that
  wants it.** This supersedes the indented, depth-tagged tree
  `20260906-205900-industry-recursive-sub-builds-feed-the-plans-own.md`
  introduced, and the single-level indent before it. Recursion made the tree
  the right shape to _price_ a plan and the wrong shape to _shop_ one: on an
  Orca with every component expanded, Reinforced Carbon Fiber appeared seven
  times — once per consuming branch, each at that branch's own quantity — and
  no number on screen answered "how many do I need". Worse, `MaterialsTable`
  keys its rows by typeID, so those repeats were duplicate React keys.
  Toggling a build now grows the rows its recipe feeds and appends any that
  are new, which is what keeps the list legible however deep a plan goes. The
  engine is untouched: `buildVsBuy` still resolves the full tree, and
  `subBuildPlan.materialTableRows` only flattens it for display.

- **A built material keeps its own row rather than being replaced by its
  inputs.** It is still something the plan has to end up holding, the row is
  the only visible evidence the choice was made, and it is the only place left
  to click to undo it. `shoppingListMaterials` — what multibuy and the CSV
  export read — stays leaf-only for the opposite reason: you cannot buy the
  thing you decided to make.

- **A built row shows runs and its own job fee in the line-total column, never
  a rolled-up purchase total.** Its ingredients now have rows of their own in
  the same flat list, so a rolled-up figure beside them would be counted twice
  by anyone reading down the column. The rolled-up cost is still there as a
  _rate_ — cost per unit built, in the price cell, tagged `Built` — which is a
  number nobody sums. The installation fee is the one figure the ingredient
  rows do not already carry, so that is what the cell shows.

- **The nesting the table gave up lives in a "Build it" modal, one material at
  a time.** Every built row carries a small text button after its name opening
  the recipe behind it: how many runs, what they yield against what the plan
  needs, and the ingredient list for all of those jobs together. An input that
  is itself being built has its own "Build it" there, which swaps the modal to
  that material rather than indenting a second list inside the first — so the
  tree is still walkable, one level per view, however deep the plan goes. The
  modal's quantities are the _jobs'_, and deliberately differ from the flat
  row's merged quantity whenever runs round up past what was asked for: the
  table says what the plan needs, the modal says what to feed the machine to
  get it.

- **The "building N materials here" footnote counts the plan's own materials,
  not every built row.** The total beside it and the "buying them ready-made
  instead" comparison are both top-level sums; a count of a different set in
  the same sentence reads as a count of those. What the deeper jobs cost is
  inside that total already, and the sentence now says so.
