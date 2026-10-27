# Scope decisions — Appraisal shows net-of-fees totals at 100% of market, listing one tick under best sell (issue #1426)

_Recorded 2026-09-24 · issue #1426._

- **The two new net chips are always priced at 100% of market, ignoring the
  Appraisal tab's own Price Percent.** This clarifies, and does not reverse,
  `20260908-164742-appraisal-prices-at-a-trade-hub-and-shares.md`'s "percentage
  multiplies both sides" — that decision is about the gross `buy`/`sell`
  totals a pilot is quoting a private buyer at, not the market's own sales tax
  and broker fee, which only ever apply to a real market transaction. A net of
  a scaled figure would answer no real question, so `appraisalNet` reads a new
  `buyEachRaw`/`sellEachRaw` pair on `AppraisalRow` — populated by
  `buildAppraisal` from the unscaled `AppraisalItem.buy`/`.sell` regardless of
  `pricePercent` — rather than the percent-scaled `buyEach`/`sellEach` the rest
  of the row already carries.
- **The listing net undercuts the best sell by one legal price tick, via the
  price-tick engine's `undercutPrice` (issue #1421), not the raw best-sell
  price itself.** Listing at the exact best-sell price does not win the sale;
  listing one tick under it does, so that is the number fees should apply to.
- **Broker fee is charged once per row, at its 100 ISK minimum, on the listing
  net only.** One pasted type is one listing, the same "per stack listed" rule
  `ownedStockSale` already applies to a Build Plan material and
  `20260914-213119-lp-offer-profit-nets-market-fees-one-redemption.md` already
  applies to an LP offer redemption. The instant-sell net charges sales tax
  only: filling a standing buy order lists nothing.
- **The app always has an active Character, so there is no gross/net toggle
  and no base-rate fallback** — the two net chips render only once
  `AppraisalOutcome.accountingLevel`/`.brokerRelationsLevel` resolve
  (non-null), which happens on the same `appraisePaste` round trip that
  already loads Character Modifiers. While that is in flight the whole result
  panel is still in its existing loading state, so the chips are never shown
  computed off an untrained (level 0) skill that just has not loaded yet. The
  share page (`AppraisalShared.tsx`) has no Character at all and stays gross,
  unchanged, per the ticket's explicit out-of-scope list.
