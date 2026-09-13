# Scope decisions — Reverse lane counts placeable return hauls only (issue #941)

_Recorded 2026-09-12 · issue #941._

- **The reverse-lane count excludes return hauls whose own drop-off nothing
  local places, and says how many it excluded.** The lane is matched region to
  region, and `loadCourierEndpoints` only falls back to the contract's own
  region column for a _pickup_ — a destination is placed solely by
  `stations.json`, which holds NPC stations and nothing else. So a return haul
  delivering to a player structure has no destination region and cannot be
  matched into the lane at all. Placing it would cost one
  `/universe/structures/{id}` per unmatched id against an ACL that refuses most
  of them, which is the ESI fan-out every courier decision so far has refused.
  The count is therefore of _placeable_ return hauls, and a second line states
  how many left the right region for somewhere we cannot name. Rules out a bare
  count, which the ticket itself calls out as reading "nobody is hauling back"
  where the truth is "we cannot tell".

- **The count ignores the board's over-rate filter, while honouring every other
  filter.** The other filters — region, reward floor, collateral ceiling, hull
  volume, deadline, and the completability toggle — are pure and settle the
  moment the modal opens. The over-rate narrowing is not: it needs the corpus
  going rate, which needs every row's jump count, so a count that included it
  would render high mid-load and then drop while the reader was looking at it.
  This modal already pins its expiry countdown for exactly that reason. The
  trade is that with the over-rate filter on, the board that opens can hold
  fewer hauls than the count promised — a filter the hauler toggled themselves,
  not a wrong figure.

- **Region-level pairing, and one line rather than a nested table.** Both are
  the ticket's own calls, recorded here because they are what the code looks
  like: "somewhere in Domain back to somewhere in The Forge" is not necessarily
  near where the load is dropped, and at a corpus of a few hundred contracts for
  all of New Eden the reverse set for a region pair is typically none or one. A
  nested table would need a row cap, its own empty state, its own
  unresolved-endpoint note, and a rule for whether a click swaps or stacks the
  modal — all to render "none" most of the time.
