# Scope decisions — Order book fee columns: sell orders price a listing at the same price

_Recorded 2026-10-19._

- **A sell order's Tax & fees / Final price column prices listing your own at
  that price, not buying it.** Buying outright is free of tax and broker fee, so
  that reading made the whole Sell column 0 and told the pilot nothing; the
  question a seller asks of a row is what they would clear by matching it.
  Supersedes the Sell-order half of
  `20261019-231553-order-book-fee-columns-instant-take-sales-tax.md`.
- **Listing = broker fee + sales tax, per unit.** The broker fee uses Broker
  Relations and the selected hub's station-owner standing (none in a region or
  structure book, which has no single owner), at the plain rate with no 100 ISK
  per-order minimum, which a per-unit figure cannot show.
- **A buy order stays "sell into it now":** sales tax only, no broker fee, since
  no order is placed.
- **Both headers carry an info tooltip stating the assumption for their table.**
  The same two columns mean different things on Sell and Buy, so the figure alone
  would mislead.
- The columns still wait for the active Character's skills (Accounting and
  Broker Relations); never off an untrained placeholder.
