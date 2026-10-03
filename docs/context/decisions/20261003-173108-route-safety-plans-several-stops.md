# Scope decisions — Route Safety plans several stops (issue #2475)

_Recorded 2026-10-03 · issue #2475._

- **A trip takes at most 10 Stops after its start.** The optimizer is exact
  (Held-Karp over the stops free to move, `engine/route/tripPlan.ts`), and at
  10 that is about 100,000 steps — instant on a phone. Past that an exact
  order stops being free, and a heuristic order would be a guess the page
  then presents as "the" order. Ten covers a hauling or buying run; a longer
  itinerary is a list, not a route.

- **Optimize stop order minimises route cost under the active rules, not raw
  jumps.** Each pair's cost comes from the very search a leg is drawn with
  (`routeSweepFrom`), under the same Route Preference, security penalty and
  avoid list, so the order and its legs always agree. Under Prefer shorter
  that cost is the jump count; under a security preference a cheaper order can
  fly more jumps, and the note states the real before and after jumps rather
  than promising fewer. Costs are directed — a step costs what entering its
  system costs — so the matrix is never mirrored. Whatever later reaches the
  leg search (wormhole edges, #2476) reaches the ordering with no change to
  the optimizer. The typed order wins any tie, so the order only changes for a
  real saving.

- **Two options, and only while optimizing.** _Return to start_ adds the way
  home as a last leg and counts it. _Keep last stop last_ fixes the final stop
  as the real destination and moves only the stops before it. Both sit under
  the switch and are off with it: with optimizing off the trip is flown
  exactly as typed, one way.

- **The link keeps the typed order.** `stops` holds the stops as typed; the
  optimized order is drawn in the legs and named in the note, never written
  back, so turning the switch off restores the trip as the pilot wrote it. A
  legacy `?to=` link opens as a single stop, and with one stop the page is
  exactly what it was.

- **An unreachable stop is a fact about its legs.** A stop no stargate route
  reaches (J-space, say) gets its legs' no-route message while the other legs
  still draw, and optimizing is off until it is removed: no order can fly it.
  The trip's facts line and strip need every leg, so they wait for it too.

- **Avoid from a leg previews that leg.** Each leg's rows offer Avoid as a
  single route's do; the preview re-plans the leg it was asked from and states
  that leg's jumps. The trip's start and every stop are never offered.
