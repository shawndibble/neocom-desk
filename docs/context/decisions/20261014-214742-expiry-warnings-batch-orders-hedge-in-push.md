# Scope decisions — Expiry warnings batch orders, hedge in push (issue #3797)

_Recorded 2026-10-14 · issue #3797._

- **Orders Lapsing is one batched alert per batch, never per order.** Orders lapsing within an hour of each other are one batch (a bulk relist), counted together. A batch alerts when its soonest order enters the lead time and the previous poll was not already warning about it. Orders entering the window behind a batch already warned about stay silent until that batch has gone, then get their own alert, so staggered orders are never left unwarned. This rules out per-order events, and rules out one alert that silences everything until the list drains.
- **Orders Lapsing names no item.** The alert carries the count and lead time only; per-item naming is deferred.
- **Severity stays at the default (low).** Neither expiry event is listed in `alertGroups.ts`.
- **Corp orders are excluded from Orders Lapsing.** They are not the Character's own to relist from here.
- **Contract Expiring covers only `outstanding` contracts the Character issued.** An unaccepted courier offer counts, since it is still `outstanding`. A contract merely assigned to them, and anything accepted, deleted or finished, never fires. A courier already in progress is Courier Delivery Due's.
- **Each event owns its own lead-hour threshold** (`contractExpiringLeadHours`, `ordersLapsingLeadHours`; options 48/24/12/6 h, default 24 h), the one-key-per-event convention, all inside the 72 h Projection Horizon.
- **Both hedge in push.** Relisting or accepting is the very action the alert prompts, `20260907-114310`'s test. A relist before the lead time cancels the pending alert because the Projection is rebuilt from the fresh snapshot each poll.
- **Orders Lapsing is its own poll domain** (`orderExpiry`), not a widened `marketOrderDomain`, for `marketOrderUndercutDomain`'s reason: widening discards stored fill baselines. Its push and poll copy carry the count and lead time, not item names.
