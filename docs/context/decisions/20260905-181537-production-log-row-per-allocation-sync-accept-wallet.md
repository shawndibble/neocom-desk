# Scope decisions — Production Log: row-per-allocation sync, accept wallet-window aging, build both linking mechanisms (issue #525)

_Recorded 2026-09-05 · issue #525._

- **Manual snapshot, not automated FIFO reconstruction.** A Production Run is
  a pilot-entered snapshot of one build (materials cost, job fee, quantity)
  off a Build Plan, editable at logging time and never re-derived afterward —
  distinct from `BuildResult`'s live, market-driven _estimate_. Considered and
  rejected: reconstructing realized profit automatically from ESI wallet
  transaction history by FIFO-matching sells against buys/completed jobs (the
  approach EVE Tycoon, jEveAssets, ETMv2 and Industreaux all use a variant
  of). Rejected because EVE market items are fungible — there is no per-unit
  provenance — so FIFO is an approximation that silently desyncs whenever an
  item leaves the tracked flow another way (reprocessed, gifted, moved to a
  corp hangar, blown up); every tool that does this ships a manual correction
  UI because there is no way to avoid the drift. Correct-by-construction was
  chosen over automation for exactly that reason.
- **Each linked sale/order-watch is its own Dexie table row and its own
  Firestore document, never a field on the Production Run's own document —
  this is what actually answers findings 1 and 2 of the pre-implementation
  hostile design review (double-counting and the cross-device sync-drop).**
  `sync/merge.ts`'s `mergeRecords` is last-write-wins per _whole document_
  (`updatedAt`), not field-level. An `allocations: []` array field on one
  `ProductionRunRecord` would mean two devices linking _different_ sales to
  the same run before syncing silently drop one allocation — exactly finding 2. Instead, `ProductionSaleLinkRecord`/`ProductionOrderWatchRecord`
  (`src/db/index.ts`) are separate collections, one row per allocation, keyed
  deterministically off ESI's own natural id (`${characterId}:txn:{transactionId}`,
  `${characterId}:order:{orderId}`) rather than a random uuid. Two devices
  linking different sales to the same run now write two different documents —
  nothing to reconcile, no merge conflict possible. This is a direct copy of
  the Notification Feed's Occurrence Key precedent (CONTEXT.md) and needed
  _zero_ changes to `merge.ts` — `productionRunSpec`/`productionSaleLinkSpec`/
  `productionOrderWatchSpec` (`src/sync/planSync.ts`) are three ordinary
  `CollectionSpec`s using the existing generic `mergeRecords`/
  `syncEditableCollection` machinery, the same pattern `stationPinSpec`
  already uses.
- **Uniqueness (finding 1) falls out of the same id scheme, enforced locally
  by Dexie's own primary-key constraint.** Linking a wallet transaction or
  watching an order writes via `db.<table>.add(...)`, not `.put(...)`: a
  transaction/order already linked (to _any_ run, not just the one open in
  the UI) throws on the deterministic id collision, caught and treated as
  "already linked" by the caller (`ProductionRunsPanel.tsx`). The picker UI
  also filters candidates against every existing link for the character
  (`linkedTransactionIds`/`watchedOrderIds`), so the common case never
  reaches the constraint at all — the constraint is the backstop for the
  race between loading the picker and clicking it, not the primary UX.
  Cross-plan and cross-character uniqueness is structural, not a query: a
  transaction id can only ever back one Firestore document, full stop.
