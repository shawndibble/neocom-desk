# Scope decisions — Hauling listing price reads the listing side of history (issue #3900)

_Recorded 2026-10-16 · issue #3900._

Refines the Expected Sell Price in `20260926-161750-hauling-opportunities-v1-scope.md`.

- **The recent sale price is what listings sold for, not the day's average.** ESI's daily `average` blends buyers taking a sell listing (high) with sellers dumping into buy orders (low), so on a thin item it is a price nobody paid (Domination X-Large Shield Booster, Amarr, 2026-10-13: fills at 289,000,000 and 25,310,000, average 157,155,000). Listing mode now reads each recent day's `highest` fill, volume-weighted median as before. The Expected Sell Price is still never above one tick under the cheapest listing, and the "Check history" flag still marks margins over 100%.
- **The detail names the split.** When the newest trading day's lowest fill is under 80% of its highest, the item detail says "Last sales (date): X from a listing, Y into a buy order." so the hauler sees both kinds of sale.
- Instant mode (selling into buy orders) is unchanged: it reads the buy ladder, not history.
