# Scope decisions — Auto make-or-buy depth reuses buildHere, decided by unit-economics not a parallel cost engine (issue #652)

_Recorded 2026-09-09 · issue #652._

- **The auto pass is a decision function, not a second recursive cost engine.**
  `src/engine/industry/autoMakeOrBuy.ts`'s `autoBuildHere` walks a build's
  material tree up to the player's chosen depth (0–3, default 1) and, at each
  node, reuses `makeOrBuy.ts`'s existing single-level cost compare (the same
  primitive the hand-ticked make-or-buy marker uses) to decide build-or-buy.
  The result is a plain `Set<number>` of typeIDs — nothing more — which then
  becomes the plan's ordinary `buildHere` field. The actual recursive costing
  (owned stock, job fees, poisoned-leaf propagation) still runs entirely
  through `resolveMaterial`/`buildVsBuy`
  (`20260906-205900-industry-recursive-sub-builds-feed-the-plans-own.md`),
  unmodified — an auto-picked material is costed exactly as a hand-ticked one
  would be, not by a parallel calculation that could drift from it.

- **This "auto build depth" is a distinct, smaller cap from
  `MAX_SUB_BUILD_DEPTH`, and is never confused with Order Depth.** The
  player-facing 0–3 control here bounds how far the _auto-decision_ searches;
  `MAX_SUB_BUILD_DEPTH` (10) remains the recursive engine's own pathological-
  chain safety valve, untouched. Naming avoids the Opportunities tab's
  existing "Order Depth" (order-book depth vs. build cost,
  `classifyOrderDepth`) — the UI control and its i18n keys are
  `opportunitiesAutoBuildDepth*`, never a bare "depth", so the two concepts
  stay visually and lexically separate on a tab that already uses the word
  for something else.

- **A material only ever gets auto-picked if `resolveMaterial` would actually
  honor it.** `resolveMaterial` silently no-ops a `buildHere` entry for a
  reaction or planetary material (it only ever recurses into a
  `method: 'manufacturing'` recipe) — so `autoBuildHere` skips reaction and
  planetary candidates entirely rather than offering a typeID the real plan
  would then do nothing with.

- **The auto pass sizes every verdict at the plan's real run count, not a
  fixed 1 run.** Per-job rounding (`materials.ts`) happens once per job
  regardless of run count, so a verdict computed at the wrong scale can
  disagree with what `computeBuildPlan` actually bills once the resulting set
  becomes `buildHere`. `autoBuildHere` takes the plan's `runs` for the root
  level, and at each recursive step re-derives the child recipe's own run
  count from the actual quantity needed (`Math.ceil(needed / outputPerRun)`,
  mirroring `makeOrBuy.ts`'s own `jobUnitCost` sizing) rather than assuming
  one run of the child too.

- **Depth counts materials-tree levels, matching `materialResolution.ts`'s
  own recursion counter.** The product's own materials sit at depth 0, so a
  depth of 1 evaluates only those; a depth of 2 also evaluates the materials
  of whichever of those got auto-picked, and so on — the same counter
  semantics `resolveMaterial`/`resolveSubBuild` already use, so "depth" means
  one thing across both the manual and the automatic path.
