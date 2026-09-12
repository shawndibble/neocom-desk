# Scope decisions — Over-payment is stated as a rate, never as an accusation (issue #946)

_Recorded 2026-09-12 · issue #946._

- **No flag calls a contract a scam, and the wording was the hardest part.** The
  app cannot read intent, cannot value a courier contract's cargo — it carries
  no item lines at all — and cannot know who can dock where. So every statement
  is one the snapshot supports: "pays 60x the median reward per m³ per jump",
  "collateral is 40x the reward", "route crosses 2 systems at 0.5 or below",
  "expires in 19h". The player draws the conclusion. A first draft of the
  over-rate sentence mentioned "courier scams" in passing and the suite caught
  it — the test asserts the detail contains no "scam", "fraud" or "bad faith",
  which is the bound made mechanical rather than left to review.

- **The threshold is derived from the ticket's own figures, not picked round.**
  On a reward-per-m³-per-jump normaliser an honest short hop — 4M for 10,000 m³
  over 3 jumps — already runs ~3.6x the median of ordinary work, because a small
  parcel pays more per cubic metre than a freighter load does. The documented
  bait sits an order further out: 30M for 5,000 m³ over 8 jumps is ~20x, and
  100M for a short lowsec run is ~900x. **8x** clears ordinary small-parcel work
  comfortably and still catches the cheapest documented bait with room to spare.
  Three, the first number that suited "several times", would have flagged honest
  work. The threshold fails safe in that direction on purpose: a missed outlier
  costs a hauler nothing they were not already exposed to, a false one accuses
  ordinary work.

- **The rate multiple cannot see the freighter shape at all, which is why the
  conditions ship with it.** A freighter-gank contract at 50M for 350,000 m³
  over 5 jumps runs **0.8x** the going rate — below the median, not above it. So
  volume over 350,000 m³, the collateral-to-reward ratio, the count of systems
  crossed at 0.5 or below, and the hours to expiry are surfaced beside the
  multiple rather than derived from it. Two different shapes, one treatment.

- **A median needs a sample before it means anything.** `MIN_GOING_RATE_SAMPLE`
  is 20, and below it no row shows a multiple at all. A median over three rows
  is arithmetically fine and statistically meaningless, and this one decides
  whether a contract is called an outlier — a claim adjacent enough to an
  accusation that it should not rest on three samples. Degrading to silence is
  the right failure.

- **The going rate is measured over the whole corpus, so the jump counts are
  too.** They used to be computed for the filtered set (#943). A median that
  moved every time a filter changed would be a comparison against the rows still
  on screen rather than against the market, so the distance pass now runs over
  every row and the counts are looked up by contract id rather than by position.
  It costs no more than the unfiltered case already did.

- **`volume: 0` and `jumps: null` are excluded, never coerced.** A courier
  contract carries no item lines, so a zero volume is a figure the snapshot
  genuinely holds rather than a divisor, and an unplaced or unroutable endpoint
  has no distance. Both give `null` — the `null`-not-`Infinity` discipline
  `courierRates.ts` already keeps — and such a row shows no multiple and is
  removed by neither direction of the filter: "we cannot say" is not "within the
  going rate", and it is not "far above" it either.

- **A same-system haul counts as one jump**, matching `iskPerJump`. Zero jumps
  is a real answer, not a missing one, and dividing by it would read as an
  infinite rate and top every outlier list. Diverging would also give one row
  two different distances in two adjacent cells.

- **The multiple is a second line in the ISK/jump cell, not an eighth column.**
  The table is already seven wide and every column becomes a card line when it
  stacks below `sm`. It names its own benchmark inline — "60x going rate" —
  because it is a multiple of the corpus median per m³ per jump rather than of
  the ISK/jump figure printed above it, and a bare number there would read as
  the latter.

- **The route exposure is computed for one contract, on demand.** Counting the
  systems a haul crosses at 0.5 or below needs the path, not just the endpoints,
  and a path per row is the fan-out shape the local snapshots exist to avoid. It
  resolves when the detail opens, which is where a hauler is deciding anyway.
  0.5 is counted rather than only lowsec because 0.5 is where the documented
  ganking happens — CONCORD responds slowest there.

- **The filter offers both directions.** A hauler avoiding the documented bait
  wants these rows gone; one who has read the conditions and judged them for
  themselves wants only these. Neither reading is the app's to make, so it
  offers both and defaults to neither.

- **`over-rate` extends #944's vocabulary rather than starting a second one.**
  It is a property of the contract rather than of one end, so it is added by the
  board rather than produced by `endpointRisks`, and it is the case that proves
  `MARKED_RISKS` and `blocksCompletion` are different lists: paying well above
  the market earns a badge and is no obstacle to delivering anything.

- **Not done here:** no ESI request, no cargo valuation, and no claim about
  whether any particular contract is honest.
