# Scope decisions — Below market values at the plain hub price, sell side by default (issue #5427)

_Recorded 2026-10-28 · issue #5427._

- **Value is the hub's plain price, sell side by default.** Supersedes the best-buy-minus-sales-tax basis of the #3989 decision (20261016-191816). The board and the slide-over's Is it fair? now show the same market figure to the ISK. A Buy orders / Sell orders control (device-local) picks the side; no fees come off either.
- **Other contracts' asks never enter Profit.** Lines the hub cannot price (copies, types with no order on the chosen side) are valued at the cheapest other single-type contract's ask (≥ 3 offers) and shown in a separate Other column. Profit is `market − asking`. A bar toggle, off by default, lists and ranks contracts by `market + other − asking` too. Asking prices are not sales, so they cannot rank the board.
- **No Accounting-skill read.** With no fee step, the view no longer loads the Character's Accounting level.
