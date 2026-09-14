# Scope decisions — Often undercut flag samples on the Open Orders page, not in the poller (issue #1018)

_Recorded 2026-09-14 · issue #1018._

- **The `OrderProblem` samples are taken on the Open Orders page, not in the
  Foreground Poller, because an order's `OrderProblem` is not computable
  where the poller runs.** The ticket's brief assumed `pollDomains.ts`'s
  existing market-order poll already had the classification in hand and only
  discarded it. It does not: `marketOrderDomain` loads
  `loadOrders`/`loadOrderHistory` and derives `{orderId, isBuyOrder, typeId,
quantity, filled}`. Classifying an order needs Fuzzwork station aggregates
  and a cost basis — `buildOpenOrderRows`'s inputs — and `fetchAggregates`
  has no cache layer, so making the poller classify would mean an uncached
  third-party request per station every 5 minutes for every user with the app
  open, including ones who never open this tab. That price buys a coarse
  badge, so it was not paid. Sampling instead rides
  `OpenOrdersPanel`'s own row build, which `useRouteSnapshot` re-runs on the
  poller's ESI cache revalidation — so a tab left on this page samples at
  roughly the same ~5-minute cadence for free, and a tab that is elsewhere
  records nothing.
- **The thresholds shipped as defaults, not laws** —
  `DEFAULT_UNDERCUT_HISTORY_THRESHOLDS` in
  `src/engine/market/orderProblemHistory.ts`, the same standing
  `DEFAULT_PROBLEM_THRESHOLDS` has in
  `20260906-155913-open-orders-reads-as-a-worklist.md`. Recorded here so a
  later reader does not mistake the shipped number for the correct one:
  - `windowMs` 7 days — long enough to outlive a weekend with the tab shut,
    short enough that a re-priced order stops wearing the flag within a week.
  - `minSamples` 12 — about an hour of the page being left open at the
    observed cadence, or a dozen separate visits. Below it the order is "not
    judged yet" and wears no flag at all, which is what stops a
    freshly-listed order reading as chronically mispriced off two unlucky
    samples.
  - `undercutRate` 0.5, strictly exceeded — an even split is not "most of
    the time".
  - `minSpacingMs` 4 minutes — just under the poller's 5, so an ordinary
    refresh always records while a burst (route re-entry, a manual refresh)
    records once. The guard compares against the _stored_ last-sample
    timestamp, not a React ref, because a remount would reset a ref and let a
    burst through. Readings from within one load are handled separately: they
    share that load's timestamp, so a later, better-informed classification
    (a deep-competition fetch landing) replaces that load's sample rather
    than being dropped as too soon.
    None of these were validated against real order lifetimes — nobody has that
    data yet. They are the numbers to move first if the flag reads wrong.
- **The prune only ever covers characters whose orders were genuinely
  read.** `loadAllCharactersOpenOrders` deliberately keeps two failure
  shapes in `entries` rather than `skipped`, both with an empty `orders`
  array, so the page can show a per-character prompt instead of the row
  vanishing: a character needing re-auth, and one whose fetch returned no
  cache (offline, or a cold first load, which reads as `fetchedAt: 0`).
  Either one looks exactly like "every order closed" to a prune that reads
  only order ids, and would silently delete weeks of samples with no error to
  show for it. `sampleableCharacterIds` is the one place that distinction is
  drawn, and it is tested rather than left as a condition inside an effect.

- **The flag is a boolean, and renders no count.** The ticket allowed either
  a rate bucket or a boolean; boolean won because the series is genuinely
  gappy — samples exist only while this page is open — so "undercut 7 of 13
  checks" would claim a precision the sampling does not have. The badge
  therefore carries no `detail` string, which is asserted in
  `orderBadgeKind.test.ts` rather than left as a convention.
- **`frequentlyUndercut` is a new `OrderBadgeKind`, NOT a new
  `OrderProblem`.** The brief called for "one new `OrderBadgeKind` in the
  `engine/market/orderProblems.ts` family", but those are two types in two
  layers: `OrderProblem` drives the page's grouping and precedence, so adding
  one there would move rows between groups and break the ticket's own "no
  change to any order already reading worse-than-healthy". The flag rides on
  top of a row whose `problem` stays `healthy`.
- **It wins the healthy branch of `orderBadgeFor` outright**, ahead of both
  `best` and `noCostBasis`. A chronically-beaten order wearing a green "best
  price" badge is the one actively misleading row this page can produce, and
  "we cannot work out your floor" is a lesser thing to say about an order the
  app _can_ say is chronically beaten.
- **This is not a repeat of the `stale`/`offHub` mistake.**
  `20260906-155913-open-orders-reads-as-a-worklist.md` removed both because
  they were declared with no data able to produce them. This badge ships with
  its own store (`db.orderProblemSamples`, schema v12) and the code that
  fills it, so it can fire the day the samples accumulate — and shows nothing at all
  until they do, rather than guessing from a near-empty history.
