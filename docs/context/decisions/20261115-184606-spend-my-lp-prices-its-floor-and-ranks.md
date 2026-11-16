# Scope decisions — Spend my LP prices its floor and ranks its offers on Sell now

_Recorded 2026-11-15._

Amends 20261115-112526 (Spend my LP walks the books) and, for this one surface, 20261002-222635 (LP Value defaults to each store's market rate).

- **The plan's market-rate floor is read on Sell now.** Every step is priced on the instant basis, so the store's market rate it is compared with is too: the same `marketLpValue` read, with the store's offers selling into the hub's buy orders instead of at its sell price. The listing-basis rate made the floor roughly twice what any instant step could earn, so the plan stopped before its first redemption (CONCORD: a 997 ISK/LP step under a 2,026 listing rate). Everywhere else (Build Plans, Appraisal, the LP Store landing) still prices LP on the listing basis. A typed LP Value is unchanged and still wins.
- **The candidates are the top 10 by Sell now ISK/LP**, not by the table's basis. Ranking by listings handed the plan offers whose buy books are thin; the table keeps its own basis.
- **A step the wallet can't cover is skipped**, like one the LP can't pay for. The plan stops for the wallet only when no affordable step remains, naming the best one it couldn't cover.
- **Nothing to rank is not "the books can't price it".** With no offer in view priced on Sell now (prices loading, or filters and search leaving none), the button is disabled and says so; the order books are blamed only when offers reached them.
- **An open plan follows the page.** Switching the active Character, the Trade Hub or the store closes it: it was priced for the old one.
