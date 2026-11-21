# Scope decisions — Hub picker popover with a per-page Buy/Sell percent (issue #6531)

_Recorded 2026-11-21 · issue #6531._

- **The hub picker is a popover, on every page.** Market hub settings (App setting · <page>), Market hub (Closest on its own row, then a 2×3 grid), then the page's percent. A menu cannot hold a text field, and one shared control reads the same everywhere. Rules out a PI-only popover.
- **On App setting a hub pick still moves the Global hub.** The owner wants the popover to be a quick way to change the app-wide hub. Rules out "a pick on App setting gives the page its own hub".
- **One percent per page, whichever hub the page uses, default 100.** Stored in `sync.pagePricePercents`, never in `sync.pageHubs`, so switching between App setting and the page keeps the rate. The page passes the side it prices on; that only names the field (Buy percent / Sell percent), e.g. Contracts' own buy/sell flip changes the label, not the value.
- **Applied where each page reads its prices, never inside the shared price lookups.** Those are cached per station and shared by every page, so scaling there would leak one page's percent into another.
- **No percent on Market, Overview or Corp SRP.** Market and Overview show the live book and raw history (scaling a real order or an alert threshold would be wrong); Corp SRP uses the hub only to count order-book depth, and keeps its own payout percent.
- **Appraisal keeps its Price % field on the page as its percent** (`sync.marketPricePercent`), with no second field in the popover; the fleet payout dialog keeps reading it.
- **PI's corp buyback rate becomes PI's percent.** "My corp buyback" and its rate picker are gone; a PI percent other than 100 is a buyback at that rate (no sales tax, drop off at home). An existing buyback rate (device-local) reads as PI's percent on that device until PI has an entry; each write also goes to `piSettings.buybackPct` (100 as none) for older builds.
- **Contracts' price check compares against the scaled hub price** and its heading shows the percent; listing flags and Below market stay on the raw book.
- **Industry's percent scales material costs and product value alike**, walked Depth Prices included. Build plans keep their own hub but read the Industry percent. BPC Sourcing, Buy Ore and the shopping list's gas comparison stay on raw prices: they compare real orders, contracts and offers against each other.
- **The box writes on Enter, leaving it, or the popover closing**, never per keystroke: a partial value ("8" on the way to 85) would re-price the page, and on PI write an 8% buyback.
- **Assets has no percent.** It has no hub picker of its own to hold one (only Settings › Page hubs), and its haul value doubles as collateral.
