# Scope decisions — Net worth counts courier collateral the Character posted as acceptor (issue #5656)

_Recorded 2026-10-30 · issue #5656._

- **Amends `20261025-090505`: collateral the Character posted as acceptor of a running courier counts in "In contracts".** It is the Character's own ISK held in escrow, so it is not one party's money in another's net worth. Collateral on a courier the Character issued stays out: that is the courier's money.
- **"Running" is `acceptor_id` = Character and `date_accepted` set, status active.** ESI keeps an accepted courier `outstanding`, so `in_progress` is never relied on (`withAcceptedCourierInProgress`).
- **The deadline is `date_accepted` + `days_to_complete`, not `date_expired`.** Past it undelivered, collateral stops counting (EVE pays it to the issuer). An accepted issued courier keeps its reward in the layer until the same deadline, not the offer expiry. One helper, `courierDeliveryDeadlineMs`, serves all surfaces.
- **No asset double count.** ESI's assets endpoint omits items inside a contract, so hauled cargo is not valued in the acceptor's assets.
- **Corporation couriers and a missing or zero `days_to_complete` are left out, not guessed.**
