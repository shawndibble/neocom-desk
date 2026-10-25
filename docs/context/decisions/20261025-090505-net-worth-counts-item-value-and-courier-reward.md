# Scope decisions — Net worth counts item value and courier reward locked in own open contracts (issue #5128)

_Recorded 2026-10-25 · issue #5128._

- **An "In contracts" layer values the items the Character hands over in its own open item-exchange and auction contracts at item value, plus the reward of its own open couriers.** Never the contract price (what a buyer pays the Character) and never courier collateral (escrowed by the courier): either would sum one party's money into another's net worth.
- **A contract the app cannot value is left out, not guessed.** Items unread, a line with no price, or a blueprint copy leaves that whole contract out. Zero-price and multi-type contracts follow `20260915-102046` and `20260915-093419`: item value needs no price attribution, so a multi-type bundle is valued line by line.
- **Only the Character's own, non-corporation, unexpired contracts count.** An expired contract stays `outstanding` in ESI until its items return, so expiry is read from `date_expired`.
- **The layer is absent without the contracts permission, not zero.** `contractStock` is omitted from the row; `lacksLayer` re-reads a same-day row missing it only for a Character that holds the permission. A read that failed for a reason that may pass (rate limit, offline, over 30 uncached item reads) also omits the layer, so the row is re-read next run instead of frozen low for the day.
- **Additive and backward-compatible.** `contractStock` is an optional field on the synced `netWorthSnapshots` row; older clients ignore it, and old rows read as 0.
