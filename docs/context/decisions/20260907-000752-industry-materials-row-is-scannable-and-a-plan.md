# Scope decisions — Industry materials row is scannable, and a plan write cannot revert itself

_Recorded 2026-09-07._

- **A plan write merges into the stored record inside a transaction, never
  into `selectedPlan` from a render's closure.** `handleUpdate` and
  `handleDerivedFix` both did `db.buildPlans.put({ ...selectedPlan, ...patch })`,
  which writes back every field the patch does not mention as it stood when
  that closure was captured. `handleDerivedFix` fires from an async effect
  reconciling the build system, so its closure is routinely older than what
  the pilot has done since — and it silently rolled `buildHere` back, up to
  and including wiping ten build choices at once. Observed live, three times,
  before it was traced. `saveSourcingEdit` has always taken the
  read-modify-write path for exactly this reason; the two whole-field writers
  now do too. The cost is that a write lands one tick later, which several
  tests had to start awaiting — that latency is real and was always there,
  merely hidden behind a write that read nothing.

- **Make-or-buy advice is priced against buying even while the material is
  being built.** `resolveMaterial` gives a built row `unitPrice: null` (it is
  not bought at a unit price), `makeOrBuy` reads that as "no price to beat"
  and returns no verdict — so the advice vanished the moment a player acted on
  it, and the row's tooltip fell back to naming the toggle's action, which
  read as a recommendation to undo the build. `materialRow.buyPricedLine`
  fills in the override-or-hub price for that comparison alone. Whether
  building beats buying is exactly the question a player wants answered
  _while_ they are building.

- **The advice tooltip leads with the suggestion, in bold, and closes with
  what a click does.** "Suggestion: Build It" / "Suggestion: Buy It", the two
  unit prices and the saving, then "Click to Build" / "Click to Buy". The
  suggestion and the click are deliberately independent: a row already being
  built is clicked to go back to buying, whatever the advice says, and
  spelling both out is what stops a single line reading as a contradiction.
  The reasoning is terse fragments (`Build 42.96/u at ME 0% · Buy 50.00/u`)
  rather than sentences — it is read off a hover at a glance. That also
  collapses six method-and-verdict strings into three method ones, since the
  heading no longer needs restating. `Tooltip.content` and
  `IconButton.tooltip` widened from `string` to `ReactNode` to allow it.

- **Owned-stock detection covers every row on the table, not the blueprint's
  own materials.** It was keyed on `blueprint.materials`, so a mineral a
  sub-build introduced was reported as unowned however much of it sat in the
  hangar — a pilot with 10,714,573 Tritanium was told they had none. Now keyed
  on the flat row list, memoised on the joined id string rather than array
  identity so `detectOwnedStock` still does not re-scan every Character's
  assets on a runs/ME/TE keystroke.

- **A materials row states each thing once.** The detected-stock offer lost
  its "16 owned" twin (the total and the placement breakdown moved onto the
  offer's own hover tooltip, and nothing renders once the offer is taken); the
  price column lost its `Hub` tag (the default needs no label — `Override`,
  `Owned` and `No price` are the exceptions worth one); the line total lost
  its owned/bought split line, keeping only `Need: N` under the quantity,
  which is the one part of that arithmetic not already on the row; and a built
  row's price cell is the word `Built` as the link into its recipe, with runs
  beside it, rather than a unit cost, a status word, a fee and a separate
  "Build it" link spread across three cells.

- **One door into the calculation breakdown.** The hero's "Calculations"
  button is gone; the Costs & Revenue panel's header keeps the identical
  trigger, next to the figures the breakdown explains. Folded, that panel
  shows total cost, revenue and net profit in its body — not beside its title,
  where three figures crowd two header buttons and wrap under them.
  `CollapsiblePanel` grew a `collapsedSummary` for that: the only thing a
  folded panel renders in its body, so the fold costs a reader the breakdown
  rather than the answer.
