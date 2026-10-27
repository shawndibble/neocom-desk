# Scope decisions — Swap search replaces factories whose output nothing wants

_Recorded 2026-09-06._

- **An exchange is only ever offered against output the allocation could not
  place.** This is the safety rule the whole feature rests on. A factory whose
  P1 is feeding an allocated opportunity is load-bearing, and removing it would
  starve the very line it feeds; a factory whose P1 nobody wanted is simply
  worth less than what its budget could hold instead. Reading the supply pools
  _after_ allocation is what tells the two apart, so the conversion pass cannot
  run before it. This rules out the more aggressive search the raw arithmetic
  suggests — a market-fed Advanced Industry Facility clears about 6,300 ISK/hr
  against a Basic Industry Facility's 2,600–3,100, so "convert every fed Basic
  you own" is nominally worth around +100k ISK/hr — because that answer is a
  colony rebuild resting on hauling 2,400 units an hour, forever.

- **Only fed pins are convertible.** A starved pin makes nothing, so it has no
  margin to give up, and `idleFacilityPlan` already offers it for removal.
  Counting it here would offer the same pin twice under two different reasons.

- **What a factory earns is priced the same way as what would replace it** —
  revenue on the bid, its own material on the bid (the sale forgone), customs
  charged on the difference in tier, since the P0 leaves the planet either way.
  An exchange is only honest if both halves are valued on one basis.

- **The removed factories' output leaves the supply pool with them.** Otherwise
  a later line could be routed P1 from a factory that has just been torn down —
  the same class of promise as routing more than a planet makes.

- **The conversion pass fires only when the colony set is budget-bound.** With
  room to spare the allocation simply builds on free budget and nothing needs
  replacing, which is correct: an exchange offered where an addition would do is
  a demolition nobody asked for. On a Command Center level 5 operation with
  2,000–2,800 MW free per colony, budget is the binding constraint and leftover
  P1 does survive, so it does fire in practice.

- **A P2 factory is convertible too, not just a P1 one.** `colonyOutputPerHour`
  tracks every schematic's output, so an Advanced Industry Facility whose P2 no
  High-Tech Production Plant consumes is as eligible as a Basic one. It can only
  ever be replaced by a _better-paying_ product: swapping it for the same
  product gives an identical margin either side, so the net is zero and the
  `> 0` guard drops it.

- **The exchange removes as few pins as it can.** `remove` is scanned upwards
  and a new best needs a strictly greater net, so ties keep the smaller count.
  Where a factory earns something, removing one more than the replacement needs
  costs that margin and loses; where a factory earns nothing — a P2 quoted far
  below what its inputs cost, say — removing more genuinely does pay, and the
  card says so.

- **Known bound: valued at the best standing order, not tested against
  order-book depth.** `sellVolume`/`buyVolume` exist in the market aggregate but
  die at `marketData.ts`, so nothing here knows whether the book absorbs the
  volume a plan implies. Spot-checked against Jita at the time of writing: the
  5% percentile sat within 0–4% of the edge on every type involved, so the
  effect was around 16% on a market-fed factory's margin rather than an order of
  magnitude. Plumbing depth through is a separate change.

- **The hauling load is named on the card.** A market-fed Advanced Industry
  Facility is 80 units an hour of shopping, every hour. That is the part which
  does not appear in the ISK, and the pilot asked to be told what they would
  have to bring to the planet.
