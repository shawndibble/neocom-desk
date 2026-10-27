# Scope decisions — Item names open Show info by default

_Recorded 2026-10-05._

- **An item name that stands alone opens Show info, not the Market.** Rows
  with their own primary action keep their plain name (the row action wins).
  Show info is URL-backed and global (`?info=type-<id>`, `ItemInfoLink`,
  `ItemInfoModal` in `App.tsx`); Back closes it. Rules out per-page Item
  Detail hosts for name links.
- **Market stays reachable.** "View in Market" in the row menu, an "Open in
  Market" button in the Show info header, and Show info's best sell and best
  buy figures (accent, solid-underlined links keeping hub/region).
- **Market context keeps `MarketItemLink`.** Market browser surfaces,
  Variations, Compare, Order book, Hauling detail, Appraisal and unpriced-cost
  views, Loyalty Store offers (price-led), Mining Tax dialog lines (valuation)
  and the Injector price fact: the name links to the Market.
