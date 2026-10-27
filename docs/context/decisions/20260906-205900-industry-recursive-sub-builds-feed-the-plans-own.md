# Scope decisions — Industry recursive sub-builds feed the plan's own profit

_Recorded 2026-09-06._

- **A Build Plan can now build a material's own recipe inputs, recursively,
  however many levels the recipe tree actually has** — this supersedes the
  depth-one limit in
  `20260904-235527-industry-one-level-sub-builds.md`. That decision's own
  reasoning ("the tree does not [bottom out at one level]") was the argument
  for the reversal, not against it: `recipeFor` already answers per material,
  at any depth, whether anything produces it, so the recursion stops on its
  own wherever a real recipe tree does — a raw mineral or an unmodelled
  planetary input still falls back to "buy it", exactly as before. Nothing
  about that per-type answer depended on how deep the caller was standing.
  Two guards exist purely as a safety valve, never as a feature:
  `MAX_SUB_BUILD_DEPTH` (10) bounds a pathological chain, and a `visited` set
  refuses to build a material that is already its own ancestor on the branch.
  Planetary materials are still never expanded — that half of the original
  decision holds unchanged: a colony is not a job you can queue.

- **The build choice is now a pricing input to the plan's own profit, not a
  second, parallel computation.** This supersedes the "Two cost figures,
  never one rewritten in place" bullet of the same prior decision. Before,
  `buildVsBuy` priced every material at the hub regardless of `buildHere`,
  and a separate features-layer expansion repriced the materials table alone
  — so toggling a build changed what the table showed without ever touching
  the Results panel's profit, and a material with no hub listing stayed
  permanently unpriceable even once the player said exactly how they'd source
  it. Now `buildVsBuy` itself resolves every `buildHere` choice
  (`src/engine/industry/materialResolution.ts`): a built material's line cost
  is the rolled-up cost of the job that produces it — materials plus every
  sub-job's own fee, recursively — and that number is what `materialCost`,
  `totalCost` and `profit` are computed from. The parent job's own fee is
  untouched (`estimatedItemValue` reads the parent blueprint's ME0
  quantities, unaffected by how its inputs were sourced); only the material
  cost side moves.

- **A poisoned leaf blocks profit honestly instead of pricing it as free.** A
  material neither owned, priced, nor itself buildable makes `unitCost` (and
  therefore every ancestor's own rolled-up cost) `null`, propagating up
  through however many built levels sit above it — the same `unpriceable`
  contract the plan already had for a single unpriced material, now correct
  through recursion. This is what actually answers the motivating case: a
  component with no listing at the configured trade hub gets a real profit
  figure once the player marks it (and, if needed, its own inputs) to build,
  and stays honestly blank if some deeper ingredient genuinely has nowhere to
  price it.

- **Owned stock is one pool for the whole resolved tree, not one per branch.**
  Two different built materials can each recurse into the same raw input (two
  components both consuming Tritanium, say); a shared, mutable
  `ownedPool: Map<typeID, remaining>` is threaded through every recursive
  call so the first branch reached claims what's available and a later branch
  sees the true remainder — never the same physical stock credited twice.

- **The materials table shows one flattened, depth-tagged list
  (`MaterialTableRow.depth`) instead of a boolean `isSubInput`.** A built
  row's own Price/Line total cells now show its real rolled-up cost, not a
  placeholder — "Built" plus a per-unit number, and the line total the
  build's remaining quantity actually costs — because that number now exists
  and feeds the plan's own totals; before, it was blank because there was
  nothing behind it worth showing. The build-here control (hammer/cart) is
  offered at any depth on any row a recipe can produce, not only the plan's
  own materials — a recipe input a build introduced is exactly as buildable
  as anything else, which is what lets a player keep drilling down.

- **The shopping list and CSV export flatten the whole tree to its leaves,
  merged by type**, generalizing the old one-level `mergeSubBuildMaterials`.
  A material with a `subBuild` never appears in either export itself; its
  leaves do, however deep they sit, so multibuy still gets one line per
  mineral rather than one per branch that happens to consume it.

- **The materials-table price fetch (`buildPlanTypeIds`) walks the whole
  reachable recipe tree instead of two fixed hops**, bounded by the same
  `MAX_SUB_BUILD_DEPTH` safety valve. The old two-level widening matched the
  old one-level sub-build plus one level of make-or-buy advice on its inputs;
  once a build can go arbitrarily deep, a fixed hop count would show "No
  price" on a real, priceable row for no reason but an unfetched price —
  indistinguishable from a genuine unpriced material.

- **The "buying it ready-made instead" footnote compares against a real,
  per-item baseline, or says nothing.** The prior wording used the plan's own
  (pre-recursion) `materialCost` as "what buying instead would cost" — for a
  material with no hub listing, that quietly priced it as free, understating
  the comparison by the exact amount the whole feature exists to price
  correctly. The footnote now runs a second, `buildHere: []` pass of the same
  plan purely for this comparison (never for the plan's own totals) and shows
  the comparison sentence only when every built top-level material has a real
  price in that baseline.
