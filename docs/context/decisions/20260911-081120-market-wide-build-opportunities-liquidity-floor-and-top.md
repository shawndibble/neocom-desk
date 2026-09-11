# Scope decisions — Market-wide Build Opportunities liquidity floor and top-N defaults (issue #819)

_Recorded 2026-09-11 · issue #819._

- **Liquidity floor defaults to 50M ISK of sell-order value at the hub
  (`DEFAULT_LIQUIDITY_FLOOR_ISK`, `src/features/industry/marketWideOpportunities.ts`).**
  The ticket calls this a human judgment call with no ESI-derivable number to
  anchor it to. 50M is low enough that a mid-tier T2 module or ammo line still
  clears it, but high enough to exclude products with essentially no live
  market (a handful of orders at a stale price). Rules out a floor tied to
  build cost or product price — depth is about whether a market exists to
  sell into, not whether the item is expensive.
- **Top-N per Market Group category defaults to 5
  (`DEFAULT_TOP_N_PER_MARKET_GROUP`).** Keeps the survivor set (and therefore
  the second, material-price fetch) small regardless of how many products
  clear the liquidity floor in a busy category — the ticket's "never a
  full-SDE sweep" requirement applies to the price-fetch cost, not just the
  precomputed material trees. Five was picked as "enough to compare a few
  real options per category without the panel becoming a second full list."
  Rules out ranking every liquid candidate before capping — the cap is a
  pre-filter, applied on sell-depth ordering, not a post-hoc truncation of a
  fully-priced ranked list.
- **A product's own Market Group ID is the grouping key, and a product with no
  Market Group is treated as its own single-member group, never merged with
  another ungrouped product.** The build script (`scripts/build-sde.mjs`)
  only bakes `marketWideTrees.json` entries for products that carry a Market
  Group at all, so this case is dead code in practice today — kept as an
  explicit rule in `selectLiquidCandidates`
  (`src/engine/industry/marketWideOpportunities.ts`) rather than an assumed
  invariant, since a `null` group forced to share one bucket would silently
  make unrelated items compete for the same N slots.
- **The precomputed material tree ignores ME/TE, owned stock, and
  auto-make-or-buy — it is an ME-0 approximation, not a `computeBuildPlan`
  run.** This is what makes precomputing the whole SDE's manufacturing trees
  at build time (rather than resolving each one live, which the ticket
  explicitly rules out) tractable. Selecting a row still opens a real Build
  Plan, where `computeBuildPlan` supplies the exact numbers — this scan only
  has to be good enough to point at the right candidates, not exact.
