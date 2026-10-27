# Scope decisions — The combining plan spans every system, priced at each host's own office

_Recorded 2026-09-06._

- **The network plan now covers every system the character has a colony in, not
  just the one on screen.** Combining is precisely the thing one planet cannot
  do alone, and there is no reason the other planet has to be next door. A pilot
  whose two refineries sat in different systems was told each could only sell
  raw — the exact blindness this surface exists to remove. The per-planet cards
  still answer for the system on screen; only the "Together" panel spans.

- **A colony carries its own customs rate, and only the host's is ever used.**
  This is what makes spanning systems cheap rather than a second tax model.
  `chain.ts` charges sourced material on exactly one boundary — the import onto
  the planet that consumes it — and the export off that same planet. A supplying
  colony's own export sits outside the chain's boundary set. So a cross-system
  plan needs the right rate per candidate host and nothing else.
  `NetworkOptions.taxRate` stays as the fallback for a colony that carries none,
  which is every existing caller.

- **A candidate is screened at the kindest rate in the set and priced at its
  host's.** Ranking needs one number per candidate, and the margin now depends
  on which colony hosts it, so the screening figure is an optimistic bound: a
  product the customs office eats at the best rate in the set is eaten
  everywhere. Greedy ordering by an upper bound is still greedy — ADR 0012
  already records that the allocation is a good split rather than a provably
  optimal one — and what a line reports is always recomputed at its real host's
  rate.

- **The host is the colony that earns the most, not the one with the most
  room.** Capacity alone was right while every colony shared one rate. Across
  systems it is not: the roomiest planet can be the one whose office takes the
  difference. Ties still go to a colony that already makes one of the inputs —
  one fewer customs boundary and one fewer route to set up.

- **"Room but no margin" is reported as `unprofitable`, not `no-host-budget`.**
  Two different facts. A pilot with spare Powergrid behind a 90% office is not
  short of room, and telling them so would send them to buy a Command Center
  upgrade that changes nothing.

- **Planet names already carry their system**, so a cross-system route reads
  correctly without extra plumbing: EVE names a planet `<System> <Numeral>`, and
  "route in from Efa V" is unambiguous wherever the reader is standing.
