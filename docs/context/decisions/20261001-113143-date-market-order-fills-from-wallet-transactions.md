# Scope decisions — Date market order fills from wallet transactions

_Recorded 2026-10-01._

- **A fill is dated by the sale that emptied the order, inferred from the
  wallet.** ESI never says when an order filled. Order history records only
  when it was issued, and wallet transactions carry no order id. A sale of
  the same item, at the same station and unit price, on or after the order's
  `issued` is that order's sale, and the newest one is the fill
  (`engine/market/fillTime`). Two of the Character's own orders with the same
  item, price and station can't be told apart. That's accepted, because the
  date that results is still a real sale of that item at that price. A relist
  at the same price is the common form of this. Its sales after the poll that
  noticed the fill are excluded, with a 5-minute allowance for ESI clock
  skew. Its sales between the fill and that poll can't be told apart.
- **First dated by the poll, re-dated later.** ESI caches transactions for
  an hour and orders for twenty minutes, so the poll that notices a fill
  usually can't see its sale yet. The feed row is written at the poll's time
  with the order's matching details (`fillMatch`). Each later poll retries
  (`fillTimeSettle`) and moves `firedAt` back once the sale shows up. Holding
  the alert back until the wallet catches up was rejected, because it would
  delay the alert by up to an hour.
- **A provisional time is marked, not hidden.** Until the row settles, the
  Alerts page shows a "?" beside its time. The tooltip says the exact time
  comes from wallet transactions, which update hourly. A settled row shows
  no marker.
- **A row settles at its noticed time when no answer can come.** This covers
  three cases: the wallet scope is missing or revoked; data provably newer
  than the fill (fetched at least 65 minutes after it was noticed) holds no
  matching sale; or the row is older than the transactions endpoint reaches.
  A marker that promises an update that never arrives is worse than none.
- **Corp orders keep the poll's time and get no marker.** A corp order's
  sales pay into the corp wallet, which the Character's transactions never
  show.
- **Feed sync now reconciles dates, not just dismissals.** A row's date can
  move back after it is written, so `sync/merge.mergeFeed` pushes or pulls
  the earlier `firedAt` once dismissals agree. That applies to every event,
  which also settles the push-arrival vs. poll-occurrence dates that two
  devices used to keep apart.
