# Scope decisions — Courier hauls carry endpoint space, not route safety (issue #939)

_Recorded 2026-09-12 · issue #939._

- **The band describes an end, and the UI never lets it read as the route.**
  A highsec pickup and a highsec delivery can still route through lowsec, and
  this app cannot know which: answering that is one route lookup per row
  against ESI's shared 100-errors-per-minute budget, the fan-out every courier
  scope decision so far refuses. So the board shows a band beside each end and
  the filter is called **Destination space**. There is deliberately no "avoid
  lowsec" or "safe routes only" control — that would be a claim about the whole
  trip made from data that only describes its two ends. Same shape as the
  `20260906` hauling decision: ship the number, say outright what is not in it.

- **The classifier is reused, never reimplemented.** `classifySpace` already
  exists for BPC Search's Space filter (#796) and bands wormhole space by the
  `J######` name before falling through to `securityBand`, because a wormhole's
  raw security status is not a reliable signal. Restating those cutoffs here
  would be a second source of truth for a question the app already answers.

- **`space` is required on `CourierEndpoint`, not optional.** An optional field
  lets a hand-built fixture omit it silently, and the band would then be missing
  in tests while the suite stayed green — twice already this has been how a real
  bug shipped past a green suite. Required makes the compiler enumerate every
  producer.

- **An end nothing local places has no band, and a narrowed filter drops it.**
  A player structure is not in `stations.json` by definition, so there is no
  system and no security status to classify. It shows "Unknown space", never a
  guessed band — it is already excluded from the destination-region filter for
  exactly this reason. Because that reads to a player as the filter eating rows,
  the empty state names that cause when it is the one that applies, rather than
  presenting the board's own exclusion as an absence in the data.

- **The chips offer only the bands these hauls actually end in.** Checked
  against the shipped snapshot: **no NPC station sits in a J-named system** — 0
  of 5,210, against 2,597 J-named systems. Endpoints are named out of
  `stations.json`, which holds NPC stations only, so wormhole hauls end at
  player structures that nothing local places at all, and a fixed four-chip row
  would offer a Wormhole chip that can never match. Worse, deselecting it would
  read as a no-op while silently dropping every haul whose destination has no
  band. Derived from the rows — the rule `regionOptionsFor` already applies one
  function above — so it corrects itself if the SDE ever does place a station in
  J-space. (Thera is the one wormhole-space system with NPC stations; it is not
  J-named and reads `-0.99`, so `classifySpace` bands it nullsec. That is the
  shared classifier's answer and BPC Search gives the same one; changing it is
  not this ticket's to make.)

- **Every offered band selected is no filter at all.** Deselecting every band asks
  for hauls ending in none of them and is honestly empty; "show everything"
  lives in the all-offered-selected case, which the panel maps to no filter so
  unplaced destinations stay visible. Measured against what is on offer rather
  than against all four, since a band with no rows behind it must not be able to
  hold the filter open.

- **No new column and no new card line.** The band rides inside the existing
  two-line route cell beside the region label already there, so the table's
  width is unchanged and the card the row collapses into below `sm` gains
  nothing. The filter goes in the bar that is already `collapsible`, where an
  extra control costs nothing at either width.

- **Not done here:** the detail modal is unchanged — the ticket scopes this to
  the route cell and the filter. No origin-space filter either: "what leaves
  highsec" is a question about the hauler's current position, which the origin
  region filter already answers better.
