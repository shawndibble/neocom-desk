# Scope decisions — Open Orders reads as a worklist

_Recorded 2026-09-06._

- **Orders are grouped under their worst Order Problem, worst group first,
  and healthy orders start folded.** The page used to be a flat table with
  no opinion about which row needed the pilot first; grouping by precedence
  (`belowFloor`, then undercut at station/system/region, then
  expiring-or-stale, then outbid, then healthy) makes the page answer "what
  needs me" before it lists anything at all. Healthy orders are folded, not
  filtered out — the group's own heading and count still render, so
  "nothing needs attention" is a visible state, not an absence that reads as
  "nothing matched."
- **The undercut thresholds shipped as defaults, not laws:**
  `expiringWithinDays: 7` and `staleAfterDays: 12`
  (`DEFAULT_PROBLEM_THRESHOLDS` in `src/engine/market/orderProblems.ts`).
  Both are a starting point picked to feel right against a 90-day max order
  duration, not derived from a study of sell-through rates — every caller
  can override `ProblemThresholds`, and the constant is expected to move
  once real usage says otherwise. Record the values here so a later reader
  does not mistake "the shipped number" for "the correct number."
- **One floor shown, the second explained.** `orderFloor.ts` returns two
  numbers, `relist` and `fill`, but only `relist` is ever rendered as a
  figure — on the row and in the modal's quick-answer chip. `fill` surfaces
  only inside the deeper cost breakdown, because it only matters when the
  pilot is deciding to leave an order alone rather than re-price it; showing
  both as equally-weighted numbers up front would make the reader do the
  "which one applies right now" reasoning the page exists to do for them.
- **Station undercut is eager for every order; system and region are on
  demand.** Station prices are batched Fuzzwork aggregates — cheap enough to
  check on every refresh for every order. System and region undercuts need
  one region order book per item, so they run only when the pilot opens an
  order's detail or asks a group to "check deeper." The cost asymmetry, not
  a UX preference, is why the eager/on-demand split falls where it does.
- **Deliberately deferred, and why:**
  - Alert/notification settings for order problems — a later PR; this
    redesign only makes the problems visible on the page you're already on.
  - Reprocessing comparison ("would refining and selling the minerals beat
    selling the item?") — filed as #537, blocked on baking reprocessing
    yields into the SDE.
  - The market inside player structures — filed as #538; today only the
    region-wide check can see a structure's orders, so a station/system
    undercut against a structure-only rival cannot be graded yet.
  - A hand-entered cost basis (typing in what an order's stock cost, when
    there is no Production Run to link) — the "Type what it cost me" copy
    exists in en.json but isn't wired to anything yet; it needs a new
    stored table to hold a cost the app didn't itself compute, which is out
    of scope for this redesign.
- **`OrderBadgeKind`'s `'stale'` and `'offHub'` return when the features
  behind them land.** Both were declared and shown in `OrderBadgeLegend`
  with no `OrderProblem` ever able to produce them — dead copy this
  redesign accidentally shipped, now removed along with their `en.json`
  keys. `stale` needs per-order sale tracking (has anything sold since
  listing) that the current data shape doesn't carry; `offHub` needs a
  hub-gap comparison (is this stock sitting somewhere far from the trade
  hub while the hub price runs well above it) that nothing computes today.
  Re-add both to `OrderBadgeKind` and the legend when those land, not
  before.
