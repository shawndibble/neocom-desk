# Scope decisions — Ranked and Build Plans cap a troll product sell price (issue #6039)

_Recorded 2026-11-09 · issue #6039._

- **Ranked rows and the Build Plan price the product through one cap, `capProductPrice` (`marketData.ts`).** A hub's cheapest sell order above CCP's average × `TROLL_PRICE_RATIO` (the Market-Wide rule, `cappedSellPrice`) is priced at the average and marked "Price capped" (tooltip on ISK/hour, the plan's sale line, a Ranked CSV column). Applied to the product only; materials, datacores and decryptors are unchanged. The snapshot gains `averagePrices` from the `/markets/prices/` call it already makes. Unlike Market-Wide, a product with no CCP average keeps its raw price (no cap) rather than dropping out, and a failed price list skips the cap. A Build Plan opened directly caps the same way, so a row and its plan always agree (`20261027-074537-*`).
