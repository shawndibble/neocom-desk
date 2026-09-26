# Scope decisions — Moon tax: price a bid-less ore at today's sell, and link the pricing banner to its entries

_Recorded 2026-09-26._

- **An ore with no buy side anywhere is valued at today's live sell instead
  of 0.** `resolveTaxUnitPrice` keeps its saved → historical → live-buy order
  and gains a last tier, live sell. Thin compressed moon ore (Glistening
  Bitumens at Jita) can have no bids at all, and billing 0 silently understates
  the tax. A sell price overstates what a buyer would pay, so it is an
  estimate, not a quote: the type is tracked separately (`sellFallback`), the
  "could not be priced" banner no longer lists it, and a softer "priced at
  today's sell" notice does. Only a type with no orders on either side today
  stays at 0 and keeps the original warning. The 20260906-081307 buy-not-sell
  rule still holds whenever a buy side exists.
- **The pricing banners link to the entries they are about.** The table shows
  an entry's total, never per-ore prices, so a type name alone did not say
  which row to fix. Each banner lists the affected entries (date · system —
  ore) as buttons that open the entry's detail, where the value can be set by
  hand. Affected rows are found by re-reading each row's price at its own
  Payee's hub and mined date (`findPricingGaps`), so a row is listed only if
  it was actually priced badly. Dismissed rows are skipped: they owe nothing.
