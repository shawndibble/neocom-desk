# Scope decisions — LP offer profit nets market fees; one redemption is one order (issue #1050)

_Recorded 2026-09-14 · issue #1050._

- **An LP offer's profit and ISK/LP are netted of market fees, not gross.** The
  LP Store already prices revenue off a trade hub's order book and already asks
  which side of it the player takes ("Sell (list order)" / "Buy (instant)"), so
  the fees of that transaction follow. This rules out the counter-model — that
  an LP item is redeemed to _use_ rather than resell, for which a gross figure
  is closer to the truth — because a player who is not selling does not pick an
  order-book side, and adopting it would argue away the buy/sell toggle too. It
  also settles the shipped `loyalty.netProfit` string ("Net profit") as true of
  what is displayed rather than aspirational.

- **Sales tax on both bases, broker fee only on "Sell (list order)".** This is
  `ownedStockSale`'s split exactly, not a second model: filling a standing buy
  order lists nothing, so no broker fee is charged; listing your own order pays
  both. Rates come from `src/engine/industry/fees.ts`, the single authority the
  build-vs-buy and owned-stock engines already read. No duplicate rate constant
  exists in the loyalty engine.

- **One offer redemption is one order, so the 100 ISK broker-fee minimum is
  charged once for the whole stack.** An offer hands over a single stack of a
  single type; that goes on the market as one listing. This is the same "per
  stack listed" rule `ownedStockSale` applies to a material. It rules out both
  alternatives, which are the ones that actually move the verdict on the cheap,
  high-volume items every LP store is full of: charging the floor per unit
  would condemn all of them, and exempting small offers from the floor would
  flatter them.

- **Fees are charged once, on the offer's revenue leg only.** `iskCost`,
  `requiredItemsCost` and `buildCost` are what the character pays, and nothing
  paid is ever listed on the market — the same reason `buildVsBuy` charges no
  fee on a consumed material. For a blueprint offer the row builder keeps
  taking only `materialCost + jobFee` from `buildVsBuy` and never reads its
  `profit`, which carries that engine's own fee deduction; a regression test
  asserts the blueprint and plain-item paths agree on an equivalent offer.

- **The buy/sell price basis maps to the shared Liquidation Basis at the
  feature boundary.** `priceBasis.ts` keeps its own `'sell' | 'buy'` vocabulary
  for the UI preference; `useLoyaltyStoreOffers` translates it to
  `LiquidationBasis` (`'order' | 'instant'`) for the engines. The engine speaks
  the glossary's term, and the preference is not renamed.
