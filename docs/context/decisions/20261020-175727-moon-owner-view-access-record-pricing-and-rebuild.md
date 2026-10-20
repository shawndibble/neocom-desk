# Scope decisions — Moon owner view: access record, pricing and rebuild triggers (issue #4512)

_Recorded 2026-10-20 · issue #4512._

- **A moon owner reads its view through `feederViews/{feeder}/viewers/{uid}`, never an `officers` doc.** An `officers` doc would unlock the raw book (miner debts, statements, miner rate). The record is checked live (CEO, Director or Accountant; Junior Accountant stays out, unlike the status read) and lapses after 24h. The view needs no holder shortcut: the role is always live.
- **After leaving, `corpTaxBookFeederPrevious/{feeder}` (`{ collectorCorporationId, leftAt }`, function-only) is written in the leave transaction**, because leaving deletes the `FeederOf` pointer. The access callable tries `FeederOf`, then `Previous`. Whatever else ends coverage later (removal, #4520) must write it too; auto-disconnect keeps `FeederOf`.
- **The view prices ore at the book hub's daily open buy from R2, falling back to the open sell, else 0 and counted as an unpriced day.** The client's live-buy and live-sell tiers cannot run on the server, so a day with no open buy and no open sell shows 0 where the personal tab would use today's live book. A failed price read aborts the rebuild and leaves the earlier view: a half-priced view would understate what is owed.
- **Rebuilds are best-effort (`tryRebuildFeederView`) and never fail the write that triggered them.** Triggers: every feeder ledger read, the grant-time and callable rate request, leave, dismissal. Payout and agreed-rate writers (#4514, #4513) must call it too.
- **Rate and mode history are additive optional record fields (`ownerRateHistory`, `modeChanges`).** When absent they are derived from `requestedRatePct` / `agreedRatePct` / `mode`, dated the join day; no past entries are invented.
- **Refinery labels are not stored yet.** `feederViews/.../refineries/{id}` carries `label: null` and the system a row recorded, until #4506's label storage exists.
