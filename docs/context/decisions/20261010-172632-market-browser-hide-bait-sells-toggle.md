# Scope decisions — market browser hide bait sells toggle (issue #3517)

_Recorded 2026-10-10 · issue #3517._

- **Bait sells can be hidden, but only when the pilot asks.** This refines
  `20261004-100214-market-browser-order-book-rework-scope-bar-stacked.md`'s
  "Bait sells are flagged, never hidden". The flag is still the default. An
  opt-in "Hide bait sells" filter chip, off by default and remembered per
  device, drops the flagged rows from the sell table.
- **Hiding never misstates the book.** While the chip is on, the sell card
  says how many sells it hid. Depth, "buying down to here", best prices and
  CSV export still use every order. A hidden row only leaves the table.
- **Sell side only, one definition of bait.** Hiding uses the same threshold
  as the flag (`SELL_OUTLIER_FACTOR`, 10× the best sell). Buy orders far below
  the best bid are often real lowball bids, so they are never hidden.
