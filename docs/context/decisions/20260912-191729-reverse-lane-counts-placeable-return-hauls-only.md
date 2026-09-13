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

  It takes a second filter pass to keep, not a split of one. An unplaced end has
  no region _and_ no space band, and those go null together — so asked with the
  hauler's band filter still applied, every row this line exists to report is
  dropped before it can be counted, and the figure reads zero exactly when it
  has something to say. The band filter is lifted for that pass alone: a band
  filter cannot apply to a row with no band.

- **The count narrows by every stage the board narrows by, the over-rate filter
  included.** It was written without that one, on the reasoning that the
  over-rate narrowing needs the corpus going rate, which needs every row's jump
  count — so the figure would render high mid-load and then drop while the
  reader looked at it. That was the wrong trade: activating the count spreads
  the whole UI filter, `overRate` with it, so a count that skipped the stage
  promised hauls the board it opened then filtered away. A dead link is worse
  than a figure that settles, and the count is gated on the distances exactly as
  the board is — with them still landing neither applies the filter, and once
  they land both do, so the two agree in every state.

- **The route-text filter is carried into the reverse lane unchanged, and is
  asymmetric at station granularity.** A needle matching a station name
  ("Jita IV - Moon 4") counts only return hauls touching that same station, not
  every haul back into the region. The alternative is deciding that typed text
  means something different on the way home, which is a guess about intent; the
  count is therefore of return hauls matching the hauler's current route text,
  and no separate knob is offered.

- **Region-level pairing, and one line rather than a nested table.** Both are
  the ticket's own calls, recorded here because they are what the code looks
  like: "somewhere in Domain back to somewhere in The Forge" is not necessarily
  near where the load is dropped, and at a corpus of a few hundred contracts for
  all of New Eden the reverse set for a region pair is typically none or one. A
  nested table would need a row cap, its own empty state, its own
  unresolved-endpoint note, and a rule for whether a click swaps or stacks the
  modal — all to render "none" most of the time.
