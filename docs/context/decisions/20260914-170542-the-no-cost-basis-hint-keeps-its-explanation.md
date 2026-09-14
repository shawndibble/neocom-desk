# Scope decisions — The no-cost-basis hint keeps its explanation and names the build-plan prerequisite (issue #1020)

_Recorded 2026-09-14 · issue #1020._

- **The hint is trimmed, not dropped.** It advertised two routes to a cost
  basis — linking a Production Run, and typing the cost in — and only the
  first has ever existed. The obvious minimal fix is to cut the clause and
  leave one sentence, but the hint is also the only place in the app that
  explains what a cost basis is _for_ (the lowest safe price). That
  explanation still earns its space on an order that has no cost basis, even
  for a player who cannot act on it today, so the hint keeps it and drops
  only the promise it could not keep.
- **The hint now names the Build Plan prerequisite up front.** A Production
  Run can only be logged against a Build Plan (`ProductionRunsPanel` is
  scoped to a `buildPlanId`), so a pure trader — someone who buys and resells
  and never builds — has no route to a cost basis at all. The old copy sent
  them to the Industry page with a "Link a build" button and no way to find
  out it would not help. Saying "make a build plan on the Industry page, log
  the run that made these, then link it to this order" costs one sentence and
  is the difference between a dead end and a dead end the player can see.
- **`market.orders.badge.noCostBasisAction` was corrected too, though the
  ticket named only the detail hint.** The badge legend's action line told
  the player to link a build with the same silence about the prerequisite, so
  leaving it would have shipped two strings that disagree about the same
  situation. Kept to the legend's one-line format.
- **The unused `market.orders.enterCost` string ("Type what it cost me") is
  deleted, not left dormant.** This follows the precedent
  `20260906-155913-open-orders-reads-as-a-worklist.md` set for
  `OrderBadgeKind`'s `stale`/`offHub`: copy declared ahead of the feature
  behind it gets removed and re-added when the feature lands, rather than
  sitting in the locale file looking implemented. The hand-entered cost basis
  is still deferred for the reason that decision gives — it needs a new
  stored table for a cost the app did not itself compute.
- **Not done: building the hand-entered cost basis.** Out of scope by the
  ticket, and independently argued against during the review that found this
  defect — the typed figure would drive the `belowFloor` problem that sorts
  the whole worklist, off a per-unit number the app has no way to check.
