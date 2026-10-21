# Scope decisions — Corp market orders needs Accountant or Trader and is additive (issue #4612)

_Recorded 2026-10-20 · issue #4612._

- **`canReadOrders` is held by Accountant or Trader (or a Director) and is additive.** ESI's `/corporations/{id}/orders` lists both roles in `x-required-roles`. Its scope, `esi-markets.read_corporation_orders.v1`, joins the corp group and `ADDITIVE_CORP_CAPABILITIES`, so a Character who granted the group earlier stays `ready` and the widget stays undrawn until the scope arrives. A Junior_Accountant does not hold it.
- **The widget reuses the character Orders engine (`buildOpenOrderRows`).** Undercut status is the station tier only (best rival price at the order's station); the deep system/region check, cost basis and floor are per Character and stay off the corp view.
- **Rules out** a second undercut implementation for corp orders.
