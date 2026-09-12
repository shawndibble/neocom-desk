# Scope decisions — Courier risk flags state a condition, never a verdict (issue #944)

_Recorded 2026-09-12 · issue #944._

- **No flag claims the hauler cannot complete the contract.** The app cannot
  read a player structure's access list, and probing one per row is exactly the
  ESI fan-out the local-snapshot approach exists to avoid. So every string names
  a condition and what it would cost — "docking needs access its owner controls,
  and this app cannot check it" — never "you cannot dock". The consequence is
  stated because that is the part a hauler is deciding about: the collateral is
  already put up when the contract is accepted.

- **"Player structure" and "we could not read our own table" are opposite
  conclusions, and the resolver used to collapse them.** `sde/npcStations.ts`
  answers with three values on purpose — an entry, `null` for an id the loaded
  table does not hold (a player structure by elimination), `undefined` for a
  snapshot that could not be read at all — and `courierEndpoints.ts` treated the
  last two alike, which was harmless while the only consequence was an
  unshowable name. It stopped being harmless the moment a scam flag rode on the
  answer: one failed file read would have marked **every haul on the board** as
  a likely scam, which is the worst possible direction for a safety feature to
  fail in. `CourierEndpoint.resolution` now carries which of the three it was.

- **"No gate route" is derived, not pattern-matched.** The ticket framed this as
  a wormhole check, but a wormhole endpoint is always a player structure —
  `stations.json` holds no NPC station in any J-named system (0 of 5,210,
  checked; see #939) — so there is no system, no band and no name to test. The
  jump graph answers it directly instead: it keys every solar system, gateless
  ones with an empty list, so "in the graph, no edges" is literally "no stargate
  route reaches this system". That is true of all 2,597 J-space systems and of
  625 Drifter and unreachable systems beside them, which is the honest superset
  — the claim is about New Eden, not about wormholes specifically.

  The graph can only answer for an endpoint it can place, and a J-space endpoint
  is always a structure. The contract's own `regionId` covers the _pickup_: a
  region belongs to the place rather than to the contract, so the region a haul
  is posted in is the region its origin sits in, and every J-space system is in
  the 11000000 block. A structure that is only ever a _destination_ has no
  region from anywhere, so a J-space delivery is named as a structure but not as
  gateless. Both are true; the second is simply not always knowable, and
  guessing it is not on offer. It is still hidden by the completion control,
  which acts on the structure flag.

- **A missing graph and a gateless system must not read alike.**
  `hasStargates` is `false` for "no stargate touches this system" and `null` for
  "we could not read the graph" — the same distinction the flag above turns on,
  and the reason the jumps column already says "distances are unavailable"
  rather than reporting every haul as routeless.

- **A place no gate reaches gets no sovereignty note beside it.**
  `classifySpace` bands wormhole space by the `J######` name, so Thera —
  wormhole space, four NPC stations, no stargates — falls through to its raw
  security and reads nullsec. Printing both would tell the hauler the trip
  depends on sovereignty, standings or a jump network, none of which is true of
  anywhere a gate cannot reach. "No gate route" is the stronger claim and the
  correct one, so it stands alone.

- **Nullsec gets no marker of its own.** The route cell already names each end's
  space band (#939), which is informational text rather than a warning — exactly
  what a nullsec end should be. A second marker in a warning colour would turn
  that note into an alarm. It keeps its sentence in the detail modal, where
  there is room to say why it is only a note.

- **The hide control does not hide nullsec.** It removes player-structure
  deliveries and endpoints no gate route reaches. Plenty of nullsec hauling is
  ordinary, well-paid work, and putting it behind a safety control would quietly
  remove a real market rather than protect anyone.

- **Hiding is defined where the flags are, not in the row filter.**
  `completableCourierRoutes` sits beside `courierRisks` so the one module that
  decides what a risk _is_ also decides what hiding one means. Split across two
  files they could drift into disagreeing about which rows a flag covers.

- **The collateral-to-reward ratio stays in the detail modal.** It has been
  there since #938, and that is where the flags are spelled out, so the fourth
  signal already sits beside the other three at the point of decision. As a
  column it would add a card line below `sm`, which is the constraint the route
  cell markers were shaped to respect.

- **The markers are the shared visual language.** #946 adds the other half of
  the same picture — hauls priced to be _accepted_, where this covers hauls that
  are hard to _complete_. It extends `CourierRiskKind` and
  `courierRiskLabels.ts` rather than introducing a second badge system, and
  should not need to touch the rendering at all.

- **Only the delivery end carries the structure flag,** which is what the ticket
  asks for. An inaccessible _pickup_ is arguably the same trap — a public
  courier contract is accepted remotely and the collateral taken then, so a
  hauler who cannot dock to collect the cargo loses it just the same. Left out
  because the ticket names the delivery point specifically; raised in the PR
  rather than widened here.

- **Not done here:** no structure is probed, no ESI request is added, and no
  flag is derived from anything but the local snapshots the board already reads.
