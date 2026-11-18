# Scope decisions — Doctrine Fit hub coverage (issue #6387)

_Recorded 2026-11-18 · issue #6387._

- **Coverage is a column on the Director's Doctrine Fits list** (`DoctrineFitsPanel`), at the
  default Trade Hub (`useMarketHub`). Members' read-only Doctrine rows in the Fittings library
  carry none: the ticket names the surface that lists Doctrine Fits for a Director to manage.
- **The price ceiling is 2x the part's lowest sell at the station** (`PRICE_CEILING`). The ticket
  says "up to a price ceiling" without a figure; an order priced far above the best is a
  placeholder, not stock. A constant, not a setting.
- **"Gap cost for one more ship" prices only the parts the book can still supply.** By
  definition the limiting part cannot supply ship N+1, so a full price does not exist; the cost
  walks each part's book past the units the N complete ships use, and the part that runs out is
  named instead ("short on X" / "X not listed"). It is labelled "next ship's listed parts".
- **A part whose book failed to load makes the whole fit show nothing**, never zero: unread is
  not the same as unlisted. A part with no sell order in range at the station is zero, named.