- **ESI's wallet-transaction rolling window (~2,500 rows, finding 3) is
  accepted as a known, narrow gap for this slice — not mitigated.** A sale
  that ages out of ESI's own history before the pilot links it simply cannot
  be retroactively linked via "Link Past Sale." This does not corrupt
  anything — the run's realized profit just stays permanently short that one
  sale's revenue, the same way an un-logged run understates profit today.
  "Watch Open Order" (built in this same slice, not deferred — see below)
  mitigates the _common_ case (the pilot's own sell order filling) since it
  tracks `volume_remain` directly and never touches wallet-transaction
  history at all; an instant sell into someone else's buy order is the one
  path this app cannot backstop, and there is no ESI endpoint that would let
  it.
- **Both linking mechanisms are built in this slice, not just "Link Past
  Sale."** "Watch Open Order" needed no new background-polling
  infrastructure to be worth shipping now: `computeOrderFillQuantity`
  (`src/engine/industry/orderWatch.ts`) is a pure diff over a manually
  refreshed `volume_remain` reading, matching the app's existing
  manual-refresh-button convention (`ActiveJobsPanel`'s own refresh icon)
  rather than inventing a poller. A watch only ever counts a _confirmed drop_
  in `volume_remain`, never extrapolates a fill from the order's
  disappearance (which could equally be a cancellation) — so a cancelled
  order cannot be mistaken for a sale.
- **Broker fee is charged only on the portion of realized revenue confirmed
  via a watched sell order, never on a linked past wallet transaction.**
  `realizedProfit` (`src/engine/industry/realizedProfit.ts`) always charges
  sales tax on the full confirmed revenue (ESI deducts it from every sale
  regardless of mechanism), but a linked wallet transaction could equally
  have been an instant sell into a buy order — which pays no broker fee — and
  ESI's transaction record does not say which. Assuming a broker fee there
  would overstate cost. A watched order is definitionally a sell order the
  pilot placed, so its confirmed-filled portion is the only revenue the fee
  is charged against. Documented as a deliberate simplification, not full
  per-order accounting (a multiple-small-orders scenario under-applies the
  100 ISK per-order broker-fee minimum against the combined total rather than
  per order) — acceptable for a first slice; a future ticket could snapshot
  the real fee paid at order-placement time instead of re-deriving it.
- **The aggregate "Production Log" view is a panel on the existing
  `/industry` route, not a new route or sub-nav tab.** `ProductionRunsPanel`
  is appended as a fourth `<Panel>` sibling in `BuildPlanDetail.tsx`,
  directly below the existing Results panel — matching how this app already
  does per-plan master/detail (no new routes invented for this feature). A
  true cross-plan, cross-item aggregate rollup (every run, every item, one
  character) is out of scope for this slice; today's panel is scoped to one
  Build Plan's own runs, queried by `buildPlanId`.
- **Deleting a Production Run cascades to every sale link and order watch
  naming it.** `markProductionRunDeleted` (`src/sync/planSync.ts`) tombstones
  the run's own row plus every `ProductionSaleLinkRecord`/
  `ProductionOrderWatchRecord` whose `runId` matches, before tombstoning the
  run itself. An allocation left pointing at a run that no longer exists
  would be worse than a slightly noisier tombstone list — and would
  permanently corrupt "already linked" checks, since the deterministic id
  would still exist there was nothing to clean it up.
- **A third linking mechanism, "Manual / Private Sale," was added after initial
  review feedback.** Not every disposal has an ESI record at all — a gift, a
  private out-of-market deal, an item reprocessed and sold as something else.
  `ProductionSaleLinkRecord.transactionId` became optional
  (`src/db/index.ts`) rather than adding a fourth table: a manual entry is a
  sale line exactly like a linked wallet transaction in every way that
  matters to `realizedProfit` (quantity, unit price, no assumed broker fee),
  it just has no ESI natural id to key uniqueness off. Its id is
  `${characterId}:manual:${crypto.randomUUID()}` — there is no cross-device
  double-count risk to structurally prevent here, since nothing else could
  ever independently produce the same manual entry the way two devices could
  both discover the same real transaction.
- **"Attach to Contract" is deferred to a follow-up ticket, not built in this
  slice.** `features/character/contracts.ts` already caches the character's
  contract list, but an item-exchange contract's _contents_ are fetched
  lazily per contract, on demand, only when its own detail modal opens
  (`contractItems.ts`) — there is no cheap way to filter "which contracts sold
  this product" without fetching every finished contract's items individually,
  unlike the flat, already-loaded lists "Link Past Sale" and "Watch Open
  Order" filter over. Wiring that up well (a picker with its own progressive
  fetch/filter, likely with its own local cache of "items already checked
  per contract") is a real feature in its own right, not a small addition to
  this one.
- **"Link Past Sale" and "Watch Open Order" are not mutually exclusive against
  the same real-world sale — accepted, not solved.** The uniqueness scheme
  above (a transaction/order id can only ever back one link/watch record)
  prevents linking the _same_ transaction or watching the _same_ order twice,
  but nothing stops watching a sell order and _also_ linking the wallet
  transaction that order's fill eventually produces — ESI's wallet
  transaction record carries no field correlating it back to the order that
  generated it. `linkedQty + watchFilledQty` in `ProductionRunsPanel.tsx` can
  therefore exceed `run.quantity` if a pilot double-records one real sale
  this way. Solving it would need real order-to-transaction correlation ESI
  does not expose cleanly; flagged as a follow-up rather than blocking this
  slice, the same way the wallet-window aging gap above is accepted rather
  than mitigated. A manual entry carries the same risk against either
  mechanism, for the same reason — it is the pilot's own attestation, not a
  system that can cross-check itself.
- **Out of scope, unchanged from the original triage draft:** corp-owned jobs
  / corp wallet divisions (no character/division dimension on a linked sale —
  a real gap for multi-character or corp setups, flagged but not solved), and
  a per-run ME/TE snapshot for later cost-drift analysis over blueprint
  research.
