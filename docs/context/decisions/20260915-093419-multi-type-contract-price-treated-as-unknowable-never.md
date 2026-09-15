# Scope decisions — Multi-Type Contract price treated as unknowable, never apportioned or excluded

_Recorded 2026-09-15 · issue #1076._

- **A Multi-Type Contract's price is real but never attributed to any one of
  its lines — apportioning it is ruled out entirely, not merely deferred.**
  EVE exposes no per-line price on a contract item record or the public item
  endpoint; splitting the whole ask by market value would invent a number the
  ESI data does not carry. So every surface that would otherwise attribute the
  price to a single blueprint (the ISK/run figure, Blueprint Acquisition's
  cheapest-purchasable-tier selection, a BPC Watch's all-time-cheapest
  baseline) treats it as unknowable instead — the same `null`/exclusion every
  other bad-data path in this feature already falls back to, not a derived
  approximation.

- **Multi-type contracts are never excluded from the snapshot or from search
  results.** A two-item bundle is often exactly what a buyer wants, and a
  third of all blueprint-copy rows come from multi-type contracts (measured on
  live data) — dropping them would silently delete real, buyable offers.
  They stay visible everywhere; only the _price attribution_ is suppressed.

- **The distinct-type tally is built client-side, in the same pass the
  snapshot loader already narrows rows in — no new stored field, no
  re-sync.** `contractOffers.ts`'s `bpcRowsFromContractOffers` counts every
  distinct `typeId` per `contractId` across _all_ for-sale lines it's handed,
  not just blueprint-flagged ones, before filtering down to blueprint rows —
  a contract mixing one blueprint copy with eleven plain modules is still a
  12-type bundle even though only the blueprint line survives the filter.

- **The tally must run over the whole snapshot, not per chunk.** The backend
  sorts contract-offer rows by contract before slicing them into fixed-size
  chunk docs (`functions/src/index.ts`'s `chunkRows`), which keeps one
  contract's lines contiguous but does not guarantee they land in a single
  chunk — a large enough contract (one archived bundle ran to 493 lines) can
  straddle a chunk boundary. `syncedContracts.ts`'s `fetchSnapshot`
  accumulates every chunk's raw rows into one array before calling
  `bpcRowsFromContractOffers` once, rather than narrowing per chunk as it did
  before this fix — narrowing per chunk would tally each half of a
  boundary-straddling contract as its own false single-type listing, silently
  wrong in exactly the case this decision exists to prevent.

- **Contract Search's item mode and both boards' maximum-price filters are
  exempt.** There, the row _is_ the contract and the ask is exactly what a
  buyer would pay for the whole thing — a bundle's price answering "what does
  this cost" is correct, not a mis-attribution, so neither surface needed to
  change.

- **A watch's "new offer" fire may still name a multi-type row; its "cheaper"
  fire never can.** A brand-new multi-type listing is still real, buyable
  information worth surfacing — suppressing it entirely would be crying wolf
  in the other direction — so it fires with `isMultiType: true` and the
  notification copy says the offer is part of a multi-item contract. A
  "cheaper" fire is different: the all-time-cheapest baseline is a monotonic
  ratchet, so a single bundle row matching it would permanently silence every
  future genuine "cheaper" fire that watch could ever raise. That baseline,
  and the "cheaper" comparison against it, are computed from single-type
  matches only.
